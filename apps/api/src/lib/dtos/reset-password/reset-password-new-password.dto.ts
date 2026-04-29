import { refinePasswords } from '$lib/validations/account';
import { z } from 'zod';

export const resetPasswordNewPasswordDto = z.object({
	email: z.string().trim().email(),
	password: z.string({ required_error: 'Password is required' }).trim(),
	confirm_password: z.string({ required_error: 'Confirm Password is required' }).trim(),
})
.superRefine(({ confirm_password, password }, ctx) => {
	return refinePasswords(confirm_password, password, ctx);
});

export type ResetPasswordNewPasswordDto = z.infer<typeof resetPasswordNewPasswordDto>;
