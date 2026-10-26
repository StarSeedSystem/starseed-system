#!/usr/bin/env node
/**
 * XR1010AJ · HUMO CON NAVEGADOR REAL (contrato `architecture/starseed-xr.md` §3 l.3). NO lo corre vitest.
 *
 * Abre `/xr/os?modo=vr` (o `STARSEED_XR_URL`) en el Chrome ya instalado de la Mac (`channel: "chrome"`, sin
 * descargar otro navegador), inyecta IWER ANTES de la página y comprueba que se pinta «Entrar en VR», que se
 * puede pulsar y que `navigator.xr` recibe `requestSession`. Una línea por comprobación; sale 1 si algo falla.
 * Si no hay Chrome, no es un fallo del código: sale 0 con «sin navegador: omitido».
 *
 * Honestidad: IWER no sustituye al visor real. Gestos, rendimiento y lo que se ve solo se comprueban con el
 * aparato, en `/xr/diagnostico`. Esto solo demuestra que la entrada emulada llega a pedir sesión.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright";

const URL_XR = process.env.STARSEED_XR_URL ?? "http://localhost:9002/xr/os?modo=vr";
const TOPE_MS = 30_000;
const requerir = createRequire(import.meta.url);

/** Bundle UMD de IWER (expone `globalThis.IWER`), el mismo que usa la librería en pruebas. */
function rutaIWER() {
    return path.resolve(path.dirname(requerir.resolve("iwer")), "..", "build", "iwer.min.js");
}

/** IWER se instala antes que el código de la página; además se cuenta cada `requestSession` pedida. */
function arranqueIWER(bundle) {
    return `${bundle}
;(() => {
  try {
    const dispositivo = new IWER.XRDevice(IWER.metaQuest3);
    dispositivo.installRuntime();
    const xr = navigator.xr;
    const pedirOriginal = xr.requestSession.bind(xr);
    window.__starseedXR = { pedidas: [] };
    xr.requestSession = (modo, opciones) => {
      window.__starseedXR.pedidas.push(modo);
      return pedirOriginal(modo, opciones);
    };
    window.__starseedIWER = dispositivo;
  } catch (e) {
    window.__starseedXR = { error: String(e) };
  }
})();`;
}

const resultados = [];
function comprobar(ok, texto) {
    resultados.push(ok);
    console.log(`${ok ? "OK" : "FALLO"} · ${texto}`);
}

let navegador;
try {
    navegador = await chromium.launch({ channel: "chrome", headless: true });
} catch {
    console.log("sin navegador: omitido");
    process.exit(0);
}

try {
    const bundle = readFileSync(rutaIWER(), "utf8");
    const contexto = await navegador.newContext();
    const pagina = await contexto.newPage();
    await pagina.addInitScript({ content: arranqueIWER(bundle) });

    let paginaLista = false;
    let respuesta = null;
    try {
        respuesta = await pagina.goto(URL_XR, { waitUntil: "domcontentloaded", timeout: TOPE_MS });
        paginaLista = true;
    } catch (e) {
        comprobar(false, `la página no cargó: ${e instanceof Error ? e.message : String(e)}`);
    }
    comprobar(respuesta !== null && respuesta.status() < 400, `la página respondió ${respuesta?.status() ?? "sin respuesta"}`);

    if (!paginaLista) {
        for (const texto of ["IWER instalado antes de la página", "se ve el botón «Entrar en VR»", "navigator.xr recibió requestSession"]) {
            comprobar(false, `${texto}: no se pudo comprobar, la página no cargó`);
        }
    } else {
        const arranque = await pagina.evaluate(() => window.__starseedXR ?? null).catch(() => null);
        comprobar(
            arranque !== null && !arranque.error,
            `IWER instalado antes de la página${arranque?.error ? `: ${arranque.error}` : ""}`,
        );

        const boton = pagina.getByRole("button", { name: "Entrar en VR" });
        const hayBoton = await boton.waitFor({ state: "visible", timeout: TOPE_MS }).then(() => true, () => false);
        comprobar(hayBoton, "se ve el botón «Entrar en VR»");

        if (hayBoton) {
            await boton.click({ timeout: TOPE_MS }).catch(() => undefined);
            await pagina.waitForFunction(
                () => Array.isArray(window.__starseedXR?.pedidas) && window.__starseedXR.pedidas.length > 0,
                undefined,
                { timeout: TOPE_MS },
            ).catch(() => undefined);
            const pedidas = await pagina.evaluate(() => window.__starseedXR?.pedidas ?? []).catch(() => []);
            const detalle = pedidas.length > 0 ? ` (${pedidas.join(", ")})` : "";
            comprobar(pedidas.length > 0, `navigator.xr recibió requestSession${detalle}`);
        } else {
            comprobar(false, "navigator.xr no recibió requestSession: no hay botón que pulsar");
        }
    }
} finally {
    await navegador.close().catch(() => undefined);
}

const fallos = resultados.filter((ok) => !ok).length;
console.log(fallos === 0 ? "Humo XR: todo en verde." : `Humo XR: ${fallos} comprobación(es) fallida(s).`);
process.exit(fallos === 0 ? 0 : 1);
