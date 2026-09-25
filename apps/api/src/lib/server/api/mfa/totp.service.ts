// TOTP service stubbed - requires missing EncryptionService
import { inject, injectable } from '@needle-di/core';
import { CredentialsRepository } from '../users/credentials.repository';

@injectable()
export class TotpService {
  constructor(private readonly credentialsRepository = inject(CredentialsRepository)) {}

  async findOneByUserId(_userId: string) {
    return null;
  }

  async findOneByUserIdOrThrow(_userId: string) {
    throw new Error('TOTP not implemented');
  }

  async create(_userId: string, _key: Uint8Array) {
    return null;
  }

  async deleteOneByUserId(_userId: string) {
    return null;
  }

  async deleteOneByUserIdAndType(_userId: string, _type: string) {
    return null;
  }

  async verify(_userId: string, _code: string) {
    return false;
  }
}
