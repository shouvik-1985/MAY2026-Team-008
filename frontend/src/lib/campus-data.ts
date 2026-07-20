// Dummy data powering every page in the CampusVerse app shell.
export type RoleId = "student" | "faculty" | "admin" | "scholarship" | "placement";

export const ROLES: { id: RoleId; title: string; tagline: string; accent: string }[] = [
  {
    id: "student",
    title: "Student",
    tagline: "Your university in one place.",
    accent: "oklch(0.7 0.25 310)",
  },
  {
    id: "faculty",
    title: "Professor",
    tagline: "Teach, mentor, and orchestrate.",
    accent: "oklch(0.82 0.18 200)",
  },
  {
    id: "admin",
    title: "Administrator",
    tagline: "Run the entire campus.",
    accent: "oklch(0.72 0.27 350)",
  },
  {
    id: "scholarship",
    title: "Scholarship Partner",
    tagline: "Empower student dreams.",
    accent: "oklch(0.85 0.12 60)",
  },
  {
    id: "placement",
    title: "Placement Partner",
    tagline: "Connect students with internships and jobs.",
    accent: "oklch(0.82 0.18 200)",
  },
];

export const USER = {
  name: "Aarav Mehta",
  id: "CV-2026-1187",
  department: "Computer Science & AI",
  semester: 6,
  cgpa: 9.2,
  attendance: 92,
  avatar: "AM",
};

export const SCHEDULE_TODAY = [
  {
    time: "09:00",
    title: "Advanced Machine Learning",
    room: "Hall · A-201",
    color: "oklch(0.7 0.25 310)",
  },
  {
    time: "11:00",
    title: "Distributed Systems Lab",
    room: "Lab · C-3",
    color: "oklch(0.82 0.18 200)",
  },
  { time: "14:00", title: "HCI Studio", room: "Studio · D-12", color: "oklch(0.72 0.27 350)" },
  { time: "16:30", title: "Robotics Seminar", room: "Auditorium 2", color: "oklch(0.85 0.12 60)" },
];

export const ASSIGNMENTS = [
  {
    id: 1,
    title: "Transformer Architecture Report",
    subject: "Adv. ML",
    due: "in 2 days",
    progress: 70,
    status: "ongoing",
  },
  {
    id: 2,
    title: "RAFT Consensus Simulation",
    subject: "Distributed Systems",
    due: "in 5 days",
    progress: 30,
    status: "ongoing",
  },
  {
    id: 3,
    title: "Voice-First UX Case Study",
    subject: "HCI",
    due: "tomorrow",
    progress: 90,
    status: "ongoing",
  },
  {
    id: 4,
    title: "Robot Path Planning Demo",
    subject: "Robotics",
    due: "completed",
    progress: 100,
    status: "graded",
    grade: "A",
  },
  {
    id: 5,
    title: "Linear Algebra Set 4",
    subject: "Mathematics",
    due: "in 9 days",
    progress: 0,
    status: "pending",
  },
];

export const ANNOUNCEMENTS = [
  {
    id: 1,
    pinned: true,
    unread: true,
    category: "Academic",
    title: "Mid-Sem Schedule Released",
    body: "The Mid-Semester examinations for Spring 2026 begin on April 14. Detailed seating arrangements are available in your portal.",
    time: "12 min ago",
  },
  {
    id: 2,
    pinned: true,
    unread: true,
    category: "Events",
    title: "TEDxCampusVerse — Call for Speakers",
    body: "Submit your talk proposals before March 30 to be part of the flagship innovation summit.",
    time: "1 hour ago",
  },
  {
    id: 3,
    pinned: false,
    unread: false,
    category: "Fees",
    title: "Semester 6 fee deadline extended",
    body: "The fee submission window has been extended to April 5 without late charges.",
    time: "Yesterday",
  },
  {
    id: 4,
    pinned: false,
    unread: true,
    category: "Scholarships",
    title: "Tata Excellence Grant — Round 2",
    body: "Applications open for high-performing third year students. Apply via the Scholarships module.",
    time: "2 days ago",
  },
  {
    id: 5,
    pinned: false,
    unread: false,
    category: "Library",
    title: "New books added to AI shelf",
    body: "180 new titles across reinforcement learning, generative models and theory of computation.",
    time: "3 days ago",
  },
];

export const ATTENDANCE_SUBJECTS = [
  { name: "Advanced ML", pct: 96, color: "oklch(0.7 0.25 310)" },
  { name: "Distributed Systems", pct: 88, color: "oklch(0.82 0.18 200)" },
  { name: "HCI Studio", pct: 94, color: "oklch(0.72 0.27 350)" },
  { name: "Robotics", pct: 81, color: "oklch(0.85 0.12 60)" },
  { name: "Mathematics", pct: 90, color: "oklch(0.65 0.25 260)" },
  { name: "Ethics in AI", pct: 100, color: "oklch(0.78 0.18 50)" },
];

export const WEEKLY_ATTENDANCE = [82, 88, 95, 90, 92, 100, 85];

export const RESOURCES = [
  { id: 1, title: "Deep Learning · Goodfellow", subject: "Adv. ML", type: "Book", tag: "trending" },
  {
    id: 2,
    title: "CAP Theorem Lecture Notes",
    subject: "Distributed Systems",
    type: "Notes",
    tag: "new",
  },
  { id: 3, title: "Design of Everyday Things", subject: "HCI", type: "Book", tag: "bookmarked" },
  { id: 4, title: "ROS 2 Crash Course", subject: "Robotics", type: "Video", tag: "new" },
  {
    id: 5,
    title: "Linear Algebra Done Right",
    subject: "Mathematics",
    type: "Book",
    tag: "trending",
  },
  { id: 6, title: "Ethics & Society Reader", subject: "Ethics", type: "PDF", tag: "" },
  {
    id: 7,
    title: "Distributed Algorithms · Lynch",
    subject: "Distributed Systems",
    type: "Book",
    tag: "bookmarked",
  },
  { id: 8, title: "MIT 6.S191 Slides", subject: "Adv. ML", type: "Slides", tag: "trending" },
];

export const COMPLAINTS = [
  {
    id: "CV-2231",
    title: "Hostel B — Wi-Fi outage",
    category: "Hostel",
    stage: 3,
    created: "2 days ago",
  },
  {
    id: "CV-2218",
    title: "Library AC not working",
    category: "Facilities",
    stage: 4,
    created: "5 days ago",
  },
  {
    id: "CV-2204",
    title: "Re-evaluation request — DS Quiz 2",
    category: "Academic",
    stage: 1,
    created: "Today",
  },
];

export const COMPLAINT_STAGES = [
  "Submitted",
  "Acknowledged",
  "Assigned",
  "In Progress",
  "Resolved",
];

export const CERTIFICATES = [
  {
    id: 1,
    name: "Bonafide Certificate",
    desc: "Proof of enrollment.",
    eta: "24 hours",
    status: "available",
  },
  {
    id: 2,
    name: "Transcript",
    desc: "Verified academic record.",
    eta: "3 days",
    status: "available",
  },
  { id: 3, name: "ID Card", desc: "Replacement campus ID.", eta: "48 hours", status: "available" },
  { id: 4, name: "NOC", desc: "No-objection certificate.", eta: "2 days", status: "available" },
  {
    id: 5,
    name: "Migration Certificate",
    desc: "For transfers and exits.",
    eta: "5 days",
    status: "available",
  },
];

export const FEE_HISTORY = [
  { id: "INV-0061", semester: "Sem 5", amount: 84500, status: "paid", date: "Aug 12, 2025" },
  { id: "INV-0072", semester: "Sem 6", amount: 84500, status: "due", date: "Apr 05, 2026" },
  { id: "INV-0054", semester: "Sem 4", amount: 81000, status: "paid", date: "Jan 18, 2025" },
];

export const SCHOLARSHIPS = [
  { id: 1, name: "Tata Excellence Grant", amount: "₹ 1,20,000", status: "approved", progress: 100 },
  { id: 2, name: "Infosys Future Scholars", amount: "₹ 80,000", status: "applied", progress: 60 },
  { id: 3, name: "Govt. Merit Aid", amount: "₹ 45,000", status: "approved", progress: 100 },
  { id: 4, name: "Women in Tech Fellowship", amount: "₹ 60,000", status: "eligible", progress: 20 },
  { id: 5, name: "Sports Excellence Fund", amount: "₹ 30,000", status: "rejected", progress: 100 },
];

export const EVENTS = [
  {
    id: 1,
    title: "TEDxCampusVerse 2026",
    date: "Apr 18",
    venue: "Main Auditorium",
    spots: 312,
    accent: "oklch(0.72 0.27 350)",
  },
  {
    id: 2,
    title: "Hack the Twin · 36 hr Hackathon",
    date: "Apr 22",
    venue: "Innovation Hub",
    spots: 84,
    accent: "oklch(0.7 0.25 310)",
  },
  {
    id: 3,
    title: "AI for Good Summit",
    date: "May 04",
    venue: "Hall A-201",
    spots: 220,
    accent: "oklch(0.82 0.18 200)",
  },
  {
    id: 4,
    title: "Spring Music Festival",
    date: "May 11",
    venue: "Open Grounds",
    spots: 1800,
    accent: "oklch(0.85 0.12 60)",
  },
];

export const MARKETPLACE = [
  {
    id: 1,
    name: "Macbook Air M2 · 2024",
    category: "Laptops",
    price: "₹ 78,000",
    seller: "Riya · Sem 8",
    tag: "Great deal",
  },
  {
    id: 2,
    name: "DSA by Cormen · 4th Ed",
    category: "Books",
    price: "₹ 540",
    seller: "Karan · Sem 4",
    tag: "Like new",
  },
  {
    id: 3,
    name: "Study Lamp · Philips",
    category: "Hostel",
    price: "₹ 420",
    seller: "Nikhil · Sem 2",
    tag: "",
  },
  {
    id: 4,
    name: "ML Lab Handwritten Notes",
    category: "Notes",
    price: "₹ 120",
    seller: "Aanya · Sem 7",
    tag: "Top rated",
  },
  {
    id: 5,
    name: "iPad 10th Gen + Pencil",
    category: "Laptops",
    price: "₹ 32,500",
    seller: "Dev · Sem 5",
    tag: "",
  },
  {
    id: 6,
    name: "Operating Systems · Galvin",
    category: "Books",
    price: "₹ 380",
    seller: "Pari · Sem 3",
    tag: "",
  },
];

export const CHAT_HISTORY = [
  { role: "user", text: "What's my attendance in Distributed Systems?" },
  {
    role: "ai",
    text: "You're at 88% in Distributed Systems — 4% above the safe zone. You can skip 1 class this fortnight without breaching the 75% limit.",
  },
  { role: "user", text: "Remind me about the ML assignment tonight" },
  {
    role: "ai",
    text: "Done. I'll ping you at 8:30 PM with the Transformer report checklist and your last writing draft.",
  },
];

export const SUGGESTED_PROMPTS = [
  "Summarise today's lectures",
  "Predict my CGPA next semester",
  "Draft a leave application",
  "Find me free study rooms now",
];

export const NOTIFICATIONS = [
  {
    group: "Academic",
    items: [
      { id: 1, title: "New grade · HCI Quiz 3", body: "You scored 19/20.", time: "10m" },
      { id: 2, title: "Class rescheduled", body: "Robotics moved to 4:30 PM.", time: "1h" },
    ],
  },
  {
    group: "Assignments",
    items: [
      { id: 3, title: "Voice-First UX due tomorrow", body: "Final draft pending.", time: "2h" },
    ],
  },
  {
    group: "Fees",
    items: [
      {
        id: 4,
        title: "Semester 6 fee window open",
        body: "Pay by Apr 05 to avoid penalty.",
        time: "Yesterday",
      },
    ],
  },
  {
    group: "Events",
    items: [
      { id: 5, title: "You're registered for TEDx", body: "Seat C-12 confirmed.", time: "2d" },
    ],
  },
  {
    group: "AI",
    items: [
      { id: 6, title: "Weekly insight", body: "Your peak focus window is 9–11 AM.", time: "3d" },
    ],
  },
];

export const ACHIEVEMENTS = [
  { name: "Dean's List", year: "2025" },
  { name: "Hackathon Winner · BuildVerse", year: "2025" },
  { name: "Google Solutions Finalist", year: "2024" },
  { name: "TA · Algorithms", year: "2024" },
];

export const SKILLS = [
  "Python",
  "PyTorch",
  "Rust",
  "Distributed Systems",
  "Figma",
  "ROS 2",
  "TypeScript",
];
