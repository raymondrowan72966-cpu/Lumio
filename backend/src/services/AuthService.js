import { ValidationError, DatabaseError, DuplicateEmailError, AuthenticationError, RateLimitError } from '../errors/index.js';
import { sha256Hex } from '../utils/crypto.js';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Orchestrates registration/login/invitation flows on top of already-real
 * collaborators (UserRepository, WorkspaceRepository, PasswordService,
 * SessionService, TokenService). Sprint 2C implements `registerOwner` only
 * — Workspace Owner self-registration via Email & Password, per
 * docs/SAAS_AUTHENTICATION_SPECIFICATION.md Section 2. `login`,
 * `logout`, and `acceptInvitation` remain Sprint 1 placeholders, untouched.
 */
export class AuthService {
  constructor({ userRepository, workspaceRepository, passwordService, sessionService, tokenService, passwordResetRepository, rateLimitRepository, emailService, appBaseUrl, db, logger } = {}) {
    this.userRepository = userRepository;
    this.workspaceRepository = workspaceRepository;
    this.passwordService = passwordService;
    this.sessionService = sessionService;
    this.tokenService = tokenService;
    this.passwordResetRepository = passwordResetRepository;
    this.rateLimitRepository = rateLimitRepository;
    this.emailService = emailService;
    this.appBaseUrl = appBaseUrl;
    this.db = db;
    this.logger = logger;
  }

  /**
   * Workspace Owner self-registration via Email & Password.
   *
   * Database Concurrency Rule: uniqueness is enforced authoritatively by
   * the `users.email` UNIQUE constraint (migration 0001), not by the
   * pre-check below. The pre-check exists ONLY to give the common,
   * non-racing case a fast, clean `DuplicateEmailError` without paying
   * for a password hash and a doomed transaction attempt first — it is a
   * UX optimization, never the source of correctness. Proof that
   * correctness doesn't depend on it: the `catch` block around
   * `db.batch()` below independently detects and maps the exact same
   * UNIQUE constraint violation to the exact same `DuplicateEmailError`,
   * which is the path that actually runs if two requests for the same
   * email race each other and both pass the pre-check before either has
   * inserted anything. Removing the pre-check entirely would only make
   * the common case slightly slower on rejection — it would not make any
   * currently-passing case incorrect.
   *
   * Steps 1-3 (validate input, normalize, hash password, the pre-check
   * itself) necessarily happen before the atomic transaction — D1's
   * `db.batch()` executes already-built, already-bound statements with no
   * async work permitted in between, so anything requiring await
   * (password hashing, token generation, the duplicate-email read) must
   * complete first. Steps 4-7 (create user, workspace, membership,
   * session) then execute as ONE atomic `db.batch()` call: if any one of
   * those four inserts fails — including the UNIQUE constraint violation
   * from a concurrent registration the pre-check couldn't have seen —
   * every insert in the batch is rolled back together, per D1's
   * documented all-or-nothing guarantee. This is the most complete
   * transactional guarantee the actual D1 API makes available; there is
   * no separate BEGIN/COMMIT a Worker could issue instead. See
   * DECISIONS.md ADR-014/ADR-013 for the full reasoning, and the entry
   * documenting this rule's confirmation for the exact "is correctness
   * pre-check-dependent?" analysis.
   */
  async registerOwner({ email, password, firstName, lastName = '' } = {}) {
    // --- 1. Validate input -------------------------------------------------
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required.');
    }
    if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
      throw new ValidationError('First name is required.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_FORMAT.test(normalizedEmail)) {
      throw new ValidationError('Email address is not a valid format.');
    }
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : '';

    // --- 2. Fast UX pre-check — NOT the authoritative uniqueness check.
    //        See the class-level comment above and DECISIONS.md for why
    //        application correctness never depends on this query. -------
    const existing = await this.userRepository.findByEmail(normalizedEmail);
    if (existing) {
      this.logger?.warning('registration rejected: duplicate email (pre-check)', { email: normalizedEmail });
      throw new DuplicateEmailError();
    }

    // --- 3. Hash password (also validates complexity — throws
    //        ValidationError for weak/empty/invalid input before anything
    //        is written). ------------------------------------------------
    const passwordHash = await this.passwordService.hash(password);

    // --- Build every statement for the atomic transaction ----------------
    const now = Date.now();
    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const displayName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const workspaceName = `${normalizedFirstName}'s Workspace`;

    const userStatement = this.userRepository.buildCreateStatement({
      id: userId,
      email: normalizedEmail,
      authProvider: 'email',
      passwordHash,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      displayName,
      now,
    });
    const workspaceStatement = this.workspaceRepository.buildCreateStatement({
      id: workspaceId,
      ownerId: userId,
      name: workspaceName,
      now,
    });
    const membershipStatement = this.workspaceRepository.buildAddMemberStatement({
      workspaceId,
      userId,
      role: 'workspace_owner',
      invitationAcceptedAt: null, // never via invitation for self-registration
      now,
    });
    const sessionBuild = await this.sessionService.buildCreateStatement({
      userId,
      rememberMe: false, // Remember Me is explicitly out of this sprint's scope
      deviceId: null,
      now,
    });
    const settingsStatement = this.workspaceRepository.buildCreateSettingsStatement({
      workspaceId,
      now,
    });

    // --- 4-8. Execute all five inserts as one atomic transaction.
    //          Order matters: workspace must precede workspace_settings
    //          (FK constraint). D1 batch() executes statements in order
    //          within a single transaction, so workspace exists before
    //          the settings INSERT runs. This catch block — not the
    //          pre-check above — is the authoritative enforcement of
    //          email uniqueness, per the Database Concurrency Rule
    //          (DECISIONS.md). -----------------------------------------
    try {
      await this.db.batch([userStatement, workspaceStatement, settingsStatement, membershipStatement, sessionBuild.statement]);
    } catch (err) {
      const message = err?.details?.cause || String(err);
      if (message.includes('UNIQUE') && message.includes('users.email')) {
        this.logger?.warning('registration rejected: duplicate email (UNIQUE constraint — authoritative)', { email: normalizedEmail });
        throw new DuplicateEmailError();
      }
      this.logger?.error('registration transaction failed', { email: normalizedEmail, error: message });
      throw new DatabaseError('Registration failed. No changes were saved.', { cause: message });
    }

    this.logger?.audit('workspace owner registered', { userId, workspaceId });

    // --- 8. Return a successful authentication response -------------------
    // Deliberately an explicit allow-list, never a raw DB row spread — the
    // password hash and any other internal-only column can never leak
    // through this, even if the users table gains new columns later.
    return {
      user: {
        id: userId,
        email: normalizedEmail,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        displayName,
        createdAt: now,
      },
      workspace: {
        id: workspaceId,
        name: workspaceName,
      },
      session: {
        sessionId: sessionBuild.sessionId,
        refreshToken: sessionBuild.refreshToken,
        expiresAt: sessionBuild.expiresAt,
      },
    };
  }

  /**
   * Email + password login. Returns the authenticated user context plus a raw
   * refresh token that the route handler embeds in an HttpOnly session cookie —
   * the token is never returned to the client in the JSON body.
   *
   * The error message is deliberately identical for "no account" and "wrong
   * password" — distinguishing them would allow email enumeration.
   */
  async login({ email, password, rememberMe = false } = {}) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required.');
    }
    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_FORMAT.test(normalizedEmail)) {
      throw new ValidationError('Email address is not a valid format.');
    }

    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user) {
      this.logger?.warning('login rejected: invalid credentials', { email: normalizedEmail });
      throw new AuthenticationError('Invalid email or password.');
    }
    const valid = await this.passwordService.verify(password, user.password_hash);
    if (!valid) {
      this.logger?.warning('login rejected: invalid credentials', { email: normalizedEmail });
      throw new AuthenticationError('Invalid email or password.');
    }

    const { sessionId, refreshToken, expiresAt } = await this.sessionService.createSession({
      userId: user.id,
      rememberMe,
      deviceId: null,
    });

    const memberships = await this.db.all(
      "SELECT * FROM workspace_members WHERE user_id = ? AND status = 'active'",
      [user.id],
    );
    const membership = memberships[0] || null;
    if (!membership) {
      this.logger?.warning('login rejected: no active workspace membership', { userId: user.id });
      throw new AuthenticationError('Your account has been deactivated or removed from this workspace.');
    }
    let workspace = null;
    if (membership) {
      workspace = await this.workspaceRepository.findById(membership.workspace_id);
    }

    this.logger?.audit('user logged in', { userId: user.id, sessionId });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        displayName: user.display_name,
        authProvider: user.auth_provider,
        createdAt: user.created_at,
      },
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name,
        ownerId: workspace.owner_id,
      } : null,
      membership: membership ? {
        workspaceId: membership.workspace_id,
        role: membership.role,
      } : null,
      session: { refreshToken, expiresAt, sessionId },
    };
  }

  /**
   * Revokes the caller's current session. Idempotent — calling logout with an
   * already-revoked or missing sessionId is a no-op, not an error.
   */
  async logout({ sessionId } = {}) {
    if (!sessionId) return;
    await this.sessionService.revokeSession(sessionId);
    this.logger?.audit('user logged out', { sessionId });
  }

  /**
   * Changes the password for the currently authenticated user.
   *
   * Flow:
   *   1. Verify current password against stored hash.
   *   2. Validate new password ≠ confirm password mismatch.
   *   3. Validate new password ≠ current password.
   *   4. Hash new password (also enforces policy — throws ValidationError on failure).
   *   5. Persist new hash via updatePasswordHash().
   *   6. Revoke ALL sessions (every device logs out).
   *   7. Create a fresh session for the current device, preserving Remember Me.
   *   8. Emit audit log entry.
   *   9. Return new session tokens.
   *
   * @param {{ userId, currentPassword, newPassword, confirmPassword, rememberMe }} params
   * @returns {{ session: { sessionId, refreshToken, expiresAt } }}
   */
  async changePassword({ userId, currentPassword, newPassword, confirmPassword, rememberMe = false } = {}) {
    if (!userId) throw new ValidationError('User ID is required.');
    if (!currentPassword || typeof currentPassword !== 'string') {
      throw new ValidationError('Current password is required.');
    }
    if (!newPassword || typeof newPassword !== 'string') {
      throw new ValidationError('New password is required.');
    }
    if (!confirmPassword || typeof confirmPassword !== 'string') {
      throw new ValidationError('Password confirmation is required.');
    }

    // --- 1. Confirm passwords match before touching anything ---------------
    if (newPassword !== confirmPassword) {
      throw new ValidationError('New password and confirmation do not match.');
    }

    // --- 2. Load user row to get stored hash --------------------------------
    const user = await this.userRepository.findById(userId);
    if (!user) throw new ValidationError('User not found.');
    if (!user.password_hash) {
      throw new ValidationError('This account does not use a password. Sign in with your linked provider.');
    }

    // --- 3. Verify current password -----------------------------------------
    const currentValid = await this.passwordService.verify(currentPassword, user.password_hash);
    if (!currentValid) {
      this.logger?.warning('password change rejected: current password incorrect', { userId });
      throw new ValidationError('Current password is incorrect.');
    }

    // --- 4. Reject if new password is the same as current -------------------
    const sameAsCurrent = await this.passwordService.verify(newPassword, user.password_hash);
    if (sameAsCurrent) {
      throw new ValidationError('New password must be different from the current password.');
    }

    // --- 5. Hash new password (enforces policy — throws ValidationError) ----
    const newHash = await this.passwordService.hash(newPassword);

    // --- 6. Persist new hash ------------------------------------------------
    await this.userRepository.updatePasswordHash(userId, newHash);

    // --- 7. Revoke all sessions (every device) ------------------------------
    await this.sessionService.revokeAllSessionsForUser(userId);

    // --- 8. Create fresh session for current device -------------------------
    const { sessionId, refreshToken, expiresAt } = await this.sessionService.createSession({
      userId,
      rememberMe,
      deviceId: null,
    });

    // --- 9. Audit log -------------------------------------------------------
    this.logger?.audit('ACCOUNT_PASSWORD_CHANGED', { userId });

    return {
      session: { sessionId, refreshToken, expiresAt },
    };
  }

  /**
   * Initiates a password reset for the given email.
   * Always responds with { ok: true } — never reveals whether an account exists.
   *
   * @param {{ email: string }} params
   * @returns {{ ok: true }}
   */
  async requestPasswordReset({ email, ip = 'unknown' } = {}) {
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_FORMAT.test(normalizedEmail)) {
      throw new ValidationError('Email address is not a valid format.');
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // IP-based rate limit: 5 requests per IP per hour.
    // Returns 429 — IP-based limiting does not reveal account existence.
    const ipKey = `ip:${ip}`;
    const ipCount = await this.rateLimitRepository.countSince(ipKey, oneHourAgo);
    if (ipCount >= 5) {
      this.logger?.warning('password reset rate limited by IP', { ip });
      throw new RateLimitError('Too many password reset requests. Please try again later.');
    }
    await this.rateLimitRepository.record(ipKey, now);

    const user = await this.userRepository.findByEmail(normalizedEmail);

    if (!user || !user.password_hash) {
      this.logger?.info('password reset requested: account not found or OAuth-only', { email: normalizedEmail });
      return { ok: true };
    }

    // Email-based rate limit: 5 requests per account per hour.
    // Silently succeeds — does not reveal whether an account exists.
    const emailCount = await this.passwordResetRepository.countByUserSince(user.id, oneHourAgo);
    if (emailCount >= 5) {
      this.logger?.warning('password reset rate limited by email', { userId: user.id });
      return { ok: true };
    }

    await this.passwordResetRepository.invalidatePreviousTokens(user.id, now);

    const { token, tokenHash, expiresAt } = await this.tokenService.generateToken('passwordReset');
    const id = crypto.randomUUID();
    await this.passwordResetRepository.create({ id, userId: user.id, tokenHash, expiresAt, now });

    const resetLink = `${this.appBaseUrl}/#/reset-password/${token}`;

    await this.emailService.sendPasswordResetEmail({
      to: user.email,
      firstName: user.first_name,
      resetLink,
    });

    this.logger?.audit('PASSWORD_RESET_REQUESTED', { userId: user.id });
    return { ok: true };
  }

  /**
   * Completes a password reset using a raw token from the reset link.
   * No auto-login — the user must sign in with their new password.
   *
   * @param {{ token: string, newPassword: string, confirmPassword: string }} params
   * @returns {{ ok: true }}
   */
  async confirmPasswordReset({ token, newPassword, confirmPassword } = {}) {
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Reset token is required.');
    }
    if (!newPassword || typeof newPassword !== 'string') {
      throw new ValidationError('New password is required.');
    }
    if (!confirmPassword || typeof confirmPassword !== 'string') {
      throw new ValidationError('Password confirmation is required.');
    }
    if (newPassword !== confirmPassword) {
      throw new ValidationError('Passwords do not match.');
    }

    const tokenHash = await sha256Hex(token);
    const record = await this.passwordResetRepository.findByTokenHash(tokenHash);

    // Verify token — map used_at to revokedAt per TokenService contract.
    const verification = record
      ? await this.tokenService.verifyToken(token, { tokenHash: record.reset_token_hash, expiresAt: record.expires_at, revokedAt: record.used_at })
      : { valid: false, reason: 'mismatch' };

    if (!verification.valid) {
      if (verification.reason === 'expired') {
        this.logger?.audit('PASSWORD_RESET_TOKEN_EXPIRED', { tokenHash });
        throw new ValidationError(
          'This password reset link has expired or has already been used.\nPlease request a new password reset.',
        );
      }
      if (verification.reason === 'revoked') {
        this.logger?.audit('PASSWORD_RESET_TOKEN_INVALID', { reason: 'revoked', tokenHash });
        throw new ValidationError(
          'This password reset link has expired or has already been used.\nPlease request a new password reset.',
        );
      }
      this.logger?.audit('PASSWORD_RESET_TOKEN_INVALID', { reason: verification.reason, tokenHash });
      throw new ValidationError(
        'This password reset link has expired or has already been used.\nPlease request a new password reset.',
      );
    }

    const user = await this.userRepository.findById(record.user_id);
    if (!user) throw new ValidationError('User not found.');

    const newHash = await this.passwordService.hash(newPassword);

    const now = Date.now();
    await this.passwordResetRepository.markUsed(record.id, now);
    await this.userRepository.updatePasswordHash(user.id, newHash);
    await this.sessionService.revokeAllSessionsForUser(user.id);

    this.logger?.audit('PASSWORD_RESET_COMPLETED', { userId: user.id });
    return { ok: true };
  }

  async acceptInvitation(_token, _credentials) {
    throw new Error('AuthService.acceptInvitation is not implemented yet (Sprint 2C: registration only).');
  }
}
