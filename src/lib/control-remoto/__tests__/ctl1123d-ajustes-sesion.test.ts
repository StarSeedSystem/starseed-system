/**
 * CTL1123D · pruebas de ajustes avanzados de sesión remota.
 * Solo funciones puras exportadas: entrada → salida, sin red, sin disco, sin reloj.
 */
import { describe, expect, it } from "vitest";
import {
    AJUSTES_DEFECTO,
    ajustesSeguros,
    AjustesSesion,
    CALIDAD_MAX,
    CALIDAD_MIN,
    CalidadJpeg,
    deserializarAjustes,
    FpsObjetivo,
    FPS_VALIDOS,
    LadoMaximo,
    LADOS_VALIDOS,
    ModoTeclado,
    MODOS_TECLADO_VALIDOS,
    normalizarCalidadJpeg,
    normalizarFps,
    normalizarLadoMaximo,
    normalizarModoTeclado,
    normalizarPerfilMultiantena,
    PerfilMultiantena,
    PERFILES_VALIDOS,
    serializarAjustes,
    validarAjustes,
    validarCalidadJpeg,
    validarFps,
    validarLadoMaximo,
    validarModoTeclado,
    validarPerfilMultiantena,
} from "../ajustes-sesion";

describe("CTL1123D · validadores de tipos", () => {
    describe("validarFps", () => {
        it("acepta solo los valores permitidos", () => {
            FPS_VALIDOS.forEach((f) => expect(validarFps(f)).toBe(true));
            expect(validarFps(10)).toBe(false);
            expect(validarFps(45)).toBe(false);
            expect(validarFps(60.5)).toBe(false);
            expect(validarFps("30")).toBe(false);
            expect(validarFps(null)).toBe(false);
        });
    });

    describe("validarLadoMaximo", () => {
        it("acepta solo los valores permitidos", () => {
            LADOS_VALIDOS.forEach((l) => expect(validarLadoMaximo(l)).toBe(true));
            expect(validarLadoMaximo(500)).toBe(false);
            expect(validarLadoMaximo(1920.5)).toBe(false);
            expect(validarLadoMaximo("1080")).toBe(false);
            expect(validarLadoMaximo(null)).toBe(false);
        });
    });

    describe("validarCalidadJpeg", () => {
        it("acepta enteros entre 40 y 90 inclusive", () => {
            expect(validarCalidadJpeg(CALIDAD_MIN)).toBe(true);
            expect(validarCalidadJpeg(CALIDAD_MAX)).toBe(true);
            expect(validarCalidadJpeg(70)).toBe(true);
            expect(validarCalidadJpeg(39)).toBe(false);
            expect(validarCalidadJpeg(91)).toBe(false);
            expect(validarCalidadJpeg(70.5)).toBe(false);
            expect(validarCalidadJpeg("70")).toBe(false);
            expect(validarCalidadJpeg(null)).toBe(false);
        });
    });

    describe("validarPerfilMultiantena", () => {
        it("acepta solo los perfiles permitidos", () => {
            PERFILES_VALIDOS.forEach((p) => expect(validarPerfilMultiantena(p)).toBe(true));
            expect(validarPerfilMultiantena("otro")).toBe(false);
            expect(validarPerfilMultiantena(123)).toBe(false);
            expect(validarPerfilMultiantena(null)).toBe(false);
        });
    });

    describe("validarModoTeclado", () => {
        it("acepta solo los modos permitidos", () => {
            MODOS_TECLADO_VALIDOS.forEach((m) => expect(validarModoTeclado(m)).toBe(true));
            expect(validarModoTeclado("otro")).toBe(false);
            expect(validarModoTeclado(123)).toBe(false);
            expect(validarModoTeclado(null)).toBe(false);
        });
    });
});

describe("CTL1123D · normalizadores con valores por defecto", () => {
    describe("normalizarFps", () => {
        it("devuelve el valor si es válido", () => {
            expect(normalizarFps(24)).toBe(24);
            expect(normalizarFps(60)).toBe(60);
        });
        it("devuelve el defecto si es inválido", () => {
            expect(normalizarFps(10)).toBe(AJUSTES_DEFECTO.fpsObjetivo);
            expect(normalizarFps("30")).toBe(AJUSTES_DEFECTO.fpsObjetivo);
            expect(normalizarFps(null)).toBe(AJUSTES_DEFECTO.fpsObjetivo);
            expect(normalizarFps(undefined)).toBe(AJUSTES_DEFECTO.fpsObjetivo);
        });
        it("permite sobrescribir el defecto", () => {
            expect(normalizarFps(10, 15)).toBe(15);
            expect(normalizarFps(null, 24)).toBe(24);
        });
    });

    describe("normalizarLadoMaximo", () => {
        it("devuelve el valor si es válido", () => {
            expect(normalizarLadoMaximo(720)).toBe(720);
            expect(normalizarLadoMaximo(1920)).toBe(1920);
        });
        it("devuelve el defecto si es inválido", () => {
            expect(normalizarLadoMaximo(500)).toBe(AJUSTES_DEFECTO.ladoMaximo);
            expect(normalizarLadoMaximo("1080")).toBe(AJUSTES_DEFECTO.ladoMaximo);
            expect(normalizarLadoMaximo(null)).toBe(AJUSTES_DEFECTO.ladoMaximo);
        });
        it("permite sobrescribir el defecto", () => {
            expect(normalizarLadoMaximo(500, 720)).toBe(720);
        });
    });

    describe("normalizarCalidadJpeg", () => {
        it("devuelve el valor si es válido", () => {
            expect(normalizarCalidadJpeg(60)).toBe(60);
            expect(normalizarCalidadJpeg(CALIDAD_MIN)).toBe(CALIDAD_MIN);
            expect(normalizarCalidadJpeg(CALIDAD_MAX)).toBe(CALIDAD_MAX);
        });
        it("usa defecto para enteros fuera de rango", () => {
            expect(normalizarCalidadJpeg(30)).toBe(AJUSTES_DEFECTO.calidadJpeg);
            expect(normalizarCalidadJpeg(100)).toBe(AJUSTES_DEFECTO.calidadJpeg);
        });
        it("devuelve el defecto para no enteros o no numéricos", () => {
            expect(normalizarCalidadJpeg(60.5)).toBe(AJUSTES_DEFECTO.calidadJpeg);
            expect(normalizarCalidadJpeg("70")).toBe(AJUSTES_DEFECTO.calidadJpeg);
            expect(normalizarCalidadJpeg(null)).toBe(AJUSTES_DEFECTO.calidadJpeg);
        });
        it("permite sobrescribir el defecto", () => {
            expect(normalizarCalidadJpeg(30, 50 as CalidadJpeg)).toBe(50);
            expect(normalizarCalidadJpeg(null, 80 as CalidadJpeg)).toBe(80);
        });
    });

    describe("normalizarPerfilMultiantena", () => {
        it("devuelve el valor si es válido", () => {
            expect(normalizarPerfilMultiantena("baja-latencia")).toBe("baja-latencia");
            expect(normalizarPerfilMultiantena("ahorro")).toBe("ahorro");
        });
        it("devuelve el defecto si es inválido", () => {
            expect(normalizarPerfilMultiantena("rapido")).toBe(AJUSTES_DEFECTO.perfilMultiantena);
            expect(normalizarPerfilMultiantena(123)).toBe(AJUSTES_DEFECTO.perfilMultiantena);
            expect(normalizarPerfilMultiantena(null)).toBe(AJUSTES_DEFECTO.perfilMultiantena);
        });
        it("permite sobrescribir el defecto", () => {
            expect(normalizarPerfilMultiantena("rapido", "baja-latencia")).toBe("baja-latencia");
        });
    });

    describe("normalizarModoTeclado", () => {
        it("devuelve el valor si es válido", () => {
            expect(normalizarModoTeclado("mensaje")).toBe("mensaje");
            expect(normalizarModoTeclado("tiempo-real")).toBe("tiempo-real");
        });
        it("devuelve el defecto si es inválido", () => {
            expect(normalizarModoTeclado("inmediato")).toBe(AJUSTES_DEFECTO.modoTeclado);
            expect(normalizarModoTeclado(123)).toBe(AJUSTES_DEFECTO.modoTeclado);
            expect(normalizarModoTeclado(null)).toBe(AJUSTES_DEFECTO.modoTeclado);
        });
        it("permite sobrescribir el defecto", () => {
            expect(normalizarModoTeclado("inmediato", "mensaje")).toBe("mensaje");
        });
    });
});

describe("CTL1123D · validarAjustes (objeto parcial → ajustes completos)", () => {
    it("objeto vacío devuelve los defectos", () => {
        const r = validarAjustes({});
        expect(r).toEqual(AJUSTES_DEFECTO);
    });

    it("sobrescribe solo los campos proporcionados", () => {
        const r = validarAjustes({ fpsObjetivo: 60 as FpsObjetivo, calidadJpeg: 85 as CalidadJpeg });
        expect(r.fpsObjetivo).toBe(60);
        expect(r.calidadJpeg).toBe(85);
        expect(r.ladoMaximo).toBe(AJUSTES_DEFECTO.ladoMaximo);
        expect(r.perfilMultiantena).toBe(AJUSTES_DEFECTO.perfilMultiantena);
        expect(r.modoTeclado).toBe(AJUSTES_DEFECTO.modoTeclado);
    });

    it("normaliza valores inválidos a sus defectos", () => {
        const r = validarAjustes({ fpsObjetivo: 10 as FpsObjetivo, ladoMaximo: 500 as LadoMaximo, calidadJpeg: 200 as CalidadJpeg, perfilMultiantena: "x" as PerfilMultiantena, modoTeclado: "y" as ModoTeclado });
        expect(r).toEqual(AJUSTES_DEFECTO);
    });

    it("usa defecto para calidadJpeg fuera de rango (entero pero inválido)", () => {
        const r = validarAjustes({ calidadJpeg: 30 as CalidadJpeg });
        expect(r.calidadJpeg).toBe(AJUSTES_DEFECTO.calidadJpeg);
        const r2 = validarAjustes({ calidadJpeg: 95 as CalidadJpeg });
        expect(r2.calidadJpeg).toBe(AJUSTES_DEFECTO.calidadJpeg);
    });

    it("acepta calidadJpeg válida dentro del rango", () => {
        const r = validarAjustes({ calidadJpeg: 60 as CalidadJpeg });
        expect(r.calidadJpeg).toBe(60);
        const r2 = validarAjustes({ calidadJpeg: CALIDAD_MIN as CalidadJpeg });
        expect(r2.calidadJpeg).toBe(CALIDAD_MIN);
        const r3 = validarAjustes({ calidadJpeg: CALIDAD_MAX as CalidadJpeg });
        expect(r3.calidadJpeg).toBe(CALIDAD_MAX);
    });
});

describe("CTL1123D · serialización y deserialización segura", () => {
    it("serializarAjustes produce JSON válido con todos los campos", () => {
        const s = serializarAjustes(AJUSTES_DEFECTO);
        const obj = JSON.parse(s);
        expect(obj.fpsObjetivo).toBe(30);
        expect(obj.ladoMaximo).toBe(1280);
        expect(obj.calidadJpeg).toBe(70);
        expect(obj.perfilMultiantena).toBe("auto-simultaneo");
        expect(obj.modoTeclado).toBe("ambos");
    });

    it("deserializarAjustes reconstruye ajustes válidos", () => {
        const s = serializarAjustes({ ...AJUSTES_DEFECTO, fpsObjetivo: 60, calidadJpeg: 90 as CalidadJpeg });
        const r = deserializarAjustes(s);
        expect(r).not.toBeNull();
        expect(r?.fpsObjetivo).toBe(60);
        expect(r?.calidadJpeg).toBe(90);
    });

    it("deserializarAjustes devuelve null para JSON inválido", () => {
        expect(deserializarAjustes("no es json")).toBeNull();
        expect(deserializarAjustes("")).toBeNull();
        expect(deserializarAjustes("{")).toBeNull();
    });

    it("deserializarAjustes devuelve null para valores JSON que no son objetos", () => {
        expect(deserializarAjustes("null")).toBeNull();
        expect(deserializarAjustes("123")).toBeNull();
        expect(deserializarAjustes('"string"')).toBeNull();
        expect(deserializarAjustes("[]")).toBeNull();
    });

    it("deserializarAjustes normaliza campos inválidos a sus defectos", () => {
        const r = deserializarAjustes('{"fpsObjetivo": 10, "calidadJpeg": 200}');
        expect(r).not.toBeNull();
        expect(r?.fpsObjetivo).toBe(AJUSTES_DEFECTO.fpsObjetivo);
        expect(r?.calidadJpeg).toBe(AJUSTES_DEFECTO.calidadJpeg);
    });

    it("round-trip: serializar → deserializar mantiene los valores", () => {
        const original = { ...AJUSTES_DEFECTO, fpsObjetivo: 24 as FpsObjetivo, ladoMaximo: 1920 as LadoMaximo, calidadJpeg: 80 as CalidadJpeg, perfilMultiantena: "baja-latencia" as PerfilMultiantena, modoTeclado: "tiempo-real" as ModoTeclado };
        const s = serializarAjustes(original);
        const r = deserializarAjustes(s);
        expect(r).toEqual(original);
    });
});

describe("CTL1123D · ajustesSeguros (copia inmutable)", () => {
    it("devuelve un objeto con los mismos valores", () => {
        const a = { ...AJUSTES_DEFECTO, fpsObjetivo: 60 as FpsObjetivo, calidadJpeg: 85 as CalidadJpeg };
        const s = ajustesSeguros(a);
        expect(s).toEqual(a);
        expect(s).not.toBe(a); // distinta referencia
    });

    it("modificar el resultado no afecta al original", () => {
        const a = { ...AJUSTES_DEFECTO };
        const s = ajustesSeguros(a);
        (s as AjustesSesion).fpsObjetivo = 15;
        expect(a.fpsObjetivo).toBe(30);
    });
});

describe("CTL1123D · constantes exportadas", () => {
    it("FPS_VALIDOS contiene exactamente 15, 24, 30, 60", () => {
        expect(FPS_VALIDOS).toEqual([15, 24, 30, 60]);
    });
    it("LADOS_VALIDOS contiene exactamente 720, 1080, 1280, 1920", () => {
        expect(LADOS_VALIDOS).toEqual([720, 1080, 1280, 1920]);
    });
    it("PERFILES_VALIDOS contiene los tres perfiles", () => {
        expect(PERFILES_VALIDOS).toEqual(["auto-simultaneo", "baja-latencia", "ahorro"]);
    });
    it("MODOS_TECLADO_VALIDOS contiene los tres modos", () => {
        expect(MODOS_TECLADO_VALIDOS).toEqual(["mensaje", "tiempo-real", "ambos"]);
    });
    it("CALIDAD_MIN y CALIDAD_MAX son 40 y 90", () => {
        expect(CALIDAD_MIN).toBe(40);
        expect(CALIDAD_MAX).toBe(90);
    });
    it("AJUSTES_DEFECTO tiene la forma esperada", () => {
        expect(AJUSTES_DEFECTO).toEqual({
            fpsObjetivo: 30,
            ladoMaximo: 1280,
            calidadJpeg: 70 as CalidadJpeg,
            perfilMultiantena: "auto-simultaneo",
            modoTeclado: "ambos",
        });
    });
});