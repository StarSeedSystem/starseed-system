/**
 * Destinos de instalación (PURO) — dónde vive cada app que instalas desde la Biblioteca.
 *
 * (2026-09-25) Alex: «al presionar el botón de instalar se deben seleccionar los medios de
 * instalación, incluyendo solo en la web en servidores StarSeed, vincular y sincronizar
 * las descargas en el dispositivo desde donde se instale, y que aparezcan las neuronas
 * (dispositivos) vinculadas con esa cuenta y los perfiles».
 *
 * Un «destino» es UNA instalación de UNA app en UN sitio:
 *   · web      → la app se abre desde los servidores StarSeed / su web oficial; nada que descargar.
 *   · neurona  → un dispositivo de la cuenta (este u otro). Si es otro, la instalación queda
 *                «pedida» hasta que esa neurona la acepte: un navegador no puede instalar
 *                nada sin que la persona lo confirme en ESE dispositivo (y así debe ser).
 * Cada destino puede ir a la biblioteca de un perfil concreto de la cuenta.
 *
 * La lista se sincroniza entre neuronas por `user_settings.prefs.instalaciones`
 * (ver instalaciones-store.ts); aquí solo hay tipos y reglas puras.
 */

export type TipoDestino = "web" | "neurona";

export type EstadoDestino =
    /** Pedida desde otra neurona: espera a que este dispositivo la acepte. */
    | "pedida"
    /** El instalador se descargó (o se abrió su enlace) en ese dispositivo. */
    | "descargada"
    /** Lista para usarse (web, PWA instalada o app nativa confirmada). */
    | "instalada"
    | "cancelada"
    | "fallida";

export type MedioInstalacion = "web" | "pwa" | "descarga" | "tienda";

export interface DestinoInstalacion {
    id: string;
    appId: string;
    appNombre: string;
    tipo: TipoDestino;
    /** Id de la neurona (neuron_devices.id) cuando tipo === "neurona". */
    neuronaId?: string;
    neuronaNombre?: string;
    /** Perfil de la cuenta en cuya biblioteca aparece la app (null = biblioteca de la cuenta). */
    perfilId?: string | null;
    perfilNombre?: string | null;
    estado: EstadoDestino;
    medio?: MedioInstalacion;
    /** Nombre del archivo del instalador, si hubo descarga. */
    archivo?: string;
    /** Versión instalada (tag del release oficial, p. ej. «v2.0.0»). */
    version?: string;
    /** Carpeta donde se guardó (texto legible, nunca una ruta absoluta con el nombre del usuario). */
    carpeta?: string;
    /** Neurona que la pidió (para «pedida desde tu Mac»). */
    pedidaDesde?: string;
    creada: number;
    actualizada: number;
}

let secuencia = 0;

export function nuevoIdDestino(ahora = Date.now()): string {
    secuencia = (secuencia + 1) % 1_000_000;
    return `dest-${ahora.toString(36)}-${secuencia.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** ¿Es un destino bien formado? (lo que llega de la nube no se da por bueno). */
export function esDestino(v: unknown): v is DestinoInstalacion {
    if (!v || typeof v !== "object") return false;
    const d = v as Record<string, unknown>;
    return (
        typeof d.id === "string" &&
        typeof d.appId === "string" &&
        typeof d.appNombre === "string" &&
        (d.tipo === "web" || d.tipo === "neurona") &&
        typeof d.estado === "string" &&
        typeof d.creada === "number" &&
        typeof d.actualizada === "number"
    );
}

/**
 * Fusión de dos listas (local y nube): por id gana la versión más reciente
 * (`actualizada`). Nunca se pierde un destino que solo exista en un lado.
 * Orden: más recientes primero. Se guardan como mucho `tope` destinos.
 */
export function fusionarDestinos(
    a: readonly DestinoInstalacion[],
    b: readonly DestinoInstalacion[],
    tope = 400,
): DestinoInstalacion[] {
    const porId = new Map<string, DestinoInstalacion>();
    for (const d of [...a, ...b]) {
        if (!esDestino(d)) continue;
        const ya = porId.get(d.id);
        if (!ya || d.actualizada > ya.actualizada) porId.set(d.id, d);
    }
    return [...porId.values()].sort((x, y) => y.actualizada - x.actualizada).slice(0, tope);
}

/** Destinos pedidos PARA esta neurona que aún esperan su «sí». */
export function pendientesPara(neuronaId: string, lista: readonly DestinoInstalacion[]): DestinoInstalacion[] {
    return lista.filter((d) => d.tipo === "neurona" && d.neuronaId === neuronaId && d.estado === "pedida");
}

/** Todos los sitios donde vive una app (sin cancelados), para «Instalada en…». */
export function destinosDeApp(appId: string, lista: readonly DestinoInstalacion[]): DestinoInstalacion[] {
    return lista.filter((d) => d.appId === appId && d.estado !== "cancelada");
}

/** Cambia el estado de un destino (inmutable). */
export function conEstado(
    d: DestinoInstalacion,
    estado: EstadoDestino,
    extra: Partial<DestinoInstalacion> = {},
    ahora = Date.now(),
): DestinoInstalacion {
    return { ...d, ...extra, estado, actualizada: Math.max(ahora, d.actualizada + 1) };
}

/** «web», «tu MacBook», «Móvil de Ana · perfil Arte» — etiqueta corta de un destino. */
export function etiquetaDestino(d: DestinoInstalacion, estaNeuronaId?: string): string {
    const donde =
        d.tipo === "web"
            ? "En la web (servidores StarSeed)"
            : d.neuronaId && d.neuronaId === estaNeuronaId
              ? `Este dispositivo${d.neuronaNombre ? ` (${d.neuronaNombre})` : ""}`
              : d.neuronaNombre || "Otra neurona";
    return d.perfilNombre ? `${donde} · perfil ${d.perfilNombre}` : donde;
}

export const ETIQUETA_ESTADO: Record<EstadoDestino, string> = {
    pedida: "esperando que ese dispositivo acepte",
    descargada: "instalador descargado",
    instalada: "instalada",
    cancelada: "cancelada",
    fallida: "no se pudo instalar",
};
