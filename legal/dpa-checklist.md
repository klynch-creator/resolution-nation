# DPA Pre-Execution Checklist

**Status: DRAFT — Internal use during sales**

Run this checklist before signing any incoming Data Privacy Agreement, addendum, or vendor data agreement. The goal is to spot terms that conflict with how the Service actually works, before you commit.

## 1. Identification

- [ ] Counterparty legal name matches the entity that will pay (district, BOCES, charter network).
- [ ] Authorized signatory on counterparty side is named with title.
- [ ] Effective date, term, and renewal mechanics are specified.

## 2. Scope of data

- [ ] List of student PII categories matches what the Service actually collects (see /legal/privacy-policy.md §2).
- [ ] No promise to collect data we don't (e.g., precise geolocation) and no promise to refrain from collecting data we need to operate (e.g., audit log).

## 3. Purpose limitation

- [ ] Sole use is "providing the Service for the educational purposes described in the agreement."
- [ ] No clause permitting marketing, advertising, or behavioral profiling — we already don't do this, but make sure the language is clean.

## 4. Sub-processors

- [ ] List in DPA matches /legal/subprocessors.md.
- [ ] Notification mechanism for sub-processor changes is reasonable (advance email to a named contact, with a right to object that does not allow unilateral mid-term termination without cause).

## 5. Security

- [ ] Required security controls match what we actually implement (encryption in transit + at rest, RLS, MFA on admin accounts, audit logging, vulnerability scanning, periodic pen test).
- [ ] No promises of certifications we don't have. SOC 2 Type II — explicitly note "in progress, target [date]" if not yet achieved. iKeepSafe — note status accurately.
- [ ] Pen test report sharing terms are reasonable (under NDA, on request, not freely distributable).

## 6. Breach notification

- [ ] Notification window matches statute (NY: 7 calendar days from discovery). Watch for "immediately" or "within 24 hours" language.
- [ ] Notification goes to a named contact, not "the district" generically.
- [ ] Definition of "breach" is consistent with NY Ed Law 2-d.

## 7. Data retention and return / destruction

- [ ] On termination, we return or destroy data within 30 days (or whatever window is in our Privacy Policy).
- [ ] Backups age-out language is included (we can't reach into PITR snapshots immediately).

## 8. Audit rights

- [ ] District can request a summary of our security posture annually.
- [ ] No language requiring on-site physical audit on demand (we are a single-person SaaS; offer a written response to a security questionnaire instead).

## 9. Indemnification, insurance, liability

- [ ] Indemnification scope is mutual, or at least limited to breaches caused by our gross negligence or willful misconduct.
- [ ] Insurance requirements are achievable (cyber liability $1M is typical and reasonable).
- [ ] Liability cap is present. Uncapped liability for any reason is a hard no.

## 10. New York–specific (Ed Law 2-d / Part 121)

- [ ] Exhibit E (or NY-specific addendum) is attached and matches our supplemental data security and privacy plan.
- [ ] Parent Bill of Rights for Data Privacy and Security is referenced and the version at /legal/ny-parent-bill is attached or linked.
- [ ] District's data security and privacy policy is referenced; confirm we can comply.
- [ ] Annual training attestation language is acceptable (we can attest; we train annually).

## 11. NYC DOE–specific (if NYC Public Schools)

- [ ] Vendor compliance submission (Cloud Review) is filed and reflected in the DPA.
- [ ] Standard NYC DOE terms are accepted; deviations are flagged for attorney review.

## 12. State-specific traps

- [ ] California (SOPIPA/AB 1584): no targeted advertising, no creating behavioral profiles, no selling.
- [ ] Illinois (SOPPA): breach notification within 30 days; covered entities and data subject rights language.
- [ ] Texas (SB 820): cybersecurity incident reporting.
- [ ] Colorado (CSPA): data security program requirements.

## 13. Workflow

- [ ] Attorney has reviewed (initial sign-off retained on file).
- [ ] Final PDF + tracked-changes version archived in /contracts/.
- [ ] Tracker entry created in the Roadmap Tracker under Compliance.
- [ ] Sub-processor list double-checked against current vendor reality.

## Red flags — escalate to attorney every time

- "Liability without limit" for any clause.
- Indemnification triggered by claims that have nothing to do with our service (e.g., FERPA claims arising from the school's own actions).
- Right of the district to use our trademarks freely in their materials.
- Promise to undergo audits at the vendor's expense on demand.
- Promise of physical document destruction (we are paperless).
- Different definition of "personal information" than what we contemplate in our Privacy Policy.
- IP assignment language that would transfer our product or content to the district.
