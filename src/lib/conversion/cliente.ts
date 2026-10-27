// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversión de archivos · cliente (navegador)
// ----------------------------------------------------------------------------
// Pide a la neurona que sirve el OS (`/api/conversion`) qué formatos salen de
// un archivo y le manda el archivo para convertirlo con Filee. Lo usan el clic
// derecho del Explorador, la página /convertir, la acción de Astraura y la
// Protomolécula. Si esta neurona no convierte (404/503, p. ej. el OS abierto
// desde la web pública), prueba los conversores de la malla guardados en
// `starseed.conversion.servidores.v1`: solo `{url, token-ref}`; el token se
// busca por su referencia en el almacén de credenciales del OS y nunca se
// guarda en la lista. Sin nadie que convierta, lo dice con honestidad.
// Contrato: `architecture/conversion-archivos.md`.
// ════════════════════════════════════════════════════════════════════════════

import { allConnectorCredentials } from "@/lib/connectors/connector-credentials";

import { formatoDe, type DestinosFormato } from "./formatos";

export const RUTA_CONVERSOR = "/convertir";
/** Lista local de conversores de la malla: [{ url, "token-ref" }]. NUNCA el token. */
export const CLAVE_SERVIDORES_CONVERSION = "starseed.conversion.servidores.v1";
const API = "/api/conversion";
const MAX_SERVIDORES = 8;
const ESTADOS_SIN_NEURONA = new Set([404, 503]);

/** Un conversor de otra neurona de la cuenta, tal como vive en el almacén local. */
export interface ServidorConversion {
    url: string;
    /** Nombre de la credencial en el almacén del OS; el valor no vive aquí. */
    tokenRef: string | null;
}

/** Almacén de credenciales del OS (por defecto, el Hub de Conectores). */
export interface LlaveroConversion {
    leer(ref: string): string | null;
}

/** Lo mínimo de `localStorage` que hace falta (permite inyectar uno falso en pruebas). */
export interface AlmacenTexto {
    getItem(clave: string): string | null;
}

export interface EstadoConversor {
    disponible: boolean;
    version: string | null;
    motivo?: string;
    /** Quién convirtió: esta neurona o otra de la malla. */
    via?: "neurona" | "malla";
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
    via?: "neurona" | "malla";
}

export interface OpcionesConversion {
    calidad?: number;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    /** Si se omite, se leen de `starseed.conversion.servidores.v1`. */
    servidores?: ServidorConversion[];
    /** Si se omite, se leen del almacén de credenciales del OS. */
    credenciales?: LlaveroConversion;
}

const cache = new Map<string, { t: number; v: ConsultaDestinos }>();

function motivoSinServidor(status: number): string {
    if (status === 404) return "En este medio no hay una neurona que convierta (abre el OS desde tu neurona con Filee).";
    if (status === 401 || status === 403) return "Hace falta iniciar sesión en la neurona que convierte.";
    return "El conversor de esta neurona no responde.";
}

function esObjeto(x: unknown): x is Record<string, unknown> {
    return typeof x === "object" && x !== null && !Array.isArray(x);
}

function texto(x: unknown): string | null {
    return typeof x === "string" && x.trim() ? x.trim() : null;
}

function listaTexto(x: unknown): string[] {
    return Array.isArray(x) ? x.map(texto).filter((v): v is string => v !== null) : [];
}

/** Normaliza la lista guardada: solo http(s), sin duplicados y sin tokens en claro. */
export function normalizarServidoresConversion(crudo: unknown): ServidorConversion[] {
    if (!Array.isArray(crudo)) return [];
    const out: ServidorConversion[] = [];
    const vistos = new Set<string>();
    for (const fila of crudo) {
        if (!esObjeto(fila)) continue;
        const url = (texto(fila.url) ?? "").replace(/\/+$/, "");
        if (!/^https?:\/\//i.test(url)) continue;
        try {
            const u = new URL(url);
            if (u.protocol !== "https:" && u.protocol !== "http:") continue;
        } catch { continue; }
        if (vistos.has(url)) continue;
        vistos.add(url);
        out.push({ url, tokenRef: texto(fila["token-ref"]) ?? texto(fila.tokenRef) });
        if (out.length >= MAX_SERVIDORES) break;
    }
    return out;
}

/** Lee la lista del almacén local; defensivo y sin lanzar (SSR → []). */
export function leerServidoresConversion(almacen?: AlmacenTexto): ServidorConversion[] {
    try {
        const a = almacen ?? (typeof window !== "undefined" ? window.localStorage : null);
        if (!a) return [];
        const crudo = a.getItem(CLAVE_SERVIDORES_CONVERSION);
        return crudo ? normalizarServidoresConversion(JSON.parse(crudo)) : [];
    } catch {
        return [];
    }
}

const CAMPOS_TOKEN = ["token", "tokenRef", "apiKey", "api_key", "clave", "bearer", "password"];

function partirRef(ref: string): [string, string | null] {
    const i = ref.indexOf("/");
    return i > 0 ? [ref.slice(0, i), ref.slice(i + 1)] : [ref, null];
}

/**
 * Almacén de credenciales del OS: el token se busca por REFERENCIA (servicio o
 * «servicio/campo») en el Hub de Conectores; la lista de servidores no lo ve.
 */
const llaveroDelOS: LlaveroConversion = {
    leer(ref) {
        const nombre = texto(ref);
        if (!nombre) return null;
        const [servicio, campo] = partirRef(nombre);
        const entrada = allConnectorCredentials()[servicio];
        if (!entrada) return null;
        if (campo) return texto(entrada.fields[campo]);
        for (const c of CAMPOS_TOKEN) {
            const v = texto(entrada.fields[c]);
            if (v) return v;
        }
        const valores = Object.values(entrada.fields).map(texto).filter((v): v is string => !!v);
        return valores.length === 1 ? valores[0] : null;
    },
};

/** undefined = el conversor no pide token · null = la credencial no está guardada. */
function tokenDeServidor(s: ServidorConversion, llavero: LlaveroConversion): string | null | undefined {
    if (!s.tokenRef) return undefined;
    return llavero.leer(s.tokenRef)?.trim() || null;
}

function destinosDeJson(d: unknown, formato: string): DestinosFormato | null {
    if (!esObjeto(d)) return null;
    const crudo = d.destinos;
    const objeto = esObjeto(crudo) ? crudo : d;
    const destinos = listaTexto(objeto.destinos);
    if (!destinos.length) return null;
    const ids = listaTexto(objeto.ids);
    return {
        nombre: texto(objeto.nombre) ?? formato.toUpperCase(),
        ids: ids.length ? ids : [formato],
        destinos,
        conMotor: listaTexto(objeto.conMotor).filter((f) => !destinos.includes(f)),
    };
}

function versionDeJson(d: unknown): string | null {
    return esObjeto(d) && esObjeto(d.filee) ? texto(d.filee.version) : null;
}

interface HallazgoMalla {
    servidor: string;
    version: string | null;
    destinos: DestinosFormato;
    intentados: number;
}

async function consultarEnMalla(
    f: string,
    fetchImpl: typeof fetch,
    opciones: OpcionesConversion,
): Promise<{ hallazgo: HallazgoMalla | null; intentados: number }> {
    const servidores = opciones.servidores ?? leerServidoresConversion();
    const llavero = opciones.credenciales ?? llaveroDelOS;
    let intentados = 0;
    for (const s of servidores) {
        const token = tokenDeServidor(s, llavero);
        if (token === null) continue;
        intentados++;
        try {
            const r = await fetchImpl(`${s.url}/formatos?de=${encodeURIComponent(f)}`, {
                cache: "no-store",
                signal: opciones.signal,
                ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
            });
            if (!r.ok) continue;
            const j = (await r.json()) as unknown;
            const destinos = destinosDeJson(j, f);
            if (destinos) {
                return { hallazgo: { servidor: s.url, version: versionDeJson(j), destinos, intentados }, intentados };
            }
        } catch { /* siguiente conversor */ }
    }
    return { hallazgo: null, intentados };
}

/** A qué formatos se puede convertir este archivo aquí (caché de 5 min por formato). */
export async function consultarDestinos(nombreOFormato: string, fetchImpl: typeof fetch = fetch, opciones: OpcionesConversion = {}): Promise<ConsultaDestinos> {
    const f = formatoDe(nombreOFormato);
    if (!f) return { disponible: false, version: null, destinos: null, motivo: "No reconozco el formato de este archivo." };
    const hit = cache.get(f);
    if (hit && Date.now() - hit.t < 5 * 60_000) return hit.v;
    let v: ConsultaDestinos;
    let motivoLocal: string;
    let sinNeurona = false;
    try {
        const r = await fetchImpl(`${API}?de=${encodeURIComponent(f)}`, { cache: "no-store", signal: opciones.signal });
        if (!r.ok) {
            motivoLocal = motivoSinServidor(r.status);
            sinNeurona = ESTADOS_SIN_NEURONA.has(r.status);
        } else {
            const d = (await r.json()) as { filee?: { instalado?: boolean; version?: string | null }; destinos?: DestinosFormato | null };
            const instalado = Boolean(d.filee?.instalado);
            if (instalado && d.destinos) {
                v = { disponible: true, version: d.filee?.version ?? null, destinos: d.destinos, via: "neurona" };
                cache.set(f, { t: Date.now(), v });
                return v;
            }
            motivoLocal = instalado ? `Filee no convierte archivos .${f}.` : "Filee no está instalado en esta neurona.";
            sinNeurona = !instalado;
        }
    } catch {
        motivoLocal = "Sin conexión con la neurona que convierte.";
        sinNeurona = true;
    }
    if (sinNeurona) {
        const { hallazgo, intentados } = await consultarEnMalla(f, fetchImpl, opciones);
        if (hallazgo) {
            v = { disponible: true, version: hallazgo.version, destinos: hallazgo.destinos, via: "malla" };
            cache.set(f, { t: Date.now(), v });
            return v;
        }
        if (intentados > 0) {
            motivoLocal += ` Probé ${intentados} conversor${intentados === 1 ? "" : "es"} de tu malla y ninguno respondió.`;
        }
    }
    v = { disponible: false, version: null, destinos: null, motivo: motivoLocal };
    cache.set(f, { t: Date.now(), v });
    return v;
}

/** Solo pruebas. */
export function _limpiarCacheConversion(): void {
    cache.clear();
}

function formDeConversion(archivo: Blob, nombre: string, a: string, calidad?: number): FormData {
    const form = new FormData();
    form.set("archivo", archivo, nombre);
    form.set("nombre", nombre);
    form.set("a", a);
    if (calidad) form.set("calidad", String(calidad));
    return form;
}

function numeroCabecera(valor: string | null, defecto: number): number {
    const n = Number(valor);
    return Number.isFinite(n) && n >= 0 ? n : defecto;
}

function nombreDeContentDisposition(cd: string | null): string | null {
    if (!cd) return null;
    const est = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (est) {
        try { return decodeURIComponent(est[1].trim().replace(/^"|"$/g, "")); } catch { return est[1].trim(); }
    }
    const simple = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
    return simple ? simple[1].trim() : null;
}

function decodificar(valor: string | null, defecto: string): string {
    if (!valor) return defecto;
    try { return decodeURIComponent(valor); } catch { return defecto; }
}

async function leerConvertido(r: Response, nombre: string, via: "neurona" | "malla"): Promise<Convertido> {
    const blob = await r.blob();
    if (via === "neurona") {
        return {
            blob,
            nombre: decodificar(r.headers.get("X-Conversion-Nombre"), nombre),
            salidas: Math.max(1, numeroCabecera(r.headers.get("X-Conversion-Salidas"), 1)),
            motor: r.headers.get("X-Conversion-Motor") ?? "filee",
            ms: numeroCabecera(r.headers.get("X-Conversion-Ms"), 0),
            via,
        };
    }
    return {
        blob,
        nombre: nombreDeContentDisposition(r.headers.get("Content-Disposition")) ?? nombre,
        salidas: Math.max(1, numeroCabecera(r.headers.get("X-Conversor-Salidas"), 1)),
        motor: r.headers.get("X-Conversor-Motor") ?? "filee en la malla",
        ms: numeroCabecera(r.headers.get("X-Conversor-Ms"), 0),
        via,
    };
}

async function motivoDeRespuesta(r: Response, porDefecto: string): Promise<string> {
    try {
        const j = (await r.json()) as { motivo?: unknown };
        const m = esObjeto(j) ? texto(j.motivo) : null;
        if (m) return m;
    } catch { /* sin cuerpo JSON */ }
    if (r.status === 401 || r.status === 403) return "El conversor de la malla rechazó la credencial.";
    if (r.status === 402 || r.status === 429) return "El conversor de la malla está al límite.";
    if (r.status === 404 || r.status === 503) return "El conversor de la malla no está disponible.";
    return porDefecto;
}

async function convertirEnMalla(
    archivo: Blob,
    nombre: string,
    a: string,
    opciones: OpcionesConversion,
): Promise<{ convertido: Convertido | null; intentados: number; ultimoMotivo: string | null }> {
    const servidores = opciones.servidores ?? leerServidoresConversion();
    const llavero = opciones.credenciales ?? llaveroDelOS;
    const f = opciones.fetchImpl ?? fetch;
    let intentados = 0;
    let ultimoMotivo: string | null = null;
    for (const s of servidores) {
        const token = tokenDeServidor(s, llavero);
        if (token === null) continue;
        intentados++;
        try {
            const r = await f(`${s.url}/convertir`, {
                method: "POST",
                body: formDeConversion(archivo, nombre, a, opciones.calidad),
                signal: opciones.signal,
                ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
            });
            if (r.ok) return { convertido: await leerConvertido(r, nombre, "malla"), intentados, ultimoMotivo };
            ultimoMotivo = await motivoDeRespuesta(r, "El conversor de la malla no pudo convertir el archivo.");
        } catch {
            ultimoMotivo = "Sin conexión con el conversor de la malla.";
        }
    }
    return { convertido: null, intentados, ultimoMotivo };
}

/** Convierte un archivo (Blob o File). Lanza un Error con el motivo en español si no se puede. */
export async function convertirBlob(
    archivo: Blob,
    nombre: string,
    a: string,
    opciones: OpcionesConversion = {},
): Promise<Convertido> {
    const destino = formatoDe(a) || a;
    const f = opciones.fetchImpl ?? fetch;
    let motivoLocal: string | null = null;
    let sinNeurona = false;
    try {
        const r = await f(API, {
            method: "POST",
            body: formDeConversion(archivo, nombre, destino, opciones.calidad),
            signal: opciones.signal,
        });
        if (r.ok) return leerConvertido(r, nombre, "neurona");
        motivoLocal = await motivoDeRespuesta(r, motivoSinServidor(r.status));
        sinNeurona = ESTADOS_SIN_NEURONA.has(r.status);
    } catch {
        motivoLocal = "Sin conexión con la neurona que convierte.";
        sinNeurona = true;
    }
    if (!sinNeurona) throw new Error(motivoLocal ?? "El conversor de esta neurona no responde.");
    const { convertido, intentados, ultimoMotivo } = await convertirEnMalla(archivo, nombre, destino, opciones);
    if (convertido) return convertido;
    const cola = intentados > 0
        ? ` Probé ${intentados} conversor${intentados === 1 ? "" : "es"} de tu malla y ninguno pudo.`
        : "";
    const detalle = ultimoMotivo ? ` ${ultimoMotivo}` : "";
    throw new Error(`${motivoLocal ?? "No pude convertir el archivo."}${cola}${detalle}`.trim());
}

/** Descarga el archivo de una URL (Biblioteca, mensajes…) y lo convierte. */
export async function convertirDesdeUrl(
    url: string,
    nombre: string,
    a: string,
    opciones: OpcionesConversion = {},
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
