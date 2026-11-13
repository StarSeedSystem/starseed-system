// scripts/gen-version.mjs
// Genera public/version.json con un id ÚNICO por build. La app lo sondea
// (register-sw.tsx) para detectar CADA despliegue y recargar las pestañas/PWA
// abiertas — así "no se actualiza" deja de pasar sin depender de bumps del SW.
// Se ejecuta automáticamente en el hook `prebuild` de npm (antes de `next build`).
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"));
const version = pkg.version;

const build = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let sha = process.env.VERCEL_GIT_COMMIT_SHA || null;
if (!sha) {
  try { sha = execSync("git rev-parse HEAD", { encoding: "utf-8", cwd: process.cwd(), timeout: 5000 }).trim() || null; } catch { sha = null; }
}
let rama = null;
try { rama = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8", cwd: process.cwd(), timeout: 5000 }).trim() || null; } catch { rama = null; }
try {
  const dir = join(process.cwd(), "public");
  mkdirSync(dir, { recursive: true });
  // OS_VERSION es la ÚNICA fuente de verdad para la versión del OS
  const osRelease = JSON.parse(readFileSync(join(process.cwd(), "src/lib/version/os-release.ts"), "utf-8"));
  const osVersionMatch = osRelease.match(/export const OS_VERSION = "([^"]+)";/);
  const osVersion = osVersionMatch ? osVersionMatch[1] : null;
  writeFileSync(join(dir, "version.json"), JSON.stringify({ build, at: new Date().toISOString(), sha, rama, version, osVersion }));
  // eslint-disable-next-line no-console
  console.log("[gen-version] public/version.json →", build);
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn("[gen-version] no se pudo escribir version.json:", e?.message ?? e);
}
