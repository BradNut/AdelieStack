import type { EmailTemplate } from '../interfaces/email-template.interface';

export class RecoveryCodesUsedEmail implements EmailTemplate {
  constructor() {}

  subject(): string {
    return 'A recovery code was used';
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
				<p class='title'>A recovery code was used</p>
				<p>A two-factor recovery code was just used to sign in to your account. Each code works once. If this was not you, secure your account straight away.</p>
			</body>
			<style>
				.title { font-size: 24px; font-weight: 700; }
			</style>
		</html>
		`;
  }
}
