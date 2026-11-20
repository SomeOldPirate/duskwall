/**
 * Compile packs/_source/<pack>.json (an array of documents) into LevelDB packs.
 *   npm i -D @foundryvtt/foundryvtt-cli && node tools/build-packs.mjs
 */
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "packs", "_source");
for ( const file of fs.readdirSync(src).filter(f => f.endsWith(".json")) ) {
  const name = path.basename(file, ".json");
  const docs = JSON.parse(fs.readFileSync(path.join(src, file), "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `dw-${name}-`));
  for ( const doc of docs ) fs.writeFileSync(path.join(tmp, `${doc._id}.json`), JSON.stringify(doc));
  const dest = path.join(root, "packs", name);
  fs.rmSync(dest, { recursive: true, force: true });
  await compilePack(tmp, dest, { log: false });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("packed", name, docs.length);
}
