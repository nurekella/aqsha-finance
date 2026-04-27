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
