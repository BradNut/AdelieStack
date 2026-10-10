import type { EmailTemplate } from '../interfaces/email-template.interface';

export class RecoveryCodesRegeneratedEmail implements EmailTemplate {
  constructor() {}

  subject(): string {
    return 'Your recovery codes were regenerated';
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
				<p class='title'>Your recovery codes were regenerated</p>
				<p>New two-factor recovery codes were generated for your account. Your old codes no longer work. If this was not you, secure your account straight away.</p>
			</body>
			<style>
				.title { font-size: 24px; font-weight: 700; }
			</style>
		</html>
		`;
  }
}
