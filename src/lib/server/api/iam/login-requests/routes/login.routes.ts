import { StatusCodes } from '$lib/utils/status-codes';
import { defineOpenApiOperation } from 'hono-zod-openapi';
import { createErrorSchema } from 'stoker/openapi/schemas';
import { loginRequestDto } from '../dtos/login-request.dto';

export const signInEmail = defineOpenApiOperation({
  tags: ['Login'],
  summary: 'Sign in with email',
  description: 'Sign in with email',
  responses: {
    [StatusCodes.OK]: {
      description: 'Sign in with username',
      schema: loginRequestDto,
    },
    [StatusCodes.UNPROCESSABLE_ENTITY]: {
      description: 'The validation error(s)',
      schema: createErrorSchema(loginRequestDto),
      mediaType: 'application/json',
    },
  },
});
