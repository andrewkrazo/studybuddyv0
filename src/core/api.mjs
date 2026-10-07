import {
  buildStudyPlan,
  createId,
  ingestLecture,
  markExercise,
  rebuildCourseMemory,
  searchCourseMemory
} from "./studybuddy.mjs";
import { createRepository } from "./repository.mjs";

export function createStudyBuddyApi(options = {}) {
  const repository = options.repository ?? createRepository(options.repositoryOptions);

  return {
    async listCourses() {
      return repository.listCourses();
    },

    async createCourse(input) {
      const course = rebuildCourseMemory({
        id: input.id ?? createId("course"),
        name: input.name,
        code: input.code ?? "",
        professor: input.professor ?? "",
        term: input.term ?? "",
        examDates: input.examDates ?? [],
        lectures: [],
        createdAt: new Date().toISOString()
      });
      return repository.saveCourse(course);
    },

    async getCourse(courseId) {
      return repository.getCourse(courseId);
    },

    async addLecture(courseId, lectureInput) {
      const course = await requiredCourse(repository, courseId);
      const updated = ingestLecture(course, lectureInput);
      return repository.saveCourse(updated);
    },

    async addExamDate(courseId, examDate) {
      const course = await requiredCourse(repository, courseId);
      const next = rebuildCourseMemory({
        ...course,
        examDates: [...(course.examDates ?? []), examDate].sort()
      });
      return repository.saveCourse(next);
    },

    async completeExercise(courseId, exerciseId) {
      const course = await requiredCourse(repository, courseId);
      return repository.saveCourse(markExercise(course, exerciseId, "completed"));
    },

    async reopenExercise(courseId, exerciseId) {
      const course = await requiredCourse(repository, courseId);
      return repository.saveCourse(markExercise(course, exerciseId, "available"));
    },

    async buildStudyPlan(courseId, options = {}) {
      const course = await requiredCourse(repository, courseId);
      const examDate = options.examDate ?? course.examDates?.[0] ?? null;
      return buildStudyPlan(course, { ...options, examDate });
    },

    async search(courseId, query) {
      const course = await requiredCourse(repository, courseId);
      return searchCourseMemory(course, query);
    },

    async exportCourse(courseId) {
      return requiredCourse(repository, courseId);
    }
  };
}

async function requiredCourse(repository, courseId) {
  const course = await repository.getCourse(courseId);
  if (!course) throw new Error(`Course not found: ${courseId}`);
  return course;
}
