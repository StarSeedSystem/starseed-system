/**
 * Tipos de «Pruebas» en el pulso de Genesis (PRB1111V). Puros: los importan la pantalla, la lógica pura y las fuentes.
 * ─────────────────────────────────────────────────────────────────────────────
 * Los formatos del director de pruebas y del banco de pruebas son los de PRB1111W (`formatos.md` v1, 2026-11-12):
 * `pruebas-director-estado.json`, `pruebas-banco.json` y `pruebas-peticiones/<id>.json`. Todo se lee con defensa:
 * un archivo o un campo que falta es un estado que la pantalla nombra, nunca un fallo.
 */

import type { EnMarcha } from "./en-marcha";
import type { PlataformaPrueba, RespuestaPruebas } from "./lanzamientos-pruebas-tipos";

// ── El director de pruebas (pruebas-director-estado.json) ──────────────────────────────────────────

export type EstadoRunDirector = "en-cola" | "compilando" | "publicando" | "publicada" | "fallo" | "cancelada";

export interface PlataformaDirector {
    id: string;
    estado: string;
    detalle: string | null;
}

export interface EnCursoDirector {
    numero: number | null;
    version: string | null;
    sha: string | null;
    estado: EstadoRunDirector | string;
    desde: string | null;
    origen: string | null;
    pedidaPor: string | null;
    plataformas: PlataformaDirector[];
    manifiestos: { escritorio: string | null; android: string | null };
    avisado: boolean;
    fallo: { job: string | null; paso: string | null } | null;
}

export interface EsperandoDirector {
    sha: string | null;
    peticion: string | null;
    quien: string | null;
    desde: string | null;
    hasta: string | null;
    motivo: string | null;
}

export interface UltimaDirector {
    numero: number | null;
    runId: number | null;
    version: string | null;
    estado: string;
    fin: string | null;
    sha: string | null;
}

export type EstadoPeticion = "escrita" | "pendiente" | "hecha" | "rechazada";

export interface PeticionVista {
    id: string;
    accion: string;
    quien: string;
    t: string | null;
    estado: EstadoPeticion;
    resultado: string | null;
    tFin: string | null;
    numero: number | null;
    prueba: number | null;
    comprobacion: string | null;
    plataforma: string | null;
    sha: string | null;
}

export interface DirectorLeido {
    /** Cuándo pasó por última vez (ISO) o null = nunca. */
    t: string | null;
    cadaS: number | null;
    pasada: number | null;
    pausado: boolean;
    pausaMotivo: string | null;
    pidOk: boolean | null;
    enCurso: EnCursoDirector | null;
    esperando: EsperandoDirector | null;
    ultimas: UltimaDirector[];
    peticiones: PeticionVista[];
    avisos: string[];
}

/** Lo que la pantalla puede decir del director: dirige, está parado, en pausa, sin archivo o ilegible. */
export type EstadoDirector = "corriendo" | "parado" | "pausado" | "sin-archivo" | "ilegible";

export interface VistaDirector {
    estado: EstadoDirector;
    /** ¿Lee las peticiones ahora mismo? Solo `corriendo`. */
    leePeticiones: boolean;
    /** Una frase para el botón y la cabecera. */
    texto: string;
    haceS: number | null;
}

// ── El banco de pruebas (pruebas-banco.json) ───────────────────────────────────────────────────────

export interface AparatoBanco {
    id: string;
    nombre: string;
    esta: boolean;
    version: string | null;
    versionDe: string | null;
    appAbierta: boolean | null;
    ultimoArranque: string | null;
    errores: { t: string | null; texto: string }[];
    visto: string | null;
    /** v1.3 (PRB1111Z): desde cuándo corre esta versión y de dónde se sabe; null = el archivo no lo dice. */
    versionDesde?: string | null;
    versionDesdeFuente?: string | null;
}

export interface RangoFps {
    min: number | null;
    med: number | null;
    max: number | null;
}

/** Lo que escribió UN aparato de una llamada (formatos.md v1.1: `lados.<id>`). */
export interface LadoLlamada {
    aparato: string;
    tieneVoz: boolean;
    tieneVideo: boolean;
    vozNivel: [number | null, number | null];
    vozPerdidaPctMax: number | null;
    vozTardePctMax: number | null;
    jitterMsMax: number | null;
    esperaVozMsMax: number | null;
    mudoS: number | null;
    fpsActivo: RangoFps | null;
    fpsRecibidosMed: number | null;
    enviados: number | null;
    descartados: number | null;
    negros: number | null;
    pintados: number | null;
    erroresRx: number | null;
    pausas: { motivo: string; durS: number | null }[];
    camara: { intentos: number | null; ok: boolean | null; abierta: string | null; error: string | null } | null;
    lineas: string[];
}

export interface LlamadaBanco {
    id: string;
    desde: string | null;
    hasta: string | null;
    duracionS: number | null;
    con: string | null;
    terminada: boolean | null;
    medios: string[];
    kbps: { min: number | null; max: number | null; muestras: number | null } | null;
    lados: LadoLlamada[];
    /** v1.3: con qué versión se hizo frente a la que se prueba. Ausente/null = archivo anterior a la v1.3. */
    versionRelacion?: "esta" | "otra" | "desconocida" | null;
    /** v1.3: versión de la Mac en esa llamada (null = no se sabe). */
    versionMac?: string | null;
}

/** v1.3: una comprobación con señal que aún no tiene evidencia hecha con la versión que se prueba. */
export interface SinEvidencia {
    prueba: number;
    comprobacion: string;
    senal: string;
    razon: string;
    produciria: string;
}

export interface SugerenciaBanco {
    prueba: number;
    comprobacion: string;
    senal: string;
    veredicto: "bien" | "falla";
    motivo: string;
    llamada: string | null;
}

export interface BancoLeido {
    t: string | null;
    cadaS: number | null;
    aparatos: AparatoBanco[];
    llamadas: LlamadaBanco[];
    sugerencias: SugerenciaBanco[];
    /** Por qué no hay sugerencias, si el banco lo dice (la Mac tiene instalada otra prueba…). */
    sugerenciasNota: string | null;
    /** v1.3: comprobaciones con señal sin evidencia de esta versión (nunca también en `sugerencias`). */
    sinEvidencia?: SinEvidencia[];
    /** Lo que el banco dice de sus fuentes (cuántas líneas de registro leyó). */
    lineasLeidas: number | null;
}

// ── Accesos (instalar) ─────────────────────────────────────────────────────────────────────────────

export type PlataformaAcceso = PlataformaPrueba;

export interface EnlaceAcceso {
    plataforma: PlataformaAcceso;
    titulo: string;
    nombre: string;
    url: string;
    bytes: number | null;
}

export interface AccesosPrueba {
    numero: number;
    version: string;
    /** «en marcha» (aún subiendo) o «última publicada». */
    rol: "en-marcha" | "ultima-publicada";
    enlaces: EnlaceAcceso[];
    /** Las plataformas de las que el prerelease aún no tiene archivo con esa versión. */
    sinArchivo: PlataformaAcceso[];
}

export interface ArchivoPrerelease {
    nombre: string;
    bytes: number | null;
}

// ── Tiempos típicos ────────────────────────────────────────────────────────────────────────────────

export interface TipicoPlataforma {
    /** Mediana de las últimas pruebas que salieron bien, en minutos; null = sin historia. */
    minutos: number | null;
    muestras: number;
}

export type Tipicos = Record<PlataformaPrueba, TipicoPlataforma>;

// ── La cadena de entrega ───────────────────────────────────────────────────────────────────────────

export type EstadoEslabon = "hecho" | "en-curso" | "pendiente" | "fallo" | "desconocido";

export interface Eslabon {
    id: "tarea" | "puerta" | "publicacion" | "compilacion" | "publicada" | "instalada" | "comprobada" | "aprobada";
    titulo: string;
    estado: EstadoEslabon;
    /** Una frase con lo que se sabe (o con lo que no se sabe). */
    texto: string;
    /** ISO desde cuándo está así, o null = no consta. */
    desde: string | null;
}

// ── La cola local ──────────────────────────────────────────────────────────────────────────────────

export interface ColaLocal {
    /** Commits de main local aún no publicados en origin/main; null = no pude contarlos. */
    sinPublicar: number | null;
    /** Cabeza de origin/main y de main local (completas), si se pudieron leer. */
    origen: string | null;
    local: string | null;
}

// ── Lo que llega a la pantalla ─────────────────────────────────────────────────────────────────────

export interface RespuestaVivo extends RespuestaPruebas {
    aprobarAqui: boolean;
    /** Esta es la Genesis local: puede pedir al director. */
    controlAqui: boolean;
    tipicos: Tipicos;
    /** null = el archivo del director no existe; "ilegible" = existe y no se pudo leer. */
    director: DirectorLeido | "ilegible" | null;
    banco: BancoLeido | "ilegible" | null;
    cola: ColaLocal;
    /** Peticiones recientes al director (pendientes, hechas y las que él cuenta), la más nueva primero. */
    peticiones: PeticionVista[];
    accesos: AccesosPrueba[];
    /** false = no pude leer el prerelease de GitHub (los accesos no se saben). */
    prereleaseLeido: boolean;
    enMarcha: EnMarcha | null;
    /** Cuándo (ms) se montó esta respuesta, para calcular edades en el cliente. */
    ahoraServidor: number;
}

// ── Peticiones de la pantalla ──────────────────────────────────────────────────────────────────────

export type AccionControl = "compilar" | "cancelar" | "reintentar" | "republicar" | "pedir-arreglo" | "app-abrir";

export interface PeticionControl {
    accion: AccionControl;
    /** `compilar`: null = la cabeza de origin/main ahora; 40 hex = cuando ese commit esté en origin/main. */
    sha: string | null;
    numero: number | null;
    prueba: number | null;
    comprobacion: string | null;
    plataforma: string | null;
    nota: string | null;
}
