import type { EmailTemplate } from '../interfaces/email-template.interface';

export class EmailChangeNoticeEmail implements EmailTemplate {
  constructor(private readonly newEmail: string) {}

  subject(): string {
    return 'Your email address was changed';
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
				<p class='title'>Your email address was changed</p>
				<p>The email for your account is now ${this.newEmail}. This address no longer receives account email.</p>
				<p>If this was not you, contact support right away and secure your account.</p>
			</body>
			<style>
				.title { font-size: 24px; font-weight: 700; }
			</style>
		</html>
		`;
  }
}
