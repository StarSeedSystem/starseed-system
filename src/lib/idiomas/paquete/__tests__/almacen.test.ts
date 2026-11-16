import { describe, it, expect } from "vitest";
import {
    listarPaquetes,
    guardarPaquete,
    quitarPaquete,
    leerPaquete,
    dispararEvento,
    CLAVE_PAQUETES,
    type Almacen,
} from "../almacen";
import type { PaqueteIdioma } from "../formato";

const crearPaquete = (codigo: string, entradas: Record<string, string>): PaqueteIdioma => ({
    formato: "starseed-idioma",
    version: 1,
    codigo,
    nombre: `Idioma ${codigo}`,
    nombreIngles: `Language ${codigo}`,
    dir: "ltr",
    autor: { nombre: "Test" },
    creado: "2026-01-01T00:00:00.000Z",
    revisado: { estado: "automatico" },
    licencia: "MIT",
    base: "es",
    entradas,
    hash: `${codigo}-hash`,
});

const almacenFalso = (): Almacen => {
    const items: Record<string, string> = {};
    return {
        getItem: (k) => items[k] ?? null,
        setItem: (k, v) => { items[k] = v; },
        removeItem: (k) => { delete items[k]; },
    };
};

describe("almacen de paquetes de idioma", () => {
    describe("listarPaquetes", () => {
        it("devuelve arreglo vacío si no hay paquetes", () => {
            const a = almacenFalso();
            expect(listarPaquetes(a)).toEqual([]);
        });

        it("devuelve todos los paquetes instalados", () => {
            const a = almacenFalso();
            const paquete1 = crearPaquete("fr", { hola: "hola" });
            const paquete2 = crearPaquete("de", { hola: "hallo" });

            a.setItem(CLAVE_PAQUETES, JSON.stringify([paquete1, paquete2]));
            expect(listarPaquetes(a)).toHaveLength(2);
            expect(listarPaquetes(a).map((p) => p.codigo)).toEqual(["fr", "de"]);
        });

        it("ignora paquetes corruptos y continúa con los válidos", () => {
            const a = almacenFalso();
            const paqueteValido = crearPaquete("en", { hello: "hello" });

            a.setItem(CLAVE_PAQUETES, JSON.stringify([paqueteValido, { codigo: "invalid", entradas: {} }, null, "corrupto"]));
            const resultado = listarPaquetes(a);
            expect(resultado).toHaveLength(1);
            expect(resultado[0].codigo).toBe("en");
        });
    });

    describe("guardarPaquete", () => {
        it("guarda un paquete nuevo", () => {
            const a = almacenFalso();
            const paquete = crearPaquete("fr", { hola: "hola" });

            const resultado = guardarPaquete(paquete, a);
            expect(resultado.ok).toBe(true);
            expect(listarPaquetes(a)).toHaveLength(1);
        });

        it("reemplaza un paquete existente con el mismo código", () => {
            const a = almacenFalso();
            const paquete1 = crearPaquete("fr", { hola: "hola" });
            const paquete2 = crearPaquete("fr", { hola: "salut" });

            a.setItem(CLAVE_PAQUETES, JSON.stringify([paquete1]));
            const resultado = guardarPaquete(paquete2, a);

            expect(resultado.ok).toBe(true);
            expect(listarPaquetes(a)).toHaveLength(1);
            expect(listarPaquetes(a)[0].entradas.hola).toBe("salut");
        });

        it("devuelve error si se supera el tope de 12 paquetes", () => {
            const a = almacenFalso();
            const paquetesExistentes = Array.from({ length: 12 }, (_, i) => 
                crearPaquete(`lang${i}`, { hola: `hola${i}` })
            );
            a.setItem(CLAVE_PAQUETES, JSON.stringify(paquetesExistentes));

            const resultado = guardarPaquete(crearPaquete("nuevo", { hola: "hola" }), a);
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.motivo).toBe("máximo 12 paquetes");
            }
        });

        it("devuelve error si se supera el tope de 6 MB en total", () => {
            const a = almacenFalso();
            const granPaquete: PaqueteIdioma = {
                formato: "starseed-idioma",
                version: 1,
                codigo: "zh",
                nombre: "Chino",
                nombreIngles: "Chinese",
                dir: "ltr",
                autor: { nombre: "Test" },
                creado: "2026-01-01T00:00:00.000Z",
                revisado: { estado: "automatico" },
                licencia: "MIT",
                base: "es",
                entradas: { clave: "x".repeat(6 * 1024 * 1024 + 1) },
                hash: "hash-grande",
            };

            const resultado = guardarPaquete(granPaquete, a);
            expect(resultado.ok).toBe(false);
            if (!resultado.ok) {
                expect(resultado.motivo).toBe("tamaño máximo 6 MB");
            }
        });
    });

    describe("quitarPaquete", () => {
        it("elimina un paquete existente", () => {
            const a = almacenFalso();
            const paquete = crearPaquete("fr", { hola: "hola" });
            a.setItem(CLAVE_PAQUETES, JSON.stringify([paquete]));

            expect(listarPaquetes(a)).toHaveLength(1);
            quitarPaquete("fr", a);
            expect(listarPaquetes(a)).toHaveLength(0);
        });

        it("no hace nada si el paquete no existe", () => {
            const a = almacenFalso();
            a.setItem(CLAVE_PAQUETES, JSON.stringify([]));

            quitarPaquete("fr", a);
            expect(listarPaquetes(a)).toHaveLength(0);
        });
    });

    describe("leerPaquete", () => {
        it("devuelve un paquete existente", () => {
            const a = almacenFalso();
            const paquete = crearPaquete("fr", { hola: "hola" });
            a.setItem(CLAVE_PAQUETES, JSON.stringify([paquete]));

            const leido = leerPaquete("fr", a);
            expect(leido).not.toBeNull();
            expect(leido?.codigo).toBe("fr");
        });

        it("devuelve null si el paquete no existe", () => {
            const a = almacenFalso();
            expect(leerPaquete("fr", a)).toBeNull();
        });

        it("ignora paquetes corruptos y busca el siguiente", () => {
            const a = almacenFalso();
            const paqueteValido = crearPaquete("en", { hello: "hello" });
            a.setItem(CLAVE_PAQUETES, JSON.stringify([null, "corrupto", paqueteValido]));

            const leido = leerPaquete("en", a);
            expect(leido).not.toBeNull();
            expect(leido?.codigo).toBe("en");
        });
    });

    describe("dispararEvento", () => {
        it("dispara evento al cambiar el almacén", () => {
            const a = almacenFalso();
            dispararEvento("cambio", a);
        });

        it("envía evento a window cuando está disponible", () => {
            const eventosRecibidos: CustomEvent<string>[] = [];
            const originalWindow = globalThis.window;

            const mockWindow = {
                dispatchEvent: (evento: Event) => {
                    eventosRecibidos.push(evento as CustomEvent<string>);
                    return true;
                },
            };
            (globalThis as unknown as { window: unknown }).window = mockWindow;

            dispararEvento("starseed:idiomas-paquetes", {} as unknown as Almacen);

            (globalThis as unknown as { window: unknown }).window = originalWindow;
            expect(eventosRecibidos.length).toBeGreaterThanOrEqual(1);
        });
    });
});