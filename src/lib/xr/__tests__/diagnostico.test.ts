import { describe, it, expect } from "vitest";
import { construirInforme, fechaIsolta, resumirDuraciones, type DatosInforme, type InformeDiagnostico } from "../diagnostico";
import { evaluarCapacidades, planificarEntrada, type DatosNavegador } from "../capacidades";

const QUEST: DatosNavegador = {
    ua: "Mozilla/5.0 (Android 10; Quest 3) AppleWebKit/537.36 OculusBrowser/39.2",
    seguro: true, tieneXR: true, vr: true, ar: true, ofreceSesion: false,
    tactil: false, webgl2: true, webgpu: true, instalada: false,
};
const IOS: DatosNavegador = {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1",
    seguro: true, tieneXR: false, vr: false, ar: false, ofreceSesion: false,
    tactil: true, webgl2: true, webgpu: false, instalada: false,
};

const datosDe = (d: DatosNavegador): DatosInforme => {
    const capacidades = evaluarCapacidades(d);
    return { datos: d, capacidades, plan: planificarEntrada(capacidades, { instalada: false }), ahora: 1_767_225_600_000 };
};

const SESION_QUEST = {
    modo: "vr-inmersivo",
    funcionesConcedidas: ["local-floor", "bounded-floor", "layers", "light-estimation"],
    frecuenciasSoportadas: [72, 90, 120], frecuenciaActual: 72, foveacion: 0.5,
};

/** Mapa «Sección·clave → línea» para assert cómodo. */
const linea = (i: InformeDiagnostico, clave: string) => {
    const buscada = i.secciones.flatMap((s) => s.lineas).find((l) => l.clave === clave);
    if (!buscada) throw new Error(`falta la línea ${clave}`);
    return buscada;
};

describe("diagnóstico XR · construirInforme", () => {
    it("Quest con enabledFeatures parcial: concedida ok, esperada sin conceder aviso, extra ok", () => {
        const informe = construirInforme({ ...datosDe(QUEST), sesion: SESION_QUEST });
        expect(linea(informe, "local-floor")).toMatchObject({ valor: "concedida", estado: "ok" });
        expect(linea(informe, "hand-tracking")).toMatchObject({ valor: "no concedida", estado: "aviso" });
        expect(linea(informe, "plane-detection")).toMatchObject({ valor: "no concedida", estado: "aviso" });
        expect(linea(informe, "light-estimation")).toMatchObject({ valor: "concedida (no la esperaba esta plataforma)", estado: "ok" });
    });

    it("iPhone sin WebXR no rompe: aviso honesto y sin excepciones", () => {
        const informe = construirInforme(datosDe(IOS));
        expect(linea(informe, "WebXR")).toMatchObject({ valor: "sin WebXR", estado: "aviso" });
        expect(linea(informe, "Plataforma")).toMatchObject({ valor: "ios", estado: "ok" });
        expect(informe.texto).toContain("sin WebXR");
    });

    it("sin sesión: los datos de sesión quedan sin-probar", () => {
        const informe = construirInforme(datosDe(QUEST));
        const sesion = informe.secciones.find((s) => s.nombre === "Sesión");
        if (!sesion) throw new Error("falta la sección Sesión");
        for (const l of sesion.lineas) expect(l.estado).toBe("sin-probar");
        expect(linea(informe, "Foveación")).toMatchObject({ valor: "sin probar", estado: "sin-probar" });
    });

    it("el texto no lleva el «?» de la URL ni «@» de identificadores", () => {
        const raro: DatosNavegador = { ...QUEST, ua: "Navegador?de prueba;fragmento@ria" };
        const informe = construirInforme({ ...datosDe(raro), sesion: { ...SESION_QUEST } });
        expect(informe.texto).not.toMatch(/[?@]/);
    });

    it("orden estable: las mismas entradas dan exactamente el mismo texto", () => {
        const a = construirInforme({ ...datosDe(QUEST), sesion: SESION_QUEST, microfono: "concedido" });
        const b = construirInforme({ ...datosDe(QUEST), sesion: SESION_QUEST, microfono: "concedido" });
        expect(b.texto).toBe(a.texto);
    });

    it("vr: null (comprobando) sale sin-probar y se dice en el valor", () => {
        const d: DatosNavegador = { ...QUEST, vr: null, ar: null };
        const informe = construirInforme(datosDe(d));
        expect(linea(informe, "VR inmersiva")).toMatchObject({ estado: "sin-probar" });
        expect(linea(informe, "VR inmersiva").valor).toContain("comprobando");
        expect(linea(informe, "AR passthrough")).toMatchObject({ estado: "sin-probar" });
    });
});

describe("diagnóstico XR · estados y medidas", () => {
    it("micrófono: concedido ok, denegado fallo", () => {
        const ok = construirInforme({ ...datosDe(QUEST), microfono: "concedido" });
        const no = construirInforme({ ...datosDe(QUEST), microfono: "denegado" });
        expect(linea(ok, "Micrófono")).toMatchObject({ estado: "ok" });
        expect(linea(no, "Micrófono")).toMatchObject({ valor: "denegado por el navegador", estado: "fallo" });
    });

    it("sin medir fotogramas: calidad sin-probar; con medida, más del presupuesto avisa", () => {
        const sinMedir = construirInforme({ ...datosDe(QUEST), sesion: SESION_QUEST, calidad: { nivel: "media", modo: "auto" } });
        expect(linea(sinMedir, "Fotograma medio")).toMatchObject({ estado: "sin-probar" });
        const lento = construirInforme({
            ...datosDe(QUEST), sesion: SESION_QUEST,
            calidad: { nivel: "media", modo: "auto", frameMsMedia: 20, frameMsP95: 15 },
        });
        expect(linea(lento, "Fotograma medio")).toMatchObject({ estado: "aviso" });
        expect(linea(lento, "Fotograma p95")).toMatchObject({ estado: "ok" });
    });

    it("el visor sin lista de refrescos se avisa, no se calla", () => {
        const informe = construirInforme({ ...datosDe(QUEST), sesion: { ...SESION_QUEST, frecuenciasSoportadas: [], frecuenciaActual: undefined } });
        expect(linea(informe, "Frecuencias soportadas")).toMatchObject({ estado: "aviso", valor: "el visor no las lista" });
        expect(linea(informe, "Frecuencia actual")).toMatchObject({ estado: "sin-probar" });
    });

    it("resumirDuraciones calcula media y p95 y ignora lo no finito", () => {
        expect(resumirDuraciones([16, 33, 18, 17, 16])).toEqual({ media: 20, p95: 33 });
        expect(resumirDuraciones([12])).toEqual({ media: 12, p95: 12 });
        expect(resumirDuraciones([])).toEqual({ media: 0, p95: 0 });
        expect(resumirDuraciones([10, Number.NaN, -5, 14])).toEqual({ media: 12, p95: 14 });
    });

    it("fechaIsolta formatea UTC sin `new Date`", () => {
        expect(fechaIsolta(0)).toBe("1970-01-01 00:00:00 UTC");
        expect(fechaIsolta(3_600_000)).toBe("1970-01-01 01:00:00 UTC");
        expect(construirInforme(datosDe(QUEST)).fecha).toBe("2026-01-01 00:00:00 UTC");
    });
});
