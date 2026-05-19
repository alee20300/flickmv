import * as Sentry from '@sentry/react-native';

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Disable in development so local errors don't pollute the dashboard
    enabled: process.env.NODE_ENV !== 'development',
    tracesSampleRate: 0.2,
  });
}

export { Sentry };
