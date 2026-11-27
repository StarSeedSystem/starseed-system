import { describe, it, expect } from "vitest";
import {
    tipoOrden,
    sistemasOrden,
    validarArgs,
    requiereAdminCompleto,
    requiereAyudante,
    crearClienteAyudante,
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

type Envio = { nombre: string; args: ArgsOrden };

function clienteDePrueba(sistema: Sistema, ayudanteDisponible: boolean) {
    const enviados: Envio[] = [];
    const cliente = crearClienteAyudante({
        enviarOrden: async (nombre, args) => {
            enviados.push({ nombre, args });
            return { ok: true, salida: "hecho" };
        },
        sistema,
        ayudanteDisponible,
    });
    return { cliente, enviados };
}

describe("Cliente del ayudante · guardas", () => {
    it("envía la orden con los argumentos validados", async () => {
        const { cliente, enviados } = clienteDePrueba("linux", true);
        const r = await cliente.almacenSalud("ABC123");
        expect(r).toEqual({ ok: true, salida: "hecho" });
        expect(enviados).toEqual([{ nombre: "almacen-salud", args: { disco: "ABC123" } }]);
    });

    it("sin confirmar no envía nada (formatear, reiniciar, actualizar, servicio)", async () => {
        const { cliente, enviados } = clienteDePrueba("linux", true);
        const resultados = [
            await cliente.almacenFormatear("ABC123", false),
            await cliente.reiniciarApp(false),
            await cliente.actualizar("stable", false),
            await cliente.servicioReiniciar("starseed", false),
        ];
        for (const r of resultados) expect(r).toEqual({ ok: false, salida: "", error: "argumentos" });
        expect(enviados).toEqual([]);
    });

    it("rechaza argumentos fuera de rango sin enviar", async () => {
        const { cliente, enviados } = clienteDePrueba("macos", true);
        expect((await cliente.registros("starseed", 0)).error).toBe("argumentos");
        expect((await cliente.registros("starseed", 10001)).error).toBe("argumentos");
        expect((await cliente.modoCompleto(1441)).error).toBe("argumentos");
        expect((await cliente.almacenSalud("")).error).toBe("argumentos");
        expect(enviados).toEqual([]);
    });

    it("sin ayudante, las órdenes que lo exigen se niegan y las demás pasan", async () => {
        const { cliente, enviados } = clienteDePrueba("windows", false);
        const negada = await cliente.almacenMontar("ABC123", "D:");
        expect(negada).toEqual({ ok: false, salida: "", error: "ayudante-no-disponible" });
        const permitida = await cliente.almacenEstado();
        expect(permitida.ok).toBe(true);
        expect(enviados.map((e) => e.nombre)).toEqual(["almacen-estado"]);
    });

    it("en android solo salen las órdenes de almacenes permitidas (estado, salud, verificar)", async () => {
        const { cliente, enviados } = clienteDePrueba("android", true);
        const r = await cliente.almacenEstado();
        expect(r.ok).toBe(true);
        expect((await cliente.almacenSalud("ABC123")).ok).toBe(true);
        expect((await cliente.almacenVerificar("ABC123")).ok).toBe(true);
        expect((await cliente.modoCompleto(60)).error).toBe("sistema-no-soportado");
        expect((await cliente.servicioEstado("starseed")).error).toBe("sistema-no-soportado");
        expect(enviados.map((e) => e.nombre)).toEqual(["almacen-estado", "almacen-salud", "almacen-verificar"]);
    });

    it("la comprobación de sistema va antes que la del ayudante", async () => {
        const { cliente } = clienteDePrueba("android", false);
        expect((await cliente.reiniciarApp(true)).error).toBe("sistema-no-soportado");
    });

    it("propaga el fallo del transporte tal cual", async () => {
        const cliente = crearClienteAyudante({
            enviarOrden: async () => ({ ok: false, salida: "", error: "bloqueado" }),
            sistema: "linux",
            ayudanteDisponible: true,
        });
        expect(await cliente.servicioEstado("starseed")).toEqual({ ok: false, salida: "", error: "bloqueado" });
    });
});