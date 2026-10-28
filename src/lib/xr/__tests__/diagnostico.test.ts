// Pruebas del informe puro del diagnóstico XR (XR1010AI · contrato §3 l). Node, sin red ni WebGL.
import { describe, expect, it } from "vitest";
import { construirInforme, fechaDe, mediaP95 } from "../diagnostico";
import { evaluarCapacidades, planificarEntrada, type DatosNavegador } from "../capacidades";

const base: DatosNavegador = { ua: "", seguro: true, tieneXR: true, vr: false, ar: false, ofreceSesion: false, tactil: false, webgl2: true, webgpu: false, instalada: false };
const QUEST = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const AHORA = new Date("2026-10-28T14:31:00Z").getTime();

// Quest 3 con VR y AR, plan estándar (botón universal), sin sesión y sin micrófono probado: la base del informe.
const QUEST0 = (): ReturnType<typeof preparar> => preparar({ ...base, ua: QUEST, vr: true, ar: true });
function preparar(d: DatosNavegador) {
    const capacidades = evaluarCapacidades(d);
    return { datos: d, capacidades, plan: planificarEntrada(capacidades, { instalada: d.instalada }) };
}

const notasDe = (informe: ReturnType<typeof construirInforme>, nombre: string) =>
    informe.secciones.find((s) => s.nombre === nombre)?.lineas ?? [];
const lineaDe = (informe: ReturnType<typeof construirInforme>, nombre: string, clave: string) =>
    notasDe(informe, nombre).find((l) => l.clave === clave);

describe("sección de funciones esperadas y concedidas", () => {
    it("una línea por cada función esperada en Quest; las no concedidas salen de aviso", () => {
        const informe = construirInforme({
            ...QUEST0(),
            sesion: { modo: "vr-inmersivo", funcionesConcedidas: ["local-floor", "hand-tracking", "layers"], frecuenciasSoportadas: [72, 90], frecuenciaActual: 72 },
            ahora: AHORA,
        });
        const notas = notasDe(informe, "Funciones esperadas y concedidas");
        // Quest espera 9 funciones: una línea por cada una. Sólo hubo 3 concedidas.
        expect(notas.length).toEqual(9);
        expect(notas.find((l) => l.clave === "local-floor")?.estado).toEqual("ok");
        expect(notas.find((l) => l.clave === "layers")?.estado).toEqual("ok");
        expect(notas.find((l) => l.clave === "plane-detection")?.estado).toEqual("aviso");
        expect(notas.find((l) => l.clave === "bounded-floor")?.estado).toEqual("aviso");
        const extra = notas.find((l) => l.clave === "Concedidas no esperadas");
        expect(extra === undefined || typeof extra.valor === "string").toBe(true);
    });
    it("sin sesión, cada función esperada queda sin probar (nunca se afirma sin medir)", () => {
        const informe = construirInforme({ ...QUEST0(), ahora: AHORA });
        for (const nota of notasDe(informe, "Funciones esperadas y concedidas")) {
            expect(nota.estado).toEqual("sin-probar");
            expect(nota.valor).toContain("sin probar");
        }
    });
});

describe("aparatos sin WebXR", () => {
    it("iPhone: informa sin WebXR sin romper y sin sección de funciones esperadas", () => {
        const informe = construirInforme({ ...preparar({ ...base, ua: IPHONE, tieneXR: false, vr: null, ar: null, tactil: true }), ahora: AHORA });
        expect(notasDe(informe, "Aparato").find((l) => l.clave === "WebXR")?.valor).toContain("sin WebXR");
        expect(lineaDe(informe, "Sesión", "Sesión inmersiva")?.valor).toContain("no hay WebXR");
        expect(informe.secciones.find((s) => s.nombre.startsWith("Funciones"))).toBeUndefined();
    });
    it("con los modos sin comprobar todavía (vr: null) dice comprobando, no se equivoca", () => {
        const informe = construirInforme({ ...preparar({ ...base, vr: null, ar: null }), ahora: AHORA });
        expect(lineaDe(informe, "Aparato", "VR")?.estado).toEqual("sin-probar");
        expect(lineaDe(informe, "Aparato", "VR")?.valor).toEqual("comprobando");
        expect(lineaDe(informe, "Aparato", "AR")?.estado).toEqual("sin-probar");
    });
});

describe("informe de texto plano (privacidad, §3 k)", () => {
    const informe = construirInforme({
        ...preparar({ ...base, ua: "Navegador curioso?manos=@estandar Firefox/140.0" }),
        sesion: { modo: "ar-passthrough", funcionesConcedidas: ["local-floor"], frecuenciasSoportadas: [90], frecuenciaActual: 90, foveacion: 0.5 },
        entradas: ["tracked-pointer 1", "tracked-pointer"],
        microfono: "sin-probar",
        ahora: AHORA,
    });
    it("no lleva el signo de URL con parámetros ni el de cuentas ni URLs ni claves", () => {
        expect(informe.texto).not.toContain("?");
        expect(informe.texto).not.toContain("@");
        expect(informe.texto.toLowerCase()).not.toContain("http");
        expect(informe.texto).not.toMatch(/sk-|Bearer\s/);
    });
    it("es plano y estable: mismas entradas, mismo texto en dos llamadas", () => {
        const informe2 = construirInforme({
            ...preparar({ ...base, ua: "Navegador curioso?manos=@estandar Firefox/140.0" }),
            sesion: { modo: "ar-passthrough", funcionesConcedidas: ["local-floor"], frecuenciasSoportadas: [90], frecuenciaActual: 90, foveacion: 0.5 },
            entradas: ["tracked-pointer 1", "tracked-pointer"],
            ahora: AHORA,
        });
        expect(informe2.texto).toEqual(informe.texto);
        expect(informe2.secciones.map((s) => s.nombre)).toEqual(["Aparato", "Plan de entrada", "Sesión", "Funciones esperadas y concedidas", "Calidad"]);
        expect(informe2.texto.startsWith("StarSeed XR · informe del visor")).toBe(true);
    });
});

describe("micrófono y medición de fotogramas", () => {
    it("el estado del micrófono es el que la persona dio (además: nunca se pide solo)", () => {
        const d = { ...QUEST0(), ahora: AHORA };
        expect(lineaDe(construirInforme(d), "Sesión", "Micrófono")?.estado).toEqual("sin-probar");
        expect(lineaDe(construirInforme({ ...d, microfono: "concedido" }), "Sesión", "Micrófono")?.estado).toEqual("ok");
        expect(lineaDe(construirInforme({ ...d, microfono: "denegado" }), "Sesión", "Micrófono")?.estado).toEqual("fallo");
    });
    it("el fotograma se mide con media y percentil 95 de pura aritmética", () => {
        expect(mediaP95([])).toEqual({ media: null, p95: null });
        expect(mediaP95([NaN, Infinity, -5])).toEqual({ media: null, p95: null });
        const { media, p95 } = mediaP95([16, 12, 20, 14, 18, 2000, 22, 24]);
        expect(media).toBeCloseTo((16 + 12 + 20 + 14 + 18 + 22 + 24) / 7, 6);
        expect(p95).toEqual(24);
    });
    it("la fecha viene del dato, no del reloj: hora UTC y sin reloj en el módulo", () => {
        expect(fechaDe(0)).toEqual("1970-01-01 00:00");
        expect(fechaDe(86_400_000)).toEqual("1970-01-02 00:00");
        expect(fechaDe(AHORA)).toEqual("2026-10-28 14:31");
        expect(construirInforme({ ...QUEST0(), ahora: AHORA }).fecha).toEqual("2026-10-28 14:31");
    });
});
