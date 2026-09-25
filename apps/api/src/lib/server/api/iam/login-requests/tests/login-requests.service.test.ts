import { VERIFICATION_CODE_LENGTH } from '@adelie/shared';
import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoggerServiceMock } from '../../../../../../test/mocks/logger.mock';
import { createMailerServiceMock } from '../../../../../../test/mocks/mailer.mock';
import { LoggerService } from '../../../common/services/logger.service';
import { TokensService } from '../../../common/services/tokens.service';
import { VerificationCodesService } from '../../../common/services/verification-codes.service';
import { buildPasswordCredential, buildSession, buildUser, TEST_EMAIL, TEST_USER_ID } from '../../../common/testing/factories';
import { createTestContainer, mockProvider } from '../../../common/testing/test-container';
import { MailerService } from '../../../mail/mailer.service';
import { LoginVerificationEmail } from '../../../mail/templates/login-verification.template';
import { WelcomeEmail } from '../../../mail/templates/welcome.template';
import { CredentialsRepository } from '../../../users/credentials.repository';
import { UsersRepository } from '../../../users/users.repository';
import { UsersService } from '../../../users/users.service';
import { SessionsService } from '../../sessions/sessions.service';
import { LoginRequestsRepository } from '../login-requests.repository';
import { LoginRequestsService } from '../login-requests.service';

// UsersService transitively pulls in object storage; replace the module so this suite never loads it.
vi.mock('../../../users/users.service', () => ({ UsersService: class UsersService {} }));

const VALID_CODE = 'A'.repeat(VERIFICATION_CODE_LENGTH);
const HASHED_CODE = `hashed:${VALID_CODE}`;

function createMocks() {
  return {
    credentialsRepository: { findPasswordCredentialsByUserId: vi.fn() },
    loginRequestsRepository: {
      get: vi.fn<LoginRequestsRepository['get']>(async () => null),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    },
    usersRepository: { findOneByEmailOrUsername: vi.fn(), findOneByEmail: vi.fn() },
    usersService: { createEmail: vi.fn() },
    sessionsService: { createSession: vi.fn(async (userId: string) => ({ ...buildSession({ userId }), fresh: true })) },
    tokensService: { verifyHashedToken: vi.fn(async (token: string, hashed: string) => hashed === `hashed:${token}`) },
    verificationCodesService: {
      generateCodeWithHash: vi.fn(async () => ({ verificationCode: VALID_CODE, hashedVerificationCode: HASHED_CODE })),
      verify: vi.fn(
        async (args: { verificationCode: string; hashedVerificationCode: string }) =>
          args.hashedVerificationCode === `hashed:${args.verificationCode}`,
      ),
    },
    logger: createLoggerServiceMock(),
    mailer: createMailerServiceMock(),
  };
}

function expectBadRequest(message: string) {
  return expect.objectContaining({ status: 400, message });
}

describe('LoginRequestsService', () => {
  let mocks: ReturnType<typeof createMocks>;
  let service: LoginRequestsService;

  beforeEach(() => {
    mocks = createMocks();
    service = createTestContainer(
      mockProvider(CredentialsRepository, mocks.credentialsRepository),
      mockProvider(LoggerService, mocks.logger),
      mockProvider(LoginRequestsRepository, mocks.loginRequestsRepository),
      mockProvider(UsersRepository, mocks.usersRepository),
      mockProvider(VerificationCodesService, mocks.verificationCodesService),
      mockProvider(UsersService, mocks.usersService),
      mockProvider(SessionsService, mocks.sessionsService),
      mockProvider(TokensService, mocks.tokensService),
      mockProvider(MailerService, mocks.mailer),
    ).get(LoginRequestsService);
  });

  describe('login', () => {
    const input = { identifier: 'penguin', password: 'correct-password' };

    it('creates a session when the password matches', async () => {
      mocks.usersRepository.findOneByEmailOrUsername.mockResolvedValueOnce(buildUser());
      mocks.credentialsRepository.findPasswordCredentialsByUserId.mockResolvedValueOnce(
        buildPasswordCredential({ secret_data: 'hashed:correct-password' }),
      );

      const session = await service.login(input);

      expect(session).toMatchObject({ userId: TEST_USER_ID, fresh: true });
      expect(mocks.usersRepository.findOneByEmailOrUsername).toHaveBeenCalledWith('penguin');
      expect(mocks.sessionsService.createSession).toHaveBeenCalledExactlyOnceWith(TEST_USER_ID);
    });

    it('rejects with a generic error when the user does not exist', async () => {
      mocks.usersRepository.findOneByEmailOrUsername.mockResolvedValueOnce(null);

      await expect(service.login(input)).rejects.toEqual(expectBadRequest('Invalid credentials'));
      expect(mocks.credentialsRepository.findPasswordCredentialsByUserId).not.toHaveBeenCalled();
      expect(mocks.sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects with the same generic error when the user has no password credential', async () => {
      mocks.usersRepository.findOneByEmailOrUsername.mockResolvedValueOnce(buildUser());
      mocks.credentialsRepository.findPasswordCredentialsByUserId.mockResolvedValueOnce(undefined);

      await expect(service.login(input)).rejects.toEqual(expectBadRequest('Invalid credentials'));
      expect(mocks.tokensService.verifyHashedToken).not.toHaveBeenCalled();
      expect(mocks.sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects with the same generic error when the password is wrong', async () => {
      mocks.usersRepository.findOneByEmailOrUsername.mockResolvedValueOnce(buildUser());
      mocks.credentialsRepository.findPasswordCredentialsByUserId.mockResolvedValueOnce(
        buildPasswordCredential({ secret_data: 'hashed:other-password' }),
      );

      await expect(service.login(input)).rejects.toEqual(expectBadRequest('Invalid credentials'));
      expect(mocks.sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects an empty password (boundary)', async () => {
      mocks.usersRepository.findOneByEmailOrUsername.mockResolvedValueOnce(buildUser());
      mocks.credentialsRepository.findPasswordCredentialsByUserId.mockResolvedValueOnce(buildPasswordCredential());

      await expect(service.login({ ...input, password: '' })).rejects.toBeInstanceOf(HTTPException);
    });

    it('does not leak the identifier into the error message', async () => {
      mocks.usersRepository.findOneByEmailOrUsername.mockResolvedValueOnce(null);

      await expect(service.login(input)).rejects.not.toEqual(expect.objectContaining({ message: expect.stringContaining('penguin') }));
    });

    it('propagates database failures', async () => {
      mocks.usersRepository.findOneByEmailOrUsername.mockRejectedValueOnce(new Error('database unavailable'));

      await expect(service.login(input)).rejects.toThrow('database unavailable');
      expect(mocks.sessionsService.createSession).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    beforeEach(() => {
      mocks.loginRequestsRepository.get.mockResolvedValue({ email: TEST_EMAIL, hashedCode: HASHED_CODE });
    });

    it('logs in an existing user and burns the login request', async () => {
      mocks.usersRepository.findOneByEmail.mockResolvedValueOnce(buildUser());

      const session = await service.verify({ email: TEST_EMAIL, code: VALID_CODE });

      expect(session).toMatchObject({ userId: TEST_USER_ID });
      expect(mocks.loginRequestsRepository.delete).toHaveBeenCalledExactlyOnceWith(TEST_EMAIL);
      expect(mocks.usersService.createEmail).not.toHaveBeenCalled();
      expect(mocks.mailer.send).not.toHaveBeenCalled();
    });

    it('creates a new user, sends a welcome email, and logs them in', async () => {
      mocks.usersRepository.findOneByEmail.mockResolvedValueOnce(null);
      mocks.usersService.createEmail.mockResolvedValueOnce(buildUser({ id: 'new_user' }));

      const session = await service.verify({ email: TEST_EMAIL, code: VALID_CODE });

      expect(mocks.usersService.createEmail).toHaveBeenCalledExactlyOnceWith(TEST_EMAIL);
      expect(mocks.mailer.sent).toHaveLength(1);
      expect(mocks.mailer.sent[0]).toMatchObject({ to: TEST_EMAIL });
      expect(mocks.mailer.sent[0]?.template).toBeInstanceOf(WelcomeEmail);
      expect(session).toMatchObject({ userId: 'new_user' });
    });

    it('rejects when no login request exists for the email', async () => {
      mocks.loginRequestsRepository.get.mockResolvedValueOnce(null);

      await expect(service.verify({ email: TEST_EMAIL, code: VALID_CODE })).rejects.toEqual(expectBadRequest('Invalid code'));
      expect(mocks.verificationCodesService.verify).not.toHaveBeenCalled();
      expect(mocks.sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects a wrong code without burning the login request', async () => {
      await expect(service.verify({ email: TEST_EMAIL, code: 'ZZZZZZ' })).rejects.toEqual(expectBadRequest('Invalid code'));
      expect(mocks.loginRequestsRepository.delete).not.toHaveBeenCalled();
      expect(mocks.sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('rejects an empty code (boundary)', async () => {
      await expect(service.verify({ email: TEST_EMAIL, code: '' })).rejects.toEqual(expectBadRequest('Invalid code'));
    });

    it('cannot reuse a code once the request has been burned', async () => {
      mocks.usersRepository.findOneByEmail.mockResolvedValue(buildUser());
      mocks.loginRequestsRepository.get.mockResolvedValueOnce({ email: TEST_EMAIL, hashedCode: HASHED_CODE }).mockResolvedValueOnce(null);

      await service.verify({ email: TEST_EMAIL, code: VALID_CODE });

      await expect(service.verify({ email: TEST_EMAIL, code: VALID_CODE })).rejects.toEqual(expectBadRequest('Invalid code'));
      expect(mocks.sessionsService.createSession).toHaveBeenCalledOnce();
    });

    it('propagates welcome email failures for new users', async () => {
      mocks.usersRepository.findOneByEmail.mockResolvedValueOnce(null);
      mocks.usersService.createEmail.mockResolvedValueOnce(buildUser());
      mocks.mailer.send.mockRejectedValueOnce(new Error('smtp down'));

      await expect(service.verify({ email: TEST_EMAIL, code: VALID_CODE })).rejects.toThrow('smtp down');
      expect(mocks.sessionsService.createSession).not.toHaveBeenCalled();
    });

    it('propagates redis failures when reading the login request', async () => {
      mocks.loginRequestsRepository.get.mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(service.verify({ email: TEST_EMAIL, code: VALID_CODE })).rejects.toThrow('redis unavailable');
    });
  });

  describe('sendVerificationCode', () => {
    it('replaces any previous request, stores the hashed code, and emails the plain code', async () => {
      await service.sendVerificationCode({ email: TEST_EMAIL });

      expect(mocks.loginRequestsRepository.delete).toHaveBeenCalledWith(TEST_EMAIL);
      expect(mocks.loginRequestsRepository.set).toHaveBeenCalledExactlyOnceWith({ email: TEST_EMAIL, hashedCode: HASHED_CODE });
      expect(mocks.loginRequestsRepository.delete.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.loginRequestsRepository.set.mock.invocationCallOrder[0] ?? 0,
      );

      expect(mocks.mailer.sent).toHaveLength(1);
      const [mail] = mocks.mailer.sent;
      expect(mail?.to).toBe(TEST_EMAIL);
      expect(mail?.template).toBeInstanceOf(LoginVerificationEmail);
      expect(mail?.template.html()).toContain(VALID_CODE);
      expect(mail?.template.html()).not.toContain(HASHED_CODE);
    });

    it('does not send an email when storing the request fails', async () => {
      mocks.loginRequestsRepository.set.mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(service.sendVerificationCode({ email: TEST_EMAIL })).rejects.toThrow('redis unavailable');
      expect(mocks.mailer.send).not.toHaveBeenCalled();
    });

    it('propagates mail delivery failures', async () => {
      mocks.mailer.send.mockRejectedValueOnce(new Error('smtp down'));

      await expect(service.sendVerificationCode({ email: TEST_EMAIL })).rejects.toThrow('smtp down');
    });

    it('propagates code generation failures before touching storage', async () => {
      mocks.verificationCodesService.generateCodeWithHash.mockRejectedValueOnce(new Error('hash failed'));

      await expect(service.sendVerificationCode({ email: TEST_EMAIL })).rejects.toThrow('hash failed');
      expect(mocks.loginRequestsRepository.set).not.toHaveBeenCalled();
      expect(mocks.mailer.send).not.toHaveBeenCalled();
    });
  });
});
