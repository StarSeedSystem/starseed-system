#!/usr/bin/env node
/**
 * StarSeed XR · HUMO DE LA ENTRADA CON IWER (XR1010AJ, contrato `architecture/starseed-xr.md` §3 l).
 *
 * Abre `/xr/os?modo=vr` con el Chrome ya instalado (no descarga navegador), inyecta el runtime
 * de IWER ANTES de la página, espera el botón «Entrar en VR», lo pulsa y comprueba que
 * `navigator.xr.requestSession("immersive-vr", …)` se llamó de verdad. Una línea por comprobación;
 * código 1 si algo falla y código 0 con «sin navegador: omitido» si Playwright/Chrome no están.
 *
 * NO se ejecuta en vitest. LÍMITE HONESTO: IWER no sustituye al visor; gestos, rendimiento y lo
 * que se ve solo se comprueban en el aparato real, en `/xr/diagnostico`.
 *
 * Uso: `node scripts/xr/humo-iwer.mjs` (o `STARSEED_XR_URL=http://localhost:9002/xr/os?modo=vr`).
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const URL_XR = process.env.STARSEED_XR_URL ?? "http://localhost:9002/xr/os?modo=vr";
const OMITIDO = "sin navegador: omitido";

/** Instala IWER y envuelve `requestSession` para contar las peticiones reales de la página. */
const INSTALADOR = `
;(() => {
  const g = globalThis;
  if (!g.IWER || typeof g.IWER.XRDevice !== "function" || typeof g.IWER.metaQuest3 !== "object") return;
  if (!navigator.xr) new g.IWER.XRDevice(g.IWER.metaQuest3).installRuntime();
  const xr = navigator.xr;
  if (!xr) return;
  g.__starseedXR = { peticiones: [] };
  const original = xr.requestSession.bind(xr);
  xr.requestSession = (modo, opciones) => {
    g.__starseedXR.peticiones.push({ modo, opciones: opciones ?? null });
    return original(modo, opciones);
  };
})();
`;

async function leerBundleIwer() {
  const require = createRequire(import.meta.url);
  const paquete = require.resolve("iwer/package.json");
  return readFile(path.join(path.dirname(paquete), "build", "iwer.js"), "utf8");
}

async function abrirNavegador() {
  try {
    const { chromium } = await import("playwright");
    const navegador = await chromium.launch({ channel: "chrome", headless: true });
    return navegador;
  } catch {
    return null;
  }
}

async function main() {
  const bundle = await leerBundleIwer().catch(() => null);
  if (bundle === null) {
    console.log(`${OMITIDO} (no se pudo leer el bundle de iwer)`);
    return 0;
  }
  const sesion = await abrirNavegador();
  if (sesion === null) {
    console.log(OMITIDO);
    return 0;
  }
  let fallos = 0;
  const comprobar = (ok, texto) => {
    console.log(`${ok ? "[ok]" : "[FALLO]"} ${texto}`);
    if (!ok) fallos++;
  };
  try {
    const pagina = await sesion.newPage();
    await pagina.addInitScript({ content: bundle + INSTALADOR });
    comprobar(true, "runtime IWER inyectado antes de la página");
    const respuesta = await pagina.goto(URL_XR, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
    comprobar(Boolean(respuesta?.ok()), `la página responde en ${URL_XR} (${respuesta?.status() ?? "sin respuesta"})`);
    const boton = pagina.getByRole("button", { name: /Entrar en VR/i }).first();
    const visible = await boton.waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false);
    comprobar(visible, "la página pinta el botón «Entrar en VR»");
    if (visible) {
      const pulsado = await boton.click({ timeout: 15_000 }).then(() => true, () => false);
      comprobar(pulsado, "se pudo pulsar «Entrar en VR»");
      const pidio = await pagina
        .waitForFunction(() => (globalThis.__starseedXR?.peticiones?.length ?? 0) > 0, undefined, { timeout: 20_000 })
        .then(() => true, () => false);
      const peticiones = await pagina.evaluate(() => globalThis.__starseedXR?.peticiones ?? []).catch(() => []);
      const modos = peticiones.map((p) => p.modo).join(", ");
      comprobar(pidio, `navigator.xr recibió requestSession (${modos || "ninguna"})`);
      comprobar(peticiones.length > 0 && peticiones.every((p) => p.modo === "immersive-vr"), "la sesión pedida es immersive-vr");
    }
  } finally {
    await sesion.close().catch(() => undefined);
  }
  console.log(fallos === 0 ? "Humo IWER: todo en verde." : `Humo IWER: ${fallos} comprobación(es) en rojo.`);
  return fallos === 0 ? 0 : 1;
}

process.exitCode = await main();
