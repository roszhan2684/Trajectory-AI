/** Server bootstrap: wires the seeder into the store. Import `ready()` before touching services. */
import { ensureDB, registerSeeder } from "./db/store";
import { buildSeed } from "./seed/build";

registerSeeder(() => buildSeed());

export function ready() {
  return ensureDB();
}
