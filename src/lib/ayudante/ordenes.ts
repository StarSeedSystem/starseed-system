/**
 * Ayudante · contrato único de órdenes tipadas para todos los sistemas
 * (TRM1125J-d1 · architecture/terminal-entre-neuronas.md §35 y control-remoto-entre-neuronas.md).
 *
 * Un solo catálogo de órdenes tipadas (almacenes, servicios StarSeed, actualizar, registros,
 * reiniciar app, modo completo con caducidad) con sus parámetros, guardas y sistemas donde existe.
 * Lo usan Genesis, PoliGenesis, Astraura, Protomolécula y el control remoto.
 * Puro, sin `node:*`, nunca lanza.
 */

export type Sistema = "linux" | "macos" | "windows" | "android";
export type TipoOrden = "almacenes" | "servicios" | "actualizar" | "registros" | "reiniciar-app" | "modo-completo";
export type NivelTerminal = "usuario" | "administrador";
export type ModoAdmin = "tipado" | "completo";

export interface ArgsOrden {
    [clave: string]: unknown;
}

export interface ComandoAyudante {
    nombre: string;
    tipo: TipoOrden;
    descripcion: string;
    args: ArgsOrden;
    ejemploArgs: ArgsOrden;
    requiereAdminCompleto: boolean;
    requiereAyudante: boolean;
    sistemas: readonly Sistema[];
}

export const COMANDOS_AYUDANTE: readonly ComandoAyudante[] = [
    {
        nombre: "almacen-estado",
        tipo: "almacenes",
        descripcion: "Estado de los almacenes",
        args: {},
        ejemploArgs: {},
        requiereAdminCompleto: false,
        requiereAyudante: false,
        sistemas: ["linux", "macos", "windows", "android"],
    },
    {
        nombre: "almacen-salud",
        tipo: "almacenes",
        descripcion: "Salud de un disco/volumen (por serie)",
        args: { disco: "" },
        ejemploArgs: { disco: "ABC123" },
        requiereAdminCompleto: false,
        requiereAyudante: false,
        sistemas: ["linux", "macos", "windows", "android"],
    },
    {
        nombre: "almacen-formatear",
        tipo: "almacenes",
        descripcion: "Formatea solo discos autorizados por su serie",
        args: { disco: "", confirmar: false },
        ejemploArgs: { disco: "ABC123", confirmar: true },
        requiereAdminCompleto: true,
        requiereAyudante: true,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "almacen-montar",
        tipo: "almacenes",
        descripcion: "Monta un disco autorizado",
        args: { disco: "", punto: "" },
        ejemploArgs: { disco: "ABC123", punto: "/mnt/disco" },
        requiereAdminCompleto: true,
        requiereAyudante: true,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "almacen-desmontar",
        tipo: "almacenes",
        descripcion: "Desmonta un disco",
        args: { disco: "" },
        ejemploArgs: { disco: "ABC123" },
        requiereAdminCompleto: true,
        requiereAyudante: true,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "almacen-verificar",
        tipo: "almacenes",
        descripcion: "Verifica la integridad de un disco/volumen",
        args: { disco: "" },
        ejemploArgs: { disco: "ABC123" },
        requiereAdminCompleto: false,
        requiereAyudante: false,
        sistemas: ["linux", "macos", "windows", "android"],
    },
    {
        nombre: "servicio-estado",
        tipo: "servicios",
        descripcion: "Estado de un servicio StarSeed",
        args: { nombre: "" },
        ejemploArgs: { nombre: "starseed" },
        requiereAdminCompleto: false,
        requiereAyudante: false,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "servicio-reiniciar",
        tipo: "servicios",
        descripcion: "Reinicia un servicio StarSeed",
        args: { nombre: "", confirmar: false },
        ejemploArgs: { nombre: "starseed", confirmar: true },
        requiereAdminCompleto: true,
        requiereAyudante: true,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "actualizar",
        tipo: "actualizar",
        descripcion: "Actualiza el sistema (canal: stable/beta/nightly)",
        args: { canal: "", confirmar: false },
        ejemploArgs: { canal: "stable", confirmar: true },
        requiereAdminCompleto: true,
        requiereAyudante: true,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "registros",
        tipo: "registros",
        descripcion: "Lee registros de un servicio",
        args: { servicio: "", lineas: 100 },
        ejemploArgs: { servicio: "starseed", lineas: 50 },
        requiereAdminCompleto: false,
        requiereAyudante: false,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "reiniciar-app",
        tipo: "reiniciar-app",
        descripcion: "Reinicia la app StarSeed",
        args: { confirmar: false },
        ejemploArgs: { confirmar: true },
        requiereAdminCompleto: true,
        requiereAyudante: true,
        sistemas: ["linux", "macos", "windows"],
    },
    {
        nombre: "modo-completo",
        tipo: "modo-completo",
        descripcion: "Activa el modo administrador completo con caducidad (minutos)",
        args: { caducidadMin: 60 },
        ejemploArgs: { caducidadMin: 60 },
        requiereAdminCompleto: true,
        requiereAyudante: true,
        sistemas: ["linux", "macos", "windows"],
    },
];

function comando(nombre: string): ComandoAyudante | null {
    return COMANDOS_AYUDANTE.find((c) => c.nombre === nombre) ?? null;
}

export function tipoOrden(nombre: string): TipoOrden | null {
    return comando(nombre)?.tipo ?? null;
}

export function sistemasOrden(nombre: string): readonly Sistema[] {
    return comando(nombre)?.sistemas ?? [];
}

export function requiereAdminCompleto(nombre: string): boolean {
    return comando(nombre)?.requiereAdminCompleto ?? false;
}

export function requiereAyudante(nombre: string): boolean {
    return comando(nombre)?.requiereAyudante ?? false;
}

const RE_CANAL = /^(stable|beta|nightly)$/;
const RE_ENTERO_POSITIVO = /^[1-9][0-9]*$/;

function soloClaves(a: ArgsOrden, permitidas: string[]): boolean {
    return Object.keys(a).every((k) => permitidas.includes(k));
}

function validarAlmacenSalud(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["disco"]) || typeof a.disco !== "string" || a.disco.length === 0) return null;
    return { disco: a.disco };
}

function validarAlmacenFormatear(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["disco", "confirmar"]) || typeof a.disco !== "string" || a.disco.length === 0) return null;
    if (a.confirmar !== true) return null;
    return { disco: a.disco, confirmar: true };
}

function validarAlmacenMontar(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["disco", "punto"]) || typeof a.disco !== "string" || a.disco.length === 0 || typeof a.punto !== "string" || a.punto.length === 0) return null;
    return { disco: a.disco, punto: a.punto };
}

function validarAlmacenDesmontar(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["disco"]) || typeof a.disco !== "string" || a.disco.length === 0) return null;
    return { disco: a.disco };
}

function validarAlmacenVerificar(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["disco"]) || typeof a.disco !== "string" || a.disco.length === 0) return null;
    return { disco: a.disco };
}

function validarServicioEstado(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["nombre"]) || typeof a.nombre !== "string" || a.nombre.length === 0) return null;
    return { nombre: a.nombre };
}

function validarServicioReiniciar(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["nombre", "confirmar"]) || typeof a.nombre !== "string" || a.nombre.length === 0) return null;
    if (a.confirmar !== true) return null;
    return { nombre: a.nombre, confirmar: true };
}

function validarActualizar(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["canal", "confirmar"]) || typeof a.canal !== "string" || !RE_CANAL.test(a.canal)) return null;
    if (a.confirmar !== true) return null;
    return { canal: a.canal, confirmar: true };
}

function validarRegistros(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["servicio", "lineas"]) || typeof a.servicio !== "string" || a.servicio.length === 0) return null;
    if (typeof a.lineas !== "number" || !Number.isInteger(a.lineas) || a.lineas < 1 || a.lineas > 10000) return null;
    return { servicio: a.servicio, lineas: a.lineas };
}

function validarReiniciarApp(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["confirmar"])) return null;
    if (a.confirmar !== true) return null;
    return { confirmar: true };
}

function validarModoCompleto(a: ArgsOrden): ArgsOrden | null {
    if (!soloClaves(a, ["caducidadMin"])) return null;
    const min = a.caducidadMin;
    if (typeof min !== "number" || !Number.isInteger(min) || min < 1 || min > 1440) return null;
    return { caducidadMin: min };
}

const VALIDADORES: Record<string, (a: ArgsOrden) => ArgsOrden | null> = {
    "almacen-estado": () => ({}),
    "almacen-salud": validarAlmacenSalud,
    "almacen-formatear": validarAlmacenFormatear,
    "almacen-montar": validarAlmacenMontar,
    "almacen-desmontar": validarAlmacenDesmontar,
    "almacen-verificar": validarAlmacenVerificar,
    "servicio-estado": validarServicioEstado,
    "servicio-reiniciar": validarServicioReiniciar,
    actualizar: validarActualizar,
    registros: validarRegistros,
    "reiniciar-app": validarReiniciarApp,
    "modo-completo": validarModoCompleto,
};

export function validarArgs(nombre: string, args: ArgsOrden): ArgsOrden | null {
    const validador = VALIDADORES[nombre];
    if (!validador) return null;
    return validador(args);
}

export interface ContextoCliente {
    enviarOrden: (nombre: string, args: ArgsOrden) => Promise<{ ok: boolean; salida: string; error?: string }>;
    sistema: Sistema;
    ayudanteDisponible: boolean;
}

export interface ClienteAyudante {
    almacenEstado: () => Promise<{ ok: boolean; salida: string; error?: string }>;
    almacenSalud: (disco: string) => Promise<{ ok: boolean; salida: string; error?: string }>;
    almacenFormatear: (disco: string, confirmar: boolean) => Promise<{ ok: boolean; salida: string; error?: string }>;
    almacenMontar: (disco: string, punto: string) => Promise<{ ok: boolean; salida: string; error?: string }>;
    almacenDesmontar: (disco: string) => Promise<{ ok: boolean; salida: string; error?: string }>;
    almacenVerificar: (disco: string) => Promise<{ ok: boolean; salida: string; error?: string }>;
    servicioEstado: (nombre: string) => Promise<{ ok: boolean; salida: string; error?: string }>;
    servicioReiniciar: (nombre: string, confirmar: boolean) => Promise<{ ok: boolean; salida: string; error?: string }>;
    actualizar: (canal: "stable" | "beta" | "nightly", confirmar: boolean) => Promise<{ ok: boolean; salida: string; error?: string }>;
    registros: (servicio: string, lineas: number) => Promise<{ ok: boolean; salida: string; error?: string }>;
    reiniciarApp: (confirmar: boolean) => Promise<{ ok: boolean; salida: string; error?: string }>;
    modoCompleto: (caducidadMin: number) => Promise<{ ok: boolean; salida: string; error?: string }>;
}

function comprobarSistema(sistema: Sistema, sistemas: readonly Sistema[]): { ok: boolean; error?: string } {
    if (!sistemas.includes(sistema)) return { ok: false, error: "sistema-no-soportado" };
    return { ok: true };
}

function comprobarAyudante(requiere: boolean, disponible: boolean): { ok: boolean; error?: string } {
    if (requiere && !disponible) return { ok: false, error: "ayudante-no-disponible" };
    return { ok: true };
}

export function crearClienteAyudante(ctx: ContextoCliente): ClienteAyudante {
    const { enviarOrden, sistema, ayudanteDisponible } = ctx;

    async function ejecutar(nombre: string, args: ArgsOrden): Promise<{ ok: boolean; salida: string; error?: string }> {
        const cmd = comando(nombre);
        if (!cmd) return { ok: false, salida: "", error: "comando-desconocido" };
        const sys = comprobarSistema(sistema, cmd.sistemas);
        if (!sys.ok) return { ok: false, salida: "", error: sys.error };
        const ay = comprobarAyudante(cmd.requiereAyudante, ayudanteDisponible);
        if (!ay.ok) return { ok: false, salida: "", error: ay.error };
        const validados = validarArgs(nombre, args);
        if (!validados) return { ok: false, salida: "", error: "argumentos" };
        return enviarOrden(nombre, validados);
    }

    return {
        almacenEstado: () => ejecutar("almacen-estado", {}),
        almacenSalud: (disco: string) => ejecutar("almacen-salud", { disco }),
        almacenFormatear: (disco: string, confirmar: boolean) => ejecutar("almacen-formatear", { disco, confirmar }),
        almacenMontar: (disco: string, punto: string) => ejecutar("almacen-montar", { disco, punto }),
        almacenDesmontar: (disco: string) => ejecutar("almacen-desmontar", { disco }),
        almacenVerificar: (disco: string) => ejecutar("almacen-verificar", { disco }),
        servicioEstado: (nombre: string) => ejecutar("servicio-estado", { nombre }),
        servicioReiniciar: (nombre: string, confirmar: boolean) => ejecutar("servicio-reiniciar", { nombre, confirmar }),
        actualizar: (canal: "stable" | "beta" | "nightly", confirmar: boolean) => ejecutar("actualizar", { canal, confirmar }),
        registros: (servicio: string, lineas: number) => ejecutar("registros", { servicio, lineas }),
        reiniciarApp: (confirmar: boolean) => ejecutar("reiniciar-app", { confirmar }),
        modoCompleto: (caducidadMin: number) => ejecutar("modo-completo", { caducidadMin }),
    };
}