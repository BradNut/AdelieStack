/** Sends the browser to another page with a full navigation. Kept apart so tests can observe where it would go. */
export function redirectBrowser(url: string): void {
  window.location.assign(url);
}
