import type { EmailTemplate } from '../interfaces/email-template.interface';

export class EmailChangeRequestEmail implements EmailTemplate {
  constructor(private readonly url: string) {}

  subject(): string {
    return 'Confirm your new email address';
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
				<p class='title'>Confirm your new email address</p>
				<p>Confirm this address to make it the email for your account. If you did not ask for this change, you can ignore this message.</p>
				<p><a href='${this.url}'>Confirm email change</a></p>
			</body>
			<style>
				.title { font-size: 24px; font-weight: 700; }
			</style>
		</html>
		`;
  }
}
