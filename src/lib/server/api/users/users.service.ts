import { inject, injectable } from '@needle-di/core';
import { TokensService } from '../common/services/tokens.service';
import { DrizzleService } from '../databases/postgres/drizzle.service';
import { StorageService } from '../storage/storage.service';
import { CredentialsRepository } from './credentials.repository';
import type { UpdateUserDto } from './dtos/update-user.dto';
import { CredentialsType } from './tables/credentials.table';
import { UsersRepository } from './users.repository';
import { UserRolesService } from './user_roles.service';
import { RoleName } from '../roles/tables/roles.table';
import { BadRequest } from '../common/utils/exceptions';

@injectable()
export class UsersService {
  constructor(
    private drizzleService = inject(DrizzleService),
    private credentialsRepository = inject(CredentialsRepository),
    private usersRepository = inject(UsersRepository),
    private userRoleService = inject(UserRolesService),
    private storageService = inject(StorageService),
    private tokenService = inject(TokensService)
  ) {}

  async update(userId: string, updateUserDto: UpdateUserDto) {
    if (updateUserDto?.avatar) {
      const { key } = await this.storageService.upload({ file: updateUserDto.avatar });
      await this.usersRepository.update(userId, { avatar: key });
    }
  }

  async createEmail(email: string) {
    return this.usersRepository.create({ avatar: null, email, username: email });
  }

  async createWithPassword(username: string, password: string, email?: string | undefined) {
    const existingUsername = await this.usersRepository.findOneByUsername(username);
    if (existingUsername) {
      throw BadRequest('Could not create user');
    }
    if (email) {
      const existingEmail = await this.usersRepository.findOneByEmail(email);
      if (existingUsername || existingEmail) {
        throw BadRequest('Could not create user');
      }
    }

    return await this.drizzleService.db.transaction(async (trx) => {
      const createdUser = await this.usersRepository.create(
        { username, email: email || '', avatar: null },
        trx,
      );

      if (!createdUser) {
        return null;
      }

      const hashedPassword = await this.tokenService.createHashedToken(password);

      const credentials = await this.credentialsRepository.create(
        {
          user_id: createdUser.id,
          type: CredentialsType.PASSWORD,
          secret_data: hashedPassword,
        },
        trx,
      );

      if (!credentials) {
        await trx.rollback();
        return null;
      }

      await this.userRoleService.addRoleToUser(createdUser.id, RoleName.USER, true, trx);

      return createdUser;
    });
  }

  async updatePassword(userId: string, password: string) {
    const hashedPassword = await this.tokenService.createHashedToken(password);
    const currentCredentials = await this.credentialsRepository.findPasswordCredentialsByUserId(userId);
    if (!currentCredentials) {
      await this.credentialsRepository.create({
        user_id: userId,
        type: CredentialsType.PASSWORD,
        secret_data: hashedPassword,
      });
    } else {
      await this.credentialsRepository.update(currentCredentials.id, {
        secret_data: hashedPassword,
      });
    }
  }

  async verifyPassword(userId: string, data: { password: string }) {
    const user = await this.usersRepository.findOneById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const credential = await this.credentialsRepository.findOneByUserIdAndType(userId, CredentialsType.PASSWORD);
    if (!credential) {
      throw new Error('Password credentials not found');
    }
    const { password } = data;
    return this.tokenService.verifyHashedToken(credential.secret_data, password);
  }
}
