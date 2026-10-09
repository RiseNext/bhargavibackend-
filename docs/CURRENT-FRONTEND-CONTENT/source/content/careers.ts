/**
 * Careers copy. CONTENT-TODO: every role below is a PLACEHOLDER written for
 * this build — the clinic has not confirmed real openings yet. Replace titles,
 * branches and requirements with actual vacancies before launch, and only
 * then consider adding JobPosting JSON-LD (Google penalizes structured data
 * for listings that aren't real). See docs/CONTENT-TODO.md.
 */

export type Job = {
  /** Reserved for a future /careers/[slug] detail page. */
  slug: string;
  title: string;
  type: "Full-time" | "Part-time";
  branch: "Chikkadpally" | "Bowenpally" | "Either branch";
  experience: string;
  excerpt: string;
  responsibilities: string[];
  requirements: string[];
};

export const jobs: Job[] = [
  {
    slug: "acupuncture-therapist",
    title: "Acupuncture Therapist",
    type: "Full-time",
    branch: "Chikkadpally",
    experience: "2+ years",
    excerpt:
      "Run your own treatment room under the guidance of our founder — assessments, needling and follow-up plans.",
    responsibilities: [
      "Assess patients and plan courses of acupuncture sittings",
      "Maintain strict single-use needle and hygiene standards",
      "Keep clear treatment notes and track patient progress",
      "Teach patients simple self-care between sittings",
    ],
    requirements: [
      "Diploma or degree in Acupuncture",
      "2+ years of hands-on clinical practice",
      "Comfortable explaining treatment in Telugu and English",
      "Patience with elderly and chronic-pain patients",
    ],
  },
  {
    slug: "physiotherapist",
    title: "Physiotherapist",
    type: "Full-time",
    branch: "Bowenpally",
    experience: "1–3 years",
    excerpt:
      "Lead movement-based recovery alongside our acupuncture and chiropractic care at the Bowenpally branch.",
    responsibilities: [
      "Design exercise and mobility programmes for pain patients",
      "Deliver hands-on sessions and track measurable progress",
      "Coordinate with therapists on combined treatment plans",
      "Guide patients on posture and home routines",
    ],
    requirements: [
      "BPT qualification (MPT a plus)",
      "1–3 years treating musculoskeletal conditions",
      "Clear, encouraging patient communication",
      "Willingness to work weekend shifts on rotation",
    ],
  },
  {
    slug: "naturopathy-consultant",
    title: "Naturopathy Consultant",
    type: "Part-time",
    branch: "Either branch",
    experience: "3+ years",
    excerpt:
      "Whole-person consultations that look past symptoms to diet, habits and stress — the first step for many of our patients.",
    responsibilities: [
      "Conduct 60-minute lifestyle and health assessments",
      "Build natural, practical treatment plans",
      "Refer patients into the right therapy within the clinic",
      "Review and adjust plans at follow-up visits",
    ],
    requirements: [
      "BNYS degree or equivalent naturopathy qualification",
      "3+ years of consultation experience",
      "A complement-never-replace approach to conventional care",
      "Fluent Telugu and English; Hindi a plus",
    ],
  },
  {
    slug: "nutrition-diet-counsellor",
    title: "Nutrition & Diet Counsellor",
    type: "Part-time",
    branch: "Chikkadpally",
    experience: "1+ years",
    excerpt:
      "Turn consultation findings into food plans families can actually follow — affordable, local and sustainable.",
    responsibilities: [
      "Prepare personalised diet charts for patients",
      "Counsel patients on realistic, budget-friendly changes",
      "Track outcomes and refine plans over the course",
      "Support the clinic's health-talk content with nutrition topics",
    ],
    requirements: [
      "Degree or diploma in Nutrition / Dietetics",
      "1+ years of counselling experience",
      "Familiarity with Telugu household diets",
      "Simple, jargon-free communication style",
    ],
  },
  {
    slug: "front-desk-patient-coordinator",
    title: "Front-Desk / Patient Coordinator",
    type: "Full-time",
    branch: "Either branch",
    experience: "1+ years",
    excerpt:
      "The first voice patients hear — appointments, enquiries and a calm, welcoming front desk.",
    responsibilities: [
      "Manage appointment bookings by phone and message",
      "Welcome walk-ins and guide them to the right therapy",
      "Keep patient records and daily schedules tidy",
      "Handle basic billing and follow-up reminders",
    ],
    requirements: [
      "Fluent Telugu, Hindi and English",
      "1+ years in reception or customer-facing work",
      "Comfortable with messaging apps and basic computer work",
      "Warm, unhurried manner with elderly patients",
    ],
  },
  {
    slug: "clinic-assistant",
    title: "Clinic Assistant",
    type: "Full-time",
    branch: "Bowenpally",
    experience: "Fresher-friendly",
    excerpt:
      "Keep treatment rooms ready and therapists supported — a hands-on start to a career in wellness care.",
    responsibilities: [
      "Prepare and reset treatment rooms between sittings",
      "Maintain hygiene and single-use supplies stock",
      "Assist therapists during cupping and physio sessions",
      "Help patients move comfortably around the clinic",
    ],
    requirements: [
      "Intermediate (12th) pass or above",
      "No experience needed — we train on the job",
      "Reliable, punctual and tidy by habit",
      "Based near Bowenpally preferred",
    ],
  },
];

export const jobBySlug = (slug: string) => jobs.find((j) => j.slug === slug);
