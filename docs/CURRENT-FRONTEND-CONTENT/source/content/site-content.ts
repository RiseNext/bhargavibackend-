/** Stats, FAQs, values and the founder story (docs/textprd.md §4, §5). */

export const stats = [
  { value: 8, suffix: "+", label: "Years of expertise" },
  { value: 1000, suffix: "+", label: "Acupuncture cases" },
  // "Patients cured" softened to "treated" — see docs/CONTENT-TODO.md #3.
  { value: 3000, suffix: "+", label: "Patients treated" },
  { value: 10, suffix: "", label: "Therapies offered" },
];

export const whyChooseUs = [
  {
    title: "Personalized Treatment",
    icon: "/images/icons/personalized-treatment.png",
    text: "No two bodies respond the same way. Every plan starts with a full consultation, not a template.",
  },
  {
    title: "Experienced Therapists",
    icon: "/images/icons/licensed-therapists.png",
    text: "Eight years of practice across acupuncture, acupressure, cupping and varma therapy.",
  },
  {
    title: "Affordable Pricing",
    icon: "/images/icons/affordable-pricing.png",
    text: "Sessions from ₹100. Clear pricing before you begin — no packages you didn't ask for.",
  },
  {
    title: "High Standards",
    icon: "/images/icons/high-industry-standards.png",
    text: "Single-use needles, sterile technique and a clean, private treatment room every time.",
  },
];

export const process = [
  {
    step: "01",
    title: "Consultation",
    text: "We sit down and go through your history, symptoms, diet and daily routine — not just the pain you walked in with.",
  },
  {
    step: "02",
    title: "Assessment",
    text: "Pressure points, posture and energy flow are assessed to find where the problem actually originates.",
  },
  {
    step: "03",
    title: "Treatment Plan",
    text: "You get a plan: which therapies, how many sittings, and what you can do at home between visits.",
  },
  {
    step: "04",
    title: "Follow-Up",
    text: "Progress is reviewed each sitting and the plan is adjusted. Most people notice a change within 2–4 sessions.",
  },
];

export const homeIntro = `Mrs Anjana Bhargavi is the brain child behind the inspiring and exceptional Bhargavi Health World — a centre dedicated to providing world class treatments and counselling in alternate medicine which are tried, tested and proven to be effective. She believes “The only way to do great work is to love what you do”, and she has most definitely poured her heart and soul into the centre and into every patient's well being.`;

export const treatmentsIntro = `Alternative medicine plays a vital role in holistic health by offering diverse therapeutic options that may complement conventional treatments. It emphasizes treating the whole person — mind, body, and spirit — rather than just symptoms. Techniques such as acupuncture, chiropractic care, and nutrition can alleviate chronic conditions, reduce stress, and improve quality of life.`;

export const aboutStory = [
  `Mrs Anjana Bhargavi is the brain child behind the inspiring and exceptional Bhargavi Health World. A centre dedicated to providing world class treatments and counselling in alternate medicine which are tried, tested and proven to be effective. She believes “The only way to do great work is to love what you do”, and she most definitely has poured her heart and soul into the centre and into every patient's well being. Bhargavi was born and brought up in Mahabubnagar, Telangana. Now she serves as a senior Acupuncture Therapist.`,
  `She started her career in 2017 and has since successfully treated 1000+ patients. Learning new things has always been a passion of hers and as a part of that, she learnt Varma Therapy, Cupping Therapy and more, to enhance patient well being through targeted treatment. She started Bhargavi Health World to spread happiness by making her patients healthy from within.`,
  `Bhargavi Health World provides services including Acupressure Therapy, Acupuncture Therapy, Yoga, and meditation through Sunya.`,
];

export const achievements = [
  "Invited to give a guest lecture by the NGO IAHO",
  "An active member of various NGOs",
  "Vice President — PR & Marketing, Junior Chamber International, Secunderabad Walkertown",
  "Council member, Sunyati International Foundation, Telangana State",
  "Recipient of SIMA awards and recognitions for her service",
];

export type Faq = { question: string; answer: string };

export const faqs: Faq[] = [
  {
    question: "How many sessions are needed for acupuncture to be effective?",
    answer:
      "The number of sessions required varies by individual and condition, but many people notice improvements after 2–4 sessions, with chronic issues potentially requiring more frequent visits.",
  },
  {
    question: "What conditions can seed therapy help with?",
    answer:
      "Seed therapy is often used to help with issues such as stress, anxiety, chronic pain, digestive problems, and respiratory issues, although its effectiveness can vary based on the individual.",
  },
  {
    question: "Is physiotherapy painful?",
    answer:
      "While some techniques may cause mild discomfort, physiotherapy should not be excessively painful. Your therapist will work with you to ensure the treatment is within your comfort levels while still being effective.",
  },
  {
    question: "Do I need an appointment, or can I walk in?",
    answer:
      "Walk-ins are welcome during clinic hours, but booking ahead means you won't wait. Call or WhatsApp +91 70751 57013 to reserve a slot.",
  },
  {
    question: "What are your timings?",
    answer:
      "Every day, Monday to Sunday, 9:00 AM – 9:00 PM.",
  },
  {
    question: "Can these therapies be taken alongside my existing medication?",
    answer:
      "In most cases, yes — these are complementary therapies, not replacements for medical treatment. Bring your current prescriptions to your first consultation so your plan can be built around them.",
  },
];
