# Parent Bill of Rights for Data Privacy and Security

**Last revised: [TO BE SET BY ATTORNEY AT FINALIZATION]**
**Status: DRAFT — Attorney review required**

Resolution Nation, LLC ("Resolution Nation") is committed to protecting the privacy and security of student personally identifiable information ("PII"). This Parent Bill of Rights is issued pursuant to New York State Education Law §2-d and Part 121 of the Regulations of the Commissioner of Education. It applies whenever Resolution Nation processes student PII on behalf of a New York educational agency.

## A. A student's personally identifiable information cannot be sold or released for any commercial or marketing purpose.

Resolution Nation does not sell or release student PII for any commercial or marketing purpose. Student PII is used solely for the educational purposes authorized by the contracting educational agency.

## B. Parents have the right to inspect and review the complete contents of their child's education record stored or maintained by Resolution Nation.

Parents may inspect and review their child's records stored in the Service by submitting a request to their school. The school will coordinate with Resolution Nation to provide the records. Parents may also contact privacy@resolutionnation.app for assistance.

## C. State and federal laws — including New York Education Law §2-d, FERPA, COPPA, and applicable state student privacy laws — protect the confidentiality of a student's personally identifiable information.

Resolution Nation maintains administrative, physical, and technical safeguards to protect student PII consistent with these laws. Safeguards include, at minimum: encryption of PII in transit and at rest; access controls limiting PII to authorized personnel; audit logging of sensitive actions; vulnerability management; annual data privacy and security training for all personnel with access to student PII; and a documented incident response plan.

## D. Safeguards associated with industry standards and best practices, including but not limited to encryption, firewalls, and password protection, must be in place when PII is stored or transferred.

Resolution Nation:

- Encrypts student PII in transit using TLS 1.2 or higher.
- Encrypts student PII at rest in our primary database.
- Restricts access through role-based access controls and row-level security policies.
- Uses strong authentication for administrative access.
- Operates within a US-based hosting region.
- Retains an industry-recognized vendor for periodic penetration testing of the Service.

## E. A complete list of all student data elements collected by the State is available for public review at the following website [http://www.nysed.gov/data-privacy-security/student-data-inventory], or by writing to the Office of Information & Reporting Services, New York State Education Department, Room 863 EBA, 89 Washington Avenue, Albany, New York 12234.

## F. Parents have the right to have complaints about possible breaches of student data addressed.

Complaints should be directed to the school. Parents may also file complaints with NYSED's Chief Privacy Officer at:

Chief Privacy Officer
New York State Education Department
89 Washington Avenue
Albany, NY 12234
Email: privacy@nysed.gov

Resolution Nation will cooperate fully with any investigation initiated by the contracting school or by NYSED.

## G. Parents have the right to be notified of any breach of student data in compliance with applicable law.

In the event of a breach involving student PII, Resolution Nation will notify the contracting educational agency within seven (7) calendar days of discovery of the breach, consistent with New York Education Law §2-d and Part 121.

## H. Educational agency workers that handle PII will receive annual training on applicable federal and state laws.

Resolution Nation personnel with access to student PII complete annual data privacy and security training covering FERPA, COPPA, NY Education Law §2-d, and the Resolution Nation incident response plan.

## I. Information about contracts the educational agency enters into with third-party contractors that will receive PII.

For each contract under which Resolution Nation processes student PII for a New York educational agency, the following information is made available to parents through the agency:

- The exclusive purposes for which student data will be used: providing the Service to the school for educational purposes specified in the contract.
- How Resolution Nation will ensure that subcontractors who receive student data comply with applicable data protection and security requirements: through written sub-processor agreements that flow down our security and privacy obligations.
- The duration of the contract and what happens to student data at the end of the contract: data is returned or destroyed within thirty (30) days of contract termination, unless the educational agency directs otherwise.
- How parents may challenge the accuracy of student data: by contacting the school.
- Where student data will be stored: in the United States, on infrastructure operated by our hosting provider.
- The security protections taken to ensure that student data will be protected: as described in Sections C and D above.

## Resolution Nation Supplemental Information

The supplemental information required by NY Education Law §2-d and Part 121 is incorporated into each contract (Data Privacy Agreement) Resolution Nation enters with New York educational agencies. Parents may request the relevant supplemental information from their school.

## Contact

privacy@resolutionnation.app

---

**For Attorney Review — Notes:**
1. NYSED publishes a model Parent Bill of Rights at https://www.nysed.gov/data-privacy-security — confirm this draft aligns with the current model and incorporate any updates.
2. Confirm the breach notification timeline (7 days) and ensure the incident response plan in /CHANGES.md and internal runbooks matches.
3. Confirm sub-processor flow-down language is consistent with our actual contracts with Supabase, Vercel, Anthropic, etc.
4. Confirm data return / destruction timeline (30 days) matches the deletion windows in the Privacy Policy and the hard-delete worker.
