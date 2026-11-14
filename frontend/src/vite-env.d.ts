/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_AUTH_URL?: string;
  readonly VITE_AUTH_ME_PATH?: string;
  readonly VITE_AUTH_LOGIN_PATH?: string;
  readonly VITE_AUTH_LOGOUT_PATH?: string;
  readonly VITE_AUTH_MFA_PATH?: string;
  readonly VITE_ENABLE_MFA?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
  readonly VITE_ENABLE_MONITORING?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_SITE_NAME?: string;
  readonly VITE_SITE_INDEXABLE?: string;
  readonly VITE_GTM_ID?: string;
  readonly VITE_ANALYTICS_IN_DEV?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_USE_REAL_API?: string;
}
