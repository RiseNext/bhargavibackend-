/** Patient reviews, verbatim from the old site (docs/textprd.md §7). */

export type Testimonial = {
  name: string;
  quote: string;
  when?: string;
  featured?: boolean;
};

export const testimonials: Testimonial[] = [
  {
    name: "Kranthi Gangapuri",
    when: "a year ago",
    featured: true,
    quote:
      "Thank you very much Anjana madam for your treatment on my leg twist pain. Got quick relief after your wonderful treatment. Results are the best. I strongly recommend this Acupressure treatment for health problems.",
  },
  {
    name: "Shreya Shah",
    when: "a year ago",
    featured: true,
    quote:
      "Life changing experience in short! Ms. Anjana has been treating me for my lower back L4, L5, Thyroid, PCOD, weight issues and overall my physical and mental well-being. I can't be more thankful for her services. Every session, she treats with utmost importance and gives her complete valuable time and attention. Thank you for changing my life.",
  },
  {
    name: "Chandru ShanmukhaRavali",
    when: "a year ago",
    featured: true,
    quote:
      "Anjana Bhargavi is just wow, there is a positive vibe in her touch. Just with a single sitting of acupuncture I have seen a better change in my body. I conceived with her stress relief acupuncture sitting, and Anjana Bhargavi helped me in my pregnancy journey — she gave better suggestions. And moreover the way she communicates is just awesome, such a pleasant feel we get while communicating with her.",
  },
  {
    name: "Shree Laxmi Srinivas",
    when: "a year ago",
    featured: true,
    quote:
      "I've been overweight with joint pains for a long time. With the help of Anjana Bhargavi, my severe joint pain issues have been completely solved and my weight is under control. Highly recommend her treatment for people who are looking for an alternate therapy from allopathy and physiotherapy.",
  },
  {
    name: "Krishna Chaitanya",
    when: "a year ago",
    featured: true,
    quote:
      "Ms. Anjana Bhargavi from Bhargavi Health World is giving acupuncture and acupressure treatment for my father, who has undergone spine surgery after paralysis. As of now there are good results in sensation and movement of the body post treatment. Do consider if anyone is looking for acupuncture treatment for any kind of health problem.",
  },
  {
    name: "Kiran Bedi",
    featured: true,
    quote:
      "I consulted her to cure my thyroid and some menstrual problems. The diet plan she gave me is very simple and most effective. I got rid of my menstrual problems. Now I am 8 months pregnant and only use her medicine. She not only helped me in my health but is also very supportive in my personal life. Thank you ma'am.",
  },
  {
    name: "Imran Mehtaj",
    quote:
      "I recently visited Bhargavi Health World for fire cupping and acupuncture treatment for my left shoulder pain, and I'm extremely happy with the experience. Dr. Utheja is not only highly professional but also genuinely caring and attentive. She took the time to understand my issue thoroughly and explained the treatment process clearly. I could feel noticeable relief in my shoulder even after the first session.",
  },
  {
    name: "Sakshi Khantwal",
    quote:
      "I was treated by Dr. Utheja at Bhargavi Health World for acupuncture, cupping, and chiropractic therapy. The experience was truly healing — I got significant relief from my condition. Dr. Utheja is highly skilled and made me feel very comfortable throughout the sessions.",
  },
  {
    name: "Ram Alamuri",
    quote:
      "Dr. Utheja treated my migraine condition with acupuncture. Got relief after 3 sittings. Highly recommend visiting Bhargavi Health World.",
  },
  {
    name: "Kaluvoya Mokshitha",
    quote:
      "She is such a magic. Dr. Utheja treated me with acupuncture, cupping and chiropractic and I got really great relief. Highly recommend visiting Bhargavi Health World.",
  },
  {
    name: "Saritha Devi",
    quote:
      "I had been to this clinic with shoulder pain and neck pain, got the best service and pain relief in less time. I suggest Bhargavi Health World — a perfect place for pain relief. Thank you.",
  },
  {
    name: "Pratima Raj",
    quote:
      "Really it was a good experience with Anjana Bhargavi's treatments for my face. Previously my skin was saggy and very dull, and now after taking acupuncture face-lifting treatment it's glowing and looking healthy. Getting good compliments from everyone — thank you for the wonderful treatment.",
  },
  {
    name: "Kavitha Reddy",
    quote:
      "Anjana Bhargavi is a beautiful soul who I met in my life. Always positive and passionate towards her profession. She is very friendly in nature, she treats her clients with a beautiful smile — her smile cures their problem 50%.",
  },
  {
    name: "Soniya Gowda",
    quote:
      "Dr. Utheja treated me with acupuncture and cupping, for which I got relief. Highly recommending a visit to Bhargavi Health World.",
  },
  {
    name: "Tharun Kumar",
    quote:
      "Dr. Utheja treated me with acupuncture, cupping and chiropractic — I got relief. Highly recommending a visit to Bhargavi Health World.",
  },
  {
    name: "Innya Sree",
    quote:
      "Dr. Utheja treated me with acupuncture and got relief. I highly recommend Bhargavi Health World.",
  },
  {
    name: "Shruthi Patil",
    quote:
      "It was really a good experience and wonderful relief. It solved my problem quickly and effectively. Trustworthy — anybody can go for it without any doubt.",
  },
  {
    name: "Rakesh Bs",
    quote:
      "I didn't expect this effect so quick. It gave wonderful relief and created a soothing feeling after the treatment. Trustworthy — go for it.",
  },
  {
    name: "Rama Sree",
    quote: "Her treatment was very good. She is very friendly in nature.",
  },
  {
    name: "Nani Vegi",
    quote:
      "I have never seen this way to clear problems. Only one solution — choose Bhargavi ma'am, follow the healthy tips and change your problems. It's really an amazing experience.",
  },
  {
    name: "Pallavi Kandukuri",
    quote: "Good, nice experience with Dr. Utheja.",
  },
  {
    name: "Haribabu Ramineni",
    when: "3 years ago",
    quote:
      "Very much useful and genuine information which is very much beneficial in our day to day life.",
  },
  {
    name: "Bhavani Chowdary",
    quote: "It was so useful. Good inputs, thank you madam.",
  },
];

export const featuredTestimonials = testimonials.filter((t) => t.featured);
