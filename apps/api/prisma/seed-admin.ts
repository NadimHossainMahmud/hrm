import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating default admin user...');

  // Find the system tenant
  const systemTenant = await prisma.tenant.findFirst({
    where: { slug: 'system' }
  });

  if (!systemTenant) {
    console.error('System tenant not found. Run the main seed first.');
    return;
  }

  // Find the admin role
  const adminRole = await prisma.role.findFirst({
    where: { name: 'admin', tenantId: systemTenant.id }
  });

  if (!adminRole) {
    console.error('Admin role not found. Run the main seed first.');
    return;
  }

  // Create a test tenant for the admin
  const testTenant = await prisma.tenant.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      status: 'active',
    }
  });

  console.log('Test tenant created:', testTenant.name);

  // Check if user already exists
  const existingUser = await prisma.user.findFirst({
    where: { email: 'admin@acme.com' }
  });

  if (existingUser) {
    console.log('Admin user already exists!');
    console.log('=================================');
    console.log('Email: admin@acme.com');
    console.log('Password: admin123');
    console.log('=================================');
    return;
  }

  // Create admin user
  const passwordHash = await hashPassword('admin123');

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@acme.com',
      password: passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      isActive: true,
      tenantId: testTenant.id,
      roleId: adminRole.id,
    }
  });

  console.log('=================================');
  console.log('Default admin user created!');
  console.log('Email: admin@acme.com');
  console.log('Password: admin123');
  console.log('Tenant: Acme Corporation');
  console.log('=================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
