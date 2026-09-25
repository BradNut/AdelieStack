import { type ApplyGlobalResponse, hc } from 'hono/client';
import type { ApplicationController } from '../../../apps/api/src/lib/server/api/application.controller';

interface GlobalErrors {
  500: { json: { status: number; message: string; stack?: string } };
  400: { json: { status: number; message: string } };
  401: { json: { status: number; message: string } };
  403: { json: { status: number; message: string } };
  404: { json: { status: number; message: string } };
}

export type ApiRoutes = ApplyGlobalResponse<ReturnType<ApplicationController['registerControllers']>, GlobalErrors>;

const rpc = hc<ApiRoutes>('http://localhost');

export type ApiClient = typeof rpc;
