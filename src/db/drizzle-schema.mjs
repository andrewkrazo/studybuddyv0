import {
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code"),
  professor: text("professor"),
  term: text("term"),
  school: text("school").notNull().default(""),
  section: text("section").notNull().default(""),
  instructorBio: text("instructor_bio").notNull().default(""),
  description: text("description").notNull().default(""),
  coverImageUrl: text("cover_image_url").notNull().default(""),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  memory: jsonb("memory").notNull().default({}),
  progress: jsonb("progress").notNull().default({}),
  snapshot: jsonb("snapshot").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const examDates = pgTable("exam_dates", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  examDate: date("exam_date").notNull(),
  title: text("title").notNull().default("Exam"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const lectures = pgTable("lectures", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  professor: text("professor"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }),
  transcript: text("transcript").notNull(),
  summary: text("summary"),
  keyTerms: jsonb("key_terms").notNull().default([]),
  artifacts: jsonb("artifacts").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lectureId: uuid("lecture_id").references(() => lectures.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("available"),
  estimatedMinutes: integer("estimated_minutes").notNull().default(10),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lectureId: uuid("lecture_id").references(() => lectures.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  tags: jsonb("tags").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const studyPlans = pgTable("study_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  examDate: date("exam_date"),
  plan: jsonb("plan").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const exerciseProgress = pgTable("exercise_progress", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id").notNull().references(() => exercises.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.exerciseId] })
}));
