/** Whether `url` is an https URL; anything unparseable is not. */
export function isHttpsUrl(url: string): boolean {
  return URL.parse(url)?.protocol === 'https:';
}
