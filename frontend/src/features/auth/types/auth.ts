import type { z } from "zod";
import type { userSchema, loginSchema } from "../schemas/auth.schema";
export type User = z.infer<typeof userSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
