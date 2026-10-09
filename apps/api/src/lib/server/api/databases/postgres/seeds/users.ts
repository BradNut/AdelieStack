import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Auth } from '../../../auth/auth.config';
import * as schema from '../drizzle-schema';
import users from './data/users.json';

export default async function seed(db: NodePgDatabase<typeof schema>, auth: Auth) {
  console.log('Creating users ...');
  for (const user of users) {
    // Sign up through Better Auth so the password is hashed and stored the way it expects.
    const { user: createdUser } = await auth.api.signUpEmail({
      body: { name: `${user.first_name} ${user.last_name}`, email: user.email, password: user.password },
    });

    for (const role of user.roles) {
      const foundRole = await db.query.roles_table.findFirst({ where: eq(schema.roles_table.name, role.name) });
      if (!foundRole) {
        throw new Error(`Role ${role.name} not found`);
      }
      await db.insert(schema.user_roles_table).values({ user_id: createdUser.id, role_id: foundRole.id, primary: role.primary });
    }
  }
  console.log('Users created.');
}
