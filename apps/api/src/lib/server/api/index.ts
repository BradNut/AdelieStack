import { Container } from '@needle-di/core';
import { ApplicationController } from './application.controller';
import { ApplicationModule } from './application.module';

const applicationController = new Container().get(ApplicationController);
const applicationModule = new Container().get(ApplicationModule);

export const app = applicationModule.app();

/* ------------------------------ startServer ------------------------------ */
export function startServer() {
  return applicationModule.start();
}

/* ----------------------------------- api ---------------------------------- */
export const routes = applicationController.registerControllers();

/* ---------------------------------- Types --------------------------------- */
export type ApiRoutes = typeof routes;
