import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import { prisma } from './prisma';

const logger = createLogger();

// Create global event emitter
export const eventEmitter = new EventEmitter();

// Event types
export enum AuditEventType {
  USER_LOGIN = 'user:login',
  USER_LOGOUT = 'user:logout',
  USER_REGISTERED = 'user:registered',
  USER_PASSWORD_RESET = 'user:password_reset',
  USER_MFA_ENABLED = 'user:mfa_enabled',
  USER_MFA_DISABLED = 'user:mfa_disabled',
  EMPLOYEE_CREATED = 'employee:created',
  EMPLOYEE_UPDATED = 'employee:updated',
  EMPLOYEE_DELETED = 'employee:deleted',
}

// Phase 4: Real-time notification event (consumed by Socket.io)
export const NOTIFICATION_CREATED = 'notification:created';

// Type for JSON values in audit logs
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

// Audit log event data interface
export interface AuditLogData {
  action: string;
  tableName: string;
  recordId: string;
  oldValues?: JsonValue;
  newValues?: JsonValue;
  userId?: string;
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
}

// Audit log event listener
export const setupAuditLogListener = () => {
  eventEmitter.on('audit:log', async (data: AuditLogData) => {
    try {
      await prisma.auditLog.create({
        data: {
          action: data.action,
          tableName: data.tableName,
          recordId: data.recordId,
          oldValues: data.oldValues ? (data.oldValues as object) : undefined,
          newValues: data.newValues ? (data.newValues as object) : undefined,
          userId: data.userId || null,
          tenantId: data.tenantId,
          ipAddress: data.ipAddress || null,
          userAgent: data.userAgent || null,
        },
      });
      
      logger.debug('Audit log created', { 
        action: data.action, 
        tableName: data.tableName,
        tenantId: data.tenantId 
      });
    } catch (error) {
      logger.error('Failed to create audit log', { error, data });
    }
  });
  
  logger.info('Audit log listener initialized');
};

// Helper function to emit audit events
export const auditLog = (data: AuditLogData) => {
  eventEmitter.emit('audit:log', data);
};

// User activity events
export const emitUserLogin = (userId: string, tenantId: string, ipAddress?: string, userAgent?: string) => {
  eventEmitter.emit(AuditEventType.USER_LOGIN, { userId, tenantId, ipAddress, userAgent });
  auditLog({
    action: AuditEventType.USER_LOGIN,
    tableName: 'users',
    recordId: userId,
    userId,
    tenantId,
    ipAddress,
    userAgent,
  });
};

export const emitUserLogout = (userId: string, tenantId: string, ipAddress?: string) => {
  eventEmitter.emit(AuditEventType.USER_LOGOUT, { userId, tenantId, ipAddress });
  auditLog({
    action: AuditEventType.USER_LOGOUT,
    tableName: 'users',
    recordId: userId,
    userId,
    tenantId,
    ipAddress,
  });
};

export const emitUserRegistered = (userId: string, tenantId: string, email: string) => {
  eventEmitter.emit(AuditEventType.USER_REGISTERED, { userId, tenantId, email });
  auditLog({
    action: AuditEventType.USER_REGISTERED,
    tableName: 'users',
    recordId: userId,
    userId,
    tenantId,
    newValues: { email },
  });
};

// Initialize all listeners
export const initializeEventListeners = () => {
  setupAuditLogListener();
  
  // Add more listeners here as needed
  
  logger.info('All event listeners initialized');
};
