// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión de archivos · cliente (navegador)
// ----------------------------------------------------------------------------
// Pide a la neurona que sirve el OS (`/api/conversion`) qué formatos salen de
// un archivo y le manda el archivo para convertirlo con Filee. Lo usan el clic
// derecho del Explorador, la página /convertir, la acción de Astraura y la
// Protomolécula. Sin servidor que convierta (p. ej. el OS abierto desde la web
// pública), lo dice con honestidad: `disponible: false` y el motivo.
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { formatoDe, type DestinosFormato } from "./formatos";

export const RUTA_CONVERSOR = "/convertir";
const API = "/api/conversion";

export interface EstadoConversor {
    disponible: boolean;
    version: string | null;
    motivo?: string;
}

export interface ConsultaDestinos extends EstadoConversor {
    destinos: DestinosFormato | null;
}

export interface Convertido {
    blob: Blob;
    nombre: string;
    salidas: number;
    motor: string;
    ms: number;
}

const cache = new Map<string, { t: number; v: ConsultaDestinos }>();

function motivoSinServidor(status: number): string {
    if (status === 404) return "En este medio no hay una neurona que convierta (abre el OS desde tu neurona con Filee).";
    if (status === 401 || status === 403) return "Hace falta iniciar sesión en la neurona que convierte.";
    return "El conversor de esta neurona no responde.";
}

/** A qué formatos se puede convertir este archivo aquí (caché de 5 min por formato). */
export async function consultarDestinos(nombreOFormato: string, fetchImpl: typeof fetch = fetch): Promise<ConsultaDestinos> {
    const f = formatoDe(nombreOFormato);
    if (!f) return { disponible: false, version: null, destinos: null, motivo: "No reconozco el formato de este archivo." };
    const hit = cache.get(f);
    if (hit && Date.now() - hit.t < 5 * 60_000) return hit.v;
    let v: ConsultaDestinos;
    try {
        const r = await fetchImpl(`${API}?de=${encodeURIComponent(f)}`, { cache: "no-store" });
        if (!r.ok) {
            v = { disponible: false, version: null, destinos: null, motivo: motivoSinServidor(r.status) };
        } else {
            const d = (await r.json()) as { filee?: { instalado?: boolean; version?: string | null }; destinos?: DestinosFormato | null };
            const instalado = Boolean(d.filee?.instalado);
            v = {
                disponible: instalado,
                version: d.filee?.version ?? null,
                destinos: d.destinos ?? null,
                motivo: instalado ? (d.destinos ? undefined : `Filee no convierte archivos .${f}.`) : "Filee no está instalado en esta neurona.",
            };
        }
    } catch {
        v = { disponible: false, version: null, destinos: null, motivo: "Sin conexión con la neurona que convierte." };
    }
    cache.set(f, { t: Date.now(), v });
    return v;
}

/** Solo pruebas. */
export function _limpiarCacheConversion(): void {
    cache.clear();
}

/** Convierte un archivo (Blob o File). Lanza un Error con el motivo en español si no se puede. */
export async function convertirBlob(
    archivo: Blob,
    nombre: string,
    a: string,
    opciones: { calidad?: number; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Convertido> {
    const form = new FormData();
    form.set("archivo", archivo, nombre);
    form.set("nombre", nombre);
    form.set("a", formatoDe(a) || a);
    if (opciones.calidad) form.set("calidad", String(opciones.calidad));
    const r = await (opciones.fetchImpl ?? fetch)(API, { method: "POST", body: form, signal: opciones.signal });
    if (!r.ok) {
        let motivo = motivoSinServidor(r.status);
        try {
            const j = (await r.json()) as { motivo?: string };
            if (j?.motivo) motivo = j.motivo;
        } catch { /* sin cuerpo JSON */ }
        throw new Error(motivo);
    }
    const blob = await r.blob();
    const crudo = r.headers.get("X-Conversion-Nombre");
    return {
        blob,
        nombre: crudo ? decodeURIComponent(crudo) : nombre,
        salidas: Number(r.headers.get("X-Conversion-Salidas") ?? 1) || 1,
        motor: r.headers.get("X-Conversion-Motor") ?? "filee",
        ms: Number(r.headers.get("X-Conversion-Ms") ?? 0) || 0,
    };
}

/** Descarga el archivo de una URL (Biblioteca, mensajes…) y lo convierte. */
export async function convertirDesdeUrl(
    url: string,
    nombre: string,
    a: string,
    opciones: { calidad?: number; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Convertido> {
    const f = opciones.fetchImpl ?? fetch;
    let origen: Response;
    try {
        origen = await f(url, { signal: opciones.signal });
    } catch {
        throw new Error("No pude leer el archivo original.");
    }
    if (!origen.ok) throw new Error("No pude leer el archivo original.");
    return convertirBlob(await origen.blob(), nombre, a, opciones);
}

/** Enlace a la página del conversor con el archivo y el destino ya puestos. */
export function enlaceConversor(p: { url?: string; nombre?: string; a?: string } = {}): string {
    const q = new URLSearchParams();
    if (p.url) q.set("url", p.url);
    if (p.nombre) q.set("nombre", p.nombre);
    if (p.a) q.set("a", formatoDe(p.a) || p.a);
    const s = q.toString();
    return s ? `${RUTA_CONVERSOR}?${s}` : RUTA_CONVERSOR;
}

/** Descarga un Blob en el navegador con su nombre. */
export function descargarBlob(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
