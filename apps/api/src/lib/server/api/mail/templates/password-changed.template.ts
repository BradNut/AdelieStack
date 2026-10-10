import type { EmailTemplate } from '../interfaces/email-template.interface';

export class PasswordChangedEmail implements EmailTemplate {
  subject(): string {
    return 'Your password was changed';
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
				<p class='title'>Your password was changed</p>
				<p>The password for your account was just changed. If this was not you, reset your password and review your account security straight away.</p>
			</body>
			<style>
				.title { font-size: 24px; font-weight: 700; }
			</style>
		</html>
		`;
  }
}
