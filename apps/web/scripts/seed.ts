/**
 * pnpm seed        — build the deterministic demo dataset into .data/store.json (if absent)
 * pnpm seed:reset  — rebuild from scratch. Refuses to run against production.
 */
import fs from "node:fs";
import path from "node:path";
import { buildSeed } from "../src/server/seed/build";
import { setDB, storeStatus } from "../src/server/db/store";

const reset = process.argv.includes("--reset");
const file = path.join(process.env.TRAJECTORY_DATA_DIR ?? path.join(process.cwd(), ".data"), "store.json");

if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  console.error(
    "✗ Refusing to seed: NODE_ENV/VERCEL_ENV is production. Seeding never runs against production data.",
  );
  process.exit(1);
}
if (fs.existsSync(file) && !reset) {
  console.log(`✓ Demo data already present at ${file} (use pnpm seed:reset to rebuild).`);
  process.exit(0);
}
const t0 = Date.now();
const db = await buildSeed(undefined, (s) => console.log(s));
setDB(db);
console.log(
  `✓ Seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${storeStatus().file} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`,
);
