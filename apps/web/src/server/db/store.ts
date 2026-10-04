/**
 * Store lifecycle: a process-wide singleton (survives Next.js HMR via globalThis), lazily seeded,
 * persisted with a debounced atomic write. On read-only filesystems (e.g. serverless) it keeps
 * working in memory and reports persistence as unavailable instead of failing.
 */
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_VERSION, type DB } from "./schema";

const DATA_DIR = process.env.TRAJECTORY_DATA_DIR ?? path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

interface StoreState {
  db: DB | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
  persistence: "file" | "memory";
  lastSaveError: string | null;
  seeding: boolean;
}

const g = globalThis as unknown as { __trajectoryStore?: StoreState };
const state: StoreState = (g.__trajectoryStore ??= {
  db: null,
  saveTimer: null,
  persistence: "file",
  lastSaveError: null,
  seeding: false,
});

function readFromDisk(): DB | null {
  try {
    if (!fs.existsSync(FILE)) return null;
    const db = JSON.parse(fs.readFileSync(FILE, "utf8")) as DB;
    return db.schemaVersion === SCHEMA_VERSION ? db : null;
  } catch {
    return null;
  }
}

export function writeToDisk(db: DB): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
    state.persistence = "file";
    state.lastSaveError = null;
  } catch (e) {
    state.persistence = "memory";
    state.lastSaveError = e instanceof Error ? e.message : String(e);
  }
}

let seeder: (() => Promise<DB>) | null = null;
export function registerSeeder(fn: () => Promise<DB>): void {
  seeder = fn;
}

const pendingState = globalThis as unknown as { __trajectorySeeding?: Promise<DB> | null };

/** Load from disk, or seed once (concurrent callers share the same promise). */
export async function ensureDB(): Promise<DB> {
  if (state.db && !state.seeding) return state.db;
  if (!state.seeding) {
    const disk = readFromDisk();
    if (disk) {
      state.db = disk;
      return disk;
    }
  }
  if (!seeder) throw new Error("Store not initialised: no seeder registered");
  pendingState.__trajectorySeeding ??= (async () => {
    state.seeding = true;
    try {
      const db = await seeder!();
      state.db = db;
      writeToDisk(db);
      return db;
    } finally {
      state.seeding = false;
      pendingState.__trajectorySeeding = null;
    }
  })();
  return pendingState.__trajectorySeeding;
}

/** Synchronous accessor for code running after ensureDB() (and inside the seeder). */
export function getDB(): DB {
  if (state.db) return state.db;
  const disk = readFromDisk();
  if (disk) {
    state.db = disk;
    return disk;
  }
  throw new Error("Store not ready — await ensureDB() first");
}

export function setDB(db: DB): void {
  state.db = db;
  writeToDisk(db);
}

/** Mark the store dirty; flushes within 400ms. */
export function persist(): void {
  if (state.saveTimer) return;
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    if (state.db) writeToDisk(state.db);
  }, 400);
}

export function storeStatus() {
  return { persistence: state.persistence, file: FILE, lastSaveError: state.lastSaveError };
}

export function nextId(db: DB, prefix: string): string {
  db.counters[prefix] = (db.counters[prefix] ?? 0) + 1;
  return `${prefix}_${db.counters[prefix]!.toString(36).padStart(4, "0")}`;
}

/** Seed-time only: install a DB without writing it (the seeder persists once at the end). */
export function installDB(db: DB): void {
  state.db = db;
}
