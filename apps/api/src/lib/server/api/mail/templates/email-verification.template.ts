import type { EmailTemplate } from '../interfaces/email-template.interface';

export class EmailVerificationEmail implements EmailTemplate {
  constructor(private readonly url: string) {}

  subject(): string {
    return 'Verify your email';
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
				<p class='title'>Verify your email</p>
				<p>Confirm this address to finish setting up your account. If you did not create an account, you can ignore this message.</p>
				<p><a href='${this.url}'>Verify email</a></p>
			</body>
			<style>
				.title { font-size: 24px; font-weight: 700; }
			</style>
		</html>
		`;
  }
}
