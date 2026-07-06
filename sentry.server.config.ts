import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry-scrub";

// Dormant until SENTRY_DSN is set (RN-6).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend(event) {
    return scrubEvent(event);
  },
});
