import { describe, it, expect } from "vitest";
import {
    abrirEdicion, anadirPendiente, cerrarEdicion, completadas, CLAVE_EDITOR,
    paqueteEnEdicion, pendientes, publicarBorrador, TOPE_ENTRADAS, traducir,
    type AlmacenEditor,
} from "../editor";

type Falso = AlmacenEditor & { datos: Map<string, string> };

function almacenFalso(datos = new Map<string, string>()): Falso {
    return {
        datos,
        getItem: (k) => datos.get(k) ?? null,
        setItem: (k, v) => { datos.set(k, v); },
        removeItem: (k) => { datos.delete(k); },
    };
}

function conEdicion(): Falso {
    const a = almacenFalso();
    abrirEdicion("de-DE", "Deutsch", a);
    return a;
}

describe("editor de paquete de idioma", () => {
    it("abre una edición y la recuerda", () => {
        const a = conEdicion();
        expect(paqueteEnEdicion(a)).toEqual({ codigo: "de-DE", nombre: "Deutsch" });
        expect(pendientes(a)).toEqual([]);
        expect(completadas(a)).toEqual([]);
    });
    it("no abre sin código o sin nombre", () => {
        const a = almacenFalso();
        expect(abrirEdicion("", "Deutsch", a)).toBe(false);
        expect(abrirEdicion("de", "   ", a)).toBe(false);
        expect(paqueteEnEdicion(a)).toBeNull();
    });
    it("añade pendientes normalizando espacios y sin duplicados", () => {
        const a = conEdicion();
        expect(anadirPendiente("  Hola   mundo ", a)).toBe("anadida");
        expect(anadirPendiente("Hola mundo", a)).toBe("duplicada");
        expect(anadirPendiente("   ", a)).toBe("vacia");
        expect(pendientes(a)).toEqual(["Hola mundo"]);
    });
    it("ignora textos de más de 500 caracteres y acepta los de 500", () => {
        const a = conEdicion();
        expect(anadirPendiente("x".repeat(501), a)).toBe("demasiado-larga");
        expect(anadirPendiente("x".repeat(500), a)).toBe("anadida");
    });
    it("respeta el tope de 2.000 entradas", () => {
        const a = conEdicion();
        for (let i = 0; i < TOPE_ENTRADAS; i++) expect(anadirPendiente(`texto ${i}`, a)).toBe("anadida");
        expect(anadirPendiente("una más", a)).toBe("tope");
        expect(pendientes(a)).toHaveLength(TOPE_ENTRADAS);
    });
    it("traduce solo claves abiertas y no acepta valores vacíos", () => {
        const a = conEdicion();
        anadirPendiente("Hola", a);
        expect(traducir("Hola", "   ", a)).toBe(false);
        expect(traducir("Adiós", "Tschüss", a)).toBe(false);
        expect(traducir(" Hola ", "Hallo", a)).toBe(true);
        expect(pendientes(a)).toEqual([]);
        expect(completadas(a)).toEqual([{ clave: "Hola", valor: "Hallo" }]);
    });
    it("publica solo las entradas traducidas y nunca como revisadas", () => {
        const a = conEdicion();
        anadirPendiente("Hola", a);
        anadirPendiente("Adiós", a);
        traducir("Hola", "Hallo", a);
        const p = publicarBorrador(a, () => "2026-11-17T00:00:00.000Z");
        expect(p?.entradas).toEqual({ Hola: "Hallo" });
        expect(p?.revisado.estado).toBe("automatico");
        expect(p?.codigo).toBe("de-DE");
        expect(p?.nombre).toBe("Deutsch");
        expect(p?.dir).toBe("ltr");
        expect(p?.creado).toBe("2026-11-17T00:00:00.000Z");
    });
    it("devuelve null sin edición o sin nada traducido", () => {
        const a = almacenFalso();
        expect(publicarBorrador(a)).toBeNull();
        abrirEdicion("ar", "العربية", a);
        anadirPendiente("Hola", a);
        expect(publicarBorrador(a)).toBeNull();
    });
    it("deduce derecha a izquierda del código y publica en rtl", () => {
        const a = almacenFalso();
        abrirEdicion("ar", "العربية", a);
        anadirPendiente("Hola", a);
        traducir("Hola", "مرحبا", a);
        expect(publicarBorrador(a)?.dir).toBe("rtl");
    });
    it("recupera el estado desde el almacén (como tras recargar)", () => {
        const a = conEdicion();
        anadirPendiente("Hola", a);
        traducir("Hola", "Hallo", a);
        expect(a.datos.get(CLAVE_EDITOR)).toContain("Hallo");
        expect(paqueteEnEdicion(a)?.codigo).toBe("de-DE");
        expect(completadas(a)).toEqual([{ clave: "Hola", valor: "Hallo" }]);
    });
    it("cierra la edición y no rompe si el almacén lanza", () => {
        const a = conEdicion();
        expect(cerrarEdicion(a)).toBe(true);
        expect(paqueteEnEdicion(a)).toBeNull();
        const roto: AlmacenEditor = {
            getItem: () => { throw new Error("fallo"); },
            setItem: () => {},
            removeItem: () => {},
        };
        expect(paqueteEnEdicion(roto)).toBeNull();
        expect(pendientes(roto)).toEqual([]);
        expect(anadirPendiente("Hola", roto)).toBe("sin-edicion");
        expect(cerrarEdicion(roto)).toBe(false);
    });
});
