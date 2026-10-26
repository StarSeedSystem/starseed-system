#!/usr/bin/env node
/**
 * StarSeed XR · HUMO CON NAVEGADOR REAL + IWER (XR1010AJ, contrato §3 l.3).
 *
 * Abre `/xr/os?modo=vr` (o `STARSEED_XR_URL`) en el Chrome ya instalado de la Mac, inyecta IWER
 * ANTES de la página y comprueba que se pinta «Entrar en VR», que al pulsarlo se llama a
 * `navigator.xr.requestSession` y con qué modo. Sale con 1 si algo falla; si no hay Chrome,
 * imprime «sin navegador: omitido» y sale con 0 (no descarga otro navegador: el disco manda).
 *
 * NO corre en vitest. Uso: `node scripts/xr/humo-iwer.mjs`.
 * Honestidad: IWER no sustituye al visor real; lo que se ve y se siente se comprueba en `/xr/diagnostico`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const URL_XR = process.env.STARSEED_XR_URL || "http://localhost:9002/xr/os?modo=vr";
const RUTA_BUNDLE = fileURLToPath(new URL("../../node_modules/iwer/build/iwer.min.js", import.meta.url));

let fallos = 0;
function anotar(ok, texto) {
    if (!ok) fallos += 1;
    console.log(`${ok ? "OK   " : "FALLO"} ${texto}`);
}

/** Bundle UMD de IWER (`window.IWER`) + instalación del runtime y contador de `requestSession`. */
function guionDeEntrada() {
    const bundle = readFileSync(RUTA_BUNDLE, "utf8");
    return `${bundle}
;(() => {
  try {
    const IWER = window.IWER;
    if (!IWER) { window.__iwerError = "el bundle no expuso window.IWER"; return; }
    const dispositivo = new IWER.XRDevice(IWER.metaQuest3);
    dispositivo.installRuntime();
    window.__iwEventInstalado = true;
    window.__xrRequestSession = 0;
    window.__xrModo = null;
    const sistema = navigator.xr;
    const original = sistema.requestSession.bind(sistema);
    sistema.requestSession = (modo, opciones) => {
      window.__xrRequestSession += 1;
      window.__xrModo = modo;
      return original(modo, opciones);
    };
  } catch (error) {
    window.__iwerError = String(error && error.message ? error.message : error);
  }
})();`;
}

let navegador;
try {
    // El Chrome de la Mac, no un Chromium descargado (§3 l.3).
    navegador = await chromium.launch({ channel: "chrome", headless: true });
} catch {
    console.log("sin navegador: omitido");
    process.exit(0);
}

try {
    const pagina = await navegador.newPage();
    const erroresDePagina = [];
    pagina.on("pageerror", (e) => erroresDePagina.push(String(e)));
    await pagina.addInitScript({ content: guionDeEntrada() });

    await pagina.goto(URL_XR, { waitUntil: "domcontentloaded", timeout: 30_000 });
    anotar(true, `página abierta: ${URL_XR}`);

    const montado = await pagina.evaluate(() => window.__iwEventInstalado === true);
    const motivo = await pagina.evaluate(() => window.__iwerError || null);
    anotar(montado, `IWER instalado antes de la página${motivo ? ` (${String(motivo)})` : ""}`);
    anotar(await pagina.evaluate(() => Boolean(navigator.xr)), "navigator.xr visible");

    const boton = pagina.getByRole("button", { name: "Entrar en VR" }).first();
    let pinta = true;
    try {
        await boton.waitFor({ state: "visible", timeout: 20_000 });
    } catch {
        pinta = false;
    }
    anotar(pinta, "la página pinta el botón «Entrar en VR»");

    if (pinta) {
        await boton.click();
        try {
            await pagina.waitForFunction(() => window.__xrRequestSession > 0, undefined, { timeout: 10_000 });
        } catch {
            // Se informa abajo con el contador real.
        }
        const llamadas = await pagina.evaluate(() => window.__xrRequestSession || 0);
        anotar(llamadas > 0, `navigator.xr.requestSession recibió la llamada (${llamadas})`);
        const modo = await pagina.evaluate(() => window.__xrModo);
        anotar(modo === "immersive-vr", `modo pedido: ${String(modo)}`);
    }

    for (const error of erroresDePagina.slice(0, 3)) console.log(`aviso  error de página: ${error}`);
} catch (error) {
    anotar(false, `no se pudo completar el humo: ${error instanceof Error ? error.message : String(error)}`);
} finally {
    await navegador.close();
}

console.log(fallos === 0 ? "humo IWER: en verde" : `humo IWER: ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
