import { StatusCodes } from '@adelie/shared';
import type { RequestEvent } from '@sveltejs/kit';

// OAuth not implemented yet - stub endpoint
export async function GET(event: RequestEvent): Promise<Response> {
  return new Response(JSON.stringify({ message: 'OAuth not implemented' }), {
    status: StatusCodes.NOT_IMPLEMENTED,
  });
}
