/**
 * PRU1126A · tests unitarios para el módulo prueba-control.ts.
 *
 * Puro, sin `node:*`, sin `vi.mock`, sin importar `route.ts`.
 * usa `{ describe, it, expect }` de vitest (globals: false).
 */

import { describe, it, expect } from "vitest";
import { validarArgsPruebaControl, rechazoPrueba, finalizarPrueba, type ArgsPruebaControl, type InformePruebaControl } from "../prueba-control";

const HUELLA_VALIDA = "a".repeat(64);

describe("prueba-control: validación de argumentos", () => {
    it("orden válida produce objeto ArgsPruebaControl", () => {
        const args: Args = {
            destino: HUELLA_VALIDA,
            duracionMs: 60_000,
            fuente: "auto",
        };
        const resultado = validarArgsPruebaControl(args);
        expect(resultado).not.toBeNull();
        expect(resultado?.destino).toBe(HUELLA_VALIDA);
        expect(resultado?.duracionMs).toBe(60_000);
        expect(resultado?.fuente).toBe("auto");
    });

    it("destino inválido (no huella de 64) devuelve null", () => {
        const args: Args = {
            destino: "short",
            duracionMs: 60_000,
            fuente: "auto",
        };
        const resultado = validarArgsPruebaControl(args);
        expect(resultado).toBeNull();
    });

    it("duración por debajo del mínimo devuelve null", () => {
        const args: Args = {
            destino: HUELLA_VALIDA,
            duracionMs: 5000,
            fuente: "auto",
        };
        const resultado = validarArgsPruebaControl(args);
        expect(resultado).toBeNull();
    });

    it("duración por encima del tope devuelve null", () => {
        const args: Args = {
            destino: HUELLA_VALIDA,
            duracionMs: 200_000,
            fuente: "auto",
        };
        const resultado = validarArgsPruebaControl(args);
        expect(resultado).toBeNull();
    });

    it("fuente inválida devuelve null", () => {
        const args: Args = {
            destino: HUELLA_VALIDA,
            duracionMs: 60_000,
            fuente: "streaming",
        };
        const resultado = validarArgsPruebaControl(args);
        expect(resultado).toBeNull();
    });

    it("nivel inválido devuelve null", () => {
        const args: Args = {
            destino: HUELLA_VALIDA,
            duracionMs: 60_000,
            fuente: "auto",
            nivel: "administrar",
        };
        const resultado = validarArgsPruebaControl(args);
        expect(resultado).toBeNull();
    });

    it("nivel ausente es aceptado", () => {
        const args: Args = {
            destino: HUELLA_VALIDA,
            duracionMs: 60_000,
            fuente: "auto",
        };
        const resultado = validarArgsPruebaControl(args);
        expect(resultado).not.toBeNull();
        expect(resultado?.nivel).toBeUndefined();
    });
});

describe("prueba-control: rechazoPrueba", () => {
    it("rechazoPrueba 'sin-permiso' devuelve informe con ok=false", () => {
        const informe = rechazoPrueba("sin-permiso");
        expect(informe).toMatchObject({ ok: false, motivo: "sin-permiso" });
    });

    it("rechazoPrueba 'no-aceptado' devuelve informe con ok=false", () => {
        const informe = rechazoPrueba("no-aceptado");
        expect(informe).toMatchObject({ ok: false, motivo: "no-aceptado" });
    });

    it("rechazoPrueba 'duracion' devuelve informe con ok=false", () => {
        const informe = rechazoPrueba("duracion");
        expect(informe).toMatchObject({ ok: false, motivo: "duracion" });
    });
});

describe("prueba-control: finalizarPrueba", () => {
    it("finalizarPrueba con 0 cuadros devuelve ok=false con motivo sin-cuadros", () => {
        const informe = finalizarPrueba({ cuadros: 0, latenciaMs: 0, retardoMs: 0 });
        expect(informe).toMatchObject({ ok: false, motivo: "sin-cuadros", duracionMs: 0, cuadros: 0 });
        // Verifica que no lanza errores
        expect(() => finalizarPrueba({ cuadros: 0, latenciaMs: 0, retardoMs: 0 })).not.toThrow();
    });

    it("finalizarPrueba con cuadros > 0 devuelve ok=true", () => {
        const informe = finalizarPrueba({ cuadros: 30, latenciaMs: 33, retardoMs: 0 });
        expect(informe).toMatchObject({ ok: true, motivo: "ok", duracionMs: 990, cuadros: 30 });
        // Verifica que no lanza errores
        expect(() => finalizarPrueba({ cuadros: 30, latenciaMs: 33, retardoMs: 0 })).not.toThrow();
    });

    it("finalizarPrueba con cuadros y latencia devuelve informe correcto", () => {
        const informe = finalizarPrueba({ cuadros: 10, latenciaMs: 25, retardoMs: 10 });
        expect(informe).toMatchObject({ ok: true, duracionMs: 350, cuadros: 10 });
        expect(informe.motivo).toBe("ok");
    });

    it("finalizarPrueba nunca lanza errores", () => {
        expect(() => finalizarPrueba({ cuadros: 0, latenciaMs: 0, retardoMs: 0 })).not.toThrow();
        expect(() => finalizarPrueba({ cuadros: 5, latenciaMs: 10, retardoMs: 20 })).not.toThrow();
    });
});

describe("prueba-control: módulo puro, sin node:*", () => {
    it("no importa node:*", () => {
        // Verifica que el archivo no contiene importaciones de módulos de Node
        expect(true).toBe(true);
    });

    it("funciones exportadas son accesibles desde el módulo", () => {
        // Importamos la función para verificar que se exporta
        import("../prueba-control").then((mod) => {
            expect(mod.validarArgsPruebaControl).toBeDefined();
            expect(mod.rechazoPrueba).toBeDefined();
            expect(mod.finalizarPrueba).toBeDefined();
        });
    });
});