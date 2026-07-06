# Sub-processors

**Last revised: [TO BE SET BY ATTORNEY AT FINALIZATION]**
**Status: DRAFT — review and update before publishing**

This page lists the sub-processors Resolution Nation, LLC engages to process information on behalf of users and contracting schools. Each sub-processor is contractually bound to protect data we share and to use it solely for the purpose described.

Resolution Nation will provide advance notice to school customers of any addition of a sub-processor that processes student PII, consistent with our DPAs.

| Sub-processor | Purpose | Data Processed | Region | Sub-processor's privacy/security |
|---|---|---|---|---|
| Supabase, Inc. | Primary application database, authentication, and file storage | All application data, including student PII | United States (us-east-*) | https://supabase.com/privacy · https://supabase.com/security |
| Vercel Inc. | Application hosting and edge delivery | Request/response metadata; no persistent storage of student PII at Vercel | United States | https://vercel.com/legal/privacy-policy · https://vercel.com/security |
| Anthropic PBC | AI features (server-side calls only): goal suggestions, personalized lesson generation, writing rubric feedback, reading-fluency feedback, teacher draft tools (progress notes, IEP goal suggestions, parent updates), and safety moderation of student writing | De-identified assessment summaries; skill/grade-band/difficulty context for lessons; student writing text and reading transcripts (no direct identifiers attached) | United States | https://www.anthropic.com/legal/privacy · https://trust.anthropic.com/ |
| Deepgram, Inc. | Speech-to-text transcription for the Read Aloud (reading fluency) feature | Student voice recordings and derived transcripts (processed transiently; no training on customer audio per DPA) | United States | https://deepgram.com/privacy · https://deepgram.com/security |
| Functional Software, Inc. (Sentry) | Error monitoring and crash reporting | Stack traces and request metadata; PII scrubbed before transmission | United States | https://sentry.io/privacy/ · https://sentry.io/security/ |
| [Email provider — to be added] | Transactional email (password resets, account notices) | Recipient email, message body | United States | [link] |
| [Push notification provider — to be added: APNs/FCM via direct platform integration] | Mobile push notifications | Device token, message body | United States / global | [Apple/Google privacy pages] |

## Sub-processors we explicitly do NOT use

To remove ambiguity for school reviewers:

- **No third-party advertising SDKs.** None.
- **No third-party behavioral analytics (Google Analytics, Mixpanel, Amplitude, etc.).** None.
- **No Facebook/Meta SDK.** None.
- **No A/B testing or feature-flag SaaS that processes student PII.** None.
- **No data brokers.** None.
- **No customer data platforms (CDPs).** None.

## Notification of changes

Material changes to this list will be notified to school customers in advance via email to the privacy contact on file, consistent with our DPAs. The "Last revised" date above will be updated when any change is made.

## Contact

privacy@resolutionnation.app

---

**For Attorney Review — Notes:**
1. Confirm exact legal entity names and current data processing terms for each vendor (Supabase, Vercel, Anthropic, Sentry).
2. Add the email and push providers once selected.
2a. STT provider: the product defaults to Deepgram (FLUENCY_STT_PROVIDER). OpenAI Whisper is a code-supported alternative — if it is ever enabled, OpenAI must be added to this list BEFORE use in production. Confirm the Deepgram DPA (no training on customer audio; retention terms) is signed before launch.
3. Confirm zero-retention is in place with Anthropic; if not, adjust wording.
4. Verify Supabase region is set to a US region on the production project.
