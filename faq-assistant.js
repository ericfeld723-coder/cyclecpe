const FAQ_CONTEXT = `
1. What is an Enrolled Agent and what are their representation rights?
An enrolled agent (EA) is a person who has earned the privilege of representing taxpayers before the Internal Revenue Service. Enrolled agents, like attorneys and certified public accountants (CPAs), have unlimited representation rights. This means they are unrestricted as to which taxpayers they can represent, what types of tax matters they can handle, and which IRS offices they can represent clients before. All EAs must adhere to ethical standards outlined in Treasury Department Circular 230.

2. How do you become an enrolled agent?
To become an enrolled agent, you must: Obtain a Preparer Tax Identification Number (PTIN). Register and schedule the Special Enrollment Examination (SEE) through PSI Services (the IRS testing vendor). Achieve passing scores on all three parts of the SEE within three years. Apply for enrollment and pay the fee electronically using Pay.gov Form 23 (or paper Form 23). Pass a thorough background and tax compliance suitability check.

3. What is the fee and testing structure for the Special Enrollment Examination (SEE)?
There is a $317 fee per part paid at the time of appointment scheduling with PSI Services (effective for the 2026 testing cycle). Each exam part is 3.5 hours long (with 4 hours total seat time for tutorials and breaks). If you fail a part, you must wait 24 hours before scheduling another appointment for that same part.

4. What are the Continuing Education (CE) requirements for Enrolled Agents?
Enrolled agents must obtain 72 hours of qualifying continuing education every three-year renewal cycle. This must include a minimum of 16 hours per year, with at least 2 hours of ethics each year (totaling 6 ethics hours per cycle). All CE courses must be taken through an IRS-approved CE provider.

5. When is my EA renewal due and how is the cycle determined?
EA renewals occur every three years based on the last digit of your Social Security Number (SSN), as outlined in IRS Publication 5186: SSNs ending in 7, 8, 9 (or no SSN): Renewal window is Nov 1, 2026 – Jan 31, 2027; credential expires March 31, 2027. SSNs ending in 0, 1, 2, 3: Renewal window is Nov 1, 2027 – Jan 31, 2028; expires March 31, 2028. SSNs ending in 4, 5, 6: Renewal window is Nov 1, 2028 – Jan 31, 2029; expires March 31, 2029. Applications are submitted online via Pay.gov Form 8554.

6. What happens if I miss my renewal deadline or have a CPE/CE deficit?
If you fail to complete your required CE hours or submit Form 8554 by your March 31 expiration date, your enrollment status becomes inactive. While inactive, you lose your right to represent taxpayers before the IRS. To correct this and reinstate active status, you must complete your makeup CE hours through an approved provider like CycleCPE, submit your renewal application, and pay any required fees to the IRS Office of Enrollment.

7. Do I need to renew my PTIN every year?
Yes. Your Preparer Tax Identification Number (PTIN) must be renewed annually between mid-October and December 31 each year at IRS.gov/ptin, regardless of your three-year EA renewal cycle.

8. How does CycleCPE help me manage my Enrolled Agent renewal?
CycleCPE provides an all-in-one compliance platform featuring: A CPE Ledger & Proration Engine that automatically calculates required hours based on your original enrollment date. An interactive CE Courses Catalog with instant certificate generation upon passing course exams. An automated Form 8554 Renewal Portal that pulls your profile data and generates publication-ready PDFs instantly.

9. How many continuing education hours must an enrolled agent complete?
Enrolled agents must complete 72 hours of continuing education every three years, with a minimum of 16 hours earned in each individual year of the cycle — at least 2 of those 16 hours must be ethics. All hours must come from an IRS-approved CE provider. Hours do not need to be split evenly (e.g. 24/year) — as long as each year clears its 16-hour/2-ethics floor and the 3-year cumulative total is met.

10. I enrolled partway through a cycle — how many CE hours do I owe for my first renewal?
If your initial enrollment falls in the middle of a cycle, your first-renewal requirement is prorated: 2 hours of qualifying CE for every month you were enrolled that cycle, plus 2 hours of ethics for each calendar year of that partial period. Once your next full 3-year cycle begins, the standard 72-hour requirement applies.

11. What if I couldn't complete my required CE hours due to extenuating circumstances?
You may be able to request a waiver of the continuing education requirement under Circular 230 §10.6(i) by submitting Form 14392 along with documentation supporting your request. Waivers are not granted if you've already met the required hours for the cycle.

12. What records do I need to keep for my completed CE courses?
Enrolled agents must retain CE records for 4 years, including: the CE provider's name, the program location, the program title and approval number, course materials, the dates attended, the credit hours claimed, instructor names, and your certificate of completion. CycleCPE automatically stores your certificates and program details in your CPE Ledger.

13. How do I know a CE provider is IRS-approved?
Check the IRS's public list of approved CE providers. Approved providers are also issued an IRS Provider Number and may display the "IRS Approved Continuing Education Provider" logo. Your certificate of completion should include a program number as well.

14. Do I need to send my certificates of completion to the IRS myself?
No. IRS-approved providers report your completed programs directly to the IRS on your behalf, and you can view your recorded CE credits through your online PTIN account. Keep your own copies for your records regardless.

15. Can extra hours in one category count toward another category's requirement?
Only excess federal tax law update hours can be applied toward the general federal tax law requirement. Extra hours earned in ethics, or in federal tax law generally, cannot be shifted to satisfy a different category's requirement.

16. How many CE hours can I earn as an instructor?
You may earn a maximum of 6 instructor credit hours per year.

17. Can I retake the same course and get CE credit again?
Generally, you shouldn't repeat the same program within the same enrollment cycle purely to rack up additional credit, though retaking a course as a genuine refresher happens from time to time.

18. Can I take the AFTR course and count it toward my EA CE requirement?
No. The Annual Federal Tax Refresher (AFTR) course is a basic-level course designed for non-credentialed preparers in the Annual Filing Season Program, not for enrolled agents. AFTR completion does not count toward EA continuing education requirements.

19. Which calendar year does my CE credit count toward?
A course must be completed by midnight local time on December 31 to count toward that calendar year's requirement.

ABOUT CYCLECPE PLATFORM:
CycleCPE LLC is located at 7000 Palmetto Park Rd, Ste 210, Boca Raton, FL 33433. CycleCPE offers 22 CE courses covering Ethics, Federal Tax Law, Federal Tax Law Updates, Qualified Retirement Plan Matters, SEE Exam Prep, and AFTR. Plans: Free ($0, purchase courses individually), EA Essentials ($79/yr), EA Plus ($129/yr, unlimited course access), EA Complete ($179/yr, unlimited courses + Form 8554 preparation tool). Individual course pricing: $9 (1-hour), $15 (2-hour), $25 (4-hour), $35 (6-hour). The platform includes a CPE Ledger, an auto-populated Form 8554 generator, auto-emailed certificates, and CE tracking tools. THIS WEBSITE IS CURRENTLY IN TESTING MODE — courses have not yet been approved by the IRS, and the site should not currently be used for actual CE credit.
`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { question } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'A question is required.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: `You are the CycleCPE support assistant, answering questions about Enrolled Agent continuing education requirements and the CycleCPE platform. Answer ONLY using the information below. Keep answers concise (2-5 sentences), friendly, and direct.

If the question cannot be confidently answered from the information below — including anything about a specific person's account, billing issue, technical bug, refund, or anything not covered here — respond with EXACTLY this and nothing else: "I'm not able to answer that one directly — please email our team at info@cyclecpe.com and they'll help you out."

Reference information:
${FAQ_CONTEXT}`,
        messages: [{ role: 'user', content: question }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(200).json({
        answer: "I'm not able to answer that one directly — please email our team at info@cyclecpe.com and they'll help you out.",
      });
    }

    const data = await response.json();
    const answer = data.content?.[0]?.text || "I'm not able to answer that one directly — please email our team at info@cyclecpe.com and they'll help you out.";

    return res.status(200).json({ answer });
  } catch (err) {
    console.error('faq-assistant error:', err);
    return res.status(200).json({
      answer: "I'm not able to answer that one directly — please email our team at info@cyclecpe.com and they'll help you out.",
    });
  }
}
