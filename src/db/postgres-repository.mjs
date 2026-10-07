import { InMemoryStudyBuddyRepository } from "../core/repository.mjs";

export class PostgresStudyBuddyRepository extends InMemoryStudyBuddyRepository {
  constructor(sql, options = {}) {
    super({ courses: [] });
    this.sql = sql;
    this.userId = options.userId ?? null;
  }

  static async fromEnv(options = {}) {
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres storage.");
    const { neon } = await import("@neondatabase/serverless");
    return new PostgresStudyBuddyRepository(neon(databaseUrl), options);
  }

  async listCourses() {
    const rows = await this.sql`
      select snapshot
      from courses
      ${this.userId ? this.sql`where user_id = ${this.userId}` : this.sql``}
      order by updated_at desc
    `;
    return rows.map((row) => row.snapshot);
  }

  async getCourse(courseId) {
    const rows = await this.sql`
      select snapshot
      from courses
      where id = ${courseId}
      limit 1
    `;
    return rows[0]?.snapshot ?? null;
  }

  async saveCourse(course) {
    const examDates = course.examDates ?? [];
    await this.sql`
      insert into courses (id, user_id, name, code, professor, term, memory, progress, snapshot, updated_at)
      values (
        ${course.id},
        ${this.userId},
        ${course.name},
        ${course.code ?? ""},
        ${course.professor ?? ""},
        ${course.term ?? ""},
        ${JSON.stringify(course.memory ?? {})}::jsonb,
        ${JSON.stringify(course.progress ?? {})}::jsonb,
        ${JSON.stringify(course)}::jsonb,
        now()
      )
      on conflict (id) do update set
        name = excluded.name,
        code = excluded.code,
        professor = excluded.professor,
        term = excluded.term,
        memory = excluded.memory,
        progress = excluded.progress,
        snapshot = excluded.snapshot,
        updated_at = now()
    `;

    await this.sql`delete from exam_dates where course_id = ${course.id}`;
    for (const examDate of examDates) {
      await this.sql`
        insert into exam_dates (course_id, exam_date)
        values (${course.id}, ${examDate})
      `;
    }

    await this.persistLecturesAndExercises(course);
    return JSON.parse(JSON.stringify(course));
  }

  async deleteCourse(courseId) {
    await this.sql`delete from courses where id = ${courseId}`;
  }

  async persistLecturesAndExercises(course) {
    await this.sql`delete from lectures where course_id = ${course.id}`;
    for (const lecture of course.lectures ?? []) {
      await this.sql`
        insert into lectures (id, course_id, title, professor, recorded_at, transcript, summary, key_terms, artifacts)
        values (
          ${lecture.id},
          ${course.id},
          ${lecture.title},
          ${lecture.professor ?? course.professor ?? ""},
          ${lecture.recordedAt ?? null},
          ${lecture.transcript},
          ${lecture.summary ?? ""},
          ${JSON.stringify(lecture.artifacts?.keyTerms ?? [])}::jsonb,
          ${JSON.stringify(lecture.artifacts ?? {})}::jsonb
        )
      `;

      for (const exercise of lecture.exercises ?? []) {
        await this.sql`
          insert into exercises (id, course_id, lecture_id, type, title, status, estimated_minutes, payload, updated_at)
          values (
            ${exercise.id},
            ${course.id},
            ${lecture.id},
            ${exercise.type},
            ${exercise.title},
            ${exercise.status},
            ${exercise.estimatedMinutes ?? 10},
            ${JSON.stringify(exercise.payload ?? {})}::jsonb,
            now()
          )
          on conflict (id) do update set
            status = excluded.status,
            payload = excluded.payload,
            updated_at = now()
        `;
      }
    }
  }
}
