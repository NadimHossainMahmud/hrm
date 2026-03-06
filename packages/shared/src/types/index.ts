export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  industry?: string;
  companySize?: string;
  timezone: string;
  dateFormat: string;
  fiscalYearStart: number;
  status: 'active' | 'suspended' | 'churned';
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  tenantId: string;
  permissions: Permission[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  key: string;
  name: string;
  description?: string;
  createdAt: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
