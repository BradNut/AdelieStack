import { Container } from '@needle-di/core';
import type { ApplicationController } from './application.controller';
import { ApplicationModule } from './application.module';

const applicationModule = new Container().get(ApplicationModule);

/* ------------------------------ startServer ------------------------------ */
export function startServer() {
  return applicationModule.start();
}

/* ---------------------------------- Types --------------------------------- */
/** A type only, so importing it builds no second app. */
export type ApiRoutes = ReturnType<ApplicationController['registerControllers']>;
