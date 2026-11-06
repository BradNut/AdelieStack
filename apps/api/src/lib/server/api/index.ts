import { Container } from '@needle-di/core';
import { ApplicationModule } from './application.module';

const applicationModule = new Container().get(ApplicationModule);

export const app = applicationModule.app();

/* ------------------------------ startServer ------------------------------ */
export function startServer() {
  return applicationModule.start();
}
