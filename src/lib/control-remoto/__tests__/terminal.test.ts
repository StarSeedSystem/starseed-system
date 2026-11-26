import { describe, it, expect, beforeEach } from "vitest";
import {
    esNivelTerminal,
    nivelTerminalMinimo,
    comandoTerminal,
    validarComandoTerminal,
    ejecutarComandoTerminal,
    registrarTerminal,
    leerRegistroTerminal,
    limpiarRegistroTerminal,
    type SesionTerminal,
    type NivelTerminal,
    COMANDOS_TERMINAL,
} from "../terminal";

describe("terminal · niveles", () => {
    it("reconoce niveles válidos", () => {
        expect(esNivelTerminal("usuario")).toBe(true);
        expect(esNivelTerminal("administrador")).toBe(true);
        expect(esNivelTerminal("root")).toBe(false);
        expect(esNivelTerminal(null)).toBe(false);
    });

    it("calcula el mínimo entre dos niveles", () => {
        expect(nivelTerminalMinimo("usuario", "administrador")).toBe("usuario");
        expect(nivelTerminalMinimo("administrador", "usuario")).toBe("usuario");
        expect(nivelTerminalMinimo("administrador", "administrador")).toBe("administrador");
    });
});

describe("terminal · comandos", () => {
    it("lista los comandos definidos", () => {
        expect(COMANDOS_TERMINAL.length).toBeGreaterThan(0);
        for (const c of COMANDOS_TERMINAL) {
            expect(c.nombre).toBeTruthy();
            expect(c.descripcion).toBeTruthy();
            expect(typeof c.requiereAdminCompleto).toBe("boolean");
            expect(Array.isArray(c.sistemas)).toBe(true);
        }
    });

    it("busca un comando por nombre", () => {
        const c = comandoTerminal("almacen-estado");
        expect(c).not.toBeNull();
        expect(c?.nombre).toBe("almacen-estado");
        expect(comandoTerminal("no-existe")).toBeNull();
    });

    it("valida argumentos de un comando simple", () => {
        const r = validarComandoTerminal("almacen-estado", {});
        expect(r).toEqual({});
    });

    it("rechaza comandos desconocidos", () => {
        expect(validarComandoTerminal("no-existe", {})).toBeNull();
    });

    it("rechaza argumentos extra", () => {
        expect(validarComandoTerminal("almacen-estado", { extra: true })).toBeNull();
    });

    it("valida argumentos con valores por defecto", () => {
        const r = validarComandoTerminal("registros", {});
        expect(r).toEqual({ servicio: "", lineas: 100 });
    });

    it("valida argumentos con valores provistos", () => {
        const r = validarComandoTerminal("registros", { servicio: "mi-servicio", lineas: 50 });
        expect(r).toEqual({ servicio: "mi-servicio", lineas: 50 });
    });

    it("rechaza tipos incorrectos", () => {
        expect(validarComandoTerminal("registros", { lineas: "muchas" })).toBeNull();
        expect(validarComandoTerminal("almacen-formatear", { confirmar: "sí" })).toBeNull();
    });
});

describe("terminal · ejecución", () => {
    const sesionBase: SesionTerminal = {
        token: "abc123",
        de: "huella-test",
        nombre: "Test",
        nivel: "usuario",
        modo: "tipado",
        inicio: Date.now(),
        ultima: Date.now(),
    };

    it("ejecuta comando de usuario sin ayudante", async () => {
        const r = await ejecutarComandoTerminal("almacen-estado", {}, { sesion: sesionBase, ayudanteDisponible: false });
        expect(r.ok).toBe(true);
        expect(r.salida).toContain("almacen-estado");
    });

    it("rechaza comando admin-completo sin modo completo", async () => {
        const r = await ejecutarComandoTerminal("almacen-formatear", { disco: "sda", confirmar: true }, { sesion: sesionBase, ayudanteDisponible: true });
        expect(r.ok).toBe(false);
        expect(r.error).toBe("requiere-admin-completo");
    });

    it("ejecuta comando admin-completo con modo completo y ayudante", async () => {
        const sesionAdmin: SesionTerminal = { ...sesionBase, nivel: "administrador", modo: "completo" };
        const r = await ejecutarComandoTerminal("almacen-formatear", { disco: "sda", confirmar: true }, { sesion: sesionAdmin, ayudanteDisponible: true });
        expect(r.ok).toBe(true);
    });

    it("rechaza comando admin-completo sin ayudante disponible", async () => {
        const sesionAdmin: SesionTerminal = { ...sesionBase, nivel: "administrador", modo: "completo" };
        const r = await ejecutarComandoTerminal("almacen-formatear", { disco: "sda", confirmar: true }, { sesion: sesionAdmin, ayudanteDisponible: false });
        expect(r.ok).toBe(false);
        expect(r.error).toBe("ayudante-no-disponible");
    });
});

describe("terminal · registro", () => {
    beforeEach(() => {
        limpiarRegistroTerminal();
    });

    it("registra y lee una entrada", () => {
        const entrada = {
            id: "1",
            token: "t1",
            de: "huella-1",
            nombre: "Neurona 1",
            nivel: "usuario" as NivelTerminal,
            modo: "tipado" as const,
            comando: "almacen-estado",
            args: {},
            inicio: Date.now(),
            fin: Date.now() + 100,
            ok: true,
            salidaResumida: "ok",
        };
        registrarTerminal(entrada);
        const leido = leerRegistroTerminal();
        expect(leido.length).toBe(1);
        expect(leido[0].comando).toBe("almacen-estado");
    });

    it("filtra por controlador", () => {
        registrarTerminal({ id: "1", token: "t", de: "a", nombre: "A", nivel: "usuario", modo: "tipado", comando: "c", args: {}, inicio: 1, fin: 2, ok: true, salidaResumida: "" });
        registrarTerminal({ id: "2", token: "t", de: "b", nombre: "B", nivel: "usuario", modo: "tipado", comando: "c", args: {}, inicio: 1, fin: 2, ok: true, salidaResumida: "" });
        expect(leerRegistroTerminal({ de: "a" }).length).toBe(1);
    });

    it("filtra por rango de tiempo", () => {
        const ahora = Date.now();
        registrarTerminal({ id: "1", token: "t", de: "a", nombre: "A", nivel: "usuario", modo: "tipado", comando: "c", args: {}, inicio: ahora - 1000, fin: ahora, ok: true, salidaResumida: "" });
        registrarTerminal({ id: "2", token: "t", de: "a", nombre: "A", nivel: "usuario", modo: "tipado", comando: "c", args: {}, inicio: ahora + 1000, fin: ahora + 2000, ok: true, salidaResumida: "" });
        expect(leerRegistroTerminal({ desde: ahora }).length).toBe(1);
    });

    it("limpia el registro", () => {
        registrarTerminal({ id: "1", token: "t", de: "a", nombre: "A", nivel: "usuario", modo: "tipado", comando: "c", args: {}, inicio: 1, fin: 2, ok: true, salidaResumida: "" });
        limpiarRegistroTerminal();
        expect(leerRegistroTerminal().length).toBe(0);
    });

    it("respeta el límite máximo de entradas", () => {
        for (let i = 0; i < 600; i++) {
            registrarTerminal({ id: String(i), token: "t", de: "a", nombre: "A", nivel: "usuario", modo: "tipado", comando: "c", args: {}, inicio: i, fin: i + 1, ok: true, salidaResumida: "" });
        }
        expect(leerRegistroTerminal().length).toBeLessThanOrEqual(500);
    });
});