import { api } from "../lib/api";
import { ApiError } from "../lib/api-error";
import { config } from "../app/config";
import { sessionSchema } from "../features/auth/schemas/auth.schema";
import type { LoginInput, User } from "../features/auth/types/auth";
import {
  acceptSession,
  beginSessionCheck,
  failSession,
  resetSession,
  sessionRevision,
} from "./session";

let pending: Promise<User | null> | undefined;
let requestController: AbortController | undefined;
function cancelSessionRequest() {
  requestController?.abort();
  pending = undefined;
}
export function getCurrentUser(): Promise<User | null> {
  if (pending) return pending;
  const revision = sessionRevision();
  beginSessionCheck();
  requestController = new AbortController();
  const request = api<unknown>(config.mePath, {
    authenticated: false,
    signal: requestController.signal,
  })
    .then((data) => {
      const parsed = sessionSchema.safeParse(data);
      if (!parsed.success) throw new ApiError("invalid-response");
      if (revision !== sessionRevision()) return null;
      acceptSession(parsed.data);
      return parsed.data;
    })
    .catch((error: unknown) => {
      if (revision !== sessionRevision()) return null;
      if (error instanceof ApiError && error.status === 401) {
        acceptSession(null);
        return null;
      }
      failSession(error);
      throw error;
    })
    .finally(() => {
      if (pending === request) pending = undefined;
    });
  pending = request;
  return request;
}

function guestCartHeader(): Record<string, string> | undefined {
  try {
    if (typeof localStorage === "undefined") return undefined;
    const token = localStorage.getItem("mf:cart-token:v1");
    return token ? { "X-Cart-Token": token } : undefined;
  } catch {
    return undefined;
  }
}

export async function login(
  input: LoginInput,
): Promise<"authenticated" | "mfa"> {
  cancelSessionRequest();
  resetSession();
  const response = await api<unknown>(config.loginPath, {
    scope: "auth",
    method: "POST",
    body: input,
    headers: guestCartHeader(),
    authenticated: false,
  });
  if (
    response &&
    typeof response === "object" &&
    "two_factor" in response &&
    response.two_factor === true
  ) {
    if (!config.mfaEnabled)
      throw new Error(
        "Esta conta exige verificação em duas etapas. Habilite o suporte a MFA neste projeto.",
      );
    return "mfa";
  }
  if (!(await getCurrentUser())) throw new ApiError("http", 401);
  return "authenticated";
}
export async function completeMfa(code: string) {
  await api(config.mfaPath, {
    scope: "auth",
    method: "POST",
    body: { code },
    headers: guestCartHeader(),
    authenticated: false,
  });
  if (!(await getCurrentUser())) throw new ApiError("http", 401);
}

export async function registerCustomer(input: {
  name: string;
  email: string;
  phone?: string;
  cpf_cnpj?: string;
  password: string;
  password_confirmation: string;
  newsletter_opt_in?: boolean;
}) {
  cancelSessionRequest();
  resetSession();
  await api("/register", {
    scope: "auth",
    method: "POST",
    body: input,
    headers: guestCartHeader(),
    authenticated: false,
  });
  await getCurrentUser();
}
export async function logout() {
  cancelSessionRequest();
  resetSession(true);
  try {
    await api(config.logoutPath, {
      scope: "auth",
      method: "POST",
      authenticated: false,
    });
    resetSession();
  } catch (error) {
    throw new Error(
      "Não foi possível encerrar a sessão no servidor. Tente sair novamente.",
      { cause: error },
    );
  }
}
