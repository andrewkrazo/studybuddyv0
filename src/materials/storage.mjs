// Where original uploaded files live. Local disk for now; a hosted deployment
// needs object storage (S3, R2, ...) behind the same three methods.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Keys are built by the server from UUIDs, never from user input.
const KEY_PATTERN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;

function assertKey(key) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
}

export class LocalFileStorage {
  constructor(baseDir = process.env.STUDYBUDDY_STORAGE_DIR ?? "storage") {
    this.baseDir = resolve(baseDir);
  }

  path(key) {
    assertKey(key);
    return join(this.baseDir, key);
  }

  async put(key, bytes) {
    const filePath = this.path(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }

  async get(key) {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key) {
    await rm(this.path(key), { force: true });
  }
}

export class MemoryFileStorage {
  constructor() {
    this.files = new Map();
  }

  async put(key, bytes) {
    assertKey(key);
    this.files.set(key, new Uint8Array(bytes));
  }

  async get(key) {
    return this.files.get(key) ?? null;
  }

  async delete(key) {
    this.files.delete(key);
  }
}
