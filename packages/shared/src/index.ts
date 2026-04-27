import { z } from 'zod';

// User roles
export const UserRoleSchema = z.enum(['admin', 'user']);
export type UserRole = z.infer<typeof UserRoleSchema>;

// Health endpoint contract
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptime: z.number(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

// Money: всегда строка с фиксированной точностью (соответствует NUMERIC(18,4) в Postgres)
export const MoneyAmountSchema = z.string().regex(/^-?\d+(\.\d{1,4})?$/);
export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;

export const SUPPORTED_CURRENCIES = ['KZT', 'USD', 'EUR', 'RUB', 'CNY'] as const;
export const CurrencySchema = z.enum(SUPPORTED_CURRENCIES);
export type Currency = z.infer<typeof CurrencySchema>;

// Auth
export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  mustChangePassword: z.boolean(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(12).max(200),
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

// /api/me
export const MeResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: UserRoleSchema,
  locale: z.string(),
  timezone: z.string(),
  mustChangePassword: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

// Admin users
export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(100),
  role: UserRoleSchema,
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  role: UserRoleSchema.optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: UserRoleSchema,
  locale: z.string(),
  timezone: z.string(),
  mustChangePassword: z.boolean(),
  disabledAt: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdById: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const ListUsersResponseSchema = z.object({
  items: z.array(AdminUserSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type ListUsersResponse = z.infer<typeof ListUsersResponseSchema>;

export const CreateUserResponseSchema = z.object({
  user: AdminUserSchema,
  temporaryPassword: z.string(),
});
export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;

export const ResetPasswordResponseSchema = z.object({
  temporaryPassword: z.string(),
});
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
