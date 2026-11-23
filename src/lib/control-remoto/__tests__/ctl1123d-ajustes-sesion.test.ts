/**
 * CTL1123D · pruebas de ajustes avanzados de sesión remota.
 * Solo funciones puras exportadas: entrada → salida, sin red, sin disco, sin reloj.
 */
import { describe, expect, it } from "vitest";
import {
    AJUSTES_SESION_DEFECTO,
    normalizarFps,
    normalizarLadoMaximo,
    normalizarCalidadJpeg,
    normalizarPerfilMultiantena,
    normalizarModoTeclado,
    normalizarAjustesSesion,
    sonAjustesValidos,
    ajustesASerializables,
    ajustesDesdeSerializables,
    fusionarAjustes,
    descripcionAjustes,
    type AjustesSesion,
    type FpsObjetivo,
    type LadoMaximo,
    type CalidadJpeg,
    type PerfilMultiantena,
    type ModoTeclado,
} from "../ajustes-sesion";

describe("CTL1123D · normalizadores individuales", () => {
    describe("normalizarFps", () => {
        it("valores válidos se mantienen", () => {
            expect(normalizarFps(15)).toBe(15);
            expect(normalizarFps(24)).toBe(24);
            expect(normalizarFps(30)).toBe(30);
            expect(normalizarFps(60)).toBe(60);
        });

        it("valores cercanos se redondean al válido más próximo", () => {
            expect(normalizarFps(14)).toBe(15);
            expect(normalizarFps(16)).toBe(15);
            expect(normalizarFps(23)).toBe(24);
            expect(normalizarFps(25)).toBe(24);
            expect(normalizarFps(29)).toBe(30);
            expect(normalizarFps(31)).toBe(30);
            expect(normalizarFps(59)).toBe(60);
            expect(normalizarFps(61)).toBe(60);
        });

        it("valores lejanos eligen el más cercano", () => {
            expect(normalizarFps(0)).toBe(15);
            expect(normalizarFps(100)).toBe(60);
            expect(normalizarFps(45)).toBe(30); // 45 está a 15 de 30 y 15 de 60, el primero gana
        });

        it("no-números devuelven el defecto (30)", () => {
            expect(normalizarFps("30")).toBe(30);
            expect(normalizarFps(null)).toBe(30);
            expect(normalizarFps(undefined)).toBe(30);
            expect(normalizarFps(NaN)).toBe(30);
            expect(normalizarFps(Infinity)).toBe(30);
        });

        it("permite defecto personalizado", () => {
            expect(normalizarFps("x", 60)).toBe(60);
            expect(normalizarFps(null, 24)).toBe(24);
        });
    });

    describe("normalizarLadoMaximo", () => {
        it("valores válidos se mantienen", () => {
            expect(normalizarLadoMaximo(720)).toBe(720);
            expect(normalizarLadoMaximo(1080)).toBe(1080);
            expect(normalizarLadoMaximo(1280)).toBe(1280);
            expect(normalizarLadoMaximo(1920)).toBe(1920);
        });

        it("valores cercanos se redondean al válido más próximo", () => {
            expect(normalizarLadoMaximo(700)).toBe(720);
            expect(normalizarLadoMaximo(740)).toBe(720);
            expect(normalizarLadoMaximo(1000)).toBe(1080);
            expect(normalizarLadoMaximo(1200)).toBe(1280);
            expect(normalizarLadoMaximo(1700)).toBe(1920);
        });

        it("no-números devuelven el defecto (1280)", () => {
            expect(normalizarLadoMaximo("1280")).toBe(1280);
            expect(normalizarLadoMaximo(null)).toBe(1280);
            expect(normalizarLadoMaximo(NaN)).toBe(1280);
        });
    });

    describe("normalizarCalidadJpeg", () => {
        it("valores en rango 40–90 se mantienen (entero)", () => {
            expect(normalizarCalidadJpeg(40)).toBe(40);
            expect(normalizarCalidadJpeg(70)).toBe(70);
            expect(normalizarCalidadJpeg(90)).toBe(90);
        });

        it("decimales se redondean", () => {
            expect(normalizarCalidadJpeg(65.7)).toBe(66);
            expect(normalizarCalidadJpeg(65.2)).toBe(65);
        });

        it("fuera de rango se acota a 40–90", () => {
            expect(normalizarCalidadJpeg(30)).toBe(40);
            expect(normalizarCalidadJpeg(100)).toBe(90);
            expect(normalizarCalidadJpeg(0)).toBe(40);
            expect(normalizarCalidadJpeg(200)).toBe(90);
        });

        it("no-números devuelven el defecto (70)", () => {
            expect(normalizarCalidadJpeg("70")).toBe(70);
            expect(normalizarCalidadJpeg(null)).toBe(70);
            expect(normalizarCalidadJpeg(NaN)).toBe(70);
        });
    });

    describe("normalizarPerfilMultiantena", () => {
        it("valores válidos se mantienen", () => {
            expect(normalizarPerfilMultiantena("auto-simultaneo")).toBe("auto-simultaneo");
            expect(normalizarPerfilMultiantena("baja-latencia")).toBe("baja-latencia");
            expect(normalizarPerfilMultiantena("ahorro")).toBe("ahorro");
        });

        it("inválidos devuelven el defecto (auto-simultaneo)", () => {
            expect(normalizarPerfilMultiantena("otro")).toBe("auto-simultaneo");
            expect(normalizarPerfilMultiantena(123)).toBe("auto-simultaneo");
            expect(normalizarPerfilMultiantena(null)).toBe("auto-simultaneo");
        });

        it("permite defecto personalizado", () => {
            expect(normalizarPerfilMultiantena("x", "ahorro")).toBe("ahorro");
        });
    });

    describe("normalizarModoTeclado", () => {
        it("valores válidos se mantienen", () => {
            expect(normalizarModoTeclado("mensaje")).toBe("mensaje");
            expect(normalizarModoTeclado("tiempo-real")).toBe("tiempo-real");
            expect(normalizarModoTeclado("ambos")).toBe("ambos");
        });

        it("inválidos devuelven el defecto (ambos)", () => {
            expect(normalizarModoTeclado("otro")).toBe("ambos");
            expect(normalizarModoTeclado(123)).toBe("ambos");
            expect(normalizarModoTeclado(null)).toBe("ambos");
        });

        it("permite defecto personalizado", () => {
            expect(normalizarModoTeclado("x", "tiempo-real")).toBe("tiempo-real");
        });
    });
});

describe("CTL1123D · normalizarAjustesSesion", () => {
    it("objeto vacío devuelve los defectos", () => {
        const r = normalizarAjustesSesion({});
        expect(r).toEqual(AJUSTES_SESION_DEFECTO);
    });

    it("campos válidos se respetan, los demás usan defecto", () => {
        const r = normalizarAjustesSesion({ fps: 60, calidadJpeg: 85 });
        expect(r.fps).toBe(60);
        expect(r.calidadJpeg).toBe(85);
        expect(r.ladoMaximo).toBe(1280);
        expect(r.perfilMultiantena).toBe("auto-simultaneo");
        expect(r.modoTeclado).toBe("ambos");
    });

    it("campos inválidos se normalizan", () => {
        const r = normalizarAjustesSesion({ fps: 99, ladoMaximo: 500, calidadJpeg: 200, perfilMultiantena: "x", modoTeclado: "y" });
        expect(r.fps).toBe(60); // 99 → 60
        expect(r.ladoMaximo).toBe(720); // 500 → 720
        expect(r.calidadJpeg).toBe(90); // 200 → 90
        expect(r.perfilMultiantena).toBe("auto-simultaneo");
        expect(r.modoTeclado).toBe("ambos");
    });
});

describe("CTL1123D · sonAjustesValidos", () => {
    it("ajustes por defecto son válidos", () => {
        expect(sonAjustesValidos(AJUSTES_SESION_DEFECTO)).toBe(true);
    });

    it("ajustes con todos los valores válidos son válidos", () => {
        const a: AjustesSesion = { fps: 60, ladoMaximo: 1920, calidadJpeg: 90 as CalidadJpeg, perfilMultiantena: "baja-latencia", modoTeclado: "tiempo-real" };
        expect(sonAjustesValidos(a)).toBe(true);
    });

    it("fps inválido hace que fallen", () => {
        const a = { ...AJUSTES_SESION_DEFECTO, fps: 45 as FpsObjetivo };
        expect(sonAjustesValidos(a)).toBe(false);
    });

    it("lado máximo inválido hace que fallen", () => {
        const a = { ...AJUSTES_SESION_DEFECTO, ladoMaximo: 800 as LadoMaximo };
        expect(sonAjustesValidos(a)).toBe(false);
    });

    it("calidad fuera de rango hace que fallen", () => {
        const a = { ...AJUSTES_SESION_DEFECTO, calidadJpeg: 35 as CalidadJpeg };
        expect(sonAjustesValidos(a)).toBe(false);
    });

    it("perfil inválido hace que fallen", () => {
        const a = { ...AJUSTES_SESION_DEFECTO, perfilMultiantena: "raro" as PerfilMultiantena };
        expect(sonAjustesValidos(a)).toBe(false);
    });

    it("modo teclado inválido hace que fallen", () => {
        const a = { ...AJUSTES_SESION_DEFECTO, modoTeclado: "raro" as ModoTeclado };
        expect(sonAjustesValidos(a)).toBe(false);
    });
});

describe("CTL1123D · serialización y deserialización", () => {
    it("ajustesASerializables devuelve objeto plano con primitivos", () => {
        const a: AjustesSesion = { fps: 24, ladoMaximo: 1080, calidadJpeg: 65 as CalidadJpeg, perfilMultiantena: "ahorro", modoTeclado: "mensaje" };
        const s = ajustesASerializables(a);
        expect(s).toEqual({ fps: 24, ladoMaximo: 1080, calidadJpeg: 65, perfilMultiantena: "ahorro", modoTeclado: "mensaje" });
        expect(typeof s.fps).toBe("number");
        expect(typeof s.perfilMultiantena).toBe("string");
    });

    it("ajustesDesdeSerializables valida y normaliza", () => {
        const src = { fps: "30", ladoMaximo: 2000, calidadJpeg: 95, perfilMultiantena: "baja-latencia", modoTeclado: "ambos" };
        const r = ajustesDesdeSerializables(src);
        expect(r.fps).toBe(30);
        expect(r.ladoMaximo).toBe(1920); // 2000 → 1920
        expect(r.calidadJpeg).toBe(90); // 95 → 90
        expect(r.perfilMultiantena).toBe("baja-latencia");
        expect(r.modoTeclado).toBe("ambos");
    });

    it("objeto vacío devuelve defectos", () => {
        const r = ajustesDesdeSerializables({});
        expect(r).toEqual(AJUSTES_SESION_DEFECTO);
    });

    it("null/undefined en campos se normalizan", () => {
        const r = ajustesDesdeSerializables({ fps: null, ladoMaximo: undefined, calidadJpeg: "alto" });
        expect(r.fps).toBe(30);
        expect(r.ladoMaximo).toBe(1280);
        expect(r.calidadJpeg).toBe(70);
    });
});

describe("CTL1123D · fusionarAjustes", () => {
    it("parciales ganan sobre base", () => {
        const base: AjustesSesion = { fps: 15, ladoMaximo: 720, calidadJpeg: 40 as CalidadJpeg, perfilMultiantena: "ahorro", modoTeclado: "mensaje" };
        const r = fusionarAjustes(base, { fps: 60, modoTeclado: "tiempo-real" });
        expect(r.fps).toBe(60);
        expect(r.modoTeclado).toBe("tiempo-real");
        expect(r.ladoMaximo).toBe(720);
        expect(r.calidadJpeg).toBe(40);
        expect(r.perfilMultiantena).toBe("ahorro");
    });

    it("valida y normaliza el resultado", () => {
        const base = AJUSTES_SESION_DEFECTO;
        const r = fusionarAjustes(base, { fps: 999, calidadJpeg: -10 });
        expect(r.fps).toBe(60);
        expect(r.calidadJpeg).toBe(40);
    });
});

describe("CTL1123D · descripcionAjustes", () => {
    it("formato legible con todos los campos", () => {
        const a: AjustesSesion = { fps: 30, ladoMaximo: 1280, calidadJpeg: 70 as CalidadJpeg, perfilMultiantena: "auto-simultaneo", modoTeclado: "ambos" };
        const d = descripcionAjustes(a);
        expect(d).toBe("30 fps · 1280 px · 70 % · auto-simultaneo · ambos");
    });

    it("funciona con cualquier combinación válida", () => {
        const a: AjustesSesion = { fps: 60, ladoMaximo: 1920, calidadJpeg: 90 as CalidadJpeg, perfilMultiantena: "baja-latencia", modoTeclado: "tiempo-real" };
        const d = descripcionAjustes(a);
        expect(d).toBe("60 fps · 1920 px · 90 % · baja-latencia · tiempo-real");
    });
});