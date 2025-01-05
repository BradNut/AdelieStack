import type { ResetPasswordCodeDto } from '$lib/dtos/reset-password';
import type { ResetPasswordNewPasswordDto } from '$lib/dtos/reset-password/reset-password-new-password.dto';
import { inject, injectable } from '@needle-di/core';
import type { CreateLoginRequestDto } from '../../../../dtos/login/create-login-request.dto';
import type {  } from '../../../../dtos/login/verify-login-request.dto';
import { LoggerService } from '../../common/services/logger.service';
import { VerificationCodesService } from '../../common/services/verification-codes.service';
import { BadRequest } from '../../common/utils/exceptions';
import { MailerService } from '../../mail/mailer.service';
import { ResetPasswordEmail } from '../../mail/templates/reset-password.template';
import { UsersRepository } from '../../users/users.repository';
import { UsersService } from '../../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { ResetPasswordRequestsRepository } from './reset-password-requests.repository';

@injectable()
export class ResetPasswordRequestsService {
	constructor(
		private loggerService = inject(LoggerService),
		private resetPasswordRequestsRepository = inject(ResetPasswordRequestsRepository),
		private usersRepository = inject(UsersRepository),
		private verificationCodesService = inject(VerificationCodesService),
		private usersService = inject(UsersService),
		private sessionsService = inject(SessionsService),
		private mailer = inject(MailerService),
	) {}

	async verify({ email, code }: ResetPasswordCodeDto) {
		// find the hashed verification code for the email
		const resetPasswordRequest = await this.resetPasswordRequestsRepository.get(email);

		// if no hashed code is found, the request is invalid
		if (!resetPasswordRequest) throw BadRequest('Invalid code');

		// verify the code
		const isValid = await this.verificationCodesService.verify({
			verificationCode: code,
			hashedVerificationCode: resetPasswordRequest.hashedCode,
		});

		// if the code is invalid, throw an error
		if (!isValid) {
			throw BadRequest('Invalid code');
		}

		// burn the login request so it can't be used again
		await this.resetPasswordRequestsRepository.delete(email);

		// check if the user already exists
		const existingUser = await this.usersRepository.findOneByEmail(email);

		if (!existingUser) {
			this.loggerService.log.debug('User not found for email', email);
			throw BadRequest('Unable to reset password');
		}

		return true;
	}
	async sendResetPasswordCode({ email }: CreateLoginRequestDto) {
		// check if the user already exists
		const existingUser = await this.usersRepository.findOneByEmail(email);

		if (!existingUser) {
			this.loggerService.log.debug(`User not found for email: ${email}`);
			return;
		}

		// remove any existing login requests
		await this.resetPasswordRequestsRepository.delete(email);

		// generate a new verification code and hash
		const { verificationCode, hashedVerificationCode } = await this.verificationCodesService.generateCodeWithHash();

		// create a new login request
		await this.resetPasswordRequestsRepository.set({
			email,
			hashedCode: hashedVerificationCode,
		});

		// send the verification email
		await this.mailer.send({
			to: email,
			template: new ResetPasswordEmail(verificationCode),
		});
	}
	async resetPassword({ email, password, confirm_password }: ResetPasswordNewPasswordDto) {
  	if (password !== confirm_password) {
			throw BadRequest('Passwords do not match');
		}

  	// check if the user already exists
    const existingUser = await this.usersRepository.findOneByEmail(email);

		if (!existingUser) {
			throw BadRequest('Unable to reset password');
		}

		await this.usersService.updatePassword(existingUser.id, password);
		return true;
	}
	private async authExistingUser({ userId }: { userId: string }) {
		return this.sessionsService.createSession(userId);
	}
}
