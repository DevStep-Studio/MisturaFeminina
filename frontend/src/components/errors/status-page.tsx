import { Link } from "@tanstack/solid-router";
import ShieldAlert from "lucide-solid/icons/shield-exclamation-point";
import FileQuestion from "lucide-solid/icons/file-question-mark";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { StatePanel, stateActionClass } from "../feedback/state-panel";
export function StatusPage(props: { status: 403 | 404 }) {
  return (
    <StatePanel
      heading="h1"
      eyebrow={`Erro ${props.status}`}
      tone={props.status === 403 ? "warning" : "brand"}
      icon={
        props.status === 403 ? (
          <ShieldAlert size={28} strokeWidth={1.75} />
        ) : (
          <FileQuestion size={28} strokeWidth={1.75} />
        )
      }
      title={props.status === 403 ? "Acesso negado" : "Página não encontrada"}
      description={
        props.status === 403
          ? "Sua conta não tem permissão para acessar esta página."
          : "Este endereço não está disponível. Confira o link ou volte ao início para continuar."
      }
    >
      <Link to="/" class={stateActionClass}>
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar ao início
      </Link>
    </StatePanel>
  );
}
