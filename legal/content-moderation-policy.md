# Content Moderation & Account Restriction Policy

**Last revised: [TO BE SET BY ATTORNEY AT FINALIZATION]**
**Status: DRAFT — Attorney review required**

This policy describes how Resolution Nation, LLC ("Resolution Nation," "we") moderates student-generated writing and how account restrictions ("freezes") work. It is written for school administrators, teachers, and parents reviewing the Service, and it reflects how the product actually behaves.

## 1. What is moderated

Every piece of writing a student submits in the Writing Workshop — short responses, essays, and creative writing — is automatically screened at submission time. Moderation applies only to content the student deliberately submits inside the Service. We do not monitor keystrokes, other applications, or anything outside the Service.

## 2. How screening works

Submissions are evaluated by an automated safety check (an AI model run server-side by our sub-processor, Anthropic, under terms that prohibit training on the content). The check assigns one of three outcomes:

- **OK** — normal, school-appropriate writing. No action; the submission proceeds normally.
- **Borderline** — mild profanity, rude language, or mild conflict. The submission is surfaced to the teacher for awareness; the student's account is not restricted.
- **Inappropriate** — content that is clearly not school-appropriate, including: sexual or sexually explicit content; graphic violence or threats toward real people; self-harm, suicide, or eating-disorder content; harassment, bullying, hate, or slurs; weapons, drugs, or other clearly unsafe content; or sharing of personal contact information. The submission is flagged and the student's account is frozen pending adult review (see Section 4).

The screening is calibrated for creative fiction: age-appropriate fictional conflict, mild peril, or a "villain" is treated as normal creative writing. Only the genuinely unsafe categories above trigger a flag.

If the automated check itself fails (for example, a service error), we fail safe: the submission is marked for teacher review rather than silently passing.

## 3. Humans stay in the loop

Automated screening never makes a final judgment about a student. Every flag is routed to the student's teacher, who reviews the actual writing and decides what happens next. Teachers can clear a flag they judge to be a false positive. Linked parents can see moderation flags and account status for their own child.

Content suggesting a student may be at risk (for example, self-harm disclosures) is flagged so that the responsible adults — the teacher and, where linked, the parent — see it promptly. Resolution Nation does not contact students directly about flagged content and does not report content to any outside party except as required by law.

## 4. Account freezes

When a submission is flagged "inappropriate," the student's account is frozen: the student sees a neutral message that their account is paused pending teacher review, and product features are blocked until an adult acts. The freeze:

- is temporary and reversible — the teacher can unfreeze the account at any time after review;
- is visible to the teacher and the linked parent, along with the flagged submission and the reason;
- is never punitive by design — its purpose is to make sure a responsible adult looks at concerning content before the student continues, not to discipline the student;
- does not delete any student work.

Schools remain in control: disciplinary decisions, parent conversations, and counseling referrals are made by school staff under school policy, not by Resolution Nation.

## 5. Data handling

Moderation flags (verdict, category, one-sentence reason) and freeze/unfreeze events are stored as part of the student's record and are subject to the same retention and deletion rules as other educational records (see our Privacy Policy, Section 6). Flagged text is not shared with anyone other than the sub-processor performing the automated check, the student's teacher, and the linked parent.

## 6. Questions and appeals

Parents or school staff who believe a flag or freeze was applied in error should contact the classroom teacher first (teachers can resolve most cases immediately), or reach us at privacy@resolutionnation.app.

---

**For Attorney Review — Notes:**
1. Confirm the description matches the shipped implementation (lib/writing-moderation.ts: three-tier verdict, freeze on "inappropriate," fail-safe to "borderline" on moderator error, teacher unfreeze).
2. Confirm alignment with district acceptable-use and student-discipline policies; districts may ask for the freeze to be configurable.
3. Consider whether mandated-reporter guidance belongs here or in teacher-facing help docs.
4. Confirm consistency with the Privacy Policy Section 3 and the Anthropic entry in /legal/subprocessors.
