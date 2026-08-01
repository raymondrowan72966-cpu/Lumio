import { ValidationError, DatabaseError, PermissionError } from '../errors/index.js';
import { sha256Hex } from '../utils/crypto.js';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Accept both frontend legacy values and canonical DB values for role and authProvider.
const ROLE_CANONICAL = {
  admin:           'administrator',
  owner:           'workspace_owner',
  administrator:   'administrator',
  workspace_owner: 'workspace_owner',
};
const AUTH_PROVIDER_CANONICAL = {
  local:     'email',
  email:     'email',
  google:    'google',
  microsoft: 'microsoft',
  apple:     'apple',
};
const ROLE_LABEL = {
  administrator:   'Administrator',
  workspace_owner: 'Workspace Owner',
};

/**
 * Orchestrates the full invitation lifecycle — send, get, accept, revoke.
 * Completely independent of AuthService (AD #3).
 *
 * Collaborators:
 *   invitationRepository — invitation row persistence
 *   userRepository       — existing user lookup, new user creation
 *   workspaceRepository  — workspace/membership lookup, membership creation
 *   passwordService      — hashes password for email-auth invitees
 *   tokenService         — generates and verifies the invitation token
 *   emailService         — sends the invitation email via Resend
 *   db                   — raw D1 client for atomic batch operations
 *   logger               — structured audit logging
 *   appBaseUrl           — constructs the accept-invite link
 */
export class InvitationService {
  constructor({
    invitationRepository,
    userRepository,
    workspaceRepository,
    passwordService,
    tokenService,
    emailService,
    appBaseUrl,
    db,
    logger,
  } = {}) {
    this.invitationRepository = invitationRepository;
    this.userRepository = userRepository;
    this.workspaceRepository = workspaceRepository;
    this.passwordService = passwordService;
    this.tokenService = tokenService;
    this.emailService = emailService;
    this.appBaseUrl = appBaseUrl;
    this.db = db;
    this.logger = logger;
  }

  // ---------------------------------------------------------------------------
  // sendInvitation
  // ---------------------------------------------------------------------------

  /**
   * Validates, persists, and emails a workspace invitation.
   *
   * @param {{ workspaceId, inviterUserId, firstName, lastName, email, role, authProvider }} params
   * @returns {{ ok: true, invitationId: string }}
   */
  async sendInvitation({ workspaceId, inviterUserId, firstName, lastName = '', email, role, authProvider }) {
    // --- 1. Validate required fields ----------------------------------------
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      throw new ValidationError('First name is required.');
    }
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_FORMAT.test(normalizedEmail)) {
      throw new ValidationError('Email address is not a valid format.');
    }
    const normalizedFirstName = firstName.trim();
    const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : '';

    // --- 2. Canonicalize role and authProvider ------------------------------
    const canonicalRole = ROLE_CANONICAL[role];
    if (!canonicalRole) {
      throw new ValidationError(
        `Invalid role: "${role}". Must be "administrator" or "workspace_owner".`,
      );
    }
    const canonicalAuthProvider = AUTH_PROVIDER_CANONICAL[authProvider];
    if (!canonicalAuthProvider) {
      throw new ValidationError(
        `Invalid authentication method: "${authProvider}".`,
      );
    }

    // --- 3. Verify workspace exists -----------------------------------------
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new ValidationError('Workspace not found.');
    }

    // --- 4. Prevent inviting existing active members ------------------------
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);
    if (existingUser) {
      const membership = await this.workspaceRepository.findMembership(workspaceId, existingUser.id);
      if (membership) {
        throw new ValidationError('This person is already a member of this workspace.');
      }
    }

    // --- 5. Prevent duplicate pending invitations ---------------------------
    const existingInvite = await this.invitationRepository.findPendingByEmailAndWorkspace(
      normalizedEmail,
      workspaceId,
    );
    if (existingInvite) {
      throw new ValidationError(
        'A pending invitation already exists for this email address.',
      );
    }

    // --- 6. Generate invitation token ---------------------------------------
    const { token, tokenHash, expiresAt } = await this.tokenService.generateToken('invitation');

    // --- 7. Persist the invitation ------------------------------------------
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.invitationRepository.create({
      id,
      workspaceId,
      inviterUserId,
      email: normalizedEmail,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      role: canonicalRole,
      authProvider: canonicalAuthProvider,
      tokenHash,
      expiresAt,
      now,
    });

    // --- 8. Send invitation email -------------------------------------------
    const inviter = await this.userRepository.findById(inviterUserId);
    const inviterName = inviter
      ? `${inviter.first_name} ${inviter.last_name || ''}`.trim()
      : 'A workspace owner';
    const inviteLink = `${this.appBaseUrl}/#/accept-invite/${token}`;

    await this.emailService.sendInvitationEmail({
      to: normalizedEmail,
      firstName: normalizedFirstName,
      inviterName,
      workspaceName: workspace.name,
      role: ROLE_LABEL[canonicalRole],
      inviteLink,
      expiresAt,
    });

    // --- 9. Audit log -------------------------------------------------------
    this.logger?.audit('INVITATION_SENT', {
      invitationId: id,
      workspaceId,
      inviterUserId,
      recipientEmail: normalizedEmail,
      role: canonicalRole,
    });

    return { ok: true, invitationId: id };
  }

  // ---------------------------------------------------------------------------
  // getInvitation  (for the accept-invite screen — no auth required)
  // ---------------------------------------------------------------------------

  /**
   * Returns display-safe invitation details for the accept-invite screen.
   * Never returns sensitive fields (token hash, inviter ID).
   *
   * @param {string} rawToken
   * @returns {{ firstName, lastName, email, role, authProvider, workspaceName, expiresAt } | null}
   */
  async getInvitation(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return null;

    const tokenHash = await sha256Hex(rawToken);
    const record = await this.invitationRepository.findByTokenHash(tokenHash);
    if (!record) return null;

    // Lazily expire if the clock has passed expires_at
    if (record.status === 'pending' && Date.now() >= record.expires_at) {
      await this.invitationRepository.expirePending(Date.now());
      return null;
    }

    if (record.status !== 'pending') return null;

    const workspace = await this.workspaceRepository.findById(record.workspace_id);

    return {
      firstName: record.first_name,
      lastName: record.last_name,
      email: record.email,
      role: record.role,
      authProvider: record.auth_provider,
      workspaceName: workspace?.name || 'Lumio Workspace',
      expiresAt: record.expires_at,
    };
  }

  // ---------------------------------------------------------------------------
  // acceptInvitation  (no auth required — invitee may not have an account)
  // ---------------------------------------------------------------------------

  /**
   * Validates the token, creates the user account (if needed), creates the
   * workspace membership, and marks the invitation accepted.
   * Does NOT create a session — authentication remains AuthService's responsibility (AD #4).
   *
   * @param {{ rawToken: string, password?: string }} params
   * @returns {{ ok: true }}
   */
  async acceptInvitation({ rawToken, password }) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new ValidationError('Invitation token is required.');
    }

    // --- 1. Load and validate the invitation --------------------------------
    const tokenHash = await sha256Hex(rawToken);
    const record = await this.invitationRepository.findByTokenHash(tokenHash);

    if (!record) {
      throw new ValidationError(
        'This invitation link is invalid or has already been used.',
      );
    }

    if (record.status === 'accepted') {
      throw new ValidationError('This invitation has already been accepted.');
    }
    if (record.status === 'revoked') {
      throw new ValidationError('This invitation has been revoked by the workspace owner.');
    }
    if (record.status === 'expired' || Date.now() >= record.expires_at) {
      if (record.status === 'pending') {
        await this.invitationRepository.expirePending(Date.now());
      }
      throw new ValidationError(
        'This invitation link has expired. Please ask the workspace owner to send a new invitation.',
      );
    }

    // --- 2. For email auth, password is required ----------------------------
    if (record.auth_provider === 'email') {
      if (!password || typeof password !== 'string') {
        throw new ValidationError('A password is required to complete your account setup.');
      }
    }

    const now = Date.now();
    let userId;

    // --- 3. Check for existing user with this email -------------------------
    const existingUser = await this.userRepository.findByEmail(record.email);

    if (existingUser) {
      userId = existingUser.id;

      // Already a member — mark accepted and return (idempotent accept)
      const existingMembership = await this.workspaceRepository.findMembership(
        record.workspace_id,
        userId,
      );
      if (existingMembership) {
        await this.invitationRepository.markAccepted(record.id, now);
        this.logger?.audit('INVITATION_ACCEPTED', {
          invitationId: record.id,
          workspaceId: record.workspace_id,
          userId,
          existingUser: true,
          alreadyMember: true,
        });
        return { ok: true };
      }

      // Existing user, not yet a member — add membership only
      await this.workspaceRepository.addMember({
        workspaceId: record.workspace_id,
        userId,
        role: record.role,
        invitationAcceptedAt: now,
        now,
      });
    } else {
      // --- 4. New user — create account + membership atomically -------------
      userId = crypto.randomUUID();
      const displayName = `${record.first_name} ${record.last_name || ''}`.trim();

      let passwordHash = null;
      if (record.auth_provider === 'email') {
        // passwordService.hash validates complexity and throws ValidationError on failure
        passwordHash = await this.passwordService.hash(password);
      }

      const userStatement = this.userRepository.buildCreateStatement({
        id: userId,
        email: record.email,
        authProvider: record.auth_provider,
        passwordHash,
        firstName: record.first_name,
        lastName: record.last_name || '',
        displayName,
        now,
      });
      const membershipStatement = this.workspaceRepository.buildAddMemberStatement({
        workspaceId: record.workspace_id,
        userId,
        role: record.role,
        invitationAcceptedAt: now,
        now,
      });

      try {
        await this.db.batch([userStatement, membershipStatement]);
      } catch (err) {
        const message = String(err);
        this.logger?.error('invitation acceptance transaction failed', {
          invitationId: record.id,
          error: message,
        });
        throw new DatabaseError(
          'Account creation failed. Please try again.',
          { cause: message },
        );
      }
    }

    // --- 5. Mark invitation accepted ----------------------------------------
    await this.invitationRepository.markAccepted(record.id, now);

    // --- 6. Audit log -------------------------------------------------------
    this.logger?.audit('INVITATION_ACCEPTED', {
      invitationId: record.id,
      workspaceId: record.workspace_id,
      userId,
      role: record.role,
    });

    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // revokeInvitation  (Workspace Owner only)
  // ---------------------------------------------------------------------------

  /**
   * Revokes a pending invitation. The requestingUserId must own the invitation's workspace.
   *
   * @param {{ invitationId: string, requestingUserId: string }} params
   * @returns {{ ok: true }}
   */
  async revokeInvitation({ invitationId, requestingUserId }) {
    if (!invitationId) throw new ValidationError('Invitation ID is required.');

    const record = await this.invitationRepository.findById(invitationId);
    if (!record) throw new ValidationError('Invitation not found.');

    // Verify the requesting user is the workspace owner
    const membership = await this.workspaceRepository.findMembership(
      record.workspace_id,
      requestingUserId,
    );
    if (!membership || membership.role !== 'workspace_owner') {
      throw new PermissionError('Only a Workspace Owner can revoke invitations.');
    }

    if (record.status !== 'pending') {
      throw new ValidationError(
        `This invitation cannot be revoked — its current status is "${record.status}".`,
      );
    }

    const now = Date.now();
    await this.invitationRepository.markRevoked(invitationId, now);

    this.logger?.audit('INVITATION_REVOKED', {
      invitationId,
      workspaceId: record.workspace_id,
      revokedBy: requestingUserId,
      recipientEmail: record.email,
    });

    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // listPending  (Workspace Owner only)
  // ---------------------------------------------------------------------------

  /**
   * Returns all pending invitations for a workspace.
   *
   * @param {string} workspaceId
   * @returns {Array}
   */
  async listPending(workspaceId) {
    // Run lazy expiry before listing so stale rows don't appear as pending
    await this.invitationRepository.expirePending(Date.now());
    const rows = await this.invitationRepository.findPendingByWorkspace(workspaceId);
    // Return only the fields needed by the UI — never token hash
    return rows.map(r => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      authProvider: r.auth_provider,
      status: r.status,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
  }
}
