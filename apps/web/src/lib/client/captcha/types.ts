import type { CaptchaProvider } from '@adelie/shared';

export interface CaptchaRenderOptions {
  siteKey: string;
  theme: 'light' | 'dark';
  /** BCP 47 language tag; used where the provider lets the widget follow the site's language. */
  language: string;
  /** A fresh single-use Captcha Token is ready. */
  onToken(token: string): void;
  /** The token expired or the challenge was reset; the previous token is no longer valid. */
  onExpire(): void;
  /** The widget itself failed (blocked script, provider error). */
  onError(): void;
}

export interface CaptchaWidgetHandle {
  /** Starts a new challenge; call after every submit because tokens are single-use. */
  reset(): void;
  destroy(): void;
}

/** What a clone implements to support another Captcha Provider on the web. */
export interface CaptchaWidget {
  provider: CaptchaProvider;
  render(container: HTMLElement, options: CaptchaRenderOptions): Promise<CaptchaWidgetHandle>;
}
