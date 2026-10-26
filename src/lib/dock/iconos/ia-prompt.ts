/**
 * Variaciones de iconos con IA (Ola 1025U · V1b) — la parte PURA: el encargo al modelo, la lectura de su
 * respuesta y la paleta de una imagen de referencia. Sin red, sin React, sin almacenamiento.
 *
 * Honestidad del canal: el enrutador de Astraura es de TEXTO (`ChatMessage.content: string`), así que un
 * modelo de texto NO ve las imágenes de referencia. De cada referencia solo se le pasa su paleta de
 * colores (calculada aquí, en el aparato) y lo que la persona escriba sobre ella. La interfaz lo dice.
 *
 * Nada de lo que contesta el modelo se acepta tal cual: cada SVG pasa por `sanearSvg` y cada estilo por
 * `normalizarDiseno`. Una respuesta sin nada válido se cuenta como «sin variaciones», nunca como éxito.
 */

import {
    ETIQUETA_FORMA,
    FORMAS_ICONO,
    LIMITES,
    normalizarColor,
    normalizarDiseno,
    type DisenoIcono,
    type FondoIcono,
    type FormaIcono,
} from "./modelo";
import { MAX_SVG_CARACTERES, sanearSvg } from "./sanear-svg";

export const MAX_VARIACIONES = 4;
export const MAX_DESCRIPCION = 600;
export const MAX_REFERENCIAS = 4;

/* ─────────────────────────── Encargo ─────────────────────────── */

export interface ReferenciaIcono {
    /** Cómo la llama la persona (nombre del archivo o del elemento de la Biblioteca). */
    nombre: string;
    /** Hasta 5 colores dominantes, ya calculados en el aparato. */
    paleta: string[];
    /** Lo que la persona dice de esta referencia («quiero este trazo grueso»). */
    nota?: string;
}

export interface EncargoVariaciones {
    descripcion: string;
    cantidad: number;
    /** Para qué icono es (informativo: «Mensajes»). */
    etiquetaItem?: string;
    /** El diseño del que se parte; el modelo propone alrededor de él. */
    base?: DisenoIcono | null;
    referencias?: ReferenciaIcono[];
}

export interface MensajeIA { role: "system" | "user"; content: string }

const SISTEMA = [
    "Eres un diseñador de iconos para StarSeed OS (estilo cristal líquido: formas suaves, brillo contenido).",
    "Respondes SOLO con las variaciones pedidas, sin explicaciones fuera de ellas.",
    "Cada variación tiene este formato exacto:",
    "### Variación N: nombre corto",
    "forma: circulo | cuadrado-suave | gota | hexagono | flor | rombo | escudo",
    "fondo: cristal #rrggbb 0.6 | color #rrggbb | degradado #rrggbb #rrggbb",
    "colorGlifo: #rrggbb",
    "brillo: 0.0 a 1.0",
    "y a continuación UN solo bloque <svg> del dibujo (el glifo) con estas reglas estrictas:",
    `- viewBox="0 0 64 64", menos de ${Math.round(MAX_SVG_CARACTERES / 1000)} mil caracteres, solo path, circle, ellipse, rect, line, polyline, polygon y g;`,
    '- trazos con stroke="currentColor" (o fill="currentColor"), stroke-width entre 2 y 4, stroke-linecap="round";',
    "- sin texto, sin imágenes, sin scripts, sin estilos, sin filtros, sin enlaces ni atributos de eventos, sin colores fijos: el color lo pone colorGlifo.",
].join("\n");

/** Recorta y limpia una cadena que va al modelo (sin saltos raros ni etiquetas, con tope). */
function limpiar(x: string, max: number): string {
    return x.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function resumenBase(d: DisenoIcono): string {
    const f = d.fondo;
    const fondo =
        f.tipo === "cristal" ? `cristal ${f.tinte}` :
        f.tipo === "color" ? `color ${f.color}` :
        f.tipo === "degradado" ? `degradado ${f.desde} → ${f.hasta}` : "sin fondo";
    return `forma ${d.forma}, fondo ${fondo}, glifo ${d.colorGlifo}`;
}

/** El encargo completo: mensaje de sistema fijo + petición con descripción, base y referencias. */
export function construirEncargo(e: EncargoVariaciones): MensajeIA[] {
    const n = Math.max(1, Math.min(MAX_VARIACIONES, Math.floor(e.cantidad) || 1));
    const lineas: string[] = [];
    lineas.push(`Diséname ${n} ${n === 1 ? "variación distinta" : "variaciones distintas"} de un icono${e.etiquetaItem ? ` para «${limpiar(e.etiquetaItem, 40)}»` : ""}.`);
    const desc = limpiar(e.descripcion, MAX_DESCRIPCION);
    lineas.push(`Descripción de la persona: ${desc || "(sin descripción: sorpréndeme con buen gusto)"}`);
    if (e.base) lineas.push(`Punto de partida (puedes alejarte de él): ${resumenBase(e.base)}.`);
    const refs = (e.referencias ?? []).slice(0, MAX_REFERENCIAS);
    if (refs.length) {
        lineas.push("Referencias de la persona (no ves las imágenes: te paso su paleta y lo que dice de ellas):");
        refs.forEach((r, i) => {
            const paleta = r.paleta.map((c) => normalizarColor(c, "")).filter(Boolean).slice(0, 5).join(", ");
            const nota = r.nota ? limpiar(r.nota, 160) : "";
            lineas.push(`${i + 1}. «${limpiar(r.nombre, 40) || "referencia"}»${paleta ? ` · colores: ${paleta}` : ""}${nota ? ` · ${nota}` : ""}`);
        });
    }
    lineas.push("Responde solo con las variaciones, en el formato indicado.");
    return [
        { role: "system", content: SISTEMA },
        { role: "user", content: lineas.join("\n") },
    ];
}

/* ─────────────────────────── Lectura de la respuesta ─────────────────────────── */

export interface VariacionLeida {
    diseno: DisenoIcono;
    /** Lo que el saneador tuvo que quitar del SVG de esta variación (transparencia). */
    quitados: number;
}

export interface LecturaVariaciones {
    variaciones: VariacionLeida[];
    /** SVG que el saneador rechazó por completo. */
    rechazados: number;
    motivos: string[];
}

const RE_SVG = /<svg\b[\s\S]*?<\/svg\s*>/gi;
const MAX_RESPUESTA = 60_000;

function parseForma(valor: string): FormaIcono | null {
    const v = valor.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-záéíóúñ-]/g, "");
    const sinTildes = v.normalize("NFD").replace(/[̀-ͯ]/g, "");
    if ((FORMAS_ICONO as readonly string[]).includes(sinTildes)) return sinTildes as FormaIcono;
    for (const f of FORMAS_ICONO) {
        const et = ETIQUETA_FORMA[f].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-");
        if (et === sinTildes) return f;
    }
    return null;
}

function parseFondo(valor: string): FondoIcono | null {
    const v = valor.trim().toLowerCase();
    const colores = v.match(/#[0-9a-f]{3,8}\b/g) ?? [];
    const numero = v.match(/(?:^|\s)(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)(?:\s|$)/);
    if (/^ning/.test(v) || /^sin\b/.test(v)) return { tipo: "ninguno" };
    if (/^degradado|^gradient/.test(v) && colores.length >= 2) {
        return { tipo: "degradado", desde: normalizarColor(colores[0], "#22d3ee"), hasta: normalizarColor(colores[1], "#0b1220"), angulo: 135 };
    }
    if (/^cristal|^glass/.test(v) && colores[0]) {
        return { tipo: "cristal", tinte: normalizarColor(colores[0], "#22d3ee"), intensidad: numero ? Number(numero[1]) : 0.6 };
    }
    if (colores[0]) return { tipo: "color", color: normalizarColor(colores[0], "#22d3ee") };
    return null;
}

function leerEstilo(bloque: string): Partial<{ forma: FormaIcono; fondo: FondoIcono; colorGlifo: string; brillo: number; nombre: string }> {
    const salida: ReturnType<typeof leerEstilo> = {};
    for (const linea of bloque.split(/\r?\n/)) {
        const m = linea.match(/^\s*[-*]?\s*(forma|fondo|colorglifo|color\s*glifo|glifo|brillo|nombre)\s*[:=]\s*(.+?)\s*$/i);
        if (m) {
            const clave = m[1].toLowerCase().replace(/\s+/g, "");
            const valor = m[2];
            if (clave === "forma") { const f = parseForma(valor); if (f) salida.forma = f; }
            else if (clave === "fondo") { const f = parseFondo(valor); if (f) salida.fondo = f; }
            else if (clave === "colorglifo" || clave === "glifo") {
                const c = valor.match(/#[0-9a-f]{3,8}\b/i);
                if (c) salida.colorGlifo = normalizarColor(c[0], "#ffffff");
            } else if (clave === "brillo") {
                const n = parseFloat(valor.replace(",", "."));
                if (Number.isFinite(n)) salida.brillo = Math.min(1, Math.max(0, n));
            } else if (clave === "nombre") salida.nombre = valor.replace(/[*_`#]/g, "").trim().slice(0, LIMITES.nombreMax);
            continue;
        }
        const t = linea.match(/^\s*#{2,4}\s*(?:variaci[oó]n|opci[oó]n)?\s*\d*\s*[:.\-–—]?\s*(.+?)\s*$/i);
        if (t && !salida.nombre) salida.nombre = t[1].replace(/[*_`#]/g, "").trim().slice(0, LIMITES.nombreMax);
    }
    return salida;
}

/**
 * Lee la respuesta del modelo: por cada bloque `<svg>` toma el estilo que lo precede (forma, fondo, color,
 * brillo, nombre) y el SVG saneado. Lo que falte se hereda de `base`. Máximo `maximo` variaciones.
 */
export function leerVariaciones(respuesta: unknown, base: DisenoIcono | null | undefined, maximo = MAX_VARIACIONES): LecturaVariaciones {
    const vacio: LecturaVariaciones = { variaciones: [], rechazados: 0, motivos: [] };
    if (typeof respuesta !== "string" || !respuesta.trim()) { vacio.motivos.push("El modelo no devolvió nada."); return vacio; }
    // Si el modelo envolvió todo en un bloque de código, no importa: se buscan los <svg> igualmente.
    const texto = respuesta.slice(0, MAX_RESPUESTA);
    const tope = Math.max(1, Math.min(MAX_VARIACIONES, Math.floor(maximo) || 1));
    const salida: LecturaVariaciones = { variaciones: [], rechazados: 0, motivos: [] };

    let cursor = 0;
    for (const m of texto.matchAll(RE_SVG)) {
        const inicio = m.index ?? 0;
        const previo = texto.slice(cursor, inicio);
        cursor = inicio + m[0].length;
        if (salida.variaciones.length >= tope) break;
        const r = sanearSvg(m[0]);
        if (!r.ok) { salida.rechazados++; for (const mo of r.motivos) if (!salida.motivos.includes(mo)) salida.motivos.push(mo); continue; }
        const estilo = leerEstilo(previo);
        const partida: DisenoIcono = base ?? {
            v: 1, forma: "circulo", fondo: { tipo: "cristal", tinte: "#22d3ee", intensidad: 0.6 },
            glifo: { tipo: "lucide", clave: "auto" }, colorGlifo: "#ffffff", escala: LIMITES.escalaDefecto, brillo: 0.3,
        };
        const diseno = normalizarDiseno({
            ...partida,
            ...(estilo.forma ? { forma: estilo.forma } : {}),
            ...(estilo.fondo ? { fondo: estilo.fondo } : {}),
            ...(estilo.colorGlifo ? { colorGlifo: estilo.colorGlifo } : {}),
            ...(estilo.brillo !== undefined ? { brillo: estilo.brillo } : {}),
            glifo: { tipo: "svg", svg: r.svg },
            nombre: estilo.nombre ?? `Variación ${salida.variaciones.length + 1}`,
            origen: "ia",
        });
        if (diseno) salida.variaciones.push({ diseno, quitados: r.quitados });
        else salida.rechazados++;
    }
    if (!salida.variaciones.length) {
        salida.motivos.unshift(salida.rechazados
            ? "El modelo propuso dibujos, pero ninguno pasó el filtro de seguridad."
            : "La respuesta no traía ningún dibujo SVG que pudiera usar.");
    }
    return salida;
}

/* ─────────────────────────── Paleta de una imagen ─────────────────────────── */

const aHex = (r: number, g: number, b: number) =>
    "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/**
 * Colores dominantes de una imagen a partir de sus píxeles RGBA (`ImageData.data`). Cuantiza a 4 bits por
 * canal, ignora lo casi transparente, agrupa y devuelve los `cuantos` más frecuentes que no sean casi
 * iguales entre sí. Pura: la UI le pasa los píxeles de un lienzo pequeño.
 */
export function paletaDePixeles(rgba: ArrayLike<number>, cuantos = 5): string[] {
    const cubos = new Map<number, { n: number; r: number; g: number; b: number }>();
    for (let i = 0; i + 3 < rgba.length; i += 4) {
        if (rgba[i + 3] < 128) continue;
        const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
        const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const c = cubos.get(k);
        if (c) { c.n++; c.r += r; c.g += g; c.b += b; } else cubos.set(k, { n: 1, r, g, b });
    }
    const ordenados = [...cubos.values()].sort((a, b) => b.n - a.n);
    const elegidos: Array<[number, number, number]> = [];
    for (const c of ordenados) {
        const m: [number, number, number] = [c.r / c.n, c.g / c.n, c.b / c.n];
        const cerca = elegidos.some((e) => Math.hypot(e[0] - m[0], e[1] - m[1], e[2] - m[2]) < 48);
        if (!cerca) elegidos.push(m);
        if (elegidos.length >= cuantos) break;
    }
    return elegidos.map((m) => aHex(m[0], m[1], m[2]));
}

/* ─────────────────────────── Tope de uso ─────────────────────────── */

/** Cuántas peticiones a la IA se permiten por hora desde este editor (la economía del OS: nada sin tope). */
export const TOPE_IA_POR_HORA = 8;
const HORA_MS = 3_600_000;

export interface EstadoTope { permitido: boolean; usadas: number; tope: number; reintentarEnMin: number }

/** `marcas` = epoch ms de cada llamada hecha. Pura. */
export function estadoTope(marcas: readonly number[], ahora: number, tope = TOPE_IA_POR_HORA): EstadoTope {
    const vivas = marcas.filter((t) => Number.isFinite(t) && ahora - t < HORA_MS && t <= ahora + 60_000).sort((a, b) => a - b);
    if (vivas.length < tope) return { permitido: true, usadas: vivas.length, tope, reintentarEnMin: 0 };
    const libre = vivas[vivas.length - tope] + HORA_MS - ahora;
    return { permitido: false, usadas: vivas.length, tope, reintentarEnMin: Math.max(1, Math.ceil(libre / 60_000)) };
}

export function registrarMarca(marcas: readonly number[], ahora: number): number[] {
    return [...marcas.filter((t) => Number.isFinite(t) && ahora - t < HORA_MS), ahora].slice(-64);
}
