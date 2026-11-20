import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--webpack", "--hostname", "0.0.0.0", "--port", "3000"], {
  env: { ...process.env, LUMA_BOLT_PREVIEW: "1" },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
