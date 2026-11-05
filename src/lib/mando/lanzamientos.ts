export type MedioPanel = { id: string; titulo: string; formatos: Array<{ nombre: string; url: string }> };
export type EstadoMedio = { estado: "al-dia" | "generando" | "verificando" | "atascado" | "no-disponible"; faltan: string[]; pequenos: string[] };
export type Paso = { fase: string; t: number; detalle: string };
export type Job = { medio: string | null; job: string; estado: string; url: string | null; inicio: string | null; fin: string | null };
export type Accion = "lanzar" | "pausar" | "reanudar" | "reintentar" | "regenerar" | "auto";
export type EstadoDirector = { fase: string; detalle: string; version?: string; t: number; pasos?: Paso[]; jobs?: Job[]; medios?: Record<string, EstadoMedio> };
export type Peticion = { accion: Accion; medio?: string; activo?: boolean };
export type ResultadoValidacion = Peticion | Error;
export type FilaMedio = { id: string; titulo: string; formatos: Array<{ nombre: string; url: string }>; version: string; estado: string; detalle: string; accion: string };

const MEDIOS_IDS = ["web", "pwa", "macos", "windows", "linux", "android", "ios", "canales", "libreria"] as const;
type MedioId = (typeof MEDIOS_IDS)[number];
const ACCIONES_CON_MEDIO: readonly Accion[] = ["lanzar", "reintentar", "regenerar"];

const MEDIOS_VALIDOS = new Set<string>();
for (const m of MEDIOS_IDS) MEDIOS_VALIDOS.add(m);
const ACCIONES_VALIDAS = new Set<string>();
for (const a of ["lanzar", "pausar", "reanudar", "reintentar", "regenerar", "auto"] as const) ACCIONES_VALIDAS.add(a);

function esAccionValida(accion: string): accion is Accion { return ACCIONES_VALIDAS.has(accion as Accion) !== false; }
function esMedioValido(medio: string): medio is MedioId { return MEDIOS_IDS.includes(medio as MedioId); }
function esAccionConMedio(accion: string): accion is Accion { return ACCIONES_CON_MEDIO.includes(accion as Accion); }

const MEDIOS_TITULOS: Record<MedioId, string> = { web: "Sitio web oficial", pwa: "App web instalable (PWA)", macos: "macOS", windows: "Windows", linux: "Linux", android: "Android", ios: "iOS", canales: "Canales del actualizador", libreria: "Librería de StarSeed OS" };

export const MEDIOS_PANEL: MedioPanel[] = MEDIOS_IDS.map((id) => ({ id, titulo: MEDIOS_TITULOS[id], formatos: id === "web" ? [{ nombre: "web", url: "https://starseed-os.vercel.app" }] : [] }));

function accionParaEstado(estado: string): string {
    if (estado === "al-dia") return "descargar";
    if (estado === "generando") return "generar";
    if (estado === "verificando") return "verificar";
    if (estado === "atascado") return "regenerar";
    return "verificar";
}

export function filasDeMedios(estado: EstadoDirector, versionPublicada: string): FilaMedio[] {
    const version = estado.version ?? versionPublicada;
    const mediosEstado = estado.medios ?? {};
    return MEDIOS_PANEL.map((medio) => {
        const info = mediosEstado[medio.id] ?? { estado: "no-disponible", faltan: [], pequenos: [] };
        const detalle = info.faltan.length > 0 ? `Faltan: ${info.faltan.join(", ")}` : info.pequenos.length > 0 ? `Archivos pequeños: ${info.pequenos.join(", ")}` : estado.detalle;
        return { id: medio.id, titulo: medio.titulo, formatos: medio.formatos, version, estado: info.estado, detalle, accion: accionParaEstado(info.estado) };
    });
}

export function validarPeticion(body: unknown): ResultadoValidacion {
    if (!body || typeof body !== "object") return new Error("Petición vacía o inválida");
    const obj = body as Record<string, unknown>;
    const accion = obj.accion;
    if (typeof accion !== "string") return new Error("Falta el campo 'accion'");
    if (!esAccionValida(accion)) return new Error(`Acción no permitida: ${accion}`);
    if (accion === "auto") { if (typeof obj.activo !== "boolean") return new Error("La acción 'auto' requiere 'activo' booleano"); return { accion, activo: obj.activo }; }
    if (esAccionConMedio(accion)) {
        const medio = obj.medio;
        if (typeof medio !== "string" || !esMedioValido(medio)) return new Error(`El medio '${medio}' no es válido`);
        return { accion, medio };
    }
    return { accion };
}