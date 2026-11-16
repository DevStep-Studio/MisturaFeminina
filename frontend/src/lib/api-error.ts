export type ApiErrorKind =
  "http" | "timeout" | "offline" | "network" | "cancelled" | "invalid-response";
const statusMessages: Record<number, string> = {
  400: "Não foi possível processar a requisição.",
  401: "Sua sessão expirou. Entre novamente.",
  403: "Você não tem permissão para realizar esta ação.",
  404: "O recurso solicitado não foi encontrado.",
  419: "A sessão de segurança expirou. Atualize a página e tente novamente.",
  422: "Revise os campos informados.",
  429: "Muitas tentativas. Aguarde um momento antes de tentar novamente.",
};
export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    public readonly status = 0,
    public readonly requestId?: string,
    public readonly validation: Record<string, string[]> = {},
    public readonly redirectTo?: string,
  ) {
    super(
      kind === "timeout"
        ? "A requisição demorou mais que o esperado. Tente novamente."
        : kind === "offline"
          ? "Você está sem conexão. Verifique sua internet."
          : kind === "network"
            ? "Não foi possível conectar ao servidor. Tente novamente."
            : kind === "cancelled"
              ? "Requisição cancelada."
              : kind === "invalid-response"
                ? "O servidor retornou uma resposta inválida."
                : statusMessages[status] ||
                  "O serviço está temporariamente indisponível. Tente novamente.",
    );
    this.name = "ApiError";
  }
}
