import { describe, it, expect, beforeEach, vi } from "vitest";
import { abrirEdicion, paqueteEnEdicion, anadirPendiente, pendientes, completadas, traducir, cerrarEdicion, publicarBorrador } from "../editor";
import type { PaqueteIdioma } from "../formato";

function crearAlmacenFalso(): Storage {
    const map = new Map<string, string>();
    return {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => { map.set(k, v); },
        removeItem: (k) => { map.delete(k); },
    } as unknown as Storage;
}

const windowMock = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
};

beforeEach(() => {
    vi.stubGlobal("window", windowMock);
    vi.clearAllMocks();
});

function stubLocalStorage(storage: Storage) {
    vi.stubGlobal("localStorage", storage as any);
}

const codigoTest = "es-ES";

describe("editor de paquetes de idioma", () => {
    beforeEach(() => {
        const storage = crearAlmacenFalso();
        stubLocalStorage(storage as any);
    });

    it("abrir una nueva edición crea un paquete sin entradas", () => {
        const pkg = abrirEdicion(codigoTest, "Español") as PaqueteIdioma;
        expect(pkg.codigo).toBe(codigoTest);
        expect(Object.keys(pkg.entradas)).toHaveLength(0);
        expect(paqueteEnEdicion()).toBe(pkg);
    });

    it("agregar pendientes, duplicados, vacíos, largos y límite", () => {
        abrirEdicion(codigoTest, "Español");
        anadirPendiente("hola");
        anadirPendiente("hola"); // duplicado
        anadirPendiente("   "); // vacío
        anadirPendiente("a".repeat(501));
        let pend = pendientes();
        expect(pend).toContain("hola");
        expect(pend).toHaveLength(1);
        // add up to limit
        for (let i = 0; i < 2000; i++) {
            anadirPendiente(`p${i}`);
        }
        pend = pendientes();
        expect(pend).toHaveLength(2000); // 1 pendiente + up to 1999
        // last add should be ignored
        anadirPendiente("pextra");
        pend = pendientes();
        expect(pend).toHaveLength(2000);
    });

    it("traducir añade entrada y marca completado", async () => {
        abrirEdicion(codigoTest, "Español");
        anadirPendiente("hola");
        await traducir("hola", "hello");
        const pkg = paqueteEnEdicion();
        expect(pkg?.entradas["hola"]).toBe("hello");
        const comp = completadas();
        expect(comp).toContain("hola");
        const pend = pendientes();
        expect(pend).not.toContain("hola");
    });

    it("publicar borrador sólo incluye entradas traducidas", async () => {
        abrirEdicion(codigoTest, "Español");
        await traducir("hola", "hello");
        await traducir("mundo", "world");
        const pub = await publicarBorrador();
        expect(pub).not.toBeNull();
        if (pub) {
            expect(Object.keys(pub.entradas)).toHaveLength(2);
            expect(pub.entradas["hola"]).toBe("hello");
            expect(pub.entradas["mundo"]).toBe("world");
        }
    });

    it("estado persiste tras cerrar y reabrir edición", async () => {
        const storage = crearAlmacenFalso();
        stubLocalStorage(storage as any);
        abrirEdicion(codigoTest, "Español");
        await traducir("hola", "hello");
        cerrarEdicion();
        const pkg2 = abrirEdicion(codigoTest, "Español");
        expect(pkg2.entradas["hola"]).toBe("hello");
        const pend = pendientes();
        expect(pend).toHaveLength(0);
        const comp = completadas();
        expect(comp).toContain("hola");
    });
});
