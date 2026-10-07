export class InMemoryStudyBuddyRepository {
  constructor(initialState = { courses: [] }) {
    this.state = structuredCloneSafe(initialState);
  }

  async listCourses() {
    return structuredCloneSafe(this.state.courses ?? []);
  }

  async getCourse(courseId) {
    return structuredCloneSafe((this.state.courses ?? []).find((course) => course.id === courseId) ?? null);
  }

  async saveCourse(course) {
    const courses = this.state.courses ?? [];
    const index = courses.findIndex((item) => item.id === course.id);
    if (index === -1) courses.push(structuredCloneSafe(course));
    else courses[index] = structuredCloneSafe(course);
    this.state.courses = courses;
    return structuredCloneSafe(course);
  }

  async deleteCourse(courseId) {
    this.state.courses = (this.state.courses ?? []).filter((course) => course.id !== courseId);
  }
}

export class LocalStorageStudyBuddyRepository extends InMemoryStudyBuddyRepository {
  constructor(storageKey = "studybuddy:v0") {
    const state = readState(storageKey);
    super(state);
    this.storageKey = storageKey;
  }

  async saveCourse(course) {
    const saved = await super.saveCourse(course);
    this.persist();
    return saved;
  }

  async deleteCourse(courseId) {
    await super.deleteCourse(courseId);
    this.persist();
  }

  persist() {
    if (!globalThis.localStorage) return;
    globalThis.localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  }
}

export function createRepository(options = {}) {
  if (options.storage === "localStorage" && typeof globalThis.localStorage !== "undefined") {
    return new LocalStorageStudyBuddyRepository(options.storageKey);
  }
  return new InMemoryStudyBuddyRepository(options.initialState);
}

function readState(storageKey) {
  if (!globalThis.localStorage) return { courses: [] };
  const raw = globalThis.localStorage.getItem(storageKey);
  if (!raw) return { courses: [] };
  try {
    return JSON.parse(raw);
  } catch {
    return { courses: [] };
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
