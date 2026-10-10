import { z } from 'zod';
import { PASSWORD_REQUIRED_MESSAGE } from '../../../constants/validation-messages';

export const deleteAccountDto = z.object({
  password: z.string().min(1, { message: PASSWORD_REQUIRED_MESSAGE }),
});

export type DeleteAccountDto = z.infer<typeof deleteAccountDto>;
