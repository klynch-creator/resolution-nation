# COPPA Consent Approach

**Last revised: 2026-07-06 (draft)**
**Status: DRAFT — attorney review required (rolls up under RN-18/RN-24)**

## Decision (2026-07-06)

Resolution Nation launches **school-track only** for students under 13. Direct-to-family accounts for under-13 children are not offered at launch; a future "parent" consent track is reserved in the schema.

## How consent works, by path

**School track (the launch path).** Teachers create student accounts via roster import. The school, having contracted with us (DPA) and designated us a school official under FERPA, provides COPPA consent on parents' behalf for educational use, consistent with FTC guidance on school-authorized ed-tech. Accounts created this way carry `consent_track = 'school'`.

**Self-signup (13 and older only).** The signup form asks students for date of birth. The date is used **only in the browser** to compute age — it is never transmitted or stored (see the data-minimization audit). Students 13+ proceed and their profile records `is_under_13 = false, consent_track = 'self_over_13'`. Under-13 students are blocked before any account or data is created, and shown instructions to ask their teacher (whose roster-import flow is the compliant path in).

**Parents.** Parent accounts are adults linking to an existing school-track student via a one-time invite code; no child data is collected from parents at signup.

## Why school-only at launch

The school track keeps the consent obligation with the institution that holds the relationship with families, matches our go-to-market (school pilots), and presents the cleanest scope for iKeepSafe COPPA Safe Harbor certification. A direct-to-family track (email-plus verifiable parental consent) can be added post-certification as an amendment; the `consent_track = 'parent'` value is already reserved.

## Enforcement points in the product

1. Signup client blocks under-13 self-signups before account creation (app/auth/signup).
2. Roster import is teacher-only, pod-owner-only, rate-limited, and audit-logged (app/api/roster/import).
3. `profiles.consent_track` records the legal basis per account (migration 033).
4. Legacy accounts (pre-033) have `consent_track = NULL`; these are demo/dev accounts to be reconciled before pilot.

---

**For Attorney Review — Notes:**
1. Confirm school-consent reliance language matches current FTC COPPA guidance and the 2025 COPPA Rule amendments.
2. Confirm the client-side-only DOB check is acceptable (no server-side age record beyond the boolean).
3. Advise on whether the under-13 block screen needs additional disclosures.
4. Review the reserved 'parent' track requirements before any direct-to-family launch (email-plus mechanics, consent records, revocation).
