import { injectable } from '@needle-di/core';
import { RedisRepository } from '../../common/factories/redis-repository.factory';

/* -------------------------------------------------------------------------- */
/*                                    Model                                   */
/* -------------------------------------------------------------------------- */
type ResetPasswordRequest = { email: string; hashedCode: string };

/* -------------------------------------------------------------------------- */
/*                                 Repository                                 */
/* -------------------------------------------------------------------------- */
@injectable()
export class ResetPasswordRequestsRepository extends RedisRepository<'password-reset-request'> {
	async set(args: ResetPasswordRequest) {
		return this.redis.setWithExpiry({
			prefix: this.prefix,
			key: args.email.toLowerCase(),
			value: args.hashedCode,
			expiry: 60 * 15
		});
	}

	delete(email: string) {
		return this.redis.delete({ prefix: this.prefix, key: email.toLowerCase() });
	}

	async get(email: string): Promise<ResetPasswordRequest | null> {
		const hashedCode = await this.redis.get({
			prefix: this.prefix,
			key: email.toLowerCase()
		});
		if (!hashedCode) return null;
		return { email, hashedCode: hashedCode };
	}
}
