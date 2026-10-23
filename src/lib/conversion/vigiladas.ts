// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión · carpetas vigiladas de la Biblioteca (módulo PURO)
// ----------------------------------------------------------------------------
// Reglas «carpeta → formato» («todo lo que entra en Fotos del móvil pasa a JPG»)
// y la decisión de qué archivos nuevos convertir. Sin red, disco ni `node:*`:
// la persistencia la hace quien cablea, con la clave y el saneado de aquí.
// Nunca se reconvierte un resultado de conversión (ni se repite un archivo):
// así una carpeta vigilada no puede entrar en bucle. Contrato:
// `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { esFormatoValido, formatoDe, nombreDeSalida } from "./formatos";

/** Dónde vive el estado (reglas + archivos ya vistos) en el dispositivo. */
export const CLAVE_VIGILADAS = "starseed.conversion.vigiladas.v1";

export interface ReglaVigilada {
    id: string;
    /** Carpeta de la Biblioteca, normalizada y sin barras sobrantes. */
    carpeta: string;
    /** Formato destino que entiende Filee. */
    a: string;
    activa: boolean;
    /** 1–100 para imágenes; ausente = calidad de Filee. */
    calidad?: number;
    /** Momento en que empezó a vigilar; los archivos anteriores no se tocan. 0 = todos. */
    desde: number;
    /** También las subcarpetas de `carpeta`. */
    subcarpetas: boolean;
}

export interface EstadoVigiladas {
    version: 1;
    reglas: ReglaVigilada[];
    /** `carpeta/nombre` → ms: ya se convirtió, no se repite. */
    hechos: Record<string, number>;
    /** `carpeta/nombre` → ms: lo produjo una conversión, jamás se reconvierte. */
    resultados: Record<string, number>;
}

export interface ArchivoBiblioteca {
    nombre: string;
    carpeta: string;
    /** Formato o MIME si ya se conoce; si no, se deduce del nombre. */
    formato?: string;
    /** ms de creación/subida; los anteriores a `desde` no cuentan. */
    creado?: number;
    /** Marca explícita de que este archivo lo produjo una conversión. */
    deConversion?: boolean;
}

export interface PendienteConversion {
    archivo: ArchivoBiblioteca;
    regla: ReglaVigilada;
    a: string;
    nombreSalida: string;
    /** Clave normalizada del original, para el registro de hechos. */
    clave: string;
}

export function estadoVigiladasVacio(): EstadoVigiladas {
    return { version: 1, reglas: [], hechos: {}, resultados: {} };
}

/** «/Fotos del móvil//2026/» → «Fotos del móvil/2026»; fuera `.` y `..`. */
export function normalizarCarpeta(carpeta: string): string {
    return String(carpeta ?? "")
        .replace(/\\/g, "/")
        .replace(/[\u0000-\u001f]/g, "")
        .split("/")
        .map((p) => p.trim())
        .filter((p) => p && p !== "." && p !== "..")
        .join("/")
        .slice(0, 200);
}

/** Identidad de un archivo para no repetirlo; no distingue mayúsculas. */
export function claveArchivo(carpeta: string, nombre: string): string {
    const base = String(nombre ?? "").replace(/[\u0000-\u001f]/g, "").split(/[\\/]/).pop() ?? "";
    return `${normalizarCarpeta(carpeta).toLowerCase()}/${base.trim().toLowerCase()}`;
}

function tiempo(v: unknown): number | undefined {
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

function registro(crudo: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return out;
    for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
        const t = tiempo(v);
        if (k.trim() && t !== undefined) out[k.trim().toLowerCase()] = t;
    }
    return out;
}

/** Cualquier cosa guardada (vieja, rota o escrita a mano) vuelve a ser válida. */
export function sanearVigiladas(crudo: unknown): EstadoVigiladas {
    if (typeof crudo !== "object" || crudo === null) return estadoVigiladasVacio();
    const o = crudo as Record<string, unknown>;
    const vistas = new Set<string>();
    const reglas: ReglaVigilada[] = [];
    for (const r of Array.isArray(o.reglas) ? o.reglas : []) {
        if (typeof r !== "object" || r === null) continue;
        const x = r as Record<string, unknown>;
        const carpeta = normalizarCarpeta(String(x.carpeta ?? ""));
        const a = formatoDe(String(x.a ?? ""));
        const dedupe = `${carpeta.toLowerCase()}::${a}`;
        if (!carpeta || !esFormatoValido(a) || vistas.has(dedupe)) continue;
        vistas.add(dedupe);
        const calidad = typeof x.calidad === "number" && x.calidad >= 1 && x.calidad <= 100 ? Math.round(x.calidad) : undefined;
        reglas.push({
            id: typeof x.id === "string" && x.id.trim() ? x.id.trim().slice(0, 120) : dedupe,
            carpeta,
            a,
            activa: x.activa !== false,
            ...(calidad ? { calidad } : {}),
            desde: tiempo(x.desde) ?? 0,
            subcarpetas: x.subcarpetas !== false,
        });
    }
    return { version: 1, reglas, hechos: registro(o.hechos), resultados: registro(o.resultados) };
}

/** Añade o actualiza la regla de esa carpeta y destino; conserva su `desde`. */
export function agregarRegla(
    estado: EstadoVigiladas,
    entrada: { carpeta: string; a: string; calidad?: number; subcarpetas?: boolean; desde?: number },
): EstadoVigiladas {
    const previo = sanearVigiladas(estado);
    const carpeta = normalizarCarpeta(entrada.carpeta).toLowerCase();
    const a = formatoDe(entrada.a);
    const misma = (r: ReglaVigilada) => r.carpeta.toLowerCase() === carpeta && r.a === a;
    const existente = previo.reglas.find(misma);
    const nueva = sanearVigiladas({ reglas: [{ ...entrada, desde: entrada.desde ?? existente?.desde }] }).reglas[0];
    if (!nueva) return previo;
    return { ...previo, reglas: [...previo.reglas.filter((r) => !misma(r)), nueva] };
}

export function quitarRegla(estado: EstadoVigiladas, id: string): EstadoVigiladas {
    const previo = sanearVigiladas(estado);
    return { ...previo, reglas: previo.reglas.filter((r) => r.id !== String(id ?? "").trim()) };
}

function vigila(regla: ReglaVigilada, carpeta: string): boolean {
    const c = regla.carpeta.toLowerCase();
    const f = carpeta.toLowerCase();
    return f === c || (regla.subcarpetas && f.startsWith(`${c}/`));
}

/**
 * Los archivos de la lista que toca convertir ahora, uno por archivo y en orden.
 * No repite (registro `hechos`), no reconvierte resultados (`resultados`, marca
 * `deConversion`), no pisa un archivo existente ni el mismo destino dos veces.
 */
export function archivosNuevosAConvertir(archivos: ArchivoBiblioteca[], estado: EstadoVigiladas): PendienteConversion[] {
    const e = sanearVigiladas(estado);
    const activas = e.reglas.filter((r) => r.activa);
    const existentes = new Set(archivos.map((a) => claveArchivo(a.carpeta, a.nombre)));
    const salidas = new Set<string>();
    const out: PendienteConversion[] = [];
    for (const archivo of archivos) {
        const nombre = String(archivo?.nombre ?? "").trim();
        const carpeta = normalizarCarpeta(String(archivo?.carpeta ?? ""));
        if (!nombre || !carpeta || nombre.startsWith(".") || archivo.deConversion === true) continue;
        const origen = formatoDe(archivo.formato ?? nombre);
        const clave = claveArchivo(carpeta, nombre);
        if (!origen || e.hechos[clave] !== undefined || e.resultados[clave] !== undefined) continue;
        const creado = tiempo(archivo.creado);
        const regla = activas.find(
            (r) => r.a !== origen && !(creado !== undefined && r.desde > 0 && creado < r.desde) && vigila(r, carpeta),
        );
        if (!regla) continue;
        const nombreSalida = nombreDeSalida(nombre, regla.a);
        const claveSalida = claveArchivo(carpeta, nombreSalida);
        if (
            claveSalida === clave || salidas.has(claveSalida) || existentes.has(claveSalida) ||
            e.hechos[claveSalida] !== undefined || e.resultados[claveSalida] !== undefined
        ) continue;
        salidas.add(claveSalida);
        out.push({ archivo, regla, a: regla.a, nombreSalida, clave });
    }
    return out;
}

/** Anota el original como hecho y la salida como resultado (nunca se reconvierte). */
export function marcarConvertido(
    estado: EstadoVigiladas,
    pendiente: PendienteConversion,
    salida?: string,
    ahora = Date.now(),
): EstadoVigiladas {
    const e = sanearVigiladas(estado);
    const t = tiempo(ahora) ?? Date.now();
    const nombreSalida = String(salida ?? pendiente.nombreSalida ?? "").trim();
    const hechos = { ...e.hechos, [pendiente.clave]: t };
    const resultados = nombreSalida
        ? { ...e.resultados, [claveArchivo(pendiente.archivo.carpeta, nombreSalida)]: t }
        : e.resultados;
    return { ...e, hechos, resultados };
}

/** Lee el estado del dispositivo; sin almacenamiento o roto, valores vacíos. */
export function leerVigiladas(): EstadoVigiladas {
    try {
        if (typeof window === "undefined") return estadoVigiladasVacio();
        const txt = window.localStorage.getItem(CLAVE_VIGILADAS);
        return sanearVigiladas(txt ? JSON.parse(txt) : null);
    } catch {
        return estadoVigiladasVacio();
    }
}

export function guardarVigiladas(estado: EstadoVigiladas): void {
    try {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(CLAVE_VIGILADAS, JSON.stringify(sanearVigiladas(estado)));
    } catch {
        /* almacenamiento no disponible: las reglas no se recuerdan, nada más */
    }
}
