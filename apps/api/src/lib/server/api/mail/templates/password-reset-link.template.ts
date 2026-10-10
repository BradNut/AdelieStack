import type { EmailTemplate } from '../interfaces/email-template.interface';

export class PasswordResetLinkEmail implements EmailTemplate {
  constructor(private readonly url: string) {}

  subject(): string {
    return 'Reset your password';
  }

  html() {
    return /*html*/ `
		<html lang='en'>
			<head>
				<meta http-equiv='X-UA-Compatible' content='IE=edge' />
				<meta name='viewport' content='width=device-width, initial-scale=1.0' />
				<title>Message</title>
			</head>
			<body>
				<p class='title'>Reset your password</p>
				<p>You requested a password reset. Use the link below to choose a new password. If you did not ask for this, you can ignore this message.</p>
				<p><a href='${this.url}'>Reset password</a></p>
			</body>
			<style>
				.title { font-size: 24px; font-weight: 700; }
			</style>
		</html>
		`;
  }
}
