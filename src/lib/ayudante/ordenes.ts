/**
 * Ayudante con privilegios · UN solo contrato de órdenes tipadas y su cliente (TRM1125J ·
 * `architecture/terminal-entre-neuronas.md` y `control-remoto-entre-neuronas.md`).
 *
 * Puro, sin `node:*`, sin red y nunca lanza. El catálogo dice qué orden existe, qué parámetros lleva,
 * qué guardas la protegen y en qué sistemas está. El cliente lo usan Genesis, PoliGenesis, Astraura,
 * la Protomolécula y el control remoto, y NUNCA ejecuta sin el permiso que el dueño encendió en ESE
 * aparato: el permiso está apagado de fábrica y ningún voto ni orden remota lo enciende. Las
 * contraseñas no viajan: solo se admiten los parámetros declarados aquí y ninguno es un secreto.
 */

import type { Args } from "@/lib/control-remoto/niveles";

export type SistemaAyudante = "linux" | "macos" | "windows" | "android";
export const SISTEMAS_AYUDANTE: readonly SistemaAyudante[] = ["linux", "macos", "windows", "android"];

export type NivelAyudante = "usuario" | "administrador";
export const NIVELES_AYUDANTE: readonly NivelAyudante[] = ["usuario", "administrador"];

export type GrupoOrdenAyudante = "almacenes" | "servicios" | "actualizacion" | "registros" | "app" | "modo";
export const GRUPOS_AYUDANTE: readonly GrupoOrdenAyudante[] = ["almacenes", "servicios", "actualizacion", "registros", "app", "modo"];

export type TipoParametro = "texto" | "serie" | "servicio" | "ruta" | "entero" | "booleano" | "canal";
export type ValorParametro = string | number | boolean;

export interface ParametroOrden {
    nombre: string;
    tipo: TipoParametro;
    requerido?: boolean;
    defecto?: ValorParametro;
    min?: number;
    max?: number;
    maxLongitud?: number;
    valores?: readonly string[];
    descripcion: string;
}

export type GuardaAyudante =
    | "permiso-encendido-en-el-aparato"
    | "aparato-desbloqueado"
    | "ayudante-privilegiado"
    | "confirmacion-en-el-aparato"
    | "disco-autorizado-por-serie"
    | "solo-servicios-starseed"
    | "sin-contrasenas"
    | "anti-repeticion"
    | "topes-de-ritmo"
    | "modo-completo-vigente"
    | "registro-en-el-aparato";

/** Cuándo hace falta la confirmación de una persona EN el aparato. Serializable, sin funciones. */
export type ConfirmacionOrden = "nunca" | "siempre" | "al-activar";

export interface DefinicionOrdenAyudante {
    nombre: string;
    titulo: string;
    grupo: GrupoOrdenAyudante;
    nivel: NivelAyudante;
    requiereModoCompleto: boolean;
    requiereAyudante: boolean;
    requiereConfirmacion: ConfirmacionOrden;
    sistemas: readonly SistemaAyudante[];
    parametros: readonly ParametroOrden[];
    guardas: readonly GuardaAyudante[];
    descripcion: string;
}

export const COMANDO_AYUDANTE_EJECUTAR = "ayudante_ejecutar";
export const COMANDO_AYUDANTE_ESTADO = "ayudante_estado";

const GUARDAS_BASE: readonly GuardaAyudante[] = [
    "permiso-encendido-en-el-aparato",
    "aparato-desbloqueado",
    "sin-contrasenas",
    "anti-repeticion",
    "topes-de-ritmo",
    "registro-en-el-aparato",
];
const GUARDAS_ADMIN: readonly GuardaAyudante[] = [...GUARDAS_BASE, "ayudante-privilegiado", "confirmacion-en-el-aparato"];
const GUARDAS_DISCO: readonly GuardaAyudante[] = [...GUARDAS_BASE, "disco-autorizado-por-serie"];
const GUARDAS_DISCO_ADMIN: readonly GuardaAyudante[] = [...GUARDAS_DISCO, "ayudante-privilegiado", "confirmacion-en-el-aparato"];

const P_DISCO: ParametroOrden = { nombre: "disco", tipo: "serie", requerido: true, maxLongitud: 64, descripcion: "Serie del disco autorizado (nunca una ruta suelta)" };
const P_PUNTO: ParametroOrden = { nombre: "punto", tipo: "ruta", requerido: true, maxLongitud: 512, descripcion: "Punto de montaje absoluto dentro de la carpeta de almacenes" };
const P_CONFIRMAR: ParametroOrden = { nombre: "confirmar", tipo: "booleano", defecto: false, descripcion: "Confirmación explícita en el aparato" };
const P_SERVICIO: ParametroOrden = { nombre: "servicio", tipo: "servicio", requerido: true, maxLongitud: 80, descripcion: "Nombre de un servicio propio de StarSeed" };
const P_LINEAS: ParametroOrden = { nombre: "lineas", tipo: "entero", defecto: 100, min: 1, max: 1000, descripcion: "Cuántas líneas de registro (1 a 1000)" };
const P_CANAL: ParametroOrden = { nombre: "canal", tipo: "canal", defecto: "stable", valores: ["stable", "beta", "nightly"], descripcion: "Canal de actualización" };
const P_ACTIVO: ParametroOrden = { nombre: "activo", tipo: "booleano", requerido: true, descripcion: "Enciende o apaga el modo administrador completo" };
const P_CADUCIDAD: ParametroOrden = { nombre: "caducidadMin", tipo: "entero", defecto: 60, min: 1, max: 1440, descripcion: "Minutos que dura el modo completo (1 a 1440)" };

export const ORDENES_AYUDANTE: readonly DefinicionOrdenAyudante[] = [
    {
        nombre: "almacen-estado",
        titulo: "Estado de los almacenes",
        grupo: "almacenes",
        nivel: "usuario",
        requiereModoCompleto: false,
        requiereAyudante: false,
        requiereConfirmacion: "nunca",
        sistemas: ["linux", "macos", "windows", "android"],
        parametros: [],
        guardas: GUARDAS_BASE,
        descripcion: "Lista discos, montajes y espacio libre del aparato.",
    },
    {
        nombre: "almacen-salud",
        titulo: "Salud de un almacén",
        grupo: "almacenes",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: true,
        requiereConfirmacion: "nunca",
        sistemas: ["linux", "macos", "windows", "android"],
        parametros: [P_DISCO],
        guardas: GUARDAS_ADMIN,
        descripcion: "Lee el estado de salud del disco por su serie, nunca por una ruta.",
    },
    {
        nombre: "almacen-verificar",
        titulo: "Verificar un almacén",
        grupo: "almacenes",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: true,
        requiereConfirmacion: "nunca",
        sistemas: ["linux", "macos", "windows"],
        parametros: [P_DISCO],
        guardas: GUARDAS_DISCO_ADMIN,
        descripcion: "Comprueba la integridad del disco autorizado por su serie.",
    },
    {
        nombre: "almacen-montar",
        titulo: "Montar un almacén",
        grupo: "almacenes",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: true,
        requiereConfirmacion: "siempre",
        sistemas: ["linux", "macos", "windows"],
        parametros: [P_DISCO, P_PUNTO, P_CONFIRMAR],
        guardas: GUARDAS_DISCO_ADMIN,
        descripcion: "Monta un disco autorizado en un punto de montaje de almacenes.",
    },
    {
        nombre: "almacen-desmontar",
        titulo: "Desmontar un almacén",
        grupo: "almacenes",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: true,
        requiereConfirmacion: "siempre",
        sistemas: ["linux", "macos", "windows"],
        parametros: [P_DISCO, P_CONFIRMAR],
        guardas: GUARDAS_DISCO_ADMIN,
        descripcion: "Desmonta el disco autorizado por su serie.",
    },
    {
        nombre: "almacen-formatear",
        titulo: "Formatear un almacén",
        grupo: "almacenes",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: true,
        requiereConfirmacion: "siempre",
        sistemas: ["linux", "macos", "windows"],
        parametros: [P_DISCO, P_CONFIRMAR],
        guardas: GUARDAS_DISCO_ADMIN,
        descripcion: "Formatea SOLO discos autorizados por su serie; jamás uno elegido por ruta.",
    },
    {
        nombre: "servicio-estado",
        titulo: "Estado de un servicio StarSeed",
        grupo: "servicios",
        nivel: "usuario",
        requiereModoCompleto: false,
        requiereAyudante: false,
        requiereConfirmacion: "nunca",
        sistemas: ["linux", "macos", "windows", "android"],
        parametros: [P_SERVICIO],
        guardas: [...GUARDAS_BASE, "solo-servicios-starseed"],
        descripcion: "Dice si un servicio propio de StarSeed está vivo y desde cuándo.",
    },
    {
        nombre: "servicio-reiniciar",
        titulo: "Reiniciar un servicio StarSeed",
        grupo: "servicios",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: true,
        requiereConfirmacion: "siempre",
        sistemas: ["linux", "macos", "windows"],
        parametros: [P_SERVICIO, P_CONFIRMAR],
        guardas: [...GUARDAS_ADMIN, "solo-servicios-starseed"],
        descripcion: "Reinicia solo un servicio propio de StarSeed, con confirmación en el aparato.",
    },
    {
        nombre: "actualizar-app",
        titulo: "Actualizar la app",
        grupo: "actualizacion",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: false,
        requiereConfirmacion: "siempre",
        sistemas: ["linux", "macos", "windows", "android"],
        parametros: [P_CANAL, P_CONFIRMAR],
        guardas: [...GUARDAS_BASE, "confirmacion-en-el-aparato"],
        descripcion: "Actualiza la app StarSeed por el canal elegido; la instalación la confirma una persona.",
    },
    {
        nombre: "registros",
        titulo: "Leer registros",
        grupo: "registros",
        nivel: "usuario",
        requiereModoCompleto: false,
        requiereAyudante: false,
        requiereConfirmacion: "nunca",
        sistemas: ["linux", "macos", "windows", "android"],
        parametros: [P_SERVICIO, P_LINEAS],
        guardas: [...GUARDAS_BASE, "solo-servicios-starseed"],
        descripcion: "Lee las últimas líneas del registro de un servicio StarSeed.",
    },
    {
        nombre: "reiniciar-app",
        titulo: "Reiniciar la app",
        grupo: "app",
        nivel: "usuario",
        requiereModoCompleto: false,
        requiereAyudante: false,
        requiereConfirmacion: "siempre",
        sistemas: ["linux", "macos", "windows", "android"],
        parametros: [P_CONFIRMAR],
        guardas: [...GUARDAS_BASE, "confirmacion-en-el-aparato"],
        descripcion: "Reinicia StarSeed OS en este aparato con confirmación visible.",
    },
    {
        nombre: "modo-completo",
        titulo: "Modo administrador completo",
        grupo: "modo",
        nivel: "administrador",
        requiereModoCompleto: false,
        requiereAyudante: true,
        requiereConfirmacion: "al-activar",
        sistemas: ["linux", "macos", "windows"],
        parametros: [P_ACTIVO, P_CADUCIDAD, P_CONFIRMAR],
        guardas: [...GUARDAS_ADMIN, "modo-completo-vigente"],
        descripcion: "Enciende (con caducidad obligatoria) o apaga el administrador completo; solo lo activa el dueño en este aparato.",
    },
];

export function esSistemaAyudante(x: unknown): x is SistemaAyudante {
    return typeof x === "string" && SISTEMAS_AYUDANTE.includes(x as SistemaAyudante);
}

export function esNivelAyudante(x: unknown): x is NivelAyudante {
    return typeof x === "string" && NIVELES_AYUDANTE.includes(x as NivelAyudante);
}

export function rangoNivelAyudante(n: unknown): number {
    return typeof n === "string" ? NIVELES_AYUDANTE.indexOf(n as NivelAyudante) : -1;
}

export function ordenPorNombre(nombre: unknown): DefinicionOrdenAyudante | null {
    return typeof nombre === "string" ? ORDENES_AYUDANTE.find((o) => o.nombre === nombre) ?? null : null;
}

export function sistemasDeOrden(nombre: unknown): readonly SistemaAyudante[] {
    return ordenPorNombre(nombre)?.sistemas ?? [];
}

export function existeEnSistema(nombre: unknown, sistema: unknown): boolean {
    return esSistemaAyudante(sistema) && (ordenPorNombre(nombre)?.sistemas.includes(sistema) ?? false);
}

function validarParametro(p: ParametroOrden, v: unknown): ValorParametro | undefined {
    if (v === undefined) return undefined;
    if (p.tipo === "booleano") return typeof v === "boolean" ? v : undefined;
    if (p.tipo === "entero") {
        if (typeof v !== "number" || !Number.isSafeInteger(v)) return undefined;
        if (p.min !== undefined && v < p.min) return undefined;
        if (p.max !== undefined && v > p.max) return undefined;
        return v;
    }
    if (typeof v !== "string" || v.length < 1 || v.length > (p.maxLongitud ?? 512)) return undefined;
    if (/[\u0000-\u001f\u007f]/.test(v)) return undefined;
    if (p.tipo === "texto") return v.trim() === "" ? undefined : v;
    if (p.tipo === "serie") return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(v) ? v : undefined;
    if (p.tipo === "servicio") return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v) ? v : undefined;
    if (p.tipo === "ruta") return v.length > 1 && v.startsWith("/") && !v.endsWith("/") && !v.includes("..") && !v.includes("//") ? v : undefined;
    if (p.tipo === "canal") return p.valores?.includes(v) ? v : undefined;
    return undefined;
}

/** Valida y normaliza los argumentos de una orden: solo las claves declaradas, con sus tipos y topes. */
export function validarArgsOrden(def: DefinicionOrdenAyudante, args: Args = {}): Args | null {
    if (!args || typeof args !== "object" || Array.isArray(args)) return null;
    const permitidas = def.parametros.map((p) => p.nombre);
    if (!Object.keys(args).every((k) => permitidas.includes(k))) return null;
    const salida: Args = {};
    for (const p of def.parametros) {
        if (Object.prototype.hasOwnProperty.call(args, p.nombre)) {
            const v = validarParametro(p, args[p.nombre]);
            if (v === undefined) return null;
            salida[p.nombre] = v;
        } else if (p.defecto !== undefined) {
            salida[p.nombre] = p.defecto;
        } else if (p.requerido) {
            return null;
        }
    }
    return salida;
}

export type MotivoRechazoAyudante =
    | "orden-desconocida"
    | "argumentos"
    | "sistema-no-soportado"
    | "permiso-apagado"
    | "aparato-bloqueado"
    | "nivel-insuficiente"
    | "ayudante-no-disponible"
    | "modo-completo-requerido"
    | "modo-completo-caducado"
    | "necesita-confirmacion"
    | "sin-transporte"
    | "transporte-fallo";

export interface EstadoAparato {
    sistema: SistemaAyudante;
    /** Encendido por el dueño EN este aparato; apagado de fábrica. */
    permisoEncendido: boolean;
    ayudanteDisponible: boolean;
    desbloqueado: boolean;
    nivel: NivelAyudante;
    /** Fin (ms epoch) del modo administrador completo, o null si no está activo. */
    modoCompletoHasta?: number | null;
}

export interface ResultadoPuede {
    ok: boolean;
    motivo?: MotivoRechazoAyudante;
    args?: Args;
    def?: DefinicionOrdenAyudante;
}

export interface RespuestaAyudante {
    ok: boolean;
    salida?: string;
    error?: string;
}

export type EnviarOrdenAyudante = (orden: { nombre: string; args: Args }) => Promise<RespuestaAyudante>;

export interface ResultadoEjecucion extends ResultadoPuede {
    salida?: string;
    error?: string;
}

/** El modo completo solo vale mientras su caducidad no haya pasado. */
export function modoCompletoVigente(hasta: number | null | undefined, ahora: number): boolean {
    return typeof hasta === "number" && Number.isFinite(hasta) && hasta > ahora;
}

/** Compuertas locales de una orden concreta: sistema, permiso del dueño, bloqueo, nivel, ayudante y modo. */
export function evaluarOrden(def: DefinicionOrdenAyudante, estado: EstadoAparato, args: Args = {}, ahora: number = Date.now()): ResultadoPuede {
    if (!def.sistemas.includes(estado.sistema)) return { ok: false, motivo: "sistema-no-soportado" };
    if (!estado.permisoEncendido) return { ok: false, motivo: "permiso-apagado" };
    if (!estado.desbloqueado) return { ok: false, motivo: "aparato-bloqueado" };
    const validados = validarArgsOrden(def, args);
    if (!validados) return { ok: false, motivo: "argumentos" };
    if (rangoNivelAyudante(estado.nivel) < rangoNivelAyudante(def.nivel)) return { ok: false, motivo: "nivel-insuficiente" };
    if (def.requiereAyudante && !estado.ayudanteDisponible) return { ok: false, motivo: "ayudante-no-disponible" };
    if (def.requiereModoCompleto) {
        if (estado.modoCompletoHasta == null) return { ok: false, motivo: "modo-completo-requerido" };
        if (!modoCompletoVigente(estado.modoCompletoHasta, ahora)) return { ok: false, motivo: "modo-completo-caducado" };
    }
    const confirma = def.requiereConfirmacion === "siempre" || (def.requiereConfirmacion === "al-activar" && validados.activo === true);
    if (confirma && validados.confirmar !== true) return { ok: false, motivo: "necesita-confirmacion" };
    return { ok: true, args: validados, def };
}

type FuenteEstadoAyudante = EstadoAparato | (() => EstadoAparato);

function estadoActual(f: FuenteEstadoAyudante): EstadoAparato {
    return typeof f === "function" ? f() : f;
}

export interface ClienteAyudante {
    catalogo(): readonly DefinicionOrdenAyudante[];
    /** Solo las órdenes que este sistema conoce (aunque el permiso esté apagado). */
    paraEsteAparato(): readonly DefinicionOrdenAyudante[];
    puede(nombre: string, args?: Args): ResultadoPuede;
    ejecutar(nombre: string, args?: Args): Promise<ResultadoEjecucion>;
    modoCompletoVigente(): boolean;
}

/**
 * El cliente compartido por Genesis, PoliGenesis, Astraura, la Protomolécula y el control remoto.
 * `estado` puede ser un objeto o una función que lo lee al momento: apagar el permiso en el aparato
 * surte efecto en la siguiente orden, sin reconstruir el cliente. `enviar` es la costura con el
 * transporte (sellado y anti-repetición en `control-remoto/sellado.ts` y `orden.ts`).
 */
export function crearClienteAyudante(estado: FuenteEstadoAyudante, enviar?: EnviarOrdenAyudante, ahora: () => number = Date.now): ClienteAyudante {
    const puede = (nombre: string, args: Args = {}): ResultadoPuede => {
        const def = ordenPorNombre(nombre);
        if (!def) return { ok: false, motivo: "orden-desconocida" };
        return evaluarOrden(def, estadoActual(estado), args, ahora());
    };
    return {
        catalogo: () => ORDENES_AYUDANTE,
        paraEsteAparato: () => {
            const sistema = estadoActual(estado).sistema;
            return ORDENES_AYUDANTE.filter((o) => o.sistemas.includes(sistema));
        },
        puede,
        modoCompletoVigente: () => modoCompletoVigente(estadoActual(estado).modoCompletoHasta, ahora()),
        async ejecutar(nombre: string, args: Args = {}): Promise<ResultadoEjecucion> {
            const r = puede(nombre, args);
            if (!r.ok) return { ok: false, motivo: r.motivo };
            if (!enviar) return { ok: false, motivo: "sin-transporte", args: r.args };
            try {
                const res = await enviar({ nombre, args: r.args ?? {} });
                return res.ok
                    ? { ok: true, salida: res.salida, args: r.args }
                    : { ok: false, motivo: "transporte-fallo", error: res.error ?? "transporte-fallo", args: r.args };
            } catch {
                return { ok: false, motivo: "transporte-fallo", error: "transporte-fallo", args: r.args };
            }
        },
    };
}
