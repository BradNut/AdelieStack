import { createHono } from '#lib/server/api/common/utils/hono';

export abstract class Controller {
  protected readonly controller: ReturnType<typeof createHono>;
  constructor() {
    this.controller = createHono();
  }
  abstract routes(): ReturnType<typeof createHono>;
}

export abstract class RootController extends Controller {
  abstract registerControllers(): ReturnType<typeof createHono>;
}
