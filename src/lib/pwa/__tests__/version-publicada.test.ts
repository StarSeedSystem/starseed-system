/**
 * ACT1114J · la app que sirve su propia copia de la web (servidor local dentro de la APK) no veía lo publicado,
 * y el tope de recargas no se levantaba nunca.
 *   NODE_ENV=test npx vitest run src/lib/pwa/__tests__/version-publicada.test.ts
 */
import { describe, expect, it } from "vitest";

import {
    anotarRecarga, decidirCambioBuild, type EntradaDecisionBuild, esOrigenLocal, lineaVersionWeb, recargasEnVentana,
    recargasHechasEnVentana, TOPE_RECARGAS_SESION, urlVersionPublicada, VENTANA_RECARGAS_MS,
} from "@/lib/pwa/decision-build";

import { montarSW } from "./sw-entorno-prueba";

const base: EntradaDecisionBuild = {
    corriendo: "viejo-aaaaaa", publicada: "nuevo-bbbbbb", enLlamada: false, escribiendo: false, enLinea: true,
    recargasEstaSesion: 0, topeRecargas: TOPE_RECARGAS_SESION,
};

function almacen() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("copia local (APK con servidor propio)", () => {
    it("con la web servida desde 127.0.0.1, una build publicada distinta NO manda recargar (recargar daría la misma)", () => {
        expect(decidirCambioBuild({ ...base, origenLocal: true })).toBe("local-sin-relevo");
        expect(decidirCambioBuild({ ...base, origenLocal: false })).toBe("aplicar");
    });
    it("lee lo publicado en el origen publicado, no a sí misma", () => {
        expect(esOrigenLocal("127.0.0.1")).toBe(true);
        expect(esOrigenLocal("localhost")).toBe(true);
        expect(esOrigenLocal("starseed-os.vercel.app")).toBe(false);
        expect(urlVersionPublicada("127.0.0.1")).toBe("https://starseed-os.vercel.app/version.json");
        expect(urlVersionPublicada("starseed-os.vercel.app")).toBe("/version.json");
    });
});

describe("tope de recargas que se recupera solo", () => {
    it("dos recargas llenan la ventana; a los 10 min se levanta sin cerrar la app", () => {
        const a = almacen();
        const t0 = 1_000_000;
        expect(anotarRecarga(a, t0)).toBe(true);
        expect(anotarRecarga(a, t0 + 5_000)).toBe(true);
        expect(anotarRecarga(a, t0 + 10_000)).toBe(false); // bucle imposible
        expect(recargasHechasEnVentana(a, t0 + 10_000)).toBe(TOPE_RECARGAS_SESION);
        expect(anotarRecarga(a, t0 + VENTANA_RECARGAS_MS - 1)).toBe(false);
        expect(anotarRecarga(a, t0 + VENTANA_RECARGAS_MS + 1)).toBe(true); // la más antigua envejeció
    });
    it("basura en el almacén no lo rompe", () => {
        expect(recargasEnVentana("x", 5)).toBe(0);
        expect(recargasEnVentana([NaN, "a", 1], 5)).toBe(1);
        const a = almacen();
        a.setItem("ss:recargas-t", "{no json");
        expect(anotarRecarga(a, 10)).toBe(true);
    });
});

describe("la línea del registro", () => {
    it("dice lo que midió y decidió", () => {
        expect(lineaVersionWeb("mwgd2z1v-89cf2y", "mwk0aaaa-bbbbbb", "local-sin-relevo", "local"))
            .toBe("web-version comprobada mia=mwgd2z1v-89cf2y publicada=mwk0aaaa-bbbbbb decision=local-sin-relevo origen=local");
        expect(lineaVersionWeb(null, null, "sin-dato", "publicado")).toBe("web-version comprobada mia=? publicada=? decision=sin-dato origen=publicado");
    });
});

describe("sw-v8 · no es el worker quien deja la web vieja (con red)", () => {
    it("/version.json ni se toca ni se guarda: va directo a la red", async () => {
        const sw = montarSW({ servidor: () => new Response("{}") });
        await sw.ciclo("install");
        await sw.ciclo("activate");
        expect(await sw.pedir("/version.json")).toBeNull();
    });
    it("la navegación es red-primero: con red, una build nueva del servidor llega aunque haya copia guardada", async () => {
        let v = "viejo";
        const sw = montarSW({ servidor: () => new Response(`<!doctype html><p>${v}</p>`, { headers: { "content-type": "text/html" } }) });
        await sw.ciclo("install");
        await sw.ciclo("activate");
        expect(await (await sw.pedir("/escritorios", { modo: "navigate" }))?.text()).toContain("viejo");
        v = "nuevo";
        expect(await (await sw.pedir("/escritorios", { modo: "navigate" }))?.text()).toContain("nuevo");
        sw.estado.red = false;
        expect(await (await sw.pedir("/escritorios", { modo: "navigate" }))?.text()).toContain("nuevo"); // sin red: lo último
    });
});
