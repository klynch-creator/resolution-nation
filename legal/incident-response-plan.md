# Incident Response Plan

**Last revised: 2026-07-06 (draft)**
**Status: DRAFT — internal runbook; attorney review recommended before first district contract**
**Owner: Kaelan Lynch (Incident Commander by default)**

This plan covers security and privacy incidents affecting Resolution Nation, LLC systems or data, with specific procedures for New York Education Law §2-d's breach notification requirements. It is intentionally sized for a single-operator company; roles consolidate to the owner until there is a team.

## 1. What counts as an incident

Treat as an incident and follow this plan if any of the following occurs or is credibly suspected:

- Unauthorized access to student PII (database, storage buckets including Read Aloud audio, backups, logs)
- Compromised credential or API key (Supabase service-role key, Anthropic key, Deepgram key, CRON_SECRET, Vercel/GitHub account, personal email tied to admin accounts)
- A vulnerability that exposes data across tenant boundaries (RLS bypass, broken RPC authorization)
- A sub-processor (Supabase, Vercel, Anthropic, Deepgram, Sentry) notifies us of a breach affecting our data
- Ransomware/defacement/denial of service affecting availability of the Service to schools
- Accidental disclosure (e.g., emailing one family's data to another, public bucket misconfiguration)

When unsure whether something qualifies: it qualifies. Open an incident, then downgrade.

## 2. Severity levels

- **SEV-1** — confirmed exposure of student PII, or full compromise of an admin credential. All hands, clock is running on legal notification.
- **SEV-2** — plausible but unconfirmed exposure; cross-tenant vulnerability found by testing but no evidence of exploitation; sub-processor breach where our data's involvement is unclear.
- **SEV-3** — security defect with no data exposure (fix promptly, no notification duties expected).

## 3. Response phases

### Phase 1 — Contain (first hour)

1. Start an incident log (timestamped notes — a plain text file is fine; it becomes the evidence record).
2. Stop the bleeding, in order of preference: rotate the compromised credential; disable the affected route/feature (deploy a guard or feature-flag it off); pause the Vercel deployment; as a last resort, pause the Supabase project (takes the Service down for all users).
3. Preserve evidence BEFORE fixing: export relevant Supabase logs, Vercel logs, and the audit_log table for the affected window. Do not delete anything.
4. If keys were rotated, verify the old key is dead (test a request with it).

### Phase 2 — Assess (day 1)

Answer in the incident log:

- What data was accessible, and was it actually accessed? (Use audit_log, Supabase logs, storage access logs.)
- Which students/teachers/parents, which schools, what time window?
- Root cause?
- Is exposure ongoing?

### Phase 3 — Notify (see timelines below)

### Phase 4 — Remediate & close

- Fix the root cause; add a regression test where feasible.
- Post-incident review (even solo): what failed, what would have caught it earlier, which control to add. Log follow-up items in the roadmap tracker.
- Update this plan with what was learned.

## 4. Notification timelines and duties

**New York Education Law §2-d / Part 121 (school customers):** notify each affected school/district **without unreasonable delay and no later than 7 calendar days** after discovery of a breach or unauthorized release of student data. The district then has its own duties (notifying NYSED's Chief Privacy Officer and affected parents within 60 days). Our DPAs may set stricter timelines — check the signed DPA for each affected district; the strictest applies.

- Deliver notice to the district's designated privacy contact (on file from the DPA) by email, followed by phone.
- Notice contents: description of the incident, data types involved, date(s) of occurrence and discovery, what we've done to contain and remediate, contact point for follow-up.

**NY SHIELD Act (General Business Law §899-aa/bb):** if private information of NY residents was exposed (e.g., email + password hash), notify affected individuals in the most expedient time possible and without unreasonable delay, plus the NY Attorney General, Department of State, and State Police when thresholds are met. For accounts belonging to minors, notice goes to the parent (via the school where applicable).

**COPPA/FTC:** no fixed breach-notification clock, but document everything; the FTC evaluates reasonableness of response.

**Other states:** if non-NY students are on the platform at the time of an incident, check that state's breach law before the SEV-1 notification goes out (all 50 states have one; timelines range from "without unreasonable delay" to 30–90 days).

**Sub-processor duty:** our DPAs typically require sub-processors to notify us promptly; our clocks start at OUR discovery, including discovery via a sub-processor's notice.

**Insurance:** once cyber liability coverage is in place (roadmap RN-101), notify the carrier immediately for a SEV-1/SEV-2 — late notice can void coverage. Keep the policy's hotline number in this section.

## 5. Communication rules

- One voice: the Incident Commander sends all external communications.
- Never speculate in writing about scope before Phase 2 is complete; say what is known, what is being investigated, and when the next update comes.
- Do not use the word "breach" in external comms until counsel confirms the legal characterization — use "security incident under investigation."
- Attorney first for SEV-1: call the ed-tech attorney (retainer: roadmap RN-3) before the first district notification if at all possible within the 7-day window. Do not let waiting for counsel blow the deadline.

## 6. Key contacts (fill in and keep current)

| Role | Who | Contact |
|---|---|---|
| Incident Commander | Kaelan Lynch | [phone / email] |
| Ed-tech attorney | [TBD — RN-3] | [phone / email] |
| Supabase support | — | support@supabase.io + dashboard ticket |
| Vercel support | — | vercel.com/help |
| Anthropic | — | usersafety@anthropic.com |
| Deepgram | — | [support contact once DPA signed] |
| Cyber insurance hotline | [TBD — RN-101] | [phone] |
| NYSED Chief Privacy Officer | — | privacy@nysed.gov (for reference; districts notify) |
| NY AG breach reporting | — | https://ag.ny.gov (Security Breach Notification) |

## 7. Quick-reference: credential rotation

- **Supabase service-role key:** Dashboard → Settings → API → rotate. Then update Vercel env vars and redeploy.
- **Anthropic / Deepgram keys:** provider console → revoke + reissue → update Vercel env vars → redeploy.
- **CRON_SECRET:** generate new value → update Vercel env var → redeploy (cron and route must match).
- **GitHub / Vercel / Supabase accounts:** rotate password, verify MFA, review active sessions and OAuth grants.

## 8. Testing this plan

Run a tabletop exercise once before the first pilot (walk through a simulated leaked service-role key end-to-end, including drafting the district notice), and annually thereafter. Pair with the quarterly backup-restore drill (RN-91).

---

**For Attorney Review — Notes:**
1. Confirm the §2-d 7-day characterization and interaction with district-specific DPA terms.
2. Confirm SHIELD Act thresholds and AG notification mechanics.
3. Provide a pre-approved district notification template to attach as Appendix A.
4. Confirm "security incident" vs "breach" language guidance.
