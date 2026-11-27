import { describe, it, expect } from "vitest";
import {
    tipoOrden,
    sistemasOrden,
    validarArgs,
    requiereAdminCompleto,
    requiereAyudante,
    COMANDOS_AYUDANTE,
    type ComandoAyudante,
    type ArgsOrden,
    type Sistema,
} from "../ordenes";

describe("ordenes.ts · contrato de órdenes tipadas del ayudante", () => {
    it("define todos los comandos del catálogo único", () => {
        const nombres = COMANDOS_AYUDANTE.map((c) => c.nombre);
        expect(nombres).toEqual([
            "almacen-estado",
            "almacen-salud",
            "almacen-formatear",
            "almacen-montar",
            "almacen-desmontar",
            "almacen-verificar",
            "servicio-estado",
            "servicio-reiniciar",
            "actualizar",
            "registros",
            "reiniciar-app",
            "modo-completo",
        ]);
    });

    it("cada comando tiene su tipo de orden, sistemas y validación", () => {
        for (const cmd of COMANDOS_AYUDANTE) {
            expect(tipoOrden(cmd.nombre)).toBe(cmd.tipo);
            expect(sistemasOrden(cmd.nombre)).toEqual(cmd.sistemas);
            expect(validarArgs(cmd.nombre, cmd.ejemploArgs)).toEqual(cmd.ejemploArgs);
            expect(requiereAdminCompleto(cmd.nombre)).toBe(cmd.requiereAdminCompleto);
            expect(requiereAyudante(cmd.nombre)).toBe(cmd.requiereAyudante);
        }
    });

    it("validarArgs rechaza argumentos inválidos o extra", () => {
        expect(validarArgs("almacen-salud", { disco: "ABC123" })).toEqual({ disco: "ABC123" });
        expect(validarArgs("almacen-salud", { disco: "ABC123", extra: true })).toBeNull();
        expect(validarArgs("almacen-salud", {})).toBeNull();
        expect(validarArgs("almacen-formatear", { disco: "ABC123", confirmar: true })).toEqual({ disco: "ABC123", confirmar: true });
        expect(validarArgs("almacen-formatear", { disco: "ABC123", confirmar: false })).toBeNull();
        expect(validarArgs("servicio-reiniciar", { nombre: "starseed", confirmar: true })).toEqual({ nombre: "starseed", confirmar: true });
        expect(validarArgs("actualizar", { canal: "stable", confirmar: true })).toEqual({ canal: "stable", confirmar: true });
        expect(validarArgs("actualizar", { canal: "inexistente", confirmar: true })).toBeNull();
        expect(validarArgs("registros", { servicio: "starseed", lineas: 50 })).toEqual({ servicio: "starseed", lineas: 50 });
        expect(validarArgs("registros", { servicio: "starseed", lineas: -1 })).toBeNull();
        expect(validarArgs("reiniciar-app", { confirmar: true })).toEqual({ confirmar: true });
        expect(validarArgs("modo-completo", { caducidadMin: 60 })).toEqual({ caducidadMin: 60 });
        expect(validarArgs("modo-completo", { caducidadMin: 0 })).toBeNull();
        expect(validarArgs("modo-completo", { caducidadMin: 1441 })).toBeNull();
    });

    it("comando desconocido devuelve null en todas las consultas", () => {
        expect(tipoOrden("inexistente")).toBeNull();
        expect(sistemasOrden("inexistente")).toEqual([]);
        expect(validarArgs("inexistente", {})).toBeNull();
        expect(requiereAdminCompleto("inexistente")).toBe(false);
        expect(requiereAyudante("inexistente")).toBe(false);
    });

    it("los sistemas soportados son linux, macos, windows, android", () => {
        const sistemas: Sistema[] = ["linux", "macos", "windows", "android"];
        for (const cmd of COMANDOS_AYUDANTE) {
            for (const s of cmd.sistemas) {
                expect(sistemas).toContain(s);
            }
        }
    });

    it("android no tiene nivel administrador (solo almacenes por marco de acceso)", () => {
        for (const cmd of COMANDOS_AYUDANTE) {
            if (cmd.requiereAdminCompleto || cmd.requiereAyudante) {
                expect(cmd.sistemas).not.toContain("android");
            }
        }
    });
});

describe("Cliente del ayudante", () => {
    it("exporta una función crearClienteAyudante", async () => {
        const { crearClienteAyudante } = await import("../ordenes");
        expect(typeof crearClienteAyudante).toBe("function");
    });

    it("el cliente expone métodos para cada orden", async () => {
        const { crearClienteAyudante } = await import("../ordenes");
        const cliente = crearClienteAyudante({
            enviarOrden: async () => ({ ok: true, salida: "" }),
            sistema: "linux",
            ayudanteDisponible: true,
        });
        expect(typeof cliente.almacenEstado).toBe("function");
        expect(typeof cliente.almacenSalud).toBe("function");
        expect(typeof cliente.almacenFormatear).toBe("function");
        expect(typeof cliente.almacenMontar).toBe("function");
        expect(typeof cliente.almacenDesmontar).toBe("function");
        expect(typeof cliente.almacenVerificar).toBe("function");
        expect(typeof cliente.servicioEstado).toBe("function");
        expect(typeof cliente.servicioReiniciar).toBe("function");
        expect(typeof cliente.actualizar).toBe("function");
        expect(typeof cliente.registros).toBe("function");
        expect(typeof cliente.reiniciarApp).toBe("function");
        expect(typeof cliente.modoCompleto).toBe("function");
    });
});