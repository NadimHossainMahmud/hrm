import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default permissions
  const permissionData = [
    // Tenant management
    { key: 'tenants.read', name: 'View Tenants', description: 'Can view tenant information' },
    { key: 'tenants.write', name: 'Manage Tenants', description: 'Can create and update tenants' },
    
    // User management
    { key: 'users.read', name: 'View Users', description: 'Can view users' },
    { key: 'users.write', name: 'Manage Users', description: 'Can create and update users' },
    
    // Role management
    { key: 'roles.read', name: 'View Roles', description: 'Can view roles' },
    { key: 'roles.write', name: 'Manage Roles', description: 'Can create and update roles' },
    
    // Employee management
    { key: 'employees.read', name: 'View Employees', description: 'Can view employee information' },
    { key: 'employees.write', name: 'Manage Employees', description: 'Can create and update employees' },
    
    // Department management
    { key: 'departments.read', name: 'View Departments', description: 'Can view departments' },
    { key: 'departments.write', name: 'Manage Departments', description: 'Can create and update departments' },
    
    // Location management
    { key: 'locations.read', name: 'View Locations', description: 'Can view locations' },
    { key: 'locations.write', name: 'Manage Locations', description: 'Can create and update locations' },
    
    // Subscription/Billing
    { key: 'billing.read', name: 'View Billing', description: 'Can view billing information' },
    { key: 'billing.write', name: 'Manage Billing', description: 'Can manage billing and subscriptions' },
    
    // Reports
    { key: 'reports.read', name: 'View Reports', description: 'Can view reports' },
    
    // Settings
    { key: 'settings.read', name: 'View Settings', description: 'Can view settings' },
    { key: 'settings.write', name: 'Manage Settings', description: 'Can manage settings' },
    
    // Super admin
    { key: 'super_admin', name: 'Super Admin', description: 'Full system access' },
  ];

  const permissions = await Promise.all(
    permissionData.map(p => 
      prisma.permission.upsert({
        where: { key: p.key },
        update: {},
        create: p
      })
    )
  );

  console.log(`Created ${permissions.length} permissions`);
  
  // Create default system tenant for system roles
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: 'system' },
    update: {},
    create: {
      name: 'System',
      slug: 'system',
      status: 'inactive', // System tenant is not for regular use
    }
  });
  
  console.log('System tenant created');
  
  // Create default roles with permissions
  const rolesData = [
    {
      name: 'super_admin',
      description: 'Full system access across all tenants',
      permissions: ['super_admin', 'tenants.read', 'tenants.write', 'users.read', 'users.write', 
                     'roles.read', 'roles.write', 'employees.read', 'employees.write',
                     'departments.read', 'departments.write', 'locations.read', 'locations.write',
                     'billing.read', 'billing.write', 'reports.read', 'settings.read', 'settings.write']
    },
    {
      name: 'admin',
      description: 'Full access within their tenant',
      permissions: ['users.read', 'users.write', 'employees.read', 'employees.write',
                     'departments.read', 'departments.write', 'locations.read', 'locations.write',
                     'billing.read', 'billing.write', 'reports.read', 'settings.read', 'settings.write']
    },
    {
      name: 'hr_manager',
      description: 'HR management access',
      permissions: ['employees.read', 'employees.write', 'departments.read', 'departments.write',
                     'locations.read', 'reports.read', 'settings.read']
    },
    {
      name: 'manager',
      description: 'Manager access - can view team information',
      permissions: ['employees.read', 'departments.read', 'locations.read']
    },
    {
      name: 'employee',
      description: 'Basic employee access',
      permissions: ['employees.read']
    }
  ];
  
  for (const roleData of rolesData) {
    const role = await prisma.role.upsert({
      where: { 
        id: (await prisma.role.findFirst({ where: { name: roleData.name, tenantId: systemTenant.id } }))?.id || ''
      },
      update: {},
      create: {
        name: roleData.name,
        description: roleData.description,
        tenantId: systemTenant.id,
      }
    });
    
    // Assign permissions to role
    const rolePermissions = await Promise.all(
      roleData.permissions.map(async (permKey) => {
        const permission = permissions.find(p => p.key === permKey);
        if (!permission) return null;
        
        return prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id
            }
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id
          }
        });
      })
    );
    
    console.log(`Role '${roleData.name}' created with ${rolePermissions.filter(Boolean).length} permissions`);
  }

  // Create default plans
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { name: 'Core' },
      update: {},
      create: {
        name: 'Core',
        slug: 'core',
        description: 'Essential HR features for small businesses',
        price: 29.00,
        maxEmployees: 50,
        maxJobs: 5,
        maxCourses: 1,
        displayOrder: 1,
        features: {
          employees: true,
          departments: true,
          time_off: true,
          basic_reports: true
        }
      }
    }),
    prisma.plan.upsert({
      where: { name: 'Pro' },
      update: {},
      create: {
        name: 'Pro',
        slug: 'pro',
        description: 'Advanced HR features for growing companies',
        price: 79.00,
        maxEmployees: 250,
        maxJobs: 25,
        maxCourses: 15,
        isPopular: true,
        displayOrder: 2,
        features: {
          employees: true,
          departments: true,
          time_off: true,
          advanced_reports: true,
          performance_reviews: true,
          compensation: true
        }
      }
    }),
    prisma.plan.upsert({
      where: { name: 'Elite' },
      update: {},
      create: {
        name: 'Elite',
        slug: 'elite',
        description: 'Complete HR platform with AI insights',
        price: 199.00,
        maxEmployees: 5000,
        maxJobs: 50,
        maxCourses: 1000,
        displayOrder: 3,
        features: {
          employees: true,
          departments: true,
          time_off: true,
          elite_reports: true,
          performance_reviews: true,
          compensation: true,
          ai_insights: true,
          custom_dashboards: true
        }
      }
    })
  ]);

  console.log(`Created ${plans.length} plans`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
