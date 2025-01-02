import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { HashingService } from '../../../common/services/hashing.service';
import * as schema from '../drizzle-schema';
import users from './data/users.json';

type JsonRole = {
  name: string;
  primary: boolean;
};

export default async function seed(db: NodePgDatabase<typeof schema>) {
  const hashingService = new HashingService();
  const adminRole = await db.select().from(schema.roles_table).where(eq(schema.roles_table.name, 'admin'));
  const userRole = await db.select().from(schema.roles_table).where(eq(schema.roles_table.name, 'user'));

  const adminUser = await db
    .insert(schema.users_table)
    .values({
      username: `${process.env.ADMIN_USERNAME}`,
      email: '',
      first_name: 'Brad',
      last_name: 'S',
    })
    .returning()
    .onConflictDoNothing();

  await db.insert(schema.credentials_table).values({
    user_id: adminUser[0].id,
    type: schema.CredentialsType.PASSWORD,
    secret_data: await hashingService.hash(`${process.env.ADMIN_PASSWORD}`),
  });

  await db
    .insert(schema.user_roles_table)
    .values({
      user_id: adminUser[0].id,
      role_id: adminRole[0].id,
      primary: true,
    })
    .onConflictDoNothing();

  await db
    .insert(schema.user_roles_table)
    .values({
      user_id: adminUser[0].id,
      role_id: userRole[0].id,
      primary: false,
    })
    .onConflictDoNothing();

  await Promise.all(
    users.map(async (user) => {
      const [insertedUser] = await db
        .insert(schema.users_table)
        .values({
          ...user,
        })
        .returning();
      await db.insert(schema.credentials_table).values({
        user_id: insertedUser?.id,
        type: schema.CredentialsType.PASSWORD,
        secret_data: await hashingService.hash(user.password),
      });
      await Promise.all(
        user.roles.map(async (role: JsonRole) => {
          const foundRole = await db.query.roles_table.findFirst({
            where: eq(schema.roles_table.name, role.name),
          });
          if (!foundRole) {
            throw new Error('Role not found');
          }
          await db.insert(schema.user_roles_table).values({
          user_id: insertedUser?.id,
            role_id: foundRole?.id,
            primary: role?.primary,
          });
        }),
      );
    }),
  );
}
