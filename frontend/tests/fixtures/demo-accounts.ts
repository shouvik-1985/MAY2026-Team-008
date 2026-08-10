export const demoAccounts = {
  admin: {
    email: "admin@campusverse.edu",
    password: "admin123",
    dashboard: "/api/admin/dashboard",
  },
  professor: {
    email: "professor@campusverse.edu",
    password: "professor123",
    dashboard: "/api/professor/dashboard",
  },
  placement: {
    email: "placementpartner@gmail.com",
    password: "manager#123",
    dashboard: "/api/placement/manager/dashboard",
  },
  student: {
    email: "student@campusverse.edu",
    password: "student123",
    dashboard: "/api/student/dashboard",
  },
} as const;
