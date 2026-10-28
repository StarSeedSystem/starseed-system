#!/usr/bin/env node
/**
 * StarSeed XR · humo con IWER (XR1010AJ, contrato `architecture/starseed-xr.md` §3 (l)). NO corre en vitest.
 *
 * Uso (con `npm run build && npm run start` en localhost:9002, o el `next start` de launchd):
 *   node scripts/xr/humo-iwer.mjs
 *   STARSEED_XR_URL="http://localhost:9002/xr/os?modo=vr" node scripts/xr/humo-iwer.mjs
 *
 * Usa el Chrome ya instalado de la máquina (`channel: "chrome"`): no descarga ningún navegador.
 * Inyecta el runtime emulado de IWER antes de la página y comprueba que el botón «Entrar en VR»
 * llega a `navigator.xr.requestSession`. Honestidad: esto NO sustituye a un visor real; gestos,
 * rendimiento y lo que se ve solo se comprueban con el visor puesto en `/xr/diagnostico`.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const URL_XR = process.env.STARSEED_XR_URL ?? "http://localhost:9002/xr/os?modo=vr";
const BUNDLE = fileURLToPath(new URL("../../node_modules/iwer/build/iwer.js", import.meta.url));
let fallos = 0;

function informe(nombre, ok, detalle = "") {
    console.log(`${ok ? "ok" : "fallo"} · ${nombre}${detalle ? ` · ${detalle}` : ""}`);
    if (!ok) fallos += 1;
}

/** Se ejecuta DENTRO de la página, antes de su código: instala IWER y cuenta las peticiones de sesión. */
function instalarIwer() {
    const { XRDevice, metaQuest3 } = globalThis.IWER ?? {};
    if (!XRDevice) return;
    const dispositivo = new XRDevice(metaQuest3, { canvasContainer: document.createElement("div") });
    // Chrome de escritorio expone `navigator.xr` sin visor: hay que forzar el reemplazo.
    dispositivo.installRuntime({ forceInstall: true });
    const sistema = navigator.xr;
    const pedir = sistema.requestSession.bind(sistema);
    globalThis.__starseedXRPeticiones = [];
    sistema.requestSession = async (modo, init = {}) => {
        const registro = { modo, features: [] };
        globalThis.__starseedXRPeticiones.push(registro);
        const sesion = await pedir(modo, init);
        registro.features = Array.from(sesion.enabledFeatures ?? []);
        return sesion;
    };
}

const paquete = await readFile(BUNDLE, "utf8").catch(() => null);
if (paquete === null) {
    informe("el bundle de IWER está en node_modules", false, BUNDLE);
    process.exit(1);
}

let navegador;
try {
    navegador = await chromium.launch({ channel: "chrome", headless: true });
} catch {
    console.log("sin navegador: omitido");
    process.exit(0);
}

try {
    const pagina = await navegador.newPage();
    await pagina.addInitScript({ content: paquete });
    await pagina.addInitScript(instalarIwer);

    let respuesta = null;
    try {
        respuesta = await pagina.goto(URL_XR, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch {
        respuesta = null;
    }
    informe("la página XR responde", Boolean(respuesta && respuesta.ok()), URL_XR);

    const boton = pagina.getByRole("button", { name: "Entrar en VR" });
    let visible = true;
    try {
        await boton.waitFor({ state: "visible", timeout: 20000 });
    } catch {
        visible = false;
    }
    informe("pinta el botón «Entrar en VR»", visible);

    if (visible) {
        await boton.click();
        let peticiones = [];
        try {
            await pagina.waitForFunction(
                () => (globalThis.__starseedXRPeticiones ?? []).some((p) => p.modo === "immersive-vr"),
                null,
                { timeout: 15000 },
            );
            peticiones = await pagina.evaluate(() => globalThis.__starseedXRPeticiones);
        } catch {
            peticiones = [];
        }
        const pedida = peticiones.find((p) => p.modo === "immersive-vr");
        informe("navigator.xr recibió requestSession('immersive-vr')", Boolean(pedida));
    }
} finally {
    await navegador.close();
}

process.exit(fallos === 0 ? 0 : 1);
