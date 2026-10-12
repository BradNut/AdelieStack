import type { CspDirectives } from '@sveltejs/kit';

export const SPOTLIGHT_ORIGIN: string;
export const CAPTCHA_ORIGINS: string[];
export function createCspDirectives(options?: { development?: boolean }): CspDirectives;
declare const cspDirectives: CspDirectives;
export default cspDirectives;
