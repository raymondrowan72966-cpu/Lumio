import { ValidationError, DatabaseError } from '../errors/index.js';

const ROLE_CANONICAL = {
  admin:           'administrator',
  owner:           'workspace_owner',
  administrator:   'administrator',
  workspace_owner: 'workspace_owner',
};

const ROLE_LABEL = {
  administrator:   'Administrator',
  workspace_owner: 'Workspace Owner',
};

const MAX_WORKSPACE_OWNERS = 2;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Orchestrates direct workspace member creation — the primary onboarding
 * path that replaces invitation-based workflows for day-to-day use.
 *
 * Follows the exact same architectural pattern as InvitationService:
 * - Composed from UserRepository, WorkspaceRepository, PasswordService, EmailService
 * - Instantiated per-request via buildMemberService() in workspaces.js
 * - Atomic db.batch() for user + membership creation
 * - Email is optional and non-blocking (failures are logged, never thrown)
 *
 * The invitation system is not modified; this service is entirely additive.
 *
 * Collaborators:
 *   userRepository       — existing user lookup, new user creation
 *   workspaceRepository  — workspace/membership lookup, membership creation, owner count
 *   passwordService      — hashes the temporary password
 *   emailService         — optional welcome email (fire-and-forget)
 *   db                   — raw D1 client for atomic batch operations
 *   logger               — structured audit logging
 */
export class MemberService {
  constructor({
    userRepository,
    workspaceRepository,
    passwordService,
    emailService,
    db,
    logger,
  } = {}) {
    this.userRepository = userRepository;
    this.workspaceRepository = workspaceRepository;
    this.passwordService = passwordService;
    this.emailService = emailService;
    this.db = db;
    this.logger = logger;
  }

  // ---------------------------------------------------------------------------
  // createMember
  // ---------------------------------------------------------------------------

  /**
   * Creates a new workspace member directly — no invitation token, no pending
   * state. The user is active immediately and can log in with the temporary
   * password supplied by the Workspace Owner.
   *
   * @param {{ workspaceId, creatorUserId, firstName, lastName, email, role, temporaryPassword }} params
   * @returns {{ ok: true, userId: string }}
   */
  async createMember({
    workspaceId,
    creatorUserId,
    firstName,
    lastName = '',
    email,
    role,
    temporaryPassword,
  }) {
    // --- 1. Validate required fields ----------------------------------------
    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      throw new ValidationError('First name is required.');
    }
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email address is required.');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_FORMAT.test(normalizedEmail)) {
      throw new ValidationError('Email address is not valid.');
    }
    if (!temporaryPassword || typeof temporaryPassword !== 'string') {
      throw new ValidationError('A temporary password is required.');
    }

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = typeof lastName === 'string' ? lastName.trim() : '';

    // --- 2. Canonicalize role ------------------------------------------------
    const canonicalRole = ROLE_CANONICAL[role];
    if (!canonicalRole) {
      throw new ValidationError(
        `Role must be "administrator" or "workspace_owner". Received: "${role}".`,
      );
    }

    // --- 3. Verify workspace exists ------------------------------------------
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new ValidationError('Workspace not found.');
    }

    // --- 4. Enforce Workspace Owner limit ------------------------------------
    if (canonicalRole === 'workspace_owner') {
      const ownerCount = await this.workspaceRepository.countWorkspaceOwners(workspaceId);
      if (ownerCount >= MAX_WORKSPACE_OWNERS) {
        throw new ValidationError(
          `A workspace may have at most ${MAX_WORKSPACE_OWNERS} Workspace Owners. ` +
          'Change an existing owner to Administrator before adding another.',
        );
      }
    }

    // --- 5. Check for existing user with this email -------------------------
    const existingUser = await this.userRepository.findByEmail(normalizedEmail);

    if (existingUser) {
      const existingMembership = await this.workspaceRepository.findMembership(
        workspaceId,
        existingUser.id,
      );
      if (existingMembership) {
        throw new ValidationError(
          'A user with this email address is already a member of this workspace.',
        );
      }

      // Enforce one-user-one-workspace: reject if the user belongs to any workspace.
      const alreadyMember = await this.workspaceRepository.userHasAnyMembership(existingUser.id);
      if (alreadyMember) {
        throw new ValidationError(
          'This user already belongs to another workspace and cannot be added to this workspace.',
        );
      }

      // Existing user, no membership anywhere — add to this workspace only
      const now = Date.now();
      await this.workspaceRepository.addMember({
        workspaceId,
        userId: existingUser.id,
        role: canonicalRole,
        invitationAcceptedAt: null,
        now,
      });

      this.logger?.audit('MEMBER_CREATED', {
        workspaceId,
        userId: existingUser.id,
        role: canonicalRole,
        creatorUserId,
        existingUser: true,
      });

      this._sendWelcomeEmailSilently({
        to: normalizedEmail,
        firstName: normalizedFirstName,
        workspaceName: workspace.name,
        role: ROLE_LABEL[canonicalRole],
      });

      return { ok: true, userId: existingUser.id };
    }

    // --- 6. New user — hash password, create user + membership atomically ----
    // passwordService.hash() validates complexity and throws ValidationError on failure
    const passwordHash = await this.passwordService.hash(temporaryPassword);
    const userId = crypto.randomUUID();
    const displayName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const now = Date.now();

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

    const membershipStatement = this.workspaceRepository.buildAddMemberStatement({
      workspaceId,
      userId,
      role: canonicalRole,
      invitationAcceptedAt: null,
      now,
    });

    try {
      await this.db.batch([userStatement, membershipStatement]);
    } catch (err) {
      const message = String(err);
      this.logger?.error('member creation transaction failed', { workspaceId, error: message });
      if (message.toLowerCase().includes('unique')) {
        throw new ValidationError(
          'A user with this email address already exists.',
        );
      }
      throw new DatabaseError(
        'Member creation failed. Please try again.',
        { cause: message },
      );
    }

    this.logger?.audit('MEMBER_CREATED', {
      workspaceId,
      userId,
      role: canonicalRole,
      creatorUserId,
    });

    this._sendWelcomeEmailSilently({
      to: normalizedEmail,
      firstName: normalizedFirstName,
      workspaceName: workspace.name,
      role: ROLE_LABEL[canonicalRole],
    });

    return { ok: true, userId };
  }

  // ---------------------------------------------------------------------------
  // listMembers
  // ---------------------------------------------------------------------------

  /**
   * Returns all members of a workspace with their user details.
   *
   * @param {string} workspaceId
   * @returns {Array<{ userId, email, firstName, lastName, displayName, role, status, joinedAt }>}
   */
  async listMembers(workspaceId) {
    const rows = await this.workspaceRepository.listMembers(workspaceId);
    return rows.map(r => ({
      userId:      r.userId,
      email:       r.email,
      firstName:   r.firstName,
      lastName:    r.lastName,
      displayName: r.displayName,
      role:        r.role,
      status:      r.status,
      joinedAt:    r.joinedAt,
    }));
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Fire-and-forget welcome email. Email failure is logged but never re-thrown
   *  so member creation is never blocked or rolled back by email problems. */
  _sendWelcomeEmailSilently({ to, firstName, workspaceName, role }) {
    if (!this.emailService) return;
    this.emailService
      .sendWelcomeMemberEmail({ to, firstName, workspaceName, role })
      .catch(err => {
        this.logger?.warn('Welcome email failed (non-fatal)', {
          to,
          error: String(err),
        });
      });
  }
}
