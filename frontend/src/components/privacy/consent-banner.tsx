import { PrivacyModal, openPrivacyModal, closePrivacyModal } from "./privacy-modal";

/**
 * @deprecated O banner flutuante foi substituído pelo modal acessível de privacidade sob demanda (LGPD).
 * ConsentBanner agora renderiza o PrivacyModal silencioso.
 */
export function ConsentBanner() {
  return <PrivacyModal />;
}

export { PrivacyModal, openPrivacyModal, closePrivacyModal };
