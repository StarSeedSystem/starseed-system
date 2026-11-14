/**
 * ACT1113F · cuándo se cambia a la build publicada, qué build corre cada aparato y cómo lo dicen los registros.
 *   NODE_ENV=test npx vitest run src/lib/pwa/__tests__/cambio-de-build.test.ts
 */
import { afterEach, describe, expect, it } from "vitest";

import { anotarLlamada, fijarSumideroDiagnostico } from "@/lib/llamadas/voz-datos/diagnostico";
import { aparatoDesde, combinarAparato, sanearAparato } from "@/lib/neurons/aparato-registro";
import { buildCorriendo, etiquetaBuild, leerBuild } from "@/lib/pwa/build-corriendo";
import { decidirCambioBuild, type EntradaDecisionBuild, TOPE_RECARGAS_SESION } from "@/lib/pwa/decision-build";

import { montarSW } from "./sw-entorno-prueba";

const base: EntradaDecisionBuild = {
    corriendo: "viejo-aaaaaa", publicada: "nuevo-bbbbbb", enLlamada: false, escribiendo: false, enLinea: true,
    recargasEstaSesion: 0, topeRecargas: TOPE_RECARGAS_SESION,
};

describe("decidirCambioBuild", () => {
    it("si la que corre es la publicada, o falta un dato, no hace nada", () => {
        expect(decidirCambioBuild({ ...base, corriendo: "nuevo-bbbbbb" })).toBe("al-dia");
        expect(decidirCambioBuild({ ...base, corriendo: null })).toBe("al-dia");
        expect(decidirCambioBuild({ ...base, publicada: null })).toBe("al-dia");
    });
    it("si difiere y es seguro, aplica", () => {
        expect(decidirCambioBuild(base)).toBe("aplicar");
    });
    it("nunca durante una llamada: espera", () => {
        expect(decidirCambioBuild({ ...base, enLlamada: true })).toBe("esperar-llamada");
    });
    it("nunca con texto sin enviar: espera", () => {
        expect(decidirCambioBuild({ ...base, escribiendo: true })).toBe("esperar-escritura");
    });
    it("sin red no cambia y no insiste (sigue con lo que tiene)", () => {
        expect(decidirCambioBuild({ ...base, enLinea: false })).toBe("esperar-red");
    });
    it("el tope de recargas por sesión corta cualquier bucle, incluso si es seguro", () => {
        expect(decidirCambioBuild({ ...base, recargasEstaSesion: TOPE_RECARGAS_SESION })).toBe("tope");
        expect(decidirCambioBuild({ ...base, recargasEstaSesion: TOPE_RECARGAS_SESION - 1 })).toBe("aplicar");
    });
    it("llamada y escritura a la vez: la llamada manda", () => {
        expect(decidirCambioBuild({ ...base, enLlamada: true, escribiendo: true })).toBe("esperar-llamada");
    });
});

describe("build corriendo", () => {
    it("sanea id y sha; el sha se acorta a 10", () => {
        expect(leerBuild("mwfli3jt-ctfbyg", "fbbcb6794a1234567890")).toEqual({ build: "mwfli3jt-ctfbyg", sha: "fbbcb6794a" });
        expect(leerBuild("../x y", "zz")).toEqual({ build: null, sha: null });
        expect(leerBuild("", undefined)).toEqual({ build: null, sha: null });
    });
    it("la etiqueta es build/sha y «desconocida» sin id", () => {
        expect(etiquetaBuild({ build: "mwfli3jt-ctfbyg", sha: "fbbcb6794a" })).toBe("mwfli3jt-ctfbyg/fbbcb6794a");
        expect(etiquetaBuild({ build: "mwfli3jt-ctfbyg", sha: null })).toBe("mwfli3jt-ctfbyg");
        expect(etiquetaBuild({ build: null, sha: null })).toBe("desconocida");
    });
    it("lee lo que next.config mete en el cliente", () => {
        const a = process.env.NEXT_PUBLIC_BUILD_ID, b = process.env.NEXT_PUBLIC_BUILD_SHA;
        process.env.NEXT_PUBLIC_BUILD_ID = "mwfli3jt-ctfbyg";
        process.env.NEXT_PUBLIC_BUILD_SHA = "fbbcb6794a";
        expect(etiquetaBuild(buildCorriendo())).toBe("mwfli3jt-ctfbyg/fbbcb6794a");
        process.env.NEXT_PUBLIC_BUILD_ID = a ?? ""; process.env.NEXT_PUBLIC_BUILD_SHA = b ?? "";
    });
});

describe("registros que dicen la build", () => {
    afterEach(() => fijarSumideroDiagnostico(null));
    it("«inicio» y «fin» llevan web=<build>/<sha>; los demás hitos no", () => {
        process.env.NEXT_PUBLIC_BUILD_ID = "mwfli3jt-ctfbyg";
        process.env.NEXT_PUBLIC_BUILD_SHA = "fbbcb6794a";
        const v: string[] = [];
        fijarSumideroDiagnostico((l) => v.push(`${l.hito} ${l.detalle}`));
        anotarLlamada("inicio", null, "paso=timbre ok");
        anotarLlamada("fin", null, 'por=colgar motivo="x" contestada=si dur-s=8 canales=1');
        anotarLlamada("camara", null, "algo");
        expect(v[0]).toBe("inicio paso=timbre ok web=mwfli3jt-ctfbyg/fbbcb6794a");
        expect(v[1]).toBe('fin por=colgar motivo="x" contestada=si dur-s=8 canales=1 web=mwfli3jt-ctfbyg/fbbcb6794a');
        expect(v[2]).toBe("camara algo");
    });
    it("la neurona informa la build de su web en capabilities.aparato.web", () => {
        process.env.NEXT_PUBLIC_BUILD_ID = "mwfli3jt-ctfbyg";
        process.env.NEXT_PUBLIC_BUILD_SHA = "fbbcb6794a";
        const a = aparatoDesde({ medio: "pwa", ahora: 0 });
        expect(a.web).toBe("mwfli3jt-ctfbyg/fbbcb6794a");
        expect(sanearAparato({ web: "no valido!" })).toBeNull();
        expect(combinarAparato({ v: 1, web: "viejo-aaaaaa" }, a)?.web).toBe("mwfli3jt-ctfbyg/fbbcb6794a");
    });
});

describe("sw-v8 · el cambio de build", () => {
    it("SKIP_WAITING activa ya el worker en espera (una vez por mensaje)", async () => {
        const s = montarSW({ servidor: () => new Response("no", { status: 404 }) });
        expect(s.estado.saltos).toBe(0);
        await s.mensaje("SKIP_WAITING");
        expect(s.estado.saltos).toBe(1);
        await s.mensaje("otra-cosa");
        expect(s.estado.saltos).toBe(1);
    });
});
