import { rankSegments } from "./search.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));

// Every read is scoped by courseId so one course can never see another's files.
export class InMemoryMaterialsRepository {
  constructor() {
    this.materials = [];
    this.segments = [];
  }

  async saveMaterial(material, segments = []) {
    this.materials.push(clone(material));
    this.segments.push(...segments.map((segment) => clone({ ...segment, materialId: material.id, courseId: material.courseId })));
    return clone(material);
  }

  async listMaterials(courseId) {
    return clone(this.materials.filter((material) => material.courseId === courseId));
  }

  async getMaterial(courseId, materialId) {
    const material = this.materials.find((item) => item.courseId === courseId && item.id === materialId);
    return material ? clone(material) : null;
  }

  async getMaterialById(materialId) {
    const material = this.materials.find((item) => item.id === materialId);
    return material ? clone(material) : null;
  }

  async deleteMaterial(courseId, materialId) {
    const before = this.materials.length;
    this.materials = this.materials.filter((item) => !(item.courseId === courseId && item.id === materialId));
    this.segments = this.segments.filter((segment) => segment.materialId !== materialId || segment.courseId !== courseId);
    return this.materials.length < before;
  }

  async listSegments(courseId, materialId) {
    return clone(this.segments.filter((segment) => segment.courseId === courseId && segment.materialId === materialId)
      .sort((a, b) => a.ordinal - b.ordinal));
  }

  async searchSegments(courseId, query, { limit = 8 } = {}) {
    const materials = new Map(this.materials.filter((m) => m.courseId === courseId).map((m) => [m.id, m]));
    const pool = this.segments.filter((segment) => segment.courseId === courseId && materials.has(segment.materialId));
    return rankSegments(pool, query, { limit }).map((hit) => toResult(hit, materials.get(hit.materialId)));
  }
}

export function toResult(segment, material) {
  return {
    segmentId: segment.id,
    materialId: segment.materialId,
    filename: material?.filename ?? "",
    kind: material?.kind ?? "",
    citation: segment.citation,
    location: segment.location,
    text: segment.text,
    score: segment.score
  };
}
