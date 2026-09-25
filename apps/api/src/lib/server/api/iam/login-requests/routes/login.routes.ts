import { loginRequestDto, StatusCodes } from '@adelie/shared';
import { defineOpenApiOperation } from 'hono-zod-openapi';
import { createErrorSchema } from 'stoker/openapi/schemas';

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
