// ── Structured CV data ────────────────────────────────
// Separate from project/research content.
// Only add new entries here; existing research projects
// live in src/content/projects/.

export interface Experience {
  role: string;
  organization: string;
  location: string;
  start: string;
  end: string | null;
  description: string[];
}

export interface VolunteerEntry {
  role: string;
  organization: string;
  location: string;
  description: string[];
}

export interface LeadershipEntry {
  role: string;
  organization: string;
}

export interface Publication {
  title: string;
  authorsPosition: string;
  venue: string;
  pages: string | null;
  doi: string | null;
  year: number;
  description: string[];
}

export interface Education {
  institution: string;
  degree: string;
  location: string;
  start: string;
  end: string;
  endNote: string;
  gpa: string;
  distinction: string;
}

export interface Award {
  name: string;
}

// ── Data ──────────────────────────────────────────────

export const education: Education = {
  institution: "Queen's University",
  degree: "BSc (Honours) in Life Sciences",
  location: "Kingston, ON",
  start: "Sept 2022",
  end: "Apr 2026",
  endNote: "Expected",
  gpa: "3.94 / 4.00",
  distinction: "Dean's Honour List with Distinction (Top 3%)",
};

export const professionalExperience: Experience[] = [
  {
    role: "Research Assistant",
    organization: "Natale Lab, Queen's University",
    location: "Kingston, ON",
    start: "Feb 2024",
    end: null,
    description: [
      "Conducting molecular and histological research on cannabinoid effects in placental development",
      "Implementing ML-based tissue segmentation and fluorescence image analysis pipelines",
    ],
  },
  {
    role: "Residence Don",
    organization: "Queen's University",
    location: "Kingston, ON",
    start: "Aug 2025",
    end: null,
    description: [
      "Providing academic, wellness, and personal support to 50 undergraduate residents",
      "Facilitating conflict resolution and leadership programs",
      "Organizing inclusivity and mentorship initiatives",
    ],
  },
  {
    role: "Operations Manager",
    organization: "Student Life Center, Queen's University",
    location: "Kingston, ON",
    start: "May 2024",
    end: "Apr 2025",
    description: [
      "Managed 23 staff members across scheduling, operations, and budgeting",
      "Implemented scheduling and process automation improvements",
      "Improved operational protocols",
    ],
  },
  {
    role: "Technical Support Specialist",
    organization: "Moneris Solutions",
    location: "Remote / Toronto, ON",
    start: "Jul 2022",
    end: "Sept 2022",
    description: [
      "Provided front-line terminal and network troubleshooting for business clients",
      "Documented systemic technical issues for escalation",
    ],
  },
  {
    role: "Private STEM Tutor",
    organization: "Independent",
    location: "Ajax & Virtual",
    start: "2020",
    end: null,
    description: [
      "Mentored students in biology, chemistry, and mathematics",
      "Supported average grade improvement of 20\u201330%",
    ],
  },
];

export const volunteerExperience: VolunteerEntry[] = [
  {
    role: "Education Technology Volunteer",
    organization: "Toronto General Hospital (UHN)",
    location: "Toronto, ON",
    description: [
      "Digitized audiovisual asset systems",
      "Improved departmental accessibility workflows",
    ],
  },
  {
    role: "Emergency & Cancer Center Volunteer",
    organization: "LakeRidge Health",
    location: "Ajax / Whitby, ON",
    description: [
      "Provided logistical and emotional support in high-acuity care units",
      "Facilitated interdepartmental communication for patient needs",
    ],
  },
  {
    role: "Community Volunteer",
    organization: "Aga Khan Foundation",
    location: "GTA & Kingston",
    description: [
      "Coordinated youth mentorship and education programs",
      "Assisted fundraising events supporting global education initiatives",
    ],
  },
  {
    role: "Events Coordinator",
    organization: "Ismaili Student Association",
    location: "Kingston, ON",
    description: [
      "Organized intercultural events (200+ attendees)",
      "Managed sponsorship outreach and logistics",
      "Increased engagement by 40%",
    ],
  },
  {
    role: "Executive Member",
    organization: "Queen's Generation Connect",
    location: "Kingston, ON",
    description: [
      "Led intergenerational outreach initiatives",
      "Spearheaded volunteer recruitment and community partnerships",
    ],
  },
];

export const leadershipAndInvolvement: LeadershipEntry[] = [
  { role: "President", organization: "Afghan Students' Association" },
  { role: "President", organization: "Qapsule Undergraduate Health Science Journal" },
  { role: "Design Team Member", organization: "QMIND" },
];

export const publications: Publication[] = [
  {
    title: "Exploring Artificial Consciousness",
    authorsPosition: "Second Author",
    venue: "Canadian Undergraduate Conference on Artificial Intelligence (CUCAI 2024)",
    pages: "pp. 64\u201371",
    doi: null,
    year: 2024,
    description: [
      "Literature review and comparative analysis of AI and biological models of consciousness",
      "Ethical and philosophical evaluation of synthetic cognition",
    ],
  },
  {
    title: "Notification Sounds and Physiological Responses",
    authorsPosition: "Second Author",
    venue: "Qapsule Undergraduate Research Journal",
    pages: null,
    doi: "10.24908/qap.v1i3.18934",
    year: 2024,
    description: [
      "Studied sound frequency impact on heart rate variability and reaction time",
      "Statistical analysis in R and Python",
    ],
  },
  {
    title: "RecognEyes: Smart Glasses for Prosopagnosia",
    authorsPosition: "Second Author",
    venue: "Canadian Undergraduate Conference on Artificial Intelligence (CUCAI 2025)",
    pages: "pp. 194\u2013199",
    doi: null,
    year: 2025,
    description: [
      "TensorFlow-based facial recognition pipeline (>99% accuracy)",
    ],
  },
];

export const awardsAndScholarships: Award[] = [
  { name: "Eleanor Rowley Ingraham Admission Scholarship" },
  { name: "James H. Rattray Scholarship in Science" },
  { name: "Queen's Appeal Undergraduate Scholarship" },
  { name: "Dean's Award of Excellence" },
];
