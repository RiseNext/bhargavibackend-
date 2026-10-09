# Services — listing page and all 10 detail pages

> **Route:** `/services and /services/[slug]`
> **Source file(s):** `src/app/services/page.tsx`, `src/app/services/[slug]/page.tsx`, `src/content/services.ts`
> **Snapshot taken:** 2026-10-08 against frontend `main` @ `2fdf32a`
> **Fidelity:** prose is reproduced verbatim from the TypeScript source; section headings are transcribed verbatim from JSX. Nothing reworded, summarised or corrected.

## Part 1 — Listing page (`/services`)

- **Breadcrumb:** Home / Services
- **H1:** Ten therapies, one whole-person approach  ⚠ *the word "Ten" hardcodes the service count*
  - JSX: `Ten therapies, one <span className="italic">whole-person</span> approach`
- **Hero style:** compact (no label, no lead)

Renders all 10 services as `ServiceCard`s with a zero-padded index badge.
Each card shows: index badge, image, title, excerpt, duration, and a "View therapy" pill on hover.

**FAQ section**

- **Label:** Before you book
- **H2:** Common questions
- **Lead:** Still unsure which therapy fits? Call us and we'll tell you honestly — including when we are not the right option.

**Also renders:** `ProcessSteps`, `CtaBand`.

**SEO** — Title: "Services" · Canonical: `/services` · Description: "Bhargavi Health World in Chikkadpally offers expert holistic care through acupuncture, acupressure, physiotherapy, and more. Restore your health naturally in the heart of Hyderabad."

---

## Part 2 — Detail page template (identical on all 10)

- **Breadcrumb:** Home / Services / <service.title>
- **H1:** `<service.title>`
- **Lead:** `<service.excerpt>`

**Meta row** — ⚠ **two of these three values are hardcoded JSX, identical on every service page:**

| Label | Value | From data? |
|---|---|---|
| Session length | <service.duration> | ✅ yes |
| From | ₹100 | ❌ **NO — hardcoded** |
| Typical course | 2–4 sittings | ❌ **NO — hardcoded** |

- **Overview section:** label "Overview" / H2 "About this therapy" → renders `service.body`
- **Indications section:** label "Indications" / H2 "What it can help with" → renders `service.treats`
- **Disclaimer:** Please note: this is a complementary therapy. It works alongside — not instead of — the medical care you already receive. Bring your current prescriptions to your first consultation.
- **Booking aside:** "Book {service.title}" / "We call back to confirm your slot — usually the same day." + compact `AppointmentForm` prefilled with this service
- **Call aside:** "Prefer to call?" / both phones with branch labels / hours "Mon–Sun · 9:00 AM – 9:00 PM" ⚠ *hardcoded* / "Ask on WhatsApp"
- **Related section:** label "Explore more" / H2 "Other therapies you might need" — services.filter(s => s.slug !== service.slug).slice(0, 3) - first three others, not curated
- **Hero image alt:** ``${service.title} at ${site.name}``
- **Structured data:** `MedicalTherapy` with `provider: MedicalClinic`
- **Static generation:** `generateStaticParams()` pre-renders all 10 slugs

---

## Part 3 — All 10 services, verbatim

> Source: `src/content/services.ts` (verbatim copy at `../source/content/services.ts`, structured at `../data/services.json`).
> `copyStatus`: `"source"` = verbatim from the client's old site · `"rewrite"` = old copy was unusable, placeholder written for this build.

### 1. Acupuncture

| Field | Value |
|---|---|
| `slug` | `acupuncture` |
| `title` | Acupuncture |
| `duration` | 45–60 min |
| `image` | `/images/services/acupuncture.jpg` → `assets/services/acupuncture.jpg` |
| `copyStatus` | `source` |
| URL | `/services/acupuncture` |

**`excerpt`**

> Fine needles placed at specific points to restore the body's energy flow and ease long-standing pain.

**`treats`** (6 items)

- Chronic back, neck and joint pain
- Headaches and migraines
- Stress, anxiety and low mood
- Digestive issues such as IBS
- Menstrual irregularity and menopause symptoms
- Poor sleep and low immunity

**`body`** (3 paragraphs)

*Paragraph 1*

> Acupuncture is an ancient Chinese medical practice that involves the insertion of thin needles into specific points on the body to stimulate energy flow, known as Qi (pronounced “chee”). This technique is believed to restore balance and promote the body's natural healing processes. It has gained popularity worldwide as a complementary therapy for various conditions.

*Paragraph 2*

> Commonly treated ailments include chronic pain, such as back pain, neck pain, and osteoarthritis. Acupuncture is also effective for managing headaches and migraines, as well as alleviating symptoms associated with stress, anxiety, and depression. Additionally, it may help with digestive issues like irritable bowel syndrome (IBS), and can support women's health by regulating menstrual cycles and alleviating symptoms of menopause.

*Paragraph 3*

> Many individuals seek acupuncture to enhance overall well-being, improve sleep quality, and boost immune function. While scientific research supports its efficacy for certain conditions, individual responses can vary, making it important for patients to consult qualified practitioners. As a holistic approach, acupuncture not only addresses physical symptoms but also considers emotional and lifestyle factors, reinforcing its role in integrative health care.

---

### 2. Acupressure

| Field | Value |
|---|---|
| `slug` | `acupressure` |
| `title` | Acupressure |
| `duration` | 40–60 min |
| `image` | `/images/services/accupressure.jpg` → `assets/services/accupressure.jpg` |
| `copyStatus` | `source` |
| URL | `/services/acupressure` |

**`excerpt`**

> The same pressure points as acupuncture, worked with hands instead of needles — gentle, and needle-free.

**`treats`** (6 items)

- Back and neck pain
- Headaches and migraines
- Stress, anxiety and insomnia
- Digestive discomfort and nausea
- Menstrual cramps
- Arthritis pain

**`body`** (3 paragraphs)

*Paragraph 1*

> Acupressure is a traditional Chinese medicine technique that involves applying pressure to specific points on the body to promote healing and balance. It is rooted in the principles of acupuncture but utilizes fingers, palms, or elbows instead of needles. By stimulating these pressure points, acupressure aims to release tension, improve circulation, and enhance the body's natural ability to heal itself.

*Paragraph 2*

> Various conditions can be effectively treated or managed through acupressure, including headaches, migraines, back pain, digestive issues, and stress-related disorders. It can also help alleviate symptoms of insomnia, anxiety, and nausea, making it a popular complementary therapy for those undergoing treatments like chemotherapy. Conditions such as menstrual cramps and arthritis can benefit from targeted pressure application as well.

*Paragraph 3*

> The therapy is generally safe and can be done on oneself or with a practitioner's guidance, making it accessible for many. While research on its efficacy is still growing, many individuals report positive outcomes and relief from various ailments, showcasing acupressure's potential as a valuable holistic approach to health and wellness.

---

### 3. Naturopathy Consultation

| Field | Value |
|---|---|
| `slug` | `naturopathy-consultation` |
| `title` | Naturopathy Consultation |
| `duration` | 60 min consultation |
| `image` | `/images/services/naturopathy.jpg` → `assets/services/naturopathy.jpg` |
| `copyStatus` | `source` |
| URL | `/services/naturopathy-consultation` |

**`excerpt`**

> A whole-person assessment that looks past symptoms to the habits, diet and stress behind them.

**`treats`** (5 items)

- Long-term lifestyle conditions
- Low energy and fatigue
- Stress management
- Preventive health planning
- Dietary and habit correction

**`body`** (3 paragraphs)

*Paragraph 1*

> Naturopathy is a holistic approach to health care that emphasizes the body's inherent ability to heal itself through natural remedies and lifestyle changes. A naturopathy consultant employs various techniques, such as herbal medicine, nutrition, physical manipulations, and stress management, to promote wellness.

*Paragraph 2*

> Naturopaths assess individual health conditions by considering not just physical symptoms but also emotional and environmental factors, encouraging a comprehensive understanding of health. Consultants create personalized treatment plans that may include dietary changes, supplementation, and mind-body practices, fostering self-care and preventive measures.

*Paragraph 3*

> The philosophy behind naturopathy is rooted in the belief that optimal health can be achieved by addressing the underlying causes of illness rather than merely alleviating symptoms. This integrative approach allows individuals to take active roles in their health journey, aligning with a growing trend toward natural and preventive medicine.

---

### 4. Nutrition & Diet

| Field | Value |
|---|---|
| `slug` | `nutrition-and-diet` |
| `title` | Nutrition & Diet |
| `duration` | 45 min consultation |
| `image` | `/images/services/nutrition-diet.jpg` → `assets/services/nutrition-diet.jpg` |
| `copyStatus` | `source` |
| URL | `/services/nutrition-and-diet` |

**`excerpt`**

> Personalised meal planning built around your condition, your kitchen and what you will actually eat.

**`treats`** (5 items)

- Weight management
- Diabetes and blood-sugar support
- Thyroid and PCOD nutrition
- Food allergies and restrictions
- Sports and recovery nutrition

**`body`** (3 paragraphs)

*Paragraph 1*

> Nutrition and diet play a critical role in promoting overall health and well-being, influencing everything from physical fitness to mental health. A nutrition consultant provides expert guidance on healthy eating habits, personalized meal planning, and nutritional education tailored to individual needs or specific health conditions.

*Paragraph 2*

> Consultants assess clients' dietary habits, lifestyle factors, and nutritional deficiencies to develop tailored strategies that optimize health outcomes. They emphasize the importance of a balanced diet rich in whole foods, including fruits, vegetables, lean proteins, whole grains, and healthy fats, while also considering cultural preferences and lifestyle constraints.

*Paragraph 3*

> Successful nutrition consultants not only focus on meal plans but also work to foster a positive relationship with food, helping clients make sustainable lifestyle changes rather than relying on quick fixes or fad diets. Support also covers weight management, sports nutrition, and dietary restrictions due to allergies or chronic conditions.

---

### 5. Seed Therapy

| Field | Value |
|---|---|
| `slug` | `seed-therapy` |
| `title` | Seed Therapy |
| `duration` | 30–40 min |
| `image` | `/images/services/seed-therapy.jpg` → `assets/services/seed-therapy.jpg` |
| `copyStatus` | `source` |
| URL | `/services/seed-therapy` |

**`excerpt`**

> Seeds fixed to pressure points for continuous, gentle stimulation between your clinic visits.

**`treats`** (5 items)

- Stress, anxiety and low mood
- Chronic pain
- Digestive problems
- Allergies and inflammation
- Respiratory discomfort

**`body`** (3 paragraphs)

*Paragraph 1*

> Seed therapy, rooted in the principles of natural medicine, utilizes the seeds of various plants to promote healing and restore balance in the body. This holistic approach is based on the idea that plant seeds contain vital energy and nutrients that can influence physical and emotional well-being.

*Paragraph 2*

> Practitioners often use seed therapy to treat a range of conditions, including stress, anxiety, and depression, by applying seeds to specific acupuncture points or energy centers in the body, thereby stimulating energy flow and facilitating emotional release. Additionally, seed therapy is employed to manage chronic pain, digestive issues, allergies, and inflammation.

*Paragraph 3*

> The practice emphasizes individualized treatment, focusing on the unique needs of each patient, thus promoting a tailored healing experience. While more scientific research is necessary to validate its efficacy, many individuals report positive outcomes. It serves as a complementary modality alongside conventional treatments.

---

### 6. Cupping Therapy

| Field | Value |
|---|---|
| `slug` | `cupping-therapy` |
| `title` | Cupping Therapy |
| `duration` | 30–45 min |
| `image` | `/images/services/cupping-therapy.jpg` → `assets/services/cupping-therapy.jpg` |
| `copyStatus` | `rewrite` ⚠ **placeholder copy — the old site's text described neurofeedback, not cupping** |
| URL | `/services/cupping-therapy` |

**`excerpt`**

> Suction cups that lift the tissue, draw blood to tight muscle and release stubborn knots.

**`treats`** (4 items)

- Shoulder, neck and upper-back tightness
- Muscle stiffness and knots
- Sports and overuse strain
- Poor local circulation

**`body`** (3 paragraphs)

*Paragraph 1*

> Cupping is a traditional therapy in which warmed or suction cups are placed on the skin to draw the tissue gently upward. The lift increases local blood flow, loosens tight fascia and helps stubborn muscle knots release more easily than pressure alone can manage.

*Paragraph 2*

> At Bhargavi Health World, cupping is most often used across the shoulders, neck and upper back, and is frequently combined with acupuncture in the same session. Sessions are short, and the circular marks that follow are a normal part of the therapy — they fade on their own over several days.

*Paragraph 3*

> Both dry cupping and fire cupping are offered. Which is appropriate depends on your condition and skin sensitivity, and is decided during consultation.

---

### 7. Magneto Therapy

| Field | Value |
|---|---|
| `slug` | `magneto-therapy` |
| `title` | Magneto Therapy |
| `duration` | 30 min |
| `image` | `/images/services/magneto-therapy.jpg` → `assets/services/magneto-therapy.jpg` |
| `copyStatus` | `source` |
| URL | `/services/magneto-therapy` |

**`excerpt`**

> Magnetic fields applied over painful joints and muscles to support circulation and recovery.

**`treats`** (5 items)

- Arthritis and joint pain
- Lower back pain
- Fibromyalgia discomfort
- Sports injuries
- Post-surgical recovery support

**`body`** (3 paragraphs)

*Paragraph 1*

> Magnetotherapy, or magnetic field therapy, is an alternative treatment that uses static or pulsed magnetic fields to promote healing and alleviate various health conditions. It is based on the principle that magnetic fields can influence biological processes, potentially enhancing circulation, reducing inflammation, and accelerating tissue repair.

*Paragraph 2*

> While scientific evidence on its efficacy remains mixed, proponents note it may help alleviate pain, particularly in conditions like arthritis, fibromyalgia, and lower back pain. Additionally, magnetotherapy is sometimes used to manage stress and improve sleep quality, as well as to aid recovery from injuries.

*Paragraph 3*

> Conditions often treated include sports injuries, chronic pain syndromes, post-surgical recovery, and certain neurological disorders. Effectiveness varies from person to person, and it should complement rather than replace conventional medical treatment. Please consult us before starting any alternative therapy.

---

### 8. Chiropractic

| Field | Value |
|---|---|
| `slug` | `chiropractic` |
| `title` | Chiropractic |
| `duration` | 30–45 min |
| `image` | `/images/services/chiropractic.jpg` → `assets/services/chiropractic.jpg` |
| `copyStatus` | `source` |
| URL | `/services/chiropractic` |

**`excerpt`**

> Hands-on spinal adjustment for back, neck and nerve pain caused by misalignment.

**`treats`** (5 items)

- Lower back pain
- Neck pain and tension headaches
- Sciatica
- Joint pain in arms and legs
- Sports and work-related strain

**`body`** (3 paragraphs)

*Paragraph 1*

> Chiropractic care is a form of alternative medicine primarily focused on diagnosing and treating neuromuscular disorders, with an emphasis on treatment through manual adjustment and manipulation of the spine. One of the most common conditions treated is lower back pain, which can result from injury, poor posture, or conditions like herniated discs.

*Paragraph 2*

> Chiropractic treatment is also frequently sought for neck pain, tension headaches, and migraines, as spinal alignment can affect nerve function and overall health. Additionally, many patients seek chiropractic care for joint pain in the arms or legs, and conditions such as sciatica, which is characterized by pain radiating along the sciatic nerve due to spinal issues.

*Paragraph 3*

> While many people turn to chiropractic for relief from chronic pain, the approach is holistic, promoting overall wellness through lifestyle advice, rehabilitative exercises, and nutrition guidance.

---

### 9. Physiotherapy

| Field | Value |
|---|---|
| `slug` | `physiotherapy` |
| `title` | Physiotherapy |
| `duration` | 45 min |
| `image` | `/images/services/physiotherapy.jpg` → `assets/services/physiotherapy.jpg` |
| `copyStatus` | `source` |
| URL | `/services/physiotherapy` |

**`excerpt`**

> Guided movement, manual therapy and exercise to rebuild strength and get you moving again.

**`treats`** (6 items)

- Sports injuries
- Arthritis
- Post-surgical rehabilitation
- Stroke rehabilitation
- Chronic pain
- Respiratory conditions

**`body`** (3 paragraphs)

*Paragraph 1*

> Physiotherapy is a healthcare discipline focused on enhancing physical function and mobility through a variety of techniques, including movement, exercise, manual therapy, education, and advice. It addresses a wide range of conditions affecting the musculoskeletal, neurological, cardiopulmonary, and integumentary systems.

*Paragraph 2*

> Common conditions treated include sports injuries, arthritis, stroke rehabilitation, chronic pain, post-surgical recovery, and respiratory issues such as asthma or chronic obstructive pulmonary disease (COPD). Physiotherapists assess and design individualized treatment plans aimed at restoring mobility, improving strength, alleviating pain, and preventing further injuries.

*Paragraph 3*

> Therapeutic modalities such as heat, cold, ultrasound, and electrical stimulation are used to facilitate healing. Physiotherapy also plays a critical role in rehabilitation following orthopedic surgeries like knee or hip replacements, helping patients regain function and independence.

---

### 10. Varma Kala

| Field | Value |
|---|---|
| `slug` | `varma-kala` |
| `title` | Varma Kala |
| `duration` | 45 min |
| `image` | `/images/services/varma-kala.jpg` → `assets/services/varma-kala.jpg` |
| `copyStatus` | `source` |
| URL | `/services/varma-kala` |

**`excerpt`**

> An ancient Tamil healing art working the body's varma points to restore balance and vitality.

**`treats`** (5 items)

- Musculoskeletal disorders
- Joint pain
- Digestive issues
- Respiratory ailments
- Stress and fatigue

**`body`** (3 paragraphs)

*Paragraph 1*

> Varma Kala, an ancient healing art native to Tamil Nadu, India, is a holistic system that integrates elements of yoga, Ayurveda, and martial arts. This traditional practice focuses on the manipulation of specific points in the body known as “Varma points,” which are believed to be energy centers influencing physical, mental, and emotional well-being.

*Paragraph 2*

> By applying pressure or gentle manipulation to these points, practitioners aim to restore balance within the body. Varma Kala is used for a variety of conditions, including musculoskeletal disorders, joint pains, digestive issues, and respiratory ailments. It is also thought to alleviate stress, enhance relaxation, and improve overall vitality.

*Paragraph 3*

> While many practitioners and patients report beneficial outcomes, direct empirical research on Varma Kala remains limited. It is best considered a complementary approach alongside, rather than a replacement for, conventional medical treatment.

