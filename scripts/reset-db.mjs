import fs from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
const files = ["app.db", "app.db-shm", "app.db-wal"];

for (const file of files) {
  const target = path.join(dataDir, file);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log(`Removed ${path.relative(process.cwd(), target)}`);
  }
}

console.log("The next app start will recreate and reseed the database (SEED_DEMO=true).");
