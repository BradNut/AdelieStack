import { RolesRepository } from './roles.repository';
import { inject, injectable } from '@needle-di/core';

@injectable()
export class RolesService {
  constructor(private rolesRepository = inject(RolesRepository)) {}

  async findOneByNameOrThrow(name: string) {
    return this.rolesRepository.findOneByNameOrThrow(name);
  }
}
