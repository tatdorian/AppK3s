import { db, schema } from './index.js';
import bcrypt from 'bcryptjs';

async function seed() {
  const existing = await db.query.users.findFirst();
  if (existing) {
    console.log('Seed skipped: users already exist');
    return;
  }

  const hash = await bcrypt.hash('admin1234', 12);
  await db.insert(schema.users).values({
    email: 'admin@appk3s.local',
    passwordHash: hash,
    role: 'admin',
  });
  console.log('✅ Default admin created: admin@appk3s.local / admin1234');
}

seed().catch(console.error);
