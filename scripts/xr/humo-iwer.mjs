#!/usr/bin/env node
/**
 * XR1010AJ · humo de IWER en un navegador REAL (contrato `architecture/starseed-xr.md` §3 l).
 * Abre `/xr/os?modo=vr` con el Chrome ya instalado (canal `chrome`: no descarga navegadores),
 * inyecta IWER antes de la página y comprueba botón «Entrar en VR», pulsación y `requestSession`.
 * Una línea por comprobación; sale 1 si algo falla y 0 con «sin navegador: omitido» si no hay Chrome.
 * LÍMITE HONESTO: IWER no sustituye al visor; gestos, rendimiento y lo que se ve van en `/xr/diagnostico`.
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const URL_XR = process.env.STARSEED_XR_URL ?? "http://localhost:9002/xr/os?modo=vr";
const RUTA_BUNDLE = new URL("../../node_modules/iwer/build/iwer.js", import.meta.url);
const SIN_CHROME = /is not found|doesn't exist|Executable doesn't exist|distribution 'chrome'/i;

let fallos = 0;
const ok = (m) => console.log(`[ok] ${m}`);
const fallo = (m) => { fallos++; console.log(`[fallo] ${m}`); };

function leerBundle() {
    try {
        return readFileSync(RUTA_BUNDLE, "utf8");
    } catch {
        throw new Error(`falta el bundle de iwer (${RUTA_BUNDLE.pathname}): instala XR1010A (dependencias XR)`);
    }
}

/** IWER se instala ANTES de que corra la app y se envuelve `requestSession` para registrar la llamada. */
function guionIWER(bundle) {
    return `${bundle}
;(() => {
    const IWER = globalThis.IWER;
    if (!IWER) return;
    const device = new IWER.XRDevice(IWER.metaQuest3);
    device.installRuntime();
    globalThis.__starseedXR = { device, llamadas: [] };
    const xr = navigator.xr;
    if (!xr || typeof xr.requestSession !== "function") return;
    const original = xr.requestSession.bind(xr);
    xr.requestSession = (modo, opciones) => {
        globalThis.__starseedXR.llamadas.push({ modo });
        return original(modo, opciones);
    };
})();`;
}

async function principal() {
    let bundle;
    try {
        bundle = leerBundle();
    } catch (error) {
        fallo(error instanceof Error ? error.message : String(error));
        return 1;
    }
    let navegador;
    try {
        navegador = await chromium.launch({ channel: "chrome", headless: true });
    } catch (error) {
        if (SIN_CHROME.test(String(error && error.message))) {
            console.log("sin navegador: omitido");
            return 0;
        }
        fallo(`no se pudo lanzar Chrome: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
    try {
        const pagina = await navegador.newPage();
        await pagina.addInitScript({ content: guionIWER(bundle) });
        try {
            const respuesta = await pagina.goto(URL_XR, { waitUntil: "domcontentloaded", timeout: 30_000 });
            if (respuesta && respuesta.ok()) ok(`página cargada (${respuesta.status()}): ${URL_XR}`);
            else fallo(`la página no respondió bien: ${respuesta ? respuesta.status() : "sin respuesta"}`);
        } catch (error) {
            fallo(`no se pudo abrir ${URL_XR}: ${error instanceof Error ? error.message : String(error)}`);
            return 1;
        }
        const hayXR = await pagina.evaluate(() => Boolean(navigator.xr));
        hayXR ? ok("IWER instalado: navigator.xr presente") : fallo("navigator.xr no existe tras inyectar IWER");
        const boton = pagina.getByRole("button", { name: "Entrar en VR" }).first();
        let visible = false;
        try {
            await boton.waitFor({ state: "visible", timeout: 20_000 });
            visible = true;
            ok("la página pinta el botón «Entrar en VR»");
        } catch {
            fallo("no aparece el botón «Entrar en VR»");
        }
        if (visible) {
            try {
                await boton.click({ timeout: 10_000 });
                ok("el botón «Entrar en VR» se puede pulsar");
            } catch (error) {
                fallo(`el botón no se pudo pulsar: ${error instanceof Error ? error.message : String(error)}`);
            }
            try {
                await pagina.waitForFunction(
                    () => (globalThis.__starseedXR?.llamadas.length ?? 0) > 0,
                    undefined,
                    { timeout: 10_000 },
                );
                const llamadas = await pagina.evaluate(() => globalThis.__starseedXR.llamadas);
                const modos = llamadas.map((l) => l.modo).join(", ");
                modos.includes("immersive-vr")
                    ? ok(`navigator.xr.requestSession recibió: ${modos}`)
                    : fallo(`requestSession no pidió immersive-vr (recibido: ${modos || "nada"})`);
            } catch {
                fallo("navigator.xr.requestSession no recibió ninguna llamada");
            }
        }
        console.log(
            fallos === 0
                ? "[fin] humo de IWER en verde (emulación; el visor real se prueba en /xr/diagnostico)"
                : `[fin] ${fallos} comprobación(es) en rojo`,
        );
        return fallos === 0 ? 0 : 1;
    } finally {
        await navegador.close();
    }
}

process.exitCode = await principal();