#!/usr/bin/env node
/**
 * StarSeed XR · HUMO CON IWER Y CHROME REAL (XR1010AJ, contrato `architecture/starseed-xr.md` §3 l.3).
 *
 * Abre `/xr/os?modo=vr` en el Chrome ya instalado (nunca descarga otro navegador), inyecta IWER
 * ANTES de que corra la página y comprueba que se pinta «Entrar en VR» y que el botón llega a
 * `navigator.xr.requestSession`. NO se ejecuta en vitest: necesita un navegador de verdad.
 *
 * Uso:  node scripts/xr/humo-iwer.mjs
 *       STARSEED_XR_URL=http://localhost:9002/xr/os?modo=vr node scripts/xr/humo-iwer.mjs
 * Sale 1 si alguna comprobación falla; 0 y «sin navegador: omitido» si no hay Chrome.
 * Límite honesto: IWER no sustituye al visor; lo que se ve y el rendimiento solo se juzgan en
 * `/xr/diagnostico` (XR1010AI) con el visor puesto.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const URL_XR = process.env.STARSEED_XR_URL ?? "http://localhost:9002/xr/os?modo=vr";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RUTA_IWER = path.resolve(AQUI, "../../node_modules/iwer/build/iwer.min.js");
const ESPERA_MS = 30_000;
let fallos = 0;
function comprobar(ok, texto) {
    console.log(`${ok ? "ok" : "FALLA"} · ${texto}`);
    if (!ok) fallos += 1;
}

async function chromiumDePlaywright() {
    try {
        const { chromium } = await import("playwright");
        return chromium;
    } catch {
        return null;
    }
}

function leerIwer() {
    try {
        return readFileSync(RUTA_IWER, "utf8");
    } catch {
        return null;
    }
}

/** IWER se instala antes que cualquier script de la página; `requestSession` queda contado. */
function iniciarIwer(bundle) {
    return `${bundle}
;(() => {
  const device = new IWER.XRDevice(IWER.metaQuest3);
  device.installRuntime({ globalObject: window, forceInstall: true });
  window.__iwerDevice = device;
  window.__iwerPeticiones = [];
  const original = navigator.xr.requestSession.bind(navigator.xr);
  navigator.xr.requestSession = (modo, opciones) => {
    window.__iwerPeticiones.push({ modo, opciones });
    return original(modo, opciones);
  };
})();`;
}

const chromium = await chromiumDePlaywright();
if (!chromium) {
    console.log("sin navegador: omitido");
    process.exit(0);
}
const bundle = leerIwer();
if (!bundle) {
    console.log(`FALLA · falta el bundle de IWER en ${RUTA_IWER}`);
    process.exit(1);
}

let navegador;
try {
    // `channel: "chrome"` usa el Chrome instalado: el disco manda, no se descarga Chromium.
    navegador = await chromium.launch({ channel: "chrome", headless: true });
} catch {
    console.log("sin navegador: omitido");
    process.exit(0);
}

try {
    const pagina = await (await navegador.newContext()).newPage();
    const errores = [];
    pagina.on("pageerror", (e) => errores.push(String(e)));
    await pagina.addInitScript({ content: iniciarIwer(bundle) });
    await pagina.goto(URL_XR, { waitUntil: "domcontentloaded", timeout: ESPERA_MS });

    comprobar(await pagina.evaluate(() => Boolean(navigator.xr)), "IWER instalado: navigator.xr existe antes de cargar la página");

    const boton = pagina.getByRole("button", { name: "Entrar en VR" });
    let pinta = true;
    try {
        await boton.waitFor({ state: "visible", timeout: ESPERA_MS });
    } catch {
        pinta = false;
    }
    comprobar(pinta, "la página pinta el botón «Entrar en VR»");

    if (pinta) await boton.click();
    let pidio = false;
    try {
        await pagina.waitForFunction(() => (window.__iwerPeticiones?.length ?? 0) > 0, null, { timeout: ESPERA_MS });
        pidio = true;
    } catch { /* abajo se informa */ }
    comprobar(pidio, "el botón llamó a navigator.xr.requestSession");

    if (pidio) {
        const peticion = await pagina.evaluate(() => window.__iwerPeticiones[0]);
        comprobar(peticion.modo === "immersive-vr", `la petición fue «immersive-vr» (fue «${peticion.modo}»)`);
    }
    comprobar(errores.length === 0, errores.length === 0 ? "sin errores de página" : `errores de página: ${errores.join(" | ")}`);
} catch (e) {
    comprobar(false, `no se pudo abrir ${URL_XR}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
    await navegador.close().catch(() => undefined);
}

console.log(fallos === 0 ? "humo IWER: todo en verde" : `humo IWER: ${fallos} comprobación(es) en rojo`);
process.exit(fallos === 0 ? 0 : 1);
