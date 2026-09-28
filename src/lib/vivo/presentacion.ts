/**
 * App en vivo «Presentación» (2026-09-28 · agente L2) — contrato LIVE-APP.
 *
 * Diapositivas que se editan entre varias personas y se presentan a la vez. Cada diapositiva es un
 * `LienzoMensaje` (el mismo lienzo del editor de mensajes: textos con formato, fotos, vídeos,
 * formas, ventanas web con sandbox, apps del OS) + notas del orador. Vive en `os_spaces`
 * (kind 'dashboard' + `doc.app = "presentacion"`) con fusión POR DIAPOSITIVA: dos personas en
 * diapositivas distintas no se pisan; en la misma gana la última escritura con aviso.
 * El tema, el fondo por defecto y la proporción son del mazo entero (registro de última escritura).
 * «Presentar a todos» viaja por el canal efímero del documento (presencia + difusión): no se guarda.
 * Ruta: `/presentacion/<id>` (acepta `?sesion=` sin más).
 */

import { validarFormato } from "@/lib/mensajeria/formato";
import type { AnimacionFondo, ElementoLienzo, EstiloMensaje, FuenteMensaje, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import { nuevoIdUnidad, type UnidadColab } from "./doc-colaborativo/modelo";
import { clavesEntre } from "./doc-colaborativo/orden";
import type { Presente } from "./doc-colaborativo/motor";

export const APP_PRESENTACION = "presentacion" as const;

export const INFO_VIVO_PRESENTACION = {
    etiqueta: "Presentación",
    descripcion: "Diapositivas que se editan juntos y se presentan a todos en tiempo real.",
    icono: "Presentation",
    color: "#F43F5E",
} as const;

export const MAX_DIAPOSITIVAS = 200;
export const MAX_NOTAS = 5000;

export type ProporcionPresentacion = "16:9" | "4:3";

export interface Diapositiva {
    lienzo: LienzoMensaje;
    /** Notas del orador (texto plano). */
    notas?: string;
}

export interface MetaPresentacion {
    titulo: string;
    tema: string;
    proporcion: ProporcionPresentacion;
    /** Fondo por defecto del mazo (si falta, el del tema). */
    fondo?: string;
    animacionFondo?: AnimacionFondo;
}

export interface TemaPresentacion {
    id: string;
    nombre: string;
    /** id de FONDOS_BURBUJA o color hex. */
    fondo: string;
    color: string;
    fuente: FuenteMensaje;
    acento: string;
}

export const TEMAS_PRESENTACION: TemaPresentacion[] = [
    { id: "cosmos", nombre: "Cosmos", fondo: "cosmos", color: "#ffffff", fuente: "outfit", acento: "#7C5CFF" },
    { id: "violeta", nombre: "Violeta", fondo: "violeta", color: "#ffffff", fuente: "outfit", acento: "#C4B5FD" },
    { id: "zenith", nombre: "Zenith", fondo: "zenith", color: "#ffffff", fuente: "inter", acento: "#7DD3FC" },
    { id: "horizonte", nombre: "Horizonte", fondo: "horizonte", color: "#ffffff", fuente: "inter", acento: "#A7F3D0" },
    { id: "atardecer", nombre: "Atardecer", fondo: "atardecer", color: "#ffffff", fuente: "titular", acento: "#FEF3C7" },
    { id: "noche", nombre: "Noche", fondo: "#0B0D1A", color: "#F8FAFC", fuente: "inter", acento: "#39FF14" },
    { id: "claro", nombre: "Claro", fondo: "#F8FAFC", color: "#0F172A", fuente: "inter", acento: "#007FFF" },
    { id: "papel", nombre: "Papel", fondo: "#FFF7ED", color: "#1C1917", fuente: "serif", acento: "#DC143C" },
];

export const META_PRESENTACION_INICIAL: MetaPresentacion = { titulo: "", tema: "cosmos", proporcion: "16:9" };

export function rutaPresentacion(id: string): string {
    return `/presentacion/${encodeURIComponent(id)}`;
}

export function temaDe(meta: Pick<MetaPresentacion, "tema">): TemaPresentacion {
    return TEMAS_PRESENTACION.find((t) => t.id === meta.tema) ?? TEMAS_PRESENTACION[0];
}

export function dimensionesDe(proporcion: ProporcionPresentacion): { ancho: number; alto: number } {
    return proporcion === "4:3" ? { ancho: 960, alto: 720 } : { ancho: 960, alto: 540 };
}

/** Estilo base del texto de las diapositivas (fuente y color del tema). */
export function estiloBaseDe(meta: MetaPresentacion): EstiloMensaje {
    const t = temaDe(meta);
    return { fuente: t.fuente, color: t.color };
}

/**
 * El lienzo tal y como se ve: medidas del mazo y, si la diapositiva no tiene fondo propio, el del
 * mazo o el del tema. Lo que NO es propio de la diapositiva se quita al guardar (`sinHerencia`).
 */
export function lienzoEfectivo(d: Diapositiva, meta: MetaPresentacion): LienzoMensaje {
    const { ancho, alto } = dimensionesDe(meta.proporcion);
    const fondo = d.lienzo.fondo ?? meta.fondo ?? temaDe(meta).fondo;
    const animacionFondo = d.lienzo.animacionFondo ?? meta.animacionFondo;
    const l: LienzoMensaje = { ...d.lienzo, ancho, alto, fondo };
    if (animacionFondo) l.animacionFondo = animacionFondo;
    else delete l.animacionFondo;
    return l;
}

/** Deshace `lienzoEfectivo`: lo heredado del mazo no se guarda como propio de la diapositiva. */
export function sinHerencia(nuevo: LienzoMensaje, original: Diapositiva, meta: MetaPresentacion): LienzoMensaje {
    const efectivo = lienzoEfectivo(original, meta);
    const l: LienzoMensaje = { ...nuevo, ancho: efectivo.ancho, alto: efectivo.alto };
    if (original.lienzo.fondo === undefined && nuevo.fondo === efectivo.fondo) delete l.fondo;
    if (original.lienzo.animacionFondo === undefined && nuevo.animacionFondo === efectivo.animacionFondo) delete l.animacionFondo;
    return l;
}

// ───────────────────────────── Validación ─────────────────────────────

function esObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

export type ResultadoDiapositiva = { ok: true; diapositiva: Diapositiva } | { ok: false; error: string };

/** Los mensajes de `validarFormato` hablan de «mensaje»; aquí es una diapositiva. */
export function errorDeDiapositiva(error: string): string {
    return error
        .replace(/\bEl mensaje\b/g, "La diapositiva")
        .replace(/\bel mensaje\b/g, "la diapositiva")
        .replace(/\bdel mensaje\b/g, "de la diapositiva")
        .replace(/\bpor mensaje\b/g, "por diapositiva")
        .replace(/\bmensaje\b/g, "diapositiva");
}

/** Valida una diapositiva con la misma lista blanca que los lienzos de los mensajes. */
export function comprobarDiapositiva(raw: unknown): ResultadoDiapositiva {
    if (!esObj(raw)) return { ok: false, error: "La diapositiva no es válida." };
    const lienzoRaw = esObj(raw.lienzo) ? raw.lienzo : { ancho: 960, alto: 540, elementos: [] };
    const r = validarFormato({ v: 1, lienzo: lienzoRaw });
    if (!r.ok) return { ok: false, error: errorDeDiapositiva(r.error) };
    const lienzo = r.formato.lienzo ?? { ancho: 960, alto: 540, elementos: [] };
    const d: Diapositiva = { lienzo };
    if (typeof raw.notas === "string" && raw.notas.trim()) d.notas = raw.notas.slice(0, MAX_NOTAS);
    return { ok: true, diapositiva: d };
}

export function validarDiapositiva(raw: unknown): Diapositiva | null {
    const r = comprobarDiapositiva(raw);
    return r.ok ? r.diapositiva : null;
}

export function validarMetaPresentacion(raw: unknown): MetaPresentacion | null {
    if (!esObj(raw)) return null;
    const meta: MetaPresentacion = {
        titulo: typeof raw.titulo === "string" ? raw.titulo.slice(0, 200) : "",
        tema: typeof raw.tema === "string" && TEMAS_PRESENTACION.some((t) => t.id === raw.tema) ? raw.tema : "cosmos",
        proporcion: raw.proporcion === "4:3" ? "4:3" : "16:9",
    };
    // El fondo y la animación se validan con la misma lista blanca que los lienzos.
    const r = validarFormato({ v: 1, lienzo: { ancho: 960, alto: 540, elementos: [], fondo: raw.fondo, animacionFondo: raw.animacionFondo } });
    if (r.ok && r.formato.lienzo?.fondo) meta.fondo = r.formato.lienzo.fondo;
    if (r.ok && r.formato.lienzo?.animacionFondo) meta.animacionFondo = r.formato.lienzo.animacionFondo;
    return meta;
}

// ───────────────────────────── Diapositivas nuevas ─────────────────────────────

export type DisenoDiapositiva = "blanco" | "titulo" | "titulo-texto" | "seccion";

export const DISENOS_DIAPOSITIVA: { id: DisenoDiapositiva; nombre: string; ayuda: string }[] = [
    { id: "titulo", nombre: "Portada", ayuda: "Un título grande y un subtítulo" },
    { id: "titulo-texto", nombre: "Título y texto", ayuda: "Encabezado y un cuerpo con viñetas" },
    { id: "seccion", nombre: "Sección", ayuda: "Un rótulo para abrir un bloque" },
    { id: "blanco", nombre: "En blanco", ayuda: "Lienzo libre" },
];

function texto(
    id: string,
    z: number,
    caja: { x: number; y: number; w: number; h: number },
    contenido: string,
    opciones: { nivel?: 1 | 2 | 3; tamano: number; alineacion?: "izquierda" | "centro"; lista?: boolean },
): ElementoLienzo {
    const tramos = contenido ? [{ texto: contenido }] : [];
    const bloque = opciones.lista
        ? { tipo: "lista" as const, ordenada: false, items: [tramos] }
        : opciones.nivel
          ? { tipo: "titulo" as const, nivel: opciones.nivel, tramos }
          : { tipo: "parrafo" as const, tramos };
    return {
        id,
        tipo: "texto",
        ...caja,
        z,
        texto: { bloques: [bloque] },
        estilo: { tamano: opciones.tamano, alineacion: opciones.alineacion ?? "izquierda" },
    };
}

/**
 * Una diapositiva con su diseño. Los textos traen una indicación corta de qué escribir (se
 * reemplaza al editar), nunca contenido inventado; la portada usa el título real del mazo.
 */
export function diapositivaNueva(diseno: DisenoDiapositiva, meta: MetaPresentacion, tituloMazo?: string): Diapositiva {
    const { ancho, alto } = dimensionesDe(meta.proporcion);
    const id = () => nuevoIdUnidad("el").slice(0, 36);
    const elementos: ElementoLienzo[] = [];
    const margen = 64;
    if (diseno === "titulo") {
        elementos.push(texto(id(), 1, { x: margen, y: alto * 0.3, w: ancho - margen * 2, h: 130 }, (tituloMazo ?? "").trim() || "Título de la presentación", { nivel: 1, tamano: 56, alineacion: "centro" }));
        elementos.push(texto(id(), 2, { x: margen * 2, y: alto * 0.3 + 150, w: ancho - margen * 4, h: 70 }, "Subtítulo o autoría", { tamano: 24, alineacion: "centro" }));
    } else if (diseno === "titulo-texto") {
        elementos.push(texto(id(), 1, { x: margen, y: 48, w: ancho - margen * 2, h: 90 }, "Título de la diapositiva", { nivel: 2, tamano: 40 }));
        elementos.push(texto(id(), 2, { x: margen, y: 160, w: ancho - margen * 2, h: alto - 220 }, "Primera idea", { tamano: 26, lista: true }));
    } else if (diseno === "seccion") {
        elementos.push(texto(id(), 1, { x: margen, y: alto / 2 - 60, w: ancho - margen * 2, h: 120 }, "Nombre de la sección", { nivel: 1, tamano: 52 }));
    }
    return { lienzo: { ancho, alto, elementos } };
}

/** Doc inicial de una presentación nueva: la portada con el título. */
export function docInicialPresentacion(titulo: string): Record<string, unknown> {
    const meta: MetaPresentacion = { ...META_PRESENTACION_INICIAL, titulo };
    const [orden] = clavesEntre(null, null, 1);
    const ahora = Date.now();
    return {
        app: APP_PRESENTACION,
        v: 1,
        unidades: [{ id: nuevoIdUnidad("d"), orden, actualizado: ahora, autor: "anon", datos: diapositivaNueva("titulo", meta, titulo) }],
        meta: { valor: meta, actualizado: ahora, autor: "anon" },
    };
}

// ───────────────────────────── Contrato LIVE-APP ─────────────────────────────

export async function crearVivoPresentacion(titulo: string): Promise<{ refId: string; ruta: string }> {
    const { crearEspacioApp } = await import("./doc-colaborativo/espacios");
    const t = (titulo ?? "").trim().slice(0, 200) || "Presentación sin título";
    const space = await crearEspacioApp(APP_PRESENTACION, t, docInicialPresentacion(t));
    return { refId: space.id, ruta: rutaPresentacion(space.id) };
}

export async function listarMiosPresentacion(): Promise<{ refId: string; titulo: string; ruta: string }[]> {
    const { listarEspaciosApp } = await import("./doc-colaborativo/espacios");
    const lista = await listarEspaciosApp(APP_PRESENTACION, { soloPropios: true });
    return lista.map((e) => ({ refId: e.refId, titulo: e.titulo, ruta: rutaPresentacion(e.refId) }));
}

// ───────────────────────────── Presentar a todos ─────────────────────────────

/** Quién presenta ahora (el primero que empezó). null si nadie. */
export function presentadorActual(presentes: Presente[]): Presente | null {
    let elegido: Presente | null = null;
    for (const p of presentes) {
        if (!p.presentando) continue;
        if (!elegido || p.desde < elegido.desde) elegido = p;
    }
    return elegido;
}

/** Índice de diapositiva a mostrar a quien sigue: por id (sobrevive a reordenar), si no por posición. */
export function indiceSeguido(unidades: UnidadColab<Diapositiva>[], presentando: { id: string | null; indice: number } | null): number {
    if (!presentando || !unidades.length) return 0;
    if (presentando.id) {
        const i = unidades.findIndex((u) => u.id === presentando.id);
        if (i >= 0) return i;
    }
    return Math.max(0, Math.min(unidades.length - 1, presentando.indice));
}

/** Texto plano de una diapositiva (miniaturas accesibles, resumen del historial). */
export function textoDeDiapositiva(d: Diapositiva): string {
    const partes: string[] = [];
    for (const el of [...d.lienzo.elementos].sort((a, b) => (Math.abs(a.y - b.y) > 8 ? a.y - b.y : a.x - b.x))) {
        if (el.tipo !== "texto" || !el.texto) continue;
        for (const b of el.texto.bloques) {
            if ("tramos" in b) partes.push(b.tramos.map((t) => t.texto).join(""));
            else if (b.tipo === "lista") partes.push(...b.items.map((it) => it.map((t) => t.texto).join("")));
            else if (b.tipo === "tareas") partes.push(...b.items.map((it) => it.tramos.map((t) => t.texto).join("")));
        }
    }
    return partes.join(" ").replace(/\s+/g, " ").trim();
}

export function resumenPresentacion(unidades: UnidadColab<Diapositiva>[]): string {
    const primera = unidades[0]?.datos ? textoDeDiapositiva(unidades[0].datos).slice(0, 70) : "";
    return `${primera || "Presentación"} · ${unidades.length} ${unidades.length === 1 ? "diapositiva" : "diapositivas"}`;
}
