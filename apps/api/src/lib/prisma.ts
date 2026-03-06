import { PrismaClient } from '@prisma/client';
import { createLogger } from '../utils/logger';

const logger = createLogger();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Extend PrismaClient with RLS support
export const prismaWithRLS = (tenantId: string) => {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ 
          model, 
          operation, 
          args, 
          query 
        }: { 
          model: string; 
          operation: string; 
          args: unknown; 
          query: (args: unknown) => Promise<unknown>;
        }) {
          // Set RLS context for tenant isolation
          await prisma.$executeRawUnsafe(
            `SET app.current_tenant = '${tenantId}'`
          );
          
          try {
            const result = await query(args);
            return result;
          } finally {
            // Clear RLS context after operation
            await prisma.$executeRawUnsafe(
              `SET app.current_tenant = ''`
            );
          }
        },
      },
    },
  });
};

// Transaction with RLS support
export const transactionWithRLS = async <T>(
  tenantId: string,
  callback: (tx: PrismaClient) => Promise<T>
): Promise<T> => {
  return await prisma.$transaction(async (tx: unknown) => {
    // Set RLS context at transaction level
    await (tx as PrismaClient).$executeRawUnsafe(
      `SET LOCAL app.current_tenant = '${tenantId}'`
    );
    
    return await callback(tx as PrismaClient);
  });
};

export default prisma;
