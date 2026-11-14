import { z } from "zod";
const id = z.union([z.number().int(), z.string().min(1)]);
export const userSchema = z.object({
  id,
  name: z.string().min(1),
  email: z.email().optional(),
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  workspace_id: id.nullable().default(null),
});
export const sessionSchema = z
  .union([userSchema, z.object({ data: userSchema })])
  .transform((value) => ("data" in value ? value.data : value));
export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});
export const mfaSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Informe o código de seis dígitos."),
});
