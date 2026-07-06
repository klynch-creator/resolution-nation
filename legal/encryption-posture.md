# Encryption & Data Protection Posture

**Last revised: 2026-07-06 (draft)**
**Status: For district security reviewers; attorney/CTO review welcome**

This document describes how Resolution Nation protects student data at rest and in transit, and explains our position on application-layer field encryption (roadmap RN-28, deferred 2026-07-06).

## Current controls

**In transit:** TLS 1.2+ on every connection (browser ↔ app, app ↔ database, app ↔ sub-processors). No plaintext transport anywhere.

**At rest:** the primary database, file storage (including Read Aloud audio), and backups are encrypted at rest with AES-256 by our infrastructure provider (Supabase, on AWS). Point-in-time-recovery snapshots inherit the same encryption.

**Access control (the primary safeguard):** every database query is constrained by Postgres Row-Level Security — a student sees only their records; a teacher only their students; a parent only their approved-linked child. Privileged (service-role) access is used only inside server-side API routes for narrowly defined operations, each of which independently verifies the caller's authorization first. Sensitive actions are written to an audit log retained for two years.

**Supporting controls:** all public API routes are rate-limited; secrets live in environment configuration (never the repository); error reports are scrubbed of PII before leaving our infrastructure; data minimization is audited table-by-column (see the Data Minimization Audit).

## Position on application-layer field encryption (RN-28)

We evaluated additionally encrypting individual fields (e.g., student names) at the application layer and **deferred** it, for these reasons:

1. **Threat-model fit.** App-layer field encryption defends chiefly against an attacker who obtains raw database contents while bypassing the application. That vector is already addressed by provider-level at-rest encryption, network isolation, and key separation. The realistic risks for a service like ours — credential compromise, authorization bugs — are addressed by RLS, MFA, rate limiting, and audit logging, none of which field encryption improves.
2. **Key custody would not materially change.** The decryption key would live in the same environment configuration as the database credentials it protects against; an attacker with one typically has the other.
3. **Cost/risk of the refactor.** The application authorizes reads through RLS at the database; encrypting displayed fields would relocate large parts of the product behind bespoke decryption endpoints, expanding the very attack surface it aims to shrink.

We will revisit this position: (a) at pen-test time (RN-72), (b) if a district contract requires it, or (c) when a queued-worker architecture (RN-97) makes selective field encryption cheap for server-side-only fields such as parent contact info.

## Related documents

Data Minimization Audit (/legal/data-minimization-audit) · Incident Response Plan (/legal/incident-response-plan) · Sub-processors (/legal/subprocessors) · Privacy Policy §7 (Security)
