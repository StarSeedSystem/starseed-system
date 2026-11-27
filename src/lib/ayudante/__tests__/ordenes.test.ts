import { describe, it, expect } from "vitest";
import {
    ORDENES_AYUDANTE,
    GRUPOS_AYUDANTE,
    ordenPorNombre,
    sistemasDeOrden,
    existeEnSistema,
    validarArgsOrden,
    evaluarOrden,
    crearClienteAyudante,
    modoCompletoVigente,
    type DefinicionOrdenAyudante,
    type EstadoAparato,
} from "../ordenes";
import type { Args } from "@/lib/control-remoto/niveles";

function def(nombre: string): DefinicionOrdenAyudante {
    const d = ordenPorNombre(nombre);
    if (!d) throw new Error(`falta la orden ${nombre}`);
    return d;
}

const ESTADO_BASE: EstadoAparato = {
    sistema: "linux",
    permisoEncendido: true,
    ayudanteDisponible: true,
    desbloqueado: true,
    nivel: "administrador",
    modoCompletoHasta: null,
};

describe("ayudante · catálogo único de órdenes tipadas", () => {
    it("no repite nombres y cada orden declara grupo, sistemas, guardas y descripción", () => {
        expect(new Set(ORDENES_AYUDANTE.map((o) => o.nombre)).size).toBe(ORDENES_AYUDANTE.length);
        for (const o of ORDENES_AYUDANTE) {
            expect(o.titulo).toBeTruthy();
            expect(o.descripcion).toBeTruthy();
            expect(o.sistemas.length).toBeGreaterThan(0);
            expect(o.guardas).toContain("permiso-encendido-en-el-aparato");
            expect(GRUPOS_AYUDANTE).toContain(o.grupo);
        }
    });

    it("trae todas las órdenes del contrato", () => {
        const nombres = ORDENES_AYUDANTE.map((o) => o.nombre);
        for (const n of [
            "almacen-estado",
            "almacen-salud",
            "almacen-formatear",
            "almacen-montar",
            "almacen-desmontar",
            "almacen-verificar",
            "servicio-estado",
            "servicio-reiniciar",
            "actualizar-app",
            "registros",
            "reiniciar-app",
            "modo-completo",
        ]) {
            expect(nombres).toContain(n);
        }
    });

    it("dice en qué sistemas existe cada orden", () => {
        expect(sistemasDeOrden("almacen-formatear")).toEqual(["linux", "macos", "windows"]);
        expect(existeEnSistema("almacen-formatear", "android")).toBe(false);
        expect(existeEnSistema("almacen-estado", "android")).toBe(true);
        expect(existeEnSistema("no-existe", "linux")).toBe(false);
        expect(ordenPorNombre("no-existe")).toBeNull();
    });
});

describe("ayudante · argumentos tipados y guardas", () => {
    it("acepta una orden sin parámetros y rechaza claves de más", () => {
        expect(validarArgsOrden(def("almacen-estado"), {})).toEqual({});
        expect(validarArgsOrden(def("almacen-estado"), { extra: true })).toBeNull();
    });

    it("las contraseñas no viajan: un parámetro secreto no declarado se rechaza", () => {
        expect(validarArgsOrden(def("almacen-estado"), { contrasena: "x" })).toBeNull();
        expect(validarArgsOrden(def("servicio-estado"), { servicio: "mando", password: "x" })).toBeNull();
        expect(validarArgsOrden(def("servicio-estado"), { servicio: "../../etc/passwd" })).toBeNull();
    });

    it("el punto de montaje es una ruta absoluta y no la raíz", () => {
        expect(validarArgsOrden(def("almacen-montar"), { disco: "SERIE-1", punto: "/mnt/almacen", confirmar: true })).toEqual({ disco: "SERIE-1", punto: "/mnt/almacen", confirmar: true });
        expect(validarArgsOrden(def("almacen-montar"), { disco: "SERIE-1", punto: "/", confirmar: true })).toBeNull();
        expect(validarArgsOrden(def("almacen-montar"), { disco: "SERIE-1", punto: "/mnt/../etc", confirmar: true })).toBeNull();
    });

    it("aplica defectos y respeta los topes de los enteros", () => {
        expect(validarArgsOrden(def("registros"), { servicio: "mando" })).toEqual({ servicio: "mando", lineas: 100 });
        expect(validarArgsOrden(def("registros"), { servicio: "mando", lineas: 50 })).toEqual({ servicio: "mando", lineas: 50 });
        expect(validarArgsOrden(def("registros"), { servicio: "mando", lineas: 0 })).toBeNull();
        expect(validarArgsOrden(def("registros"), { servicio: "mando", lineas: 1001 })).toBeNull();
        expect(validarArgsOrden(def("registros"), { servicio: "mando", lineas: "muchas" })).toBeNull();
    });

    it("el disco se identifica por serie, nunca por una ruta suelta", () => {
        expect(validarArgsOrden(def("almacen-formatear"), { disco: "SERIE-1", confirmar: true })).toEqual({ disco: "SERIE-1", confirmar: true });
        expect(validarArgsOrden(def("almacen-formatear"), { disco: "/dev/sda", confirmar: true })).toBeNull();
        expect(validarArgsOrden(def("almacen-formatear"), { confirmar: true })).toBeNull();
    });

    it("valida el canal de actualización y la caducidad del modo completo", () => {
        expect(validarArgsOrden(def("actualizar-app"), {})).toEqual({ canal: "stable", confirmar: false });
        expect(validarArgsOrden(def("actualizar-app"), { canal: "diario" })).toBeNull();
        expect(validarArgsOrden(def("modo-completo"), { activo: true })).toEqual({ activo: true, caducidadMin: 60, confirmar: false });
        expect(validarArgsOrden(def("modo-completo"), { activo: true, caducidadMin: 0 })).toBeNull();
        expect(validarArgsOrden(def("modo-completo"), { activo: true, caducidadMin: 1441 })).toBeNull();
    });
});

describe("ayudante · compuertas locales", () => {
    it("sin permiso encendido en el aparato no entra nada", () => {
        const r = evaluarOrden(def("almacen-estado"), { ...ESTADO_BASE, permisoEncendido: false });
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("permiso-apagado");
    });

    it("con el aparato bloqueado no entra nada", () => {
        const r = evaluarOrden(def("almacen-estado"), { ...ESTADO_BASE, desbloqueado: false });
        expect(r.motivo).toBe("aparato-bloqueado");
    });

    it("rechaza una orden que ese sistema no conoce", () => {
        const r = evaluarOrden(def("almacen-formatear"), { ...ESTADO_BASE, sistema: "android" }, { disco: "SERIE-1", confirmar: true });
        expect(r.motivo).toBe("sistema-no-soportado");
    });

    it("exige el nivel y el ayudante privilegiado", () => {
        expect(evaluarOrden(def("servicio-reiniciar"), { ...ESTADO_BASE, nivel: "usuario" }, { servicio: "mando", confirmar: true }).motivo).toBe("nivel-insuficiente");
        expect(evaluarOrden(def("almacen-formatear"), { ...ESTADO_BASE, ayudanteDisponible: false }, { disco: "SERIE-1", confirmar: true }).motivo).toBe("ayudante-no-disponible");
    });

    it("una orden destructiva no corre sin confirmación explícita", () => {
        const sinConfirmar = evaluarOrden(def("almacen-formatear"), ESTADO_BASE, { disco: "SERIE-1" });
        expect(sinConfirmar.ok).toBe(false);
        expect(sinConfirmar.motivo).toBe("necesita-confirmacion");
        const confirmada = evaluarOrden(def("almacen-formatear"), ESTADO_BASE, { disco: "SERIE-1", confirmar: true });
        expect(confirmada.ok).toBe(true);
        expect(confirmada.args).toEqual({ disco: "SERIE-1", confirmar: true });
    });

    it("el modo completo exige caducidad vigente cuando una orden lo pide", () => {
        const conModo: DefinicionOrdenAyudante = {
            ...def("almacen-estado"),
            nombre: "prueba-con-modo",
            requiereModoCompleto: true,
            requiereAyudante: false,
            requiereConfirmacion: "nunca",
            parametros: [],
        };
        expect(evaluarOrden(conModo, { ...ESTADO_BASE, modoCompletoHasta: null }).motivo).toBe("modo-completo-requerido");
        expect(evaluarOrden(conModo, { ...ESTADO_BASE, modoCompletoHasta: 1000 }, {}, 2000).motivo).toBe("modo-completo-caducado");
        expect(evaluarOrden(conModo, { ...ESTADO_BASE, modoCompletoHasta: 3000 }, {}, 2000).ok).toBe(true);
    });

    it("el modo completo pide confirmación al encender, no al apagar", () => {
        expect(evaluarOrden(def("modo-completo"), ESTADO_BASE, { activo: true }).motivo).toBe("necesita-confirmacion");
        expect(evaluarOrden(def("modo-completo"), ESTADO_BASE, { activo: true, confirmar: true }).ok).toBe(true);
        expect(evaluarOrden(def("modo-completo"), ESTADO_BASE, { activo: false }).ok).toBe(true);
    });

    it("la caducidad se mide contra el reloj que se le pasa", () => {
        expect(modoCompletoVigente(2000, 1000)).toBe(true);
        expect(modoCompletoVigente(1000, 1000)).toBe(false);
        expect(modoCompletoVigente(null, 1000)).toBe(false);
    });
});

describe("ayudante · cliente compartido", () => {
    it("manda la orden normalizada por la costura del transporte", async () => {
        const enviadas: { nombre: string; args: Args }[] = [];
        const cliente = crearClienteAyudante(ESTADO_BASE, async (orden) => {
            enviadas.push(orden);
            return { ok: true, salida: "hecho" };
        }, () => 1000);
        const r = await cliente.ejecutar("almacen-formatear", { disco: "SERIE-1", confirmar: true });
        expect(r.ok).toBe(true);
        expect(r.salida).toBe("hecho");
        expect(enviadas).toEqual([{ nombre: "almacen-formatear", args: { disco: "SERIE-1", confirmar: true } }]);
    });

    it("no manda nada si el permiso está apagado", async () => {
        let llamado = false;
        const cliente = crearClienteAyudante({ ...ESTADO_BASE, permisoEncendido: false }, async () => {
            llamado = true;
            return { ok: true };
        });
        const r = await cliente.ejecutar("almacen-estado");
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("permiso-apagado");
        expect(llamado).toBe(false);
    });

    it("rechaza una orden que no está en el catálogo", async () => {
        const r = await crearClienteAyudante(ESTADO_BASE).ejecutar("borrar-todo");
        expect(r.ok).toBe(false);
        expect(r.motivo).toBe("orden-desconocida");
    });

    it("sin transporte no finge que ejecutó", async () => {
        const r = await crearClienteAyudante(ESTADO_BASE).ejecutar("almacen-estado");
        expect(r.motivo).toBe("sin-transporte");
    });

    it("un transporte que falla o lanza se informa como tal", async () => {
        const falla = await crearClienteAyudante(ESTADO_BASE, async () => ({ ok: false, error: "sin-ayudante" })).ejecutar("almacen-estado");
        expect(falla.ok).toBe(false);
        expect(falla.error).toBe("sin-ayudante");
        const lanza = await crearClienteAyudante(ESTADO_BASE, async () => {
            throw new Error("red");
        }).ejecutar("almacen-estado");
        expect(lanza.motivo).toBe("transporte-fallo");
    });

    it("lee el estado al momento: apagar el permiso surte efecto sin reconstruir el cliente", () => {
        let estado: EstadoAparato = ESTADO_BASE;
        const cliente = crearClienteAyudante(() => estado);
        expect(cliente.puede("almacen-estado").ok).toBe(true);
        estado = { ...ESTADO_BASE, permisoEncendido: false };
        expect(cliente.puede("almacen-estado").motivo).toBe("permiso-apagado");
    });

    it("filtra el catálogo por el sistema del aparato", () => {
        const linux = crearClienteAyudante(ESTADO_BASE).paraEsteAparato().map((o) => o.nombre);
        expect(linux).toContain("almacen-formatear");
        const android = crearClienteAyudante({ ...ESTADO_BASE, sistema: "android" }).paraEsteAparato().map((o) => o.nombre);
        expect(android).toContain("almacen-estado");
        expect(android).not.toContain("almacen-formatear");
    });

    it("informa del modo completo vigente con el reloj del cliente", () => {
        const cliente = crearClienteAyudante({ ...ESTADO_BASE, modoCompletoHasta: 2000 }, undefined, () => 1500);
        expect(cliente.modoCompletoVigente()).toBe(true);
        const caducado = crearClienteAyudante({ ...ESTADO_BASE, modoCompletoHasta: 1000 }, undefined, () => 1500);
        expect(caducado.modoCompletoVigente()).toBe(false);
    });
});
