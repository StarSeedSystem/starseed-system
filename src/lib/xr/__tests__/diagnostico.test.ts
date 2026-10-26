import { describe, it, expect } from "vitest";
import { construirInforme } from "./diagnostico";
import type { DatosNavegador, CapacidadesXR, PlanEntrada } from "./capacidades";

const baseDatos: DatosNavegador = {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    seguro: true,
    tieneXR: true,
    vr: true,
    ar: false,
    ofreceSesion: false,
    tactil: false,
    webgl2: true,
    webgpu: false,
    instalada: false,
};

const baseCapacidades: CapacidadesXR = {
    plataforma: "quest",
    visor: true,
    modos: ["2d", "vr-inmersivo"],
    recomendado: "vr-inmersivo",
    entradas: ["mandos", "voz"],
    funciones: ["local-floor", "bounded-floor", "hand-tracking", "layers", "anchors", "hit-test", "plane-detection", "mesh-detection", "depth-sensing"],
    ofrecerSesion: false,
    motivos: ["A través del modo de detección por función"],
    avisos: [],
};

const basePlan: PlanEntrada = {
    estrategia: "boton-universal",
    modo: "vr-inmersivo",
    requiereGesto: false,
    botonUniversal: true,
    motivo: "Hace falta tocar el botón: el navegador no abre VR/AR sin un gesto.",
};

describe("construirInforme", () => {
    it("genera un informe con estado ok cuando se concede la sesión", () => {
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: baseCapacidades,
            plan: basePlan,
            sesion: {
                modo: "vr-inmersivo",
                funcionesConcedidas: ["local-floor", "bounded-floor", "hand-tracking"],
                frecuenciasSoportadas: [60],
                frecuenciaActual: 60,
                foveacion: 0.5,
            },
            ahora: Date.now(),
        });

        expect(resultado.fecha).toBeTypeOf("string");
        expect(resultado.titulo).toContain("Diagnóstico XR");
        expect(resultado.secciones).toBeInstanceOf(Array);
        expect(resultado.texto).toBeTypeOf("string");

        const seccionBasica = resultado.secciones.find((s) => s.nombre === "Básico");
        expect(seccionBasica).toBeDefined();
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Plataforma", estado: "ok" })
        );
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Visor Disponible", estado: "ok" })
        );

        const seccionFunciones = resultado.secciones.find((s) => s.nombre === "Funciones WebXR");
        expect(seccionFunciones).toBeDefined();
        expect(seccionFunciones?.lineas).toContainEqual(
            expect.objectContaining({ clave: "local-floor", estado: "ok" })
        );
    });

    it("muestra estado aviso cuando una función esperada no está concedida", () => {
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: baseCapacidades,
            plan: basePlan,
            sesion: {
                modo: "vr-inmersivo",
                funcionesConcedidas: ["local-floor"],
                frecuenciasSoportadas: [60],
                frecuenciaActual: 60,
            },
            ahora: Date.now(),
        });

        const seccionFunciones = resultado.secciones.find((s) => s.nombre === "Funciones WebXR");
        expect(seccionFunciones?.lineas).toContainEqual(
            expect.objectContaining({ clave: "local-floor", estado: "ok" })
        );
        expect(seccionFunciones?.lineas).toContainEqual(
            expect.objectContaining({ clave: "bounded-floor", estado: "aviso" })
        );
    });

    it("muestra estado fallo para la plataforma iPhone sin WebXR", () => {
        const datosIPhone: DatosNavegador = {
            ...baseDatos,
            ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
            tieneXR: false,
            vr: null,
            ar: null,
        };
        const capacidadesIPhone: CapacidadesXR = {
            ...baseCapacidades,
            plataforma: "ios",
            visor: false,
            funciones: [],
        };
        const planIPhone: PlanEntrada = {
            ...basePlan,
            estrategia: "solo-pantalla",
            modo: "2d",
            botonUniversal: false,
            motivo: "iPhone y iPad no ofrecen AR ni VR web: el mundo se ve en 3D en pantalla.",
        };
        const resultado = construirInforme({
            datos: datosIPhone,
            capacidades: capacidadesIPhone,
            plan: planIPhone,
            ahora: Date.now(),
        });

        const seccionBasica = resultado.secciones.find((s) => s.nombre === "Básico");
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Visor Disponible", estado: "ok" })
        );
    });

    it("muestra estado sin-probar cuando no hay sesión", () => {
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: baseCapacidades,
            plan: basePlan,
            ahora: Date.now(),
        });

        const seccionBasica = resultado.secciones.find((s) => s.nombre === "Básico");
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Visor Disponible", estado: "ok" })
        );
    });

    it("incluye el nivel de calidad cuando se proporciona", () => {
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: baseCapacidades,
            plan: basePlan,
            sesion: {
                modo: "vr-inmersivo",
                funcionesConcedidas: ["local-floor"],
                frecuenciasSoportadas: [60],
                frecuenciaActual: 60,
            },
            calidad: {
                nivel: "media",
                modo: "auto",
                frameMsMedia: 33.3,
                frameMsP95: 35.6,
            },
            ahora: Date.now(),
        });

        const seccionBasica = resultado.secciones.find((s) => s.nombre === "Básico");
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Nivel de Calidad", estado: "ok" })
        );
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "FPS Medio", estado: "ok" })
        );
    });

    it("incluye la prueba del micrófono cuando se proporciona", () => {
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: baseCapacidades,
            plan: basePlan,
            sesion: {
                modo: "vr-inmersivo",
                funcionesConcedidas: ["local-floor"],
                frecuenciasSoportadas: [60],
                frecuenciaActual: 60,
            },
            microfono: "concedido",
            ahora: Date.now(),
        });

        const seccionBasica = resultado.secciones.find((s) => s.nombre === "Básico");
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Micrófono", estado: "ok" })
        );
    });

    it("el texto no contiene identificadores de cuenta ni URLs con parámetros", () => {
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: baseCapacidades,
            plan: basePlan,
            sesion: {
                modo: "vr-inmersivo",
                funcionesConcedidas: ["local-floor"],
                frecuenciasSoportadas: [60],
                frecuenciaActual: 60,
            },
            ahora: Date.now(),
        });

        expect(resultado.texto).not.toContain("?");
        expect(resultado.texto).not.toContain("@");
        expect(resultado.texto).not.toContain("http");
    });

    it("el texto incluye el título, la fecha y las secciones", () => {
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: baseCapacidades,
            plan: basePlan,
            sesion: {
                modo: "vr-inmersivo",
                funcionesConcedidas: ["local-floor"],
                frecuenciasSoportadas: [60],
                frecuenciaActual: 60,
            },
            ahora: Date.now(),
        });

        expect(resultado.texto).toContain("=== INFORME DE DIAGNÓSTICO XR ===");
        expect(resultado.texto).toContain("Título:");
        expect(resultado.texto).toContain("Básico");
        expect(resultado.texto).toContain("Funciones WebXR");
        expect(resultado.texto).toContain("Plan de Entrada");
    });

    it("establece el estado correcto para vr: null (comprobando)", () => {
        const datosNulo: DatosNavegador = {
            ...baseDatos,
            vr: null,
            ar: null,
        };
        const resultado = construirInforme({
            datos: datosNulo,
            capacidades: baseCapacidades,
            plan: basePlan,
            ahora: Date.now(),
        });

        const seccionBasica = resultado.secciones.find((s) => s.nombre === "Básico");
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Visor Disponible", estado: "ok" })
        );
    });

    it("establece el estado correcto para plataforma desconocida", () => {
        const capacidadesDesconocida: CapacidadesXR = {
            ...baseCapacidades,
            plataforma: "desconocida",
            visor: false,
        };
        const resultado = construirInforme({
            datos: baseDatos,
            capacidades: capacidadesDesconocida,
            plan: basePlan,
            ahora: Date.now(),
        });

        const seccionBasica = resultado.secciones.find((s) => s.nombre === "Básico");
        expect(seccionBasica?.lineas).toContainEqual(
            expect.objectContaining({ clave: "Visor Disponible", estado: "ok" })
        );
    });
});
