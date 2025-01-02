import { inject, injectable } from '@needle-di/core';
import { generateRandomString, type RandomReader } from "@oslojs/crypto/random";
import { HashingService } from './hashing.service';
import { createDate, TimeSpan, type TimeSpanUnit } from '@/utils/timespan';

@injectable()
export class TokensService {
  constructor(private hashingService = inject(HashingService)) {}

  generateToken() {
    const alphabet = '23456789ACDEFGHJKLMNPQRSTUVWXYZ'; // alphabet with removed look-alike characters (0, 1, O, I)
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes);
      }
    }
    return generateRandomString(random, alphabet, 10);
  }

  generateTokenWithExpiry(number: number, lifespan: TimeSpanUnit) {
    return {
      token: this.generateToken(),
      expiry: createDate(new TimeSpan(number, lifespan)),
    };
  }

  async generateTokenWithExpiryAndHash(number: number, lifespan: TimeSpanUnit) {
    const token = this.generateToken();
    const hashedToken = await this.hashingService.hash(token);
    return {
      token,
      hashedToken,
      expiry: createDate(new TimeSpan(number, lifespan)),
    };
  }

  async createHashedToken(token: string) {
    return this.hashingService.hash(token);
  }

  async verifyHashedToken(hashedToken: string, token: string) {
    return this.hashingService.compare(hashedToken, token);
  }
}
