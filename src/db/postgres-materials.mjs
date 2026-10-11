import { isUuid } from "../core/studybuddy.mjs";
import { toTsQuery } from "../materials/search.mjs";

// Every query filters by course_id so one course can never read another's files.
export class PostgresMaterialsRepository {
  constructor(sql) {
    this.sql = sql;
  }

  static async fromEnv(options = {}) {
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres storage.");
    const { neon } = await import("@neondatabase/serverless");
    return new PostgresMaterialsRepository(neon(databaseUrl));
  }

  async saveMaterial(material, segments = []) {
    const insertMaterial = this.sql`
      insert into materials (id, course_id, kind, filename, content_type, size_bytes, storage_key,
        status, status_detail, page_count, segment_count, created_at)
      values (${material.id}, ${material.courseId}, ${material.kind}, ${material.filename}, ${material.contentType},
        ${material.sizeBytes}, ${material.storageKey}, ${material.status}, ${material.statusDetail ?? ""},
        ${material.pageCount ?? null}, ${segments.length}, ${material.createdAt})
    `;
    const insertSegments = segments.length ? this.sql`
      insert into source_segments (id, material_id, course_id, ordinal, text, location, citation)
      select x.id, ${material.id}, ${material.courseId}, x.ordinal, x.text, x.location, x.citation
      from jsonb_to_recordset(${JSON.stringify(segments)}::jsonb)
        as x(id uuid, ordinal int, text text, location jsonb, citation text)
    ` : null;
    // One transaction: a material never exists without its passages.
    await this.sql.transaction(insertSegments ? [insertMaterial, insertSegments] : [insertMaterial]);
    return material;
  }

  async listMaterials(courseId) {
    if (!isUuid(courseId)) return [];
    const rows = await this.sql`
      select * from materials where course_id = ${courseId} order by created_at
    `;
    return rows.map(toMaterial);
  }

  async getMaterial(courseId, materialId) {
    if (!isUuid(courseId) || !isUuid(materialId)) return null;
    const rows = await this.sql`
      select * from materials where course_id = ${courseId} and id = ${materialId} limit 1
    `;
    return rows[0] ? toMaterial(rows[0]) : null;
  }

  async getMaterialById(materialId) {
    if (!isUuid(materialId)) return null;
    const rows = await this.sql`select * from materials where id = ${materialId} limit 1`;
    return rows[0] ? toMaterial(rows[0]) : null;
  }

  async deleteMaterial(courseId, materialId) {
    if (!isUuid(courseId) || !isUuid(materialId)) return false;
    const rows = await this.sql`
      delete from materials where course_id = ${courseId} and id = ${materialId} returning id
    `;
    return rows.length > 0;
  }

  async listSegments(courseId, materialId) {
    if (!isUuid(courseId) || !isUuid(materialId)) return [];
    const rows = await this.sql`
      select id, material_id, course_id, ordinal, text, location, citation
      from source_segments where course_id = ${courseId} and material_id = ${materialId}
      order by ordinal
    `;
    return rows.map((row) => ({
      id: row.id, materialId: row.material_id, courseId: row.course_id,
      ordinal: row.ordinal, text: row.text, location: row.location, citation: row.citation
    }));
  }

  async searchSegments(courseId, query, { limit = 8 } = {}) {
    const tsQuery = toTsQuery(query);
    if (!isUuid(courseId) || !tsQuery) return [];
    const rows = await this.sql`
      select s.id, s.material_id, s.text, s.location, s.citation, m.filename, m.kind,
        ts_rank_cd(s.search, q) as score
      from source_segments s
      join materials m on m.id = s.material_id and m.course_id = s.course_id,
        to_tsquery('english', ${tsQuery}) q
      where s.course_id = ${courseId} and s.search @@ q
      order by score desc, s.ordinal
      limit ${Math.min(Math.max(1, limit), 25)}
    `;
    return rows.map((row) => ({
      segmentId: row.id,
      materialId: row.material_id,
      filename: row.filename,
      kind: row.kind,
      citation: row.citation,
      location: row.location,
      text: row.text,
      score: Number(Number(row.score).toFixed(4))
    }));
  }
}

function toMaterial(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    kind: row.kind,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    storageKey: row.storage_key,
    status: row.status,
    statusDetail: row.status_detail,
    pageCount: row.page_count,
    segmentCount: row.segment_count,
    createdAt: new Date(row.created_at).toISOString()
  };
}
