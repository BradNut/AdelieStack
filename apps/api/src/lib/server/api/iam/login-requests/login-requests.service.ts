import { inject, injectable } from '@needle-di/core';
import { TokensService } from '../../common/services/tokens.service';
import { VerificationCodesService } from '../../common/services/verification-codes.service';
import { BadRequest } from '../../common/utils/exceptions';
import { MailerService } from '../../mail/mailer.service';
import { LoginVerificationEmail } from '../../mail/templates/login-verification.template';
import { WelcomeEmail } from '../../mail/templates/welcome.template';
import { CredentialsRepository } from '../../users/credentials.repository';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import type { CreateLoginRequestDto } from '../../../../dtos/login/create-login-request.dto';
import type { SignInDto } from '../../../../dtos/login/signin.dto';
import type { VerifyLoginRequestDto } from '../../../../dtos/login/verify-login-request.dto';
import { LoginRequestsRepository } from './login-requests.repository';
import { LoggerService } from '../../common/services/logger.service';

@injectable()
export class LoginRequestsService {
  constructor(
    private credentialsRepository = inject(CredentialsRepository),
    private loggerService = inject(LoggerService),
    private loginRequestsRepository = inject(LoginRequestsRepository),
    private usersRepository = inject(UsersRepository),
    private verificationCodesService = inject(VerificationCodesService),
    private usersService = inject(UsersService),
    private sessionsService = inject(SessionsService),
    private tokensService = inject(TokensService),
    private mailer = inject(MailerService),
  ) {}

  async login({ identifier, password }: SignInDto) {
    const existingUser = await this.usersRepository.findOneByEmailOrUsername(identifier);

    if (!existingUser) {
      this.loggerService.log.debug('User not found for identifier', identifier);
      throw BadRequest('Invalid credentials');
    }

    const credential = await this.credentialsRepository.findPasswordCredentialsByUserId(existingUser.id);

    if (!credential) {
      this.loggerService.log.debug('Password credential not found for user', existingUser.id);
      throw BadRequest('Invalid credentials');
    }

    if (!(await this.tokensService.verifyHashedToken(password, credential.secret_data))) {
      this.loggerService.log.debug(`Invalid password for user ${existingUser.id}`);
      throw BadRequest('Invalid credentials');
    }

    // const totpCredentials = await this.credentialsRepository.findTOTPCredentialsByUserId(existingUser.id);

    return this.authExistingUser({ userId: existingUser.id });
  }

  async verify({ email, code }: VerifyLoginRequestDto) {
    // find the hashed verification code for the email
    const loginRequest = await this.loginRequestsRepository.get(email);

    // if no hashed code is found, the request is invalid
    if (!loginRequest) throw BadRequest('Invalid code');

    // verify the code
    const isValid = await this.verificationCodesService.verify({
      verificationCode: code,
      hashedVerificationCode: loginRequest.hashedCode,
    });

    // if the code is invalid, throw an error
    if (!isValid) throw BadRequest('Invalid code');

    // burn the login request so it can't be used again
    await this.loginRequestsRepository.delete(email);

    // check if the user already exists
    const existingUser = await this.usersRepository.findOneByEmail(email);

    // if the user exists, log them in, otherwise create a new user and log them in
    return existingUser ? this.authExistingUser({ userId: existingUser.id }) : this.authNewUser({ email });
  }

  async sendVerificationCode({ email }: CreateLoginRequestDto) {
    // remove any existing login requests
    await this.loginRequestsRepository.delete(email);

    // generate a new verification code and hash
    const { verificationCode, hashedVerificationCode } = await this.verificationCodesService.generateCodeWithHash();

    // create a new login request
    await this.loginRequestsRepository.set({
      email,
      hashedCode: hashedVerificationCode,
    });

    // send the verification email
    await this.mailer.send({
      to: email,
      template: new LoginVerificationEmail(verificationCode),
    });
  }

  private async authNewUser({ email }: { email: string }) {
    // create a new user
    const user = await this.usersService.createEmail(email);

    // send the welcome email
    await this.mailer.send({
      to: email,
      template: new WelcomeEmail(),
    });

    // create a new session
    return this.sessionsService.createSession(user.id);
  }

  private async authExistingUser({ userId }: { userId: string }) {
    return this.sessionsService.createSession(userId);
  }
}
