// scripts/gen-version.mjs
// Genera public/version.json con un id ÚNICO por build. La app lo sondea
// (register-sw.tsx) para detectar CADA despliegue y recargar las pestañas/PWA
// abiertas — así "no se actualiza" deja de pasar sin depender de bumps del SW.
// Se ejecuta automáticamente en el hook `prebuild` de npm (antes de `next build`).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const build = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
try {
  const dir = join(process.cwd(), "public");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "version.json"), JSON.stringify({ build, at: new Date().toISOString() }));
  // eslint-disable-next-line no-console
  console.log("[gen-version] public/version.json →", build);
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn("[gen-version] no se pudo escribir version.json:", e?.message ?? e);
}
