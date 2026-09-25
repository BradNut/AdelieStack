export const LandingPage = {
  ADMIN: 'admin',
  USER: 'user',
} as const;

export type LandingPage = (typeof LandingPage)[keyof typeof LandingPage];
