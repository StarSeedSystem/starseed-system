/**
 * XR1010Z · avatares por nivel. Todo con cargadores falsos: sin red, sin WebGL, sin disco.
 * describe/it/expect de "vitest" (globals: false). Solo funciones puras de `cargar-vrm`.
 */
import { describe, expect, it } from "vitest";
import type { Object3D } from "three";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";
import {
    elegirAvatar,
    cargarVrm,
    techoVrmBytes,
    urlVrmSegura,
    TECHO_VRM_BYTES,
    TECHO_VRM_LIGERO_BYTES,
    MB,
    type CargadoresVrm,
    type EventoProgreso,
    type GltfCargado,
} from "../cargar-vrm";

const pref = (vrmUrl: string) => ({ vrmUrl });
const https = "https://starseed-os.vercel.app/avatares/ana.vrm";
const escena = { esCara: false } as unknown as Object3D;

function falsosCargadores(opciones: { como?: (on: (e: EventoProgreso) => void) => void; resultado?: () => GltfCargado }): CargadoresVrm {
    const raiz = (opciones.resultado ?? (() => ({ scene: escena })))();
    return {
        GLTFLoader: class {
            loadAsync(_url: string, onProgress?: (e: EventoProgreso) => void) {
                if (opciones.como) opciones.como(onProgress ?? (() => {}));
                return Promise.resolve(raiz);
            }
        },
        VRMLoaderPlugin: class { constructor(_parser: unknown) {} },
    };
}

describe("elegirAvatar por nivel", () => {
    const niveles: NivelCalidad[] = ["minima", "baja", "media", "alta", "maxima"];
    const esperado = { minima: "orbe-manos", baja: "cabeza-manos", media: "vrm", alta: "vrm", maxima: "vrm" } as const;
    it("cada nivel da su forma con preferencia y URL segura", () => {
        for (const n of niveles) expect(elegirAvatar(n, pref(https), 0)).toBe(esperado[n]);
    });
    it("sin preferencia, media y arriba se degradan a cabeza + manos; mínima nunca sube", () => {
        expect(elegirAvatar("media", null, 0)).toBe("cabeza-manos");
        expect(elegirAvatar("maxima", {}, 0)).toBe("cabeza-manos");
        expect(elegirAvatar("minima", pref(https), 0)).toBe("orbe-manos");
        expect(elegirAvatar("baja", pref(https), 0)).toBe("cabeza-manos");
    });
});

describe("reparto de VRM con 30 jugadores (contrato §3 h)", () => {
    it("en media, los 12 más cercanos llevan VRM y los otros 18 cabeza + manos", () => {
        let conVrm = 0;
        for (let i = 0; i < 30; i++) if (elegirAvatar("media", pref(https), i) === "vrm") conVrm++;
        expect(PERFILES.media.jugadoresVisibles).toBe(12);
        expect(conVrm).toBe(12);
    });
});

describe("urlVrmSegura", () => {
    it("https sin credenciales pasa; http, file://, credenciales y vacío se rechazan (y degradan)", () => {
        expect(urlVrmSegura(https)).toBe(true);
        expect(urlVrmSegura("http://starseed-os.vercel.app/ana.vrm")).toBe(false);
        expect(urlVrmSegura("https://user:pass@starseed-os.vercel.app/ana.vrm")).toBe(false);
        expect(urlVrmSegura("file:///ana.vrm")).toBe(false);
        expect(urlVrmSegura("")).toBe(false);
        expect(elegirAvatar("alta", pref("http://x/ana.vrm"), 0)).toBe("cabeza-manos");
    });
});

describe("techoVrmBytes", () => {
    it("10 MB en media (vrm-ligero), 25 MB en alta y máxima, 0 en mínima y baja", () => {
        expect(techoVrmBytes("media")).toBe(TECHO_VRM_LIGERO_BYTES);
        expect(techoVrmBytes("alta")).toBe(TECHO_VRM_BYTES);
        expect(techoVrmBytes("maxima")).toBe(TECHO_VRM_BYTES);
        expect(techoVrmBytes("minima")).toBe(0);
        expect(techoVrmBytes("baja")).toBe(0);
    });
});

describe("cargarVrm", () => {
    it("rechaza la URL insegura sin intentarlo", async () => {
        let intento = false;
        const r = await cargarVrm("http://x/ana.vrm", falsosCargadores({ como: () => { intento = true; } }), "media");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("https");
        expect(intento).toBe(false);
    });
    it("nivel mínima no carga VRM y lo dice de forma humana", async () => {
        let intento = false;
        const r = await cargarVrm(https, falsosCargadores({ como: () => { intento = true; } }), "minima");
        expect([r.ok, intento]).toEqual([false, false]);
        if (!r.ok) expect(r.motivo).toContain("no carga avatares VRM");
    });
    it("archivo demasiado grande: rechazado con el motivo del tamaño", async () => {
        const r = await cargarVrm(https, falsosCargadores({ como: (on) => on({ loaded: 12 * MB, total: 12 * MB }) }), "media");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("12 MB");
    });
    it("dentro del techo justo pasa: 9,5 MB en media no tumba el avatar", async () => {
        const r = await cargarVrm(https, falsosCargadores({ como: (on) => on({ loaded: TECHO_VRM_LIGERO_BYTES - 1024 }) }), "media");
        expect(r.ok).toBe(true);
    });
    it("un cargador falso que lanza devuelve { ok: false } sin romper nada", async () => {
        const rotos: CargadoresVrm = {
            GLTFLoader: class { loadAsync(): Promise<GltfCargado> { throw new Error("sin red"); } },
            VRMLoaderPlugin: class { constructor(_p: unknown) {} },
        };
        const r = await cargarVrm(https, rotos, "media");
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("sin red");
    });
    it("camino feliz: devuelve la raíz del VRM", async () => {
        const r = await cargarVrm(https, falsosCargadores({ resultado: () => ({ scene: escena }) }), "alta");
        expect(r.ok).toBe(true);
    });
});
