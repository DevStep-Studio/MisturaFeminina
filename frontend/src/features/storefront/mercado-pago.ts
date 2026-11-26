export interface TokenizedCard {
  card_token: string;
  payment_method_id: string;
  issuer_id?: string;
  installments: 1;
}
export interface CardFormController {
  unmount: () => Promise<void> | void;
  getCardFormData: () => {
    token?: string;
    paymentMethodId?: string;
    issuerId?: string | number;
  };
}
export interface MercadoPagoInstance {
  cardForm: (settings: unknown) => CardFormController;
}
declare global {
  interface Window {
    MercadoPago?: new (
      key: string,
      options: { locale: string },
    ) => MercadoPagoInstance;
  }
}
let pending: Promise<NonNullable<Window["MercadoPago"]>> | undefined;
export function loadMercadoPago() {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);
  return (pending ??= new Promise<NonNullable<Window["MercadoPago"]>>(
    (resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      let finished = false;
      const fail = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        script.remove();
        pending = undefined;
        reject(
          new Error("Não foi possível carregar o formulário de pagamento."),
        );
      };
      const timer = setTimeout(fail, 20000);
      script.onload = () => {
        if (finished) return;
        if (!window.MercadoPago) {
          fail();
          return;
        }
        finished = true;
        clearTimeout(timer);
        resolve(window.MercadoPago);
      };
      script.onerror = fail;
      document.head.append(script);
    },
  ).catch((error) => {
    pending = undefined;
    throw error;
  }));
}
