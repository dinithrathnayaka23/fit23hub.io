export type MaterialItem = {
  title: string;
  type: "PDF" | "PPT" | "DOC" | "Video";
  subject: string;
  semester: string;
  lecturer: string;
  likes: number;
};

export const materials: MaterialItem[] = [
  {
    title: "Advanced Database Design - Midterm Pack",
    type: "PDF",
    subject: "Database Systems",
    semester: "Semester 5",
    lecturer: "Dr. Chathura Perera",
    likes: 86,
  },
  {
    title: "Computer Vision Lab Walkthrough",
    type: "Video",
    subject: "Computer Vision",
    semester: "Semester 6",
    lecturer: "Ms. Nadeesha Silva",
    likes: 64,
  },
  {
    title: "Cloud Security Architecture Slides",
    type: "PPT",
    subject: "Cloud Computing",
    semester: "Semester 6",
    lecturer: "Mr. A. Fernando",
    likes: 59,
  },
];
