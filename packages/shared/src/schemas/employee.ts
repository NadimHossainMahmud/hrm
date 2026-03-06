import { z } from 'zod';

// Employment types
export const employmentTypeEnum = z.enum(['full_time', 'part_time', 'contract', 'intern', 'freelance']);

// Employee status
export const employeeStatusEnum = z.enum(['active', 'inactive', 'on_leave', 'terminated']);

// Base employee schema
export const employeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  jobTitle: z.string().min(1, 'Job title is required'),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  startDate: z.string().datetime(),
  employmentType: employmentTypeEnum,
  salary: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  status: employeeStatusEnum.default('active'),
  // Personal details
  dateOfBirth: z.string().datetime().optional(),
  gender: z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say']).optional(),
  nationality: z.string().optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed', 'domestic_partnership']).optional(),
  // Address
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  // Work details
  employeeNumber: z.string().optional(),
  workEmail: z.string().email().optional(),
  workPhone: z.string().optional(),
  // Custom fields (JSON)
  customFields: z.record(z.unknown()).optional(),
});

export const employeeUpdateSchema = employeeSchema.partial();

// Query params for employee list
export const employeeFilterSchema = z.object({
  search: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  employmentType: employmentTypeEnum.optional(),
  status: employeeStatusEnum.optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['firstName', 'lastName', 'email', 'startDate', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Department schemas
export const departmentSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
  description: z.string().optional(),
  parentId: z.string().uuid().optional(),
  headId: z.string().uuid().optional(), // Employee ID of department head
});

export const departmentUpdateSchema = departmentSchema.partial();

// Location schemas
export const locationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().default('UTC'),
  isHeadquarters: z.boolean().default(false),
});

export const locationUpdateSchema = locationSchema.partial();

// Emergency contact schema
export const emergencyContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  relationship: z.string().min(1, 'Relationship is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().optional(),
  isPrimary: z.boolean().default(false),
});

export const emergencyContactUpdateSchema = emergencyContactSchema.partial();

// Document schema
export const documentSchema = z.object({
  name: z.string().min(1, 'Document name is required'),
  type: z.enum(['contract', 'id', 'certificate', 'tax_form', 'medical', 'other']),
  expiryDate: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Types
export type Employee = z.infer<typeof employeeSchema>;
export type EmployeeUpdate = z.infer<typeof employeeUpdateSchema>;
export type EmployeeFilter = z.infer<typeof employeeFilterSchema>;
export type Department = z.infer<typeof departmentSchema>;
export type DepartmentUpdate = z.infer<typeof departmentUpdateSchema>;
export type Location = z.infer<typeof locationSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;
export type EmergencyContactUpdate = z.infer<typeof emergencyContactUpdateSchema>;
export type Document = z.infer<typeof documentSchema>;
