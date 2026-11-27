import { describe, it, expect } from "vitest";
import {
    PERMISO_APAGADO,
    catalogoParaSistema,
    crearClienteAyudante,
    modoCompletoVigente,
    permisoEfectivo,
    type ContextoCliente,
    type PermisoAparato,
    type ResultadoOrden,
} from "../cliente";

const AHORA = 1_800_000_000_000;

function permiso(extra: Partial<PermisoAparato> = {}): PermisoAparato {
    return { encendido: true, nivel: "administrador", modo: "tipado", completoHasta: null, ...extra };
}

function contexto(extra: Partial<ContextoCliente> = {}) {
    const enviadas: { nombre: string; args: Record<string, unknown> }[] = [];
    const registradas: string[] = [];
    const ctx: ContextoCliente = {
        sistema: "linux",
        ayudanteDisponible: true,
        permiso: permiso(),
        ahora: () => AHORA,
        enviar: async (nombre, args) => {
            enviadas.push({ nombre, args });
            return { ok: true, salida: "hecho" };
        },
        registrar: (e) => registradas.push(e.nombre),
        ...extra,
    };
    return { ctx, enviadas, registradas };
}

describe("cliente.ts · permiso del dueño en el aparato", () => {
    it("apagado por defecto: no envía nada y lo dice", async () => {
        const { ctx, enviadas } = contexto({ permiso: PERMISO_APAGADO });
        const r = await crearClienteAyudante(ctx).almacenEstado();
        expect(r).toMatchObject({ ok: false, error: "permiso-apagado", motivo: "permiso-apagado" });
        expect(enviadas).toHaveLength(0);
    });

    it("sin permiso explícito también está apagado", async () => {
        const { ctx, enviadas } = contexto({ permiso: undefined });
        const r = await crearClienteAyudante(ctx).registros("starseed", 50);
        expect(r.error).toBe("permiso-apagado");
        expect(enviadas).toHaveLength(0);
    });

    it("el motivo se puede consultar sin ejecutar", () => {
        const apagado = crearClienteAyudante(contexto({ permiso: PERMISO_APAGADO }).ctx);
        const encendido = crearClienteAyudante(contexto().ctx);
        expect(apagado.motivo("almacen-estado")).toBe("permiso-apagado");
        expect(encendido.motivo("almacen-estado")).toBeNull();
    });
});

describe("cliente.ts · catálogo y guardas del contrato", () => {
    it("con permiso envía la orden validada y registra la salida", async () => {
        const { ctx, enviadas, registradas } = contexto();
        const r = await crearClienteAyudante(ctx).almacenSalud("ABC123");
        expect(r).toEqual({ ok: true, salida: "hecho" });
        expect(enviadas).toEqual([{ nombre: "almacen-salud", args: { disco: "ABC123" } }]);
        expect(registradas).toEqual(["almacen-salud"]);
    });

    it("rechaza comando desconocido y sistema no soportado", async () => {
        const { ctx, enviadas } = contexto();
        const cliente = crearClienteAyudante(ctx);
        expect((await cliente.ejecutar("inexistente")).error).toBe("comando-desconocido");
        expect((await crearClienteAyudante({ ...ctx, sistema: "android" }).almacenFormatear("ABC123", true)).error).toBe("sistema-no-soportado");
        expect(enviadas).toHaveLength(0);
    });

    it("rechaza argumentos inválidos antes de enviar", async () => {
        const { ctx, enviadas } = contexto();
        const cliente = crearClienteAyudante(ctx);
        expect((await cliente.almacenFormatear("ABC123", false)).error).toBe("argumentos");
        expect((await cliente.registros("starseed", 0)).error).toBe("argumentos");
        expect(enviadas).toHaveLength(0);
    });

    it("un comando con ayudante exige nivel administrador y ayudante disponible", async () => {
        const usuario = contexto({ permiso: permiso({ nivel: "usuario" }) }).ctx;
        expect((await crearClienteAyudante(usuario).servicioReiniciar("starseed", true)).error).toBe("requiere-administrador");
        const sinAyudante = contexto({ ayudanteDisponible: false }).ctx;
        expect((await crearClienteAyudante(sinAyudante).almacenMontar("ABC123", "/mnt/x")).error).toBe("ayudante-no-disponible");
    });

    it("el modo completo es obligatorio y caduca", async () => {
        const tipado = contexto().ctx;
        expect((await crearClienteAyudante(tipado).reiniciarApp(true)).error).toBe("requiere-admin-completo");

        const vigente = permiso({ modo: "completo", completoHasta: AHORA + 60_000 });
        const r = await crearClienteAyudante(contexto({ permiso: vigente }).ctx).modoCompleto(60);
        expect(r.ok).toBe(true);

        const caducado = permiso({ modo: "completo", completoHasta: AHORA - 1 });
        expect((await crearClienteAyudante(contexto({ permiso: caducado }).ctx).reiniciarApp(true)).error).toBe("modo-completo-caducado");
    });

    it("un fallo del transporte no lanza: lo devuelve", async () => {
        const { ctx } = contexto({
            enviar: async () => {
                throw new Error("sin red");
            },
        });
        const r = await crearClienteAyudante(ctx).almacenEstado();
        expect(r).toMatchObject({ ok: false, salida: "", error: "transporte" });
    });

    it("el catálogo se filtra por sistema y conserva el contrato", () => {
        expect(catalogoParaSistema("android").every((c) => c.sistemas.includes("android"))).toBe(true);
        expect(catalogoParaSistema("linux").map((c) => c.nombre)).toContain("almacen-verificar");
    });
});

describe("cliente.ts · caducidad del modo completo", () => {
    it("solo vale con un instante futuro finito", () => {
        expect(modoCompletoVigente(permiso({ modo: "completo", completoHasta: AHORA + 1 }), AHORA)).toBe(true);
        expect(modoCompletoVigente(permiso({ modo: "completo", completoHasta: AHORA }), AHORA)).toBe(false);
        expect(modoCompletoVigente(permiso({ modo: "completo", completoHasta: null }), AHORA)).toBe(false);
        expect(modoCompletoVigente(permiso({ modo: "tipado" }), AHORA)).toBe(false);
    });

    it("permisoEfectivo degrada a tipado al caducar", () => {
        const caducado = permiso({ modo: "completo", completoHasta: AHORA - 1 });
        expect(permisoEfectivo(caducado, AHORA).modo).toBe("tipado");
        const vigente = permiso({ modo: "completo", completoHasta: AHORA + 1 });
        expect(permisoEfectivo(vigente, AHORA).modo).toBe("completo");
    });
});
