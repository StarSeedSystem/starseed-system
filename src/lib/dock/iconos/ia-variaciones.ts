/**
 * Variaciones de iconos con IA (Ola 1025U · V1b) — la parte que HABLA con el enrutador y con media-gen.
 * Lo puro (encargo, lectura, topes) vive en `ia-prompt.ts`; aquí solo se orquesta.
 *
 * Reglas de la economía del OS que se cumplen aquí:
 *   · UNA sola llamada al enrutador por petición (no un bucle): pide N variaciones de una vez.
 *   · Tope por hora (texto e imagen por separado) guardado en este aparato.
 *   · Gratis o local primero: sin permiso explícito no se ofrece ni se usa ningún modelo de pago.
 *   · Si no hay ninguna IA disponible, se dice y se indica cómo conseguir una; no se inventa nada.
 *   · Todo lo que vuelve se sanea y se valida; una respuesta sin nada utilizable cuenta como fallo.
 */

import type { CatalogModel, SourceTier } from "@/ai/astraura/free-catalog";
import type { SourceAvailability } from "@/ai/astraura/availability";
import type { MediaProviderId } from "@/ai/astraura/media/media-gen";
import {
    TOPE_IA_POR_HORA,
    construirEncargo,
    estadoTope,
    leerVariaciones,
    registrarMarca,
    type EncargoVariaciones,
    type EstadoTope,
    type LecturaVariaciones,
} from "./ia-prompt";
import { blobDeUrl, reducirAPng } from "./imagen";
import type { DisenoIcono } from "./modelo";
import { disenoBase } from "./modelo";

/* ─────────────────────────── Modelos elegibles ─────────────────────────── */

export interface ModeloElegible {
    sourceId: string;
    modelId: string;
    etiqueta: string;
    tier: SourceTier;
    gratis: boolean;
    privacidad: "local" | "browser" | "cloud";
}

const ORDEN_TIER: Record<SourceTier, number> = { local: 0, "local-gpu": 1, instant: 2, "free-key": 3, paid: 4 };

/** De las fuentes que el OS ya tiene LISTAS, los modelos que se pueden elegir (hasta 3 por fuente). */
export function modelosElegibles(avail: readonly SourceAvailability[], opciones: { permitirPago: boolean }): ModeloElegible[] {
    const salida: ModeloElegible[] = [];
    for (const a of avail) {
        if (!a.ready) continue;
        const gratis = a.source.tier !== "paid";
        if (!gratis && !opciones.permitirPago) continue;
        for (const m of a.source.models.slice(0, 3)) {
            salida.push({
                sourceId: a.source.id,
                modelId: m.id,
                etiqueta: `${a.source.label} · ${m.label}`,
                tier: a.source.tier,
                gratis,
                privacidad: a.source.privacy,
            });
        }
    }
    return salida.sort((x, y) => ORDEN_TIER[x.tier] - ORDEN_TIER[y.tier]);
}

/** Cuántos modelos de pago hay listos (para decir «hay N de pago apagados» sin ofrecerlos). */
export function contarDePagoListos(avail: readonly SourceAvailability[]): number {
    return avail.filter((a) => a.ready && a.source.tier === "paid").length;
}

function puntuarParaSvg(m: CatalogModel): number {
    const fuerte = m.strengths?.some((s) => s === "creative" || s === "code" || s === "coding" || s === "drawing") ? 2 : 0;
    return (m.quality ?? 5) + fuerte;
}

/**
 * El modelo gratuito más capaz para dibujar SVG entre los listos (el «Automático» del selector). Los de
 * pago nunca se eligen solos. Empata a favor de lo local (privacidad y coste cero).
 */
export function elegirModeloGratis(avail: readonly SourceAvailability[]): ModeloElegible | null {
    let mejor: { m: ModeloElegible; p: number } | null = null;
    for (const a of avail) {
        if (!a.ready || a.source.tier === "paid") continue;
        for (const modelo of a.source.models) {
            const p = puntuarParaSvg(modelo) - ORDEN_TIER[a.source.tier] * 0.01;
            if (!mejor || p > mejor.p) {
                mejor = {
                    p,
                    m: { sourceId: a.source.id, modelId: modelo.id, etiqueta: `${a.source.label} · ${modelo.label}`, tier: a.source.tier, gratis: true, privacidad: a.source.privacy },
                };
            }
        }
    }
    return mejor?.m ?? null;
}

/* ─────────────────────────── Topes guardados ─────────────────────────── */

const CLAVE_MARCAS_TEXTO = "starseed.dock.iconos.ia.texto.v1";
const CLAVE_MARCAS_IMAGEN = "starseed.dock.iconos.ia.imagen.v1";
export const TOPE_IMAGENES_POR_HORA = 6;

function leerMarcas(clave: string): number[] {
    try {
        const crudo = typeof window !== "undefined" ? window.localStorage.getItem(clave) : null;
        const a = crudo ? JSON.parse(crudo) : [];
        return Array.isArray(a) ? a.filter((x): x is number => typeof x === "number" && Number.isFinite(x)) : [];
    } catch { return []; }
}

function guardarMarcas(clave: string, marcas: number[]): void {
    try { window.localStorage.setItem(clave, JSON.stringify(marcas)); } catch { /* sin almacenamiento: el tope vale solo esta sesión */ }
}

/** Estado actual de los topes por hora (para pintarlos en el panel antes de pedir nada). */
export function topesActuales(ahora = Date.now()): { texto: EstadoTope; imagen: EstadoTope } {
    return {
        texto: estadoTope(leerMarcas(CLAVE_MARCAS_TEXTO), ahora, TOPE_IA_POR_HORA),
        imagen: estadoTope(leerMarcas(CLAVE_MARCAS_IMAGEN), ahora, TOPE_IMAGENES_POR_HORA),
    };
}

function textoTope(t: EstadoTope, que: string): string {
    return `Has usado ${t.usadas} de ${t.tope} peticiones de ${que} esta hora (es un tope para no gastar de más). Podrás volver a pedir en unos ${t.reintentarEnMin} min.`;
}

/* ─────────────────────────── Variaciones como SVG (texto) ─────────────────────────── */

export interface PeticionSvg {
    encargo: EncargoVariaciones;
    /** `undefined` = automático: el mejor modelo GRATUITO que haya listo. */
    modelo?: { sourceId: string; modelId: string } | null;
    permitirPago: boolean;
    signal?: AbortSignal;
    onEstado?: (texto: string) => void;
}

export interface ResultadoSvg {
    ok: boolean;
    variaciones: DisenoIcono[];
    /** Qué se quitó o rechazó, en lenguaje llano. */
    avisos: string[];
    /** Con qué modelo salió, tal como lo dice el enrutador. */
    via?: string;
    /** Si el enrutador usó un modelo de pago (solo ocurre si la persona lo tiene permitido en el OS). */
    dePago?: boolean;
    /** Por qué no se pudo, con el camino para arreglarlo. */
    motivo?: string;
}

export const SIN_IA_MOTIVO =
    "Ahora mismo no hay ninguna IA lista. Puedes conectar una gratuita en Ajustes → Inteligencia o instalar un modelo local desde la Biblioteca; mientras tanto, el editor funciona igual a mano.";

export async function pedirVariacionesSvg(p: PeticionSvg): Promise<ResultadoSvg> {
    const fallo = (motivo: string): ResultadoSvg => ({ ok: false, variaciones: [], avisos: [], motivo });
    if (typeof window === "undefined") return fallo("Las variaciones con IA se piden desde el navegador.");

    const tope = estadoTope(leerMarcas(CLAVE_MARCAS_TEXTO), Date.now(), TOPE_IA_POR_HORA);
    if (!tope.permitido) return fallo(textoTope(tope, "texto"));

    // Importes diferidos: ni el enrutador ni la detección de fuentes se cargan hasta que alguien pide variaciones.
    const [{ detectAvailability }, { astrauraChat }] = await Promise.all([
        import("@/ai/astraura/availability"),
        import("@/ai/astraura/router"),
    ]);

    let avail: SourceAvailability[] = [];
    try { avail = await detectAvailability(true); } catch { avail = []; }

    let elegido = p.modelo ?? null;
    if (elegido) {
        const fuente = avail.find((a) => a.source.id === elegido!.sourceId);
        if (!fuente || !fuente.ready) return fallo("Ese modelo ya no está disponible. Elige otro o deja el modo automático.");
        if (fuente.source.tier === "paid" && !p.permitirPago) return fallo("Ese modelo es de pago y tienes los modelos de pago apagados. Actívalos aquí si quieres usarlo.");
    } else {
        const auto = elegirModeloGratis(avail);
        if (auto) elegido = { sourceId: auto.sourceId, modelId: auto.modelId };
        else if (!(p.permitirPago && contarDePagoListos(avail) > 0)) return fallo(SIN_IA_MOTIVO);
    }

    p.onEstado?.("Pidiendo las variaciones…");
    // La llamada cuenta aunque falle: el tope protege el gasto, no solo los aciertos.
    guardarMarcas(CLAVE_MARCAS_TEXTO, registrarMarca(leerMarcas(CLAVE_MARCAS_TEXTO), Date.now()));
    try {
        const mensajes = construirEncargo(p.encargo);
        const res = await astrauraChat({
            messages: mensajes,
            taskHint: "creative",
            temperature: 0.9,
            maxTokens: 3500,
            signal: p.signal,
            onStatus: p.onEstado,
            ...(elegido ? { forceSource: elegido } : {}),
        });
        const ruta = res.route;
        if (ruta?.local) {
            return fallo("Ninguna IA respondió ahora mismo (la respuesta que llegó es solo la local de reserva). Prueba de nuevo en un rato o elige otro modelo.");
        }
        const lectura: LecturaVariaciones = leerVariaciones(res.text, p.encargo.base ?? disenoBase(), p.encargo.cantidad);
        const avisos: string[] = [];
        const quitados = lectura.variaciones.reduce((t, v) => t + v.quitados, 0);
        if (quitados) avisos.push(`El filtro de seguridad quitó ${quitados} elemento(s) o atributo(s) de los dibujos.`);
        if (lectura.rechazados) avisos.push(`${lectura.rechazados} dibujo(s) no pasaron el filtro de seguridad y se descartaron.`);
        const via = ruta ? `${ruta.sourceLabel} · ${ruta.modelLabel}` : undefined;
        if (!lectura.variaciones.length) {
            return { ok: false, variaciones: [], avisos, via, motivo: lectura.motivos[0] ?? "El modelo no devolvió variaciones utilizables. Prueba con otra descripción u otro modelo." };
        }
        return { ok: true, variaciones: lectura.variaciones.map((v) => v.diseno), avisos, via, dePago: ruta ? !ruta.free : undefined };
    } catch (e) {
        const abortada = (e as { name?: string })?.name === "AbortError";
        return fallo(abortada ? "Cancelado." : `No se pudo pedir las variaciones: ${e instanceof Error ? e.message : "error desconocido"}.`);
    }
}

/* ─────────────────────────── Variaciones como imagen (media-gen) ─────────────────────────── */

export interface ProveedorImagen { id: string; etiqueta: string; nota: string; web: boolean }

/** Proveedores de imagen que se pueden ofrecer: nunca la pasarela de pago, nunca el reparto por neuronas (galería). */
export async function proveedoresDeImagen(): Promise<ProveedorImagen[]> {
    try {
        const { listMediaProvidersFor } = await import("@/ai/astraura/media/media-gen");
        return listMediaProvidersFor("image").available
            .filter((p) => p.id !== "muapi" && p.id !== "neuronas")
            .map((p) => ({ id: p.id, etiqueta: p.label, nota: p.note, web: p.access !== "local-endpoint" }));
    } catch { return []; }
}

export interface PeticionImagen {
    descripcion: string;
    base?: DisenoIcono | null;
    cantidad: number;
    proveedor: string;
    signal?: AbortSignal;
    onEstado?: (texto: string) => void;
}

export interface ResultadoImagen {
    ok: boolean;
    variaciones: DisenoIcono[];
    avisos: string[];
    motivo?: string;
}

export const MAX_IMAGENES = 3;

/**
 * Hasta 3 imágenes de glifo, una a una (no en paralelo), cada una reducida a un icono pequeño. La
 * descripción sale al servicio elegido (Pollinations es una web pública): la interfaz lo avisa antes.
 */
export async function pedirVariacionesImagen(p: PeticionImagen): Promise<ResultadoImagen> {
    const fallo = (motivo: string, avisos: string[] = []): ResultadoImagen => ({ ok: false, variaciones: [], avisos, motivo });
    if (typeof window === "undefined") return fallo("Las imágenes se piden desde el navegador.");
    const descripcion = p.descripcion.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!descripcion) return fallo("Describe qué imagen quieres.");

    const n = Math.max(1, Math.min(MAX_IMAGENES, Math.floor(p.cantidad) || 1));
    const marcas = leerMarcas(CLAVE_MARCAS_IMAGEN);
    const tope = estadoTope(marcas, Date.now(), TOPE_IMAGENES_POR_HORA);
    if (tope.usadas + n > tope.tope) {
        return fallo(tope.permitido
            ? `Te quedan ${tope.tope - tope.usadas} imagen(es) esta hora; pide menos variaciones.`
            : textoTope(tope, "imagen"));
    }

    const { generateImage } = await import("@/ai/astraura/media/media-gen");
    const base = p.base ?? disenoBase();
    const variaciones: DisenoIcono[] = [];
    const avisos: string[] = [];
    let ultimoError = "";
    let marcasAhora = marcas;

    for (let i = 0; i < n; i++) {
        if (p.signal?.aborted) break;
        p.onEstado?.(`Generando imagen ${i + 1} de ${n}…`);
        marcasAhora = registrarMarca(marcasAhora, Date.now());
        guardarMarcas(CLAVE_MARCAS_IMAGEN, marcasAhora);
        const r = await generateImage({
            prompt: `app icon glyph, ${descripcion}, single centered symbol, simple flat vector style, plain background, no text`,
            width: 256,
            height: 256,
            seed: Math.floor(Math.random() * 1_000_000),
            provider: p.proveedor as MediaProviderId,
            opciones: 1,
        });
        if (!r.ok || !r.url) { ultimoError = r.error ?? "El servicio no devolvió la imagen."; continue; }
        const blob = r.blob ?? (await blobDeUrl(r.url, p.signal));
        if (!blob) { ultimoError = "La imagen se generó, pero el navegador no me deja leerla para convertirla en icono."; continue; }
        const png = await reducirAPng(blob);
        if (!png) { ultimoError = "No pude reducir la imagen a un icono pequeño."; continue; }
        variaciones.push({ ...base, glifo: { tipo: "imagen", src: png }, nombre: `Imagen ${variaciones.length + 1}`, origen: "ia" });
        if (r.provider !== p.proveedor) avisos.push(`Respondió ${r.provider} en vez de ${p.proveedor} (el servicio elegido falló).`);
    }
    if (!variaciones.length) return fallo(ultimoError || "No se generó ninguna imagen.", avisos);
    if (variaciones.length < n) avisos.push(`Salieron ${variaciones.length} de ${n} imágenes.`);
    return { ok: true, variaciones, avisos };
}
