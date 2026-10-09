/**
 * Privacy-policy content blocks — E17 / D-021.
 *
 * Transcribed from `docs/PRIVACY-POLICY-DRAFT.md`, which is the approved
 * DRAFT. "Approved" there means the wording was reviewed internally; it does
 * **NOT** mean the client has signed it off. B10 remains open and nothing here
 * claims otherwise.
 *
 * 🔴 TEN FACTS ARE DELIBERATELY ABSENT. Every one is a legal or business fact
 * that only the clinic can state, so each is written as the literal
 * `UNKNOWN_MARKER` rather than guessed. `privacyReadiness()` scans for that
 * exact string and `assertPrivacyReadyForLaunch()` refuses to publish while one
 * survives — a policy that misstates a retention period, a legal basis or the
 * registered entity is a legal exposure, which is materially worse than not yet
 * having a policy page.
 *
 * The clinic resolves them by editing these slots in the admin, which is why
 * they are content rows and not hardcoded text.
 *
 * 🔴 D-038 CORRECTIONS. The draft was written when the backend still sent
 * notification email. Three statements were therefore untrue and are corrected
 * here rather than transcribed:
 *
 *   · §3 said a "notification sent to our staff" omitted the message text.
 *     The website now sends NO email at all, so the honest statement is that
 *     enquiry detail is read only by signing in to the administration system.
 *   · §4 said a CV is "never attached to internal notification emails". True,
 *     but misleading — there is no outbound mail to attach anything to.
 *   · Both are replaced with wording that describes the architecture that
 *     actually exists.
 *
 * These rows carry no `cta_*` values: a legal page has no call to action.
 */

import { UNKNOWN_MARKER } from "../../src/lib/content/privacy";

export interface PrivacyBlockSeed {
  slot: string;
  label: string | null;
  title: string | null;
  lead: string | null;
  body: string[] | null;
  extra: Record<string, unknown> | null;
}

/** `U(reason)` — an unresolved client fact, stated as such in the content. */
const U = (reason: string): string => `${UNKNOWN_MARKER} (${reason})`;

export const PRIVACY_BLOCKS: PrivacyBlockSeed[] = [
  {
    slot: "intro",
    label: "Privacy",
    title: "Privacy Policy",
    lead:
      "This policy explains what this website collects when you contact us, why we collect it, " +
      "and what we do with it. It covers this website only.",
    body: [
      "We ask for as little as possible, and we never sell your information or share it for " +
        "advertising.",
    ],
    // 🔴 Required client input 1 of 10.
    extra: { lastUpdated: U("date of publication") },
  },
  {
    slot: "collect",
    label: "Section 1",
    title: "Information we collect",
    lead: "Only what you type into a form, plus the minimum our systems record automatically.",
    body: [
      "When you request an appointment: your name, phone number, an optional email address, " +
        "your preferred branch, the therapy you are interested in, an optional preferred date " +
        "and time, and an optional description of what you would like help with.",
      "When you send a general enquiry: your name, phone number, an optional email address and " +
        "your message.",
      "When you apply for a job: your name, phone number, an optional email address, the role " +
        "you are applying for, your experience, a short note about yourself, and — if you " +
        "choose to upload one — your CV. You may instead email your CV to us separately.",
      "Automatically: the internet address your request came from and your browser's " +
        "identification string, kept so we can recognise automated abuse of our forms.",
      "We do not ask for your date of birth, your identity-document numbers, your payment " +
        "details or your medical records through this website.",
      // 🔴 Required client input 2 of 10.
      U("whether website analytics are used, and if so which — this section must say so before any analytics are added"),
    ],
    extra: null,
  },
  {
    slot: "why",
    label: "Section 2",
    title: "Why we collect it",
    lead: "To answer you, and to run the clinic's own records. Nothing else.",
    body: [
      "To contact you about the appointment or enquiry you submitted, using the name, phone " +
        "number and email address you gave us.",
      "To prepare for your visit, using the therapy and timing you asked for.",
      "To assess a job application, using the details and CV you sent.",
      "To protect the forms from automated abuse, using the technical details above.",
      "We do not use your enquiry details for marketing, and we do not add you to a mailing " +
        "list because you booked an appointment.",
      // 🔴 Required client input 3 of 10.
      U("whether the clinic wishes to state a specific legal basis for processing"),
    ],
    extra: null,
  },
  {
    slot: "health",
    label: "Section 3",
    title: "Health and symptom information",
    lead:
      "If you describe a symptom or a condition in the appointment form, that is health " +
      "information, and we treat it with particular care.",
    body: [
      "You decide how much to share. The description field is optional — you can leave it " +
        "blank, or write only a few words, and still request an appointment.",
      "What you write is stored encrypted, and it is readable only by signing in to our " +
        "administration system. This website sends no email to anyone, so your description is " +
        "never placed in an email by us.",
      "If you choose to continue on WhatsApp, the details you send there go to the clinic's own " +
        "WhatsApp number. That is your choice and it is not required.",
      "Only authorised clinic staff can view enquiry details, and every time the description is " +
        "opened it is recorded.",
      "Please do not send detailed medical records through this website. Bring them to your " +
        "appointment instead.",
    ],
    extra: null,
  },
  {
    slot: "careers",
    label: "Section 4",
    title: "Careers and resumes",
    lead: "Your CV is kept privately and is never published.",
    body: [
      "A CV you upload is stored privately. It has no public web address, and it cannot be " +
        "found by search engines.",
      "Clinic staff open it through a temporary link that expires shortly after it is created, " +
        "and each access is recorded.",
      "This website sends no email, so your CV is never emailed by us to anyone.",
      "If you choose to email your CV instead, we give you a reference number so we can match " +
        "your document to your application.",
      "We use your application to assess you for the role you applied for, and for other roles " +
        "at the clinic if you have asked us to keep you in mind.",
      // 🔴 Required client input 4 of 10.
      U("how long unsuccessful applications and CVs should be kept"),
    ],
    extra: null,
  },
  {
    slot: "thirdParties",
    label: "Section 5",
    title: "WhatsApp and other services we rely on",
    lead: "A few services help us run this website. We keep the list short.",
    body: [
      "WhatsApp: when you choose to continue on WhatsApp, your message is handled by WhatsApp " +
        "under its own privacy terms, which we do not control. WhatsApp is optional — you can " +
        "call the clinic or email us instead.",
      "We also rely on service providers to host this website, to store its database, and to " +
        "store images and uploaded CVs. They process this information on our instructions only.",
      // 🔴 Required client input 5 of 10.
      U("whether the clinic wishes to name its hosting, database and file-storage providers, and the countries their data is held in"),
    ],
    extra: null,
  },
  {
    slot: "storage",
    label: "Section 6",
    title: "How we store and protect your information",
    lead: "Access is limited, encrypted where it matters, and recorded.",
    body: [
      "Enquiries are stored in a private database that is not reachable from the public " +
        "internet.",
      "The description you write in the appointment form is encrypted before it is stored, so " +
        "it cannot be read directly from the database.",
      "Uploaded CVs are stored privately with no public address.",
      "Only authorised clinic staff have accounts, each sign-in is protected, and views of " +
        "enquiry descriptions and CV downloads are recorded.",
    ],
    extra: null,
  },
  {
    slot: "retention",
    label: "Section 7",
    title: "How long we keep it",
    lead: "Only as long as we need it.",
    body: [
      "Appointment requests and enquiries are kept while we are in contact with you and for a " +
        "period afterwards for the clinic's own records.",
      "Job applications and CVs are kept for the role you applied for, and longer only if you " +
        "asked us to keep you in mind.",
      "Records of staff access are kept so that access to health information remains " +
        "accountable.",
      // 🔴 Required client input 6 of 10.
      U("the final retention period for each of the three categories above"),
    ],
    extra: null,
  },
  {
    slot: "rights",
    label: "Section 8",
    title: "Your choices and rights",
    lead: "You can ask us what we hold about you, and ask us to correct or delete it.",
    body: [
      "Write to us at the address in the Contact section to ask for a copy of what we hold, to " +
        "ask us to correct something, to ask us to delete your enquiry, or to ask us to stop " +
        "contacting you.",
      "Please tell us the phone number or email address you used, so we can find your record.",
      "We will respond as soon as we reasonably can.",
      // 🔴 Required client input 7 of 10.
      U("which data-protection law the clinic is subject to, and whether to set out the specific statutory rights it grants"),
    ],
    extra: null,
  },
  {
    slot: "consent",
    label: "Section 9",
    title: "Consent",
    lead: "The appointment form asks you to confirm that we may contact you.",
    body: [
      "Ticking that box means you agree that we may call or message you about the enquiry you " +
        "submitted.",
      "It does not sign you up to anything else, and you can ask us to stop at any time.",
    ],
    extra: null,
  },
  {
    slot: "children",
    label: "Section 10",
    title: "Children",
    lead: "This website is intended to be used by adults.",
    body: [
      "If you are booking on behalf of a child, please use your own contact details.",
      "If you believe a child has sent us information directly, contact us and we will remove " +
        "it.",
    ],
    extra: null,
  },
  {
    slot: "changes",
    label: "Section 11",
    title: "Changes to this policy",
    lead: "If this policy changes, the date at the top changes with it.",
    body: [
      "We may update this policy as the website changes. The current version is always the one " +
        "on this page.",
    ],
    extra: null,
  },
  {
    slot: "contact",
    label: "Section 12",
    title: "Contact us",
    lead: "For anything about this policy, or about information we hold about you.",
    body: [
      // 🔴 Required client inputs 8, 9 and 10 of 10.
      U("the registered business or legal entity name that this policy is issued by"),
      U("the clinic's full postal address for privacy correspondence"),
      U("any business registration number the clinic wishes to publish"),
    ],
    extra: null,
  },
];

/** Asserted by the seed so a transcription slip cannot pass silently. */
export const EXPECTED_PRIVACY_BLOCK_COUNT = 13;

/**
 * How many slots are expected to contain an unresolved marker on a fresh seed.
 *
 * Pinned so that "the policy is publishable" can never become true by accident
 * — if a future edit drops a marker without the client supplying the fact, the
 * seed check fails rather than the page silently going live.
 */
export const EXPECTED_PRIVACY_SLOTS_WITH_MARKERS = 8;
