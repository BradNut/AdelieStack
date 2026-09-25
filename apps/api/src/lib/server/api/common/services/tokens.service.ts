import { inject, injectable } from '@needle-di/core';
import { generateRandomString, type RandomReader } from '@oslojs/crypto/random';
import { createDate, TimeSpan, type TimeSpanUnit } from '../../../../utils/timespan';
import { HashingService } from './hashing.service';

@injectable()
export class TokensService {
  constructor(private readonly hashingService = inject(HashingService)) {}

  generateToken() {
    const alphabet = '23456789ACDEFGHJKLMNPQRSTUVWXYZ'; // alphabet with removed look-alike characters (0, 1, O, I)
    const random: RandomReader = {
      read(bytes) {
        // Type assertion needed: @oslojs/crypto's RandomReader uses ArrayBufferLike, but crypto.getRandomValues expects ArrayBuffer
        crypto.getRandomValues(bytes as Uint8Array<ArrayBuffer>);
      },
    };
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

  async verifyHashedToken(token: string, hashedToken: string) {
    return this.hashingService.compare(token, hashedToken);
  }
}
