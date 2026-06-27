import { ValidationError, DatabaseError, DuplicateEmailError } from '../errors/index.js';

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
  constructor({ userRepository, workspaceRepository, passwordService, sessionService, db, logger } = {}) {
    this.userRepository = userRepository;
    this.workspaceRepository = workspaceRepository;
    this.passwordService = passwordService;
    this.sessionService = sessionService;
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

    // --- 4-7. Execute all four inserts as one atomic transaction. This
    //          catch block — not the pre-check above — is the
    //          authoritative enforcement of email uniqueness, per the
    //          Database Concurrency Rule (DECISIONS.md). -----------------
    try {
      await this.db.batch([userStatement, workspaceStatement, membershipStatement, sessionBuild.statement]);
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
        refreshToken: sessionBuild.refreshToken,
        expiresAt: sessionBuild.expiresAt,
      },
    };
  }

  async login(_email, _password, _opts = {}) {
    throw new Error('AuthService.login is not implemented yet (Sprint 2C: registration only).');
  }

  async logout(_sessionId) {
    throw new Error('AuthService.logout is not implemented yet (Sprint 2C: registration only).');
  }

  async acceptInvitation(_token, _credentials) {
    throw new Error('AuthService.acceptInvitation is not implemented yet (Sprint 2C: registration only).');
  }
}
