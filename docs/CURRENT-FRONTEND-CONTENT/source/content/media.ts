/** Health Talks videos + clinic gallery (docs/textprd.md §8, §9). */

export type Video = {
  id: string;
  title: string;
  translation?: string;
  featured?: boolean;
};

export const videos: Video[] = [
  {
    id: "6STwtkvRBIA",
    title: "Stop Nausea & Dizziness Naturally — a simple acupressure tip",
  },
  { id: "UsKRCXN-jo0", title: "Tired of Skipping Breakfast? Try this fruit bowl plan" },
  { id: "SP6KeFkfFEc", title: "A simple fruit bowl plan for busy mornings" },
  { id: "xj_5hVlamRQ", title: "Brain development & brain games", featured: true },
  {
    id: "kOEFJyDlzks",
    title: "హాయిగా నిద్ర పోవాలంటే..",
    translation: "Tips for sound sleep",
    featured: true,
  },
  {
    id: "R25zlkaIdhY",
    title: "ఎసిడిటీ తగ్గడానికి చిట్కాలు",
    translation: "Tips to reduce acidity",
    featured: true,
  },
  {
    id: "t2qYD1cORPU",
    title: "లో బీపి తగ్గడానికి కలర్ థెరపీ",
    translation: "Colour therapy for low BP",
    featured: true,
  },
  {
    id: "7rY8IxZ9aIw",
    title: "హై బీపీ తగ్గడానికి ప్రెషర్ పాయింట్స్",
    translation: "Pressure points for high BP",
  },
  {
    id: "ue4n1KbVypI",
    title: "మెడ నొప్పి తగ్గడానికి ప్రెషర్ పాయింట్స్",
    translation: "Pressure points for neck pain",
  },
  {
    id: "cVRToZ-2190",
    title: "నడుము నొప్పి తగ్గడానికి ఇలా చేయండి",
    translation: "For lower back pain",
  },
  {
    id: "cIxwaUcG1CE",
    title: "మడమలలో నొప్పి తగ్గాలంటే",
    translation: "For heel pain",
  },
  {
    id: "Yera5I2VNEU",
    title: "Excessive Bleeding సమస్యకు చక్కని పరిష్కారం",
    translation: "A good solution for excessive bleeding",
  },
  {
    id: "4rE1haPXQ2E",
    title: "PCOD సమస్యా?! అయితే ఈ సింపుల్ పరిష్కారం",
    translation: "A simple solution for PCOD",
    featured: true,
  },
  {
    id: "nt0Ss2HUIuk",
    title: "ఈ మూడు పనులు చేస్తే మీకు స్ట్రెస్ ఉండదు",
    translation: "Three things to beat stress",
  },
  {
    id: "pxKUQ0PIqGE",
    title: "మోకాళ్ళ నొప్పులు తగ్గడానికి చిట్కాలు",
    translation: "Knee pain tips",
  },
  {
    id: "cBP4xFw0HjU",
    title: "ఇమ్మ్యూనిటీ పెంచేందుకు, దగ్గును తగ్గించేందుకు సింపుల్ ట్రిక్స్",
    translation: "Boost immunity, reduce cough",
  },
  {
    id: "vxdqIDbIBwY",
    title: "తలనొప్పిని రెండు నిమిషాల్లో తగ్గించుకోవడం ఎలా?",
    translation: "Relieve a headache in two minutes",
    featured: true,
  },
  {
    id: "E5S_L6dbL9w",
    title: "ఎమర్జెన్సీ సమయంలో బాడీలో ఆక్సిజన్ లెవెల్ పెంచుకోవడం ఎలా?",
    translation: "Raise oxygen levels in an emergency",
  },
  { id: "cdTut-hzBu4", title: "Bhargavi Health World — trailer" },
];

export const featuredVideos = videos.filter((v) => v.featured);

export const youtubeThumb = (id: string) =>
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export const youtubeWatch = (id: string) =>
  `https://www.youtube.com/watch?v=${id}`;

export const galleryImages = Array.from({ length: 8 }, (_, i) => ({
  src: `/images/gallery/i-img-${i + 1}.jpg`,
  alt: `Inside Bhargavi Health World, Chikkadpally — clinic photo ${i + 1}`,
}));
