#!/usr/bin/env node
/**
 * StarSeed XR · PRUEBA DE HUMO CON NAVEGADOR REAL (+ IWER emulado). Contrato: `architecture/starseed-xr.md` §3 (l) 3.
 *
 * Se corre a mano (NO dentro de vitest):   node scripts/xr/humo-iwer.mjs
 * Variable de entorno opcional:  STARSEED_XR_URL (por defecto http://localhost:9002/xr/os?modo=vr)
 *
 * Inyecta IWER ANTES de la página (`addInitScript`, bundle leído de `node_modules/iwer`) y usa el Chrome ya
 * instalado de la Mac (`channel: "chrome"`: no se descarga otro navegador, el disco manda). Comprueba, una
 * línea por comprobación: (1) IWER instalado, (2) la página pinta «Entrar en VR», (3) al pulsarlo
 * `navigator.xr` recibió `requestSession`. Sale con código 1 si algo falla y con 0 («sin navegador:
 * omitido») si no hay Chrome. Honestidad: IWER no sustituye al visor real — los gestos, el rendimiento y lo
 * que se ve solo se comprueban en `/xr/diagnostico` con el visor puesto (XR1010AI).
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const URL_OBJETIVO = process.env.STARSEED_XR_URL || "http://localhost:9002/xr/os?modo=vr";
const RUTA_IWER = new URL("../../node_modules/iwer/build/iwer.js", import.meta.url);

let fallos = 0;
/** Una línea por comprobación: «sí/no — qué — acota el fallo si lo hay». */
function linea(ok, que, detalle = "") {
    if (!ok) fallos++;
    console.log(`${ok ? "sí" : "NO"} — ${que}${detalle ? `: ${detalle}` : ""}`);
}

/** Corre DENTRO del navegador (se serializa con `.toString()`): instala el aparato y anota cada `requestSession`. */
function INSTALAR_EN_NAVEGADOR() {
    const xrDevice = new IWER.XRDevice(IWER.metaQuest3);
    xrDevice.installRuntime({ globalObject: window });
    window.__humoIwer = { requestSession: 0 };
    const { xr } = navigator;
    const original = xr.requestSession.bind(xr);
    Object.defineProperty(xr, "requestSession", {
        value: (...args) => { window.__humoIwer.requestSession++; return original(...args); },
        configurable: true,
    });
}

async function main() {
    let navegador;
    try {
        navegador = await chromium.launch({ channel: "chrome", headless: true });
    } catch (e) {
        console.log(`sin navegador: omitido — no hay Chrome instalado (${e.message?.split("\n")[0] ?? e})`);
        process.exit(0);
    }
    const bultoIwer = readFileSync(RUTA_IWER, "utf8");
    try {
        const pagina = await navegador.newPage();
        // IWER va ANTES de la página: el sondeo de la app debe ver `navigator.xr` desde el arranque.
        await pagina.addInitScript(`${bultoIwer}\n(${INSTALAR_EN_NAVEGADOR.toString()})();`);
        await pagina.goto(URL_OBJETIVO, { timeout: 60_000, waitUntil: "domcontentloaded" }).catch(() => {});
        const instalado = await pagina.evaluate(() =>
            typeof window.__humoIwer === "object" && typeof navigator.xr?.requestSession === "function",
        ).catch(() => false);
        linea(instalado, "IWER (XRDevice metaQuest3) instalado antes de la página");
        let boton;
        try {
            boton = pagina.getByRole("button", { name: "Entrar en VR" });
            await boton.waitFor({ state: "visible", timeout: 30_000 });
        } catch (e) {
            boton = null;
        }
        if (boton) {
            linea(true, "la página pinta el botón «Entrar en VR»");
            await boton.click().catch((e) => linea(false, "clic en «Entrar en VR»", String(e)));
            const recibida = await pagina.waitForFunction(
                () => window.__humoIwer?.requestSession > 0,
                undefined,
                { timeout: 15_000 },
            ).then(() => true, () => false);
            linea(recibida, "navigator.xr recibió requestSession al entrar");
        } else {
            linea(false, "la página pinta el botón «Entrar en VR»", `no aparece en ${URL_OBJETIVO}`);
        }
        await navegador.close();
        const codigo = fallos > 0 ? 1 : 0;
        if (fallos > 0) console.log(`humo con ${fallos} comprobación(es) en rojo`);
        process.exit(codigo);
    } catch (e) {
        linea(false, "prueba de humo", e.message?.split("\n")[0] ?? String(e));
        await navegador.close().catch(() => {});
        process.exit(1);
    }
}

main();
