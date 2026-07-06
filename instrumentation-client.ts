import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

// Dormant until NEXT_PUBLIC_SENTRY_DSN is set (RN-6): with no DSN the SDK
// initializes as a no-op and sends nothing.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0, // errors only; no performance data with URLs/params
  replaysSessionSampleRate: 0, // never record student sessions
  replaysOnErrorSampleRate: 0,
  beforeSend(event) {
    return scrubEvent(event);
  },
  beforeBreadcrumb(breadcrumb) {
    // Never breadcrumb user input or console content on student devices.
    if (breadcrumb.category === "ui.input" || breadcrumb.category === "console") {
      return null;
    }
    return breadcrumb;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
