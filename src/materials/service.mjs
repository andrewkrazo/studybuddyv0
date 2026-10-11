import { createId, isUuid, ValidationError } from "../core/studybuddy.mjs";
import { chunkSections, totalTextLength } from "./chunk.mjs";
import {
  detectDocumentType,
  detectImageType,
  DOCUMENT_TYPES,
  extractSections,
  IMAGE_TYPES,
  UnsupportedFileError
} from "./extract.mjs";

export const MATERIAL_KINDS = ["syllabus", "slides", "notes", "cover"];
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_MATERIALS_PER_COURSE = 100;
// Only one syllabus, one slide deck and one cover per course; notes can be many.
const SINGLE_KINDS = new Set(["syllabus", "cover"]);

export class TooLargeError extends Error {
  constructor(message) {
    super(message);
    this.name = "TooLargeError";
  }
}

export function cleanFilename(name = "") {
  const base = String(name).split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return (base || "file").slice(0, 200);
}

export function createMaterialsService({ repository, storage, courses }) {
  async function requireCourse(courseId) {
    const course = await courses.getCourse(courseId);
    if (!course) throw new Error(`Course not found: ${courseId}`);
    return course;
  }

  async function removeMaterial(courseId, material) {
    await repository.deleteMaterial(courseId, material.id);
    await storage.delete(material.storageKey);
  }

  return {
    // bytes: Uint8Array of the whole file. Processing happens before anything is
    // saved, so a material either exists with its passages or not at all.
    async upload(courseId, { kind, filename, bytes }) {
      await requireCourse(courseId);
      if (!MATERIAL_KINDS.includes(kind)) {
        throw new ValidationError(`Unknown material kind. Use one of: ${MATERIAL_KINDS.join(", ")}.`);
      }
      if (!bytes?.length) throw new ValidationError("The file is empty.");
      const name = cleanFilename(filename);
      const limit = kind === "cover" ? MAX_COVER_BYTES : MAX_DOCUMENT_BYTES;
      if (bytes.length > limit) throw new TooLargeError(`Files of this kind are limited to ${limit / 1024 / 1024} MB.`);

      const existing = await repository.listMaterials(courseId);
      if (existing.length >= MAX_MATERIALS_PER_COURSE) {
        throw new ValidationError(`A course can have up to ${MAX_MATERIALS_PER_COURSE} files.`);
      }

      const id = createId("material");
      let type;
      let contentType;
      let status = "ready";
      let statusDetail = "";
      let pageCount = null;
      let passages = [];

      try {
        if (kind === "cover") {
          type = detectImageType(bytes);
          contentType = IMAGE_TYPES[type];
        } else {
          type = detectDocumentType(bytes, name);
          if (kind === "syllabus" && type !== "pdf" && type !== "docx") {
            throw new UnsupportedFileError("Upload the syllabus as a PDF or DOCX.");
          }
          contentType = DOCUMENT_TYPES[type];
          const extracted = await extractSections(bytes, type);
          pageCount = extracted.pageCount;
          if (totalTextLength(extracted.sections) < 20) {
            status = "no_text";
            statusDetail = type === "pdf"
              ? "No selectable text found. This may be a scanned PDF; text recognition (OCR) isn't supported yet."
              : "No text found in this file.";
          } else {
            passages = chunkSections(extracted.sections, { filename: name })
              .map((passage) => ({ ...passage, id: createId("segment") }));
          }
        }
      } catch (error) {
        if (error instanceof UnsupportedFileError) throw new ValidationError(error.message);
        throw new ValidationError(`Couldn't read this file. It may be damaged or password-protected. (${error.message})`);
      }

      const material = {
        id,
        courseId,
        kind,
        filename: name,
        contentType,
        sizeBytes: bytes.length,
        storageKey: `${courseId}/${id}.${type}`,
        status,
        statusDetail,
        pageCount,
        segmentCount: passages.length,
        createdAt: new Date().toISOString()
      };

      await storage.put(material.storageKey, bytes);
      try {
        await repository.saveMaterial(material, passages);
      } catch (error) {
        await storage.delete(material.storageKey);
        throw error;
      }

      // Replace the previous syllabus/cover only after the new one is safely saved.
      if (SINGLE_KINDS.has(kind)) {
        for (const old of existing.filter((item) => item.kind === kind)) await removeMaterial(courseId, old);
      }
      if (kind === "cover") {
        await courses.updateCourse(courseId, { coverImageUrl: `/api/materials/${id}/file` });
      }
      return material;
    },

    async list(courseId) {
      await requireCourse(courseId);
      return repository.listMaterials(courseId);
    },

    async remove(courseId, materialId) {
      await requireCourse(courseId);
      const material = await repository.getMaterial(courseId, materialId);
      if (!material) throw new Error(`Material not found: ${materialId}`);
      await removeMaterial(courseId, material);
      if (material.kind === "cover") {
        const course = await courses.getCourse(courseId);
        if (course?.coverImageUrl === `/api/materials/${materialId}/file`) {
          await courses.updateCourse(courseId, { coverImageUrl: "" });
        }
      }
      return material;
    },

    async passages(courseId, materialId) {
      await requireCourse(courseId);
      if (!(await repository.getMaterial(courseId, materialId))) throw new Error(`Material not found: ${materialId}`);
      return repository.listSegments(courseId, materialId);
    },

    // Retrieval for the Class AI: always scoped to a single course.
    async search(courseId, query, options = {}) {
      await requireCourse(courseId);
      return repository.searchSegments(courseId, query, options);
    },

    // Only cover images are served publicly (they appear in the library).
    async coverFile(materialId) {
      if (!isUuid(materialId)) return null;
      const material = await repository.getMaterialById(materialId);
      if (!material || material.kind !== "cover") return null;
      const bytes = await storage.get(material.storageKey);
      return bytes ? { bytes, contentType: material.contentType } : null;
    }
  };
}
