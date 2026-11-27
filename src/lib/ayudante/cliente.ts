/**
 * Ayudante · cliente único del contrato de órdenes tipadas (TRM1125J · parte 2 de 3).
 * Contrato: `architecture/terminal-entre-neuronas.md` §«En todas las versiones nativas» y
 * `architecture/control-remoto-entre-neuronas.md` (permiso apagado por defecto, encendido por el
 * dueño EN el aparato, órdenes selladas con anti-repetición y topes, nada con el aparato bloqueado,
 * las contraseñas nunca viajan). Puro, sin `node:*`, nunca lanza.
 *
 * Lo usan Genesis, PoliGenesis, Astraura, la Protomolécula y el control remoto: el catálogo es el
 * mismo para todos los sistemas (`./ordenes`) y este cliente SOLO envía si el dueño encendió el
 * permiso en el aparato destino. El sellado, la anti-repetición y los topes siguen en el transporte
 * (`control-remoto/sellado.ts` y `control-remoto/orden.ts`); aquí no se reimplementan.
 */

import {
    COMANDOS_AYUDANTE,
    validarArgs,
    type ArgsOrden,
    type ComandoAyudante,
    type ModoAdmin,
    type NivelTerminal,
    type Sistema,
} from "./ordenes";

export type MotivoRechazo =
    | "permiso-apagado"
    | "comando-desconocido"
    | "sistema-no-soportado"
    | "requiere-administrador"
    | "ayudante-no-disponible"
    | "requiere-admin-completo"
    | "modo-completo-caducado"
    | "argumentos";

export interface ResultadoOrden {
    ok: boolean;
    salida: string;
    error?: string;
    motivo?: MotivoRechazo;
}

export interface PermisoAparato {
    /** El dueño lo enciende EN ESTE aparato. Apagado por defecto. */
    encendido: boolean;
    nivel: NivelTerminal;
    modo: ModoAdmin;
    /** epoch ms hasta el que vale el modo completo; null o pasado = caducado. */
    completoHasta: number | null;
}

export const PERMISO_APAGADO: PermisoAparato = {
    encendido: false,
    nivel: "usuario",
    modo: "tipado",
    completoHasta: null,
};

export interface ContextoCliente {
    sistema: Sistema;
    ayudanteDisponible: boolean;
    permiso?: PermisoAparato;
    enviar: (nombre: string, args: ArgsOrden) => Promise<ResultadoOrden>;
    ahora?: () => number;
    registrar?: (entrada: { nombre: string; args: ArgsOrden; resultado: ResultadoOrden }) => void;
}

type Entrega = Promise<ResultadoOrden>;

export interface ClienteAyudante {
    ejecutar: (nombre: string, args?: ArgsOrden) => Entrega;
    motivo: (nombre: string) => MotivoRechazo | null;
    catalogo: () => readonly ComandoAyudante[];
    almacenEstado: () => Entrega;
    almacenSalud: (disco: string) => Entrega;
    almacenFormatear: (disco: string, confirmar: boolean) => Entrega;
    almacenMontar: (disco: string, punto: string) => Entrega;
    almacenDesmontar: (disco: string) => Entrega;
    almacenVerificar: (disco: string) => Entrega;
    servicioEstado: (nombre: string) => Entrega;
    servicioReiniciar: (nombre: string, confirmar: boolean) => Entrega;
    actualizar: (canal: "stable" | "beta" | "nightly", confirmar: boolean) => Entrega;
    registros: (servicio: string, lineas: number) => Entrega;
    reiniciarApp: (confirmar: boolean) => Entrega;
    modoCompleto: (caducidadMin: number) => Entrega;
}

export function modoCompletoVigente(permiso: PermisoAparato, ahora: number): boolean {
    return (
        permiso.modo === "completo" &&
        typeof permiso.completoHasta === "number" &&
        Number.isFinite(permiso.completoHasta) &&
        ahora < permiso.completoHasta
    );
}

export function permisoEfectivo(permiso: PermisoAparato, ahora: number): PermisoAparato {
    if (permiso.modo === "completo" && !modoCompletoVigente(permiso, ahora)) {
        return { ...permiso, modo: "tipado", completoHasta: null };
    }
    return permiso;
}

export function catalogoParaSistema(sistema: Sistema): readonly ComandoAyudante[] {
    return COMANDOS_AYUDANTE.filter((c) => c.sistemas.includes(sistema));
}

function buscarComando(nombre: string): ComandoAyudante | null {
    return COMANDOS_AYUDANTE.find((c) => c.nombre === nombre) ?? null;
}

function motivoPrevio(nombre: string, ctx: ContextoCliente): MotivoRechazo | null {
    if (!(ctx.permiso ?? PERMISO_APAGADO).encendido) return "permiso-apagado";
    const cmd = buscarComando(nombre);
    if (!cmd) return "comando-desconocido";
    return cmd.sistemas.includes(ctx.sistema) ? null : "sistema-no-soportado";
}

function motivoGuardas(cmd: ComandoAyudante, ctx: ContextoCliente, ahora: number): MotivoRechazo | null {
    const p = ctx.permiso ?? PERMISO_APAGADO;
    if (cmd.requiereAyudante && p.nivel !== "administrador") return "requiere-administrador";
    if (cmd.requiereAyudante && !ctx.ayudanteDisponible) return "ayudante-no-disponible";
    if (cmd.requiereAdminCompleto) {
        if (p.modo !== "completo") return "requiere-admin-completo";
        if (!modoCompletoVigente(p, ahora)) return "modo-completo-caducado";
    }
    return null;
}

/** Motivo por el que una orden NO se puede enviar (sin mirar sus argumentos), o null. Puro. */
export function motivoRechazo(nombre: string, ctx: ContextoCliente, ahora: number): MotivoRechazo | null {
    const previo = motivoPrevio(nombre, ctx);
    if (previo) return previo;
    const cmd = buscarComando(nombre);
    return cmd ? motivoGuardas(cmd, ctx, ahora) : "comando-desconocido";
}

export function crearClienteAyudante(ctx: ContextoCliente): ClienteAyudante {
    const reloj = () => (ctx.ahora ?? Date.now)();

    const ejecutar = async (nombre: string, args: ArgsOrden = {}): Promise<ResultadoOrden> => {
        const ahora = reloj();
        const previo = motivoPrevio(nombre, ctx);
        if (previo) return { ok: false, salida: "", error: previo, motivo: previo };
        const validados = validarArgs(nombre, args);
        if (!validados) return { ok: false, salida: "", error: "argumentos", motivo: "argumentos" };
        const cmd = buscarComando(nombre);
        const guarda = cmd ? motivoGuardas(cmd, ctx, ahora) : "comando-desconocido";
        if (guarda) return { ok: false, salida: "", error: guarda, motivo: guarda };
        let resultado: ResultadoOrden;
        try {
            resultado = await ctx.enviar(nombre, validados);
        } catch {
            resultado = { ok: false, salida: "", error: "transporte" };
        }
        if (!resultado || typeof resultado.ok !== "boolean") {
            resultado = { ok: false, salida: "", error: "transporte" };
        }
        try {
            ctx.registrar?.({ nombre, args: validados, resultado });
        } catch {
            /* el registro no puede tumbar la orden */
        }
        return resultado;
    };

    return {
        ejecutar,
        motivo: (nombre) => motivoRechazo(nombre, ctx, reloj()),
        catalogo: () => catalogoParaSistema(ctx.sistema),
        almacenEstado: () => ejecutar("almacen-estado"),
        almacenSalud: (disco) => ejecutar("almacen-salud", { disco }),
        almacenFormatear: (disco, confirmar) => ejecutar("almacen-formatear", { disco, confirmar }),
        almacenMontar: (disco, punto) => ejecutar("almacen-montar", { disco, punto }),
        almacenDesmontar: (disco) => ejecutar("almacen-desmontar", { disco }),
        almacenVerificar: (disco) => ejecutar("almacen-verificar", { disco }),
        servicioEstado: (nombre) => ejecutar("servicio-estado", { nombre }),
        servicioReiniciar: (nombre, confirmar) => ejecutar("servicio-reiniciar", { nombre, confirmar }),
        actualizar: (canal, confirmar) => ejecutar("actualizar", { canal, confirmar }),
        registros: (servicio, lineas) => ejecutar("registros", { servicio, lineas }),
        reiniciarApp: (confirmar) => ejecutar("reiniciar-app", { confirmar }),
        modoCompleto: (caducidadMin) => ejecutar("modo-completo", { caducidadMin }),
    };
}
