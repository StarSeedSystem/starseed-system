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
import { safeGet } from "@/lib/safe-storage";

export const RUTA_CONVERSOR = "/convertir";
const API = "/api/conversion";
export const CLAVE_SERVIDORES_MALLA = "starseed.conversion.servidores.v1";

export interface ServidorConversionMalla {
    url: string;
    /** Nombre de la clave en la bóveda de credenciales del OS; nunca el valor. */
    tokenRef?: string;
}

/** PRUEBA: parsea la lista guardada en el almacén, sin URLs raras ni secretos en claro. */
export function parsearServidoresMalla(crudo: string | null): ServidorConversionMalla[] {
    if (!crudo) return [];
    try {
        const datos: unknown = JSON.parse(crudo);
        if (!Array.isArray(datos)) return [];
        const limpio: ServidorConversionMalla[] = [];
        for (const entrada of datos) {
            const url = typeof (entrada as { url?: unknown })?.url === "string" ? (entrada as { url: string }).url : "";
            try {
                if (!/^https?:\/\//i.test(new URL(url).toString())) throw new Error();
            } catch { continue; }
            const tokenRef = typeof (entrada as { tokenRef?: unknown })?.tokenRef === "string" ? (entrada as { tokenRef: string }).tokenRef : "";
            const valido = tokenRef.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(tokenRef);
            limpio.push({ url: url.replace(/\/+$/, ""), ...(valido ? { tokenRef } : {}) });
            if (limpio.length >= 8) break;
        }
        return limpio;
    } catch {
        return [];
    }
}

interface OpcionesMalla {
    /** Por defecto se lee del almacén (`CLAVE_SERVIDORES_MALLA`); en pruebas se inyectan. */
    servidores?: ServidorConversionMalla[];
    /** Saca el token del almacén de credenciales del OS por su nombre. */
    servirToken?: (tokenRef: string) => Promise<string | null>;
    almacenGet?: (clave: string) => string | null;
}

export interface EstadoConversor {
    disponible: boolean;
    version: string | null;
    motivo?: string;
}

export interface ConsultaDestinos extends EstadoConversor {
    destinos: DestinosFormato | null;
    /** URL de la neurona de la malla que respondió, si no fue la local. */
    viaMalla?: string;
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

/** Lee la lista de conversores de la malla del almacén (o la de la prueba). */
function servidoresDeMalla(op: OpcionesMalla = {}): ServidorConversionMalla[] {
    if (op.servidores) return op.servidores;
    try { return parsearServidoresMalla((op.almacenGet ?? safeGet)(CLAVE_SERVIDORES_MALLA)); }
    catch { return []; }
}

/** Token del almacén de credenciales del OS: por defecto la bóveda de la cuenta. */
async function tokenDeMalla(s: ServidorConversionMalla, op: OpcionesMalla): Promise<string | null> {
    if (!s.tokenRef) return null;
    if (op.servirToken) return op.servirToken(s.tokenRef);
    try {
        const [{ uidActual }, { vaultSecret }] = await Promise.all([
            import("@/lib/consumo/usuario"),
            import("@/lib/security/security"),
        ]);
        const uid = await uidActual();
        if (!uid) return null;
        const r = await vaultSecret(uid, "get", s.tokenRef);
        return r.ok ? r.value ?? null : null;
    } catch {
        return null;
    }
}

async function pedirYMirar(
    u: URL,
    init: RequestInit,
    f: typeof fetch,
): Promise<Response | null> {
    try {
        const r = await f(u.toString(), init);
        return r.status >= 500 ? null : r.ok ? r : null;
    } catch {
        return null;
    }
}

/** Pregunta a los conversores de la malla; devuelve el primer que tenga Filee con ese formato. */
async function destinosPorMalla(
    formato: string,
    op: OpcionesMalla,
    f: typeof fetch,
): Promise<ConsultaDestinos> {
    const lista = servidoresDeMalla(op);
    let ultimo = "Ninguna neurona de tu malla convierte archivos ahora mismo.";
    for (const s of lista) {
        const u = new URL("/api/conversion", s.url);
        u.searchParams.set("de", formato);
        const token = await tokenDeMalla(s, op);
        const r = await pedirYMirar(u, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} }, f);
        if (!r) continue;
        const d = (await r.json().catch(() => null)) as { filee?: { instalado?: boolean; version?: string | null }; destinos?: DestinosFormato | null; motivo?: string } | null;
        const instalado = Boolean(d?.filee?.instalado);
        if (!instalado) { ultimo = d?.motivo ?? ultimo; continue; }
        return {
            disponible: true,
            version: d?.filee?.version ?? null,
            destinos: d?.destinos ?? null,
            motivo: d?.destinos ? undefined : `Filee no convierte archivos .${formato}.`,
            viaMalla: s.url,
        };
    }
    return { disponible: false, version: null, destinos: null, motivo: ultimo };
}

function conviertePorMalla(status: number): boolean {
    return status === 404 || status === 503;
}

/** A qué formatos se puede convertir este archivo aquí (caché de 5 min por formato). */
export async function consultarDestinos(
    nombreOFormato: string,
    fetchImpl: typeof fetch = fetch,
    malla: OpcionesMalla = {},
): Promise<ConsultaDestinos> {
    const f = formatoDe(nombreOFormato);
    if (!f) return { disponible: false, version: null, destinos: null, motivo: "No reconozco el formato de este archivo." };
    const hit = cache.get(f);
    if (hit && Date.now() - hit.t < 5 * 60_000) return hit.v;
    let v: ConsultaDestinos = {
        disponible: false,
        version: null,
        destinos: null,
        motivo: "Sin conexión con la neurona que convierte.",
    };
    try {
        const r = await fetchImpl(`${API}?de=${encodeURIComponent(f)}`, { cache: "no-store" });
        if (!r.ok) {
            if (conviertePorMalla(r.status)) return guardarYDevolver(f, await destinosPorMalla(f, malla, fetchImpl));
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
        v = await destinosPorMalla(f, malla, fetchImpl);
    }
    return guardarYDevolver(f, v);
}

function guardarYDevolver(f: string, v: ConsultaDestinos): ConsultaDestinos {
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
    opciones: { calidad?: number; fetchImpl?: typeof fetch; signal?: AbortSignal; malla?: OpcionesMalla } = {},
): Promise<Convertido> {
    const destino = formatoDe(a) || a;
    const form = () => {
        const fd = new FormData();
        fd.set("archivo", archivo, nombre);
        fd.set("nombre", nombre);
        fd.set("a", destino);
        if (opciones.calidad) fd.set("calidad", String(opciones.calidad));
        return fd;
    };
    const f = opciones.fetchImpl ?? fetch;
    const initTmp = { method: "POST", body: form(), signal: opciones.signal };
    let r: Response;
    try {
        r = await f(API, initTmp);
    } catch {
        return convertirPorMalla(archivo, nombre, destino, opciones, form(), f);
    }
    if (!r.ok) {
        if (conviertePorMalla(r.status)) return convertirPorMalla(archivo, nombre, destino, opciones, form(), f);
        let motivo = motivoSinServidor(r.status);
        try {
            const j = (await r.json()) as { motivo?: string };
            if (j?.motivo) motivo = j.motivo;
        } catch { /* sin cuerpo JSON */ }
        throw new Error(motivo);
    }
    return leidoDeRespuesta(r, nombre);
}

async function leidoDeRespuesta(r: Response, nombre: string): Promise<Convertido> {
    const crudo = r.headers.get("X-Conversion-Nombre");
    return {
        blob: await r.blob(),
        nombre: crudo ? decodeURIComponent(crudo) : nombre,
        salidas: Number(r.headers.get("X-Conversion-Salidas") ?? 1) || 1,
        motor: r.headers.get("X-Conversion-Motor") ?? "filee",
        ms: Number(r.headers.get("X-Conversion-Ms") ?? 0) || 0,
    };
}

/** Último recurso: los conversores de la malla en `CLAVE_SERVIDORES_MALLA`. */
async function convertirPorMalla(
    archivo: Blob,
    nombre: string,
    a: string,
    opciones: { signal?: AbortSignal; malla?: OpcionesMalla },
    form: FormData,
    f: typeof fetch,
): Promise<Convertido> {
    const ultimo = new Error("Ninguna neurona de tu malla convierte archivos ahora mismo.");
    for (const s of servidoresDeMalla(opciones.malla ?? {})) {
        const token = await tokenDeMalla(s, opciones.malla ?? {});
        const u = new URL("/api/conversion", s.url);
        const r = await pedirYMirar(u, {
            method: "POST",
            body: form,
            signal: opciones.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        }, f);
        if (!r) continue;
        if (r.ok) return leidoDeRespuesta(r, nombre);
        const j = (await r.json().catch(() => null)) as { motivo?: string } | null;
        ultimo.message = j?.motivo ?? ultimo.message;
        continue;
    }
    throw ultimo;
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
