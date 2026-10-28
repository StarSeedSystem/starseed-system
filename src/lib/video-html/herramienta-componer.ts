/**
 * HFR1018M · Herramienta de agente `video.componer`.
 * Prepara una composición HyperFrames desde la plantilla StarSeed SIN GSAP (licencia
 * GSAP Standard, contrato §2) y sin tocar red, disco ni procesos. Si el pedido trae
 * texto para narrar, devuelve la PETICIÓN a la puerta única de voz: aquí no se sintetiza
 * nada ni se llama a nadie. Contrato: `architecture/video-hyperframes.md` §2 y §4.
 */

import { detectarAdaptadores } from "./adaptadores";
import { plantillaStarSeed } from "./plantilla";

/** Formatos que HyperFrames sabe renderizar (`--format`). */
export const FORMATOS_VIDEO = ["mp4", "webm", "mov", "gif", "png-sequence", "hls"] as const;
export type FormatoVideo = (typeof FORMATOS_VIDEO)[number];

export const DURACION_MIN = 1;
export const DURACION_MAX = 600;
export const DURACION_DEFECTO = 3;
/** Lienzo por defecto: 16:9 a 720p, el que se midió en el A1 (contrato §6). */
const ANCHO = 1280;
const ALTO = 720;

/** El pedido puede ser el título o un objeto con título y texto para narrar. */
export interface PedidoVideo {
    titulo?: string;
    texto?: string;
    narracion?: string;
    guion?: string;
}
export type EntradaPedido = string | PedidoVideo;

/** Petición para la puerta única: `hablar(texto, { contexto, persona })`. */
export interface PeticionVoz {
    texto: string;
    contexto: "lectura";
    persona?: string;
}
export interface ComposicionVideo {
    html: string;
    avisos: string[];
    siguiente: "lint" | "render";
    peticionVoz: PeticionVoz | null;
}

export interface OpcionesComponer {
    pedido: EntradaPedido;
    duracion: number;
    formato: FormatoVideo | string;
    voz?: string;
}
/** Texto limpio o cadena vacía; nunca devuelve `null` ni lanza. */
function texto(valor: unknown): string {
    return typeof valor === "string" ? valor.trim() : "";
}
/** Título y narración del pedido: un texto suelto es solo título; narrar exige campo. */
function leerPedido(pedido: EntradaPedido): { titulo: string; narracion: string } {
    if (typeof pedido === "string") return { titulo: pedido.trim(), narracion: "" };
    const titulo = texto(pedido.titulo) || texto(pedido.texto) || texto(pedido.narracion) || texto(pedido.guion);
    const narracion = texto(pedido.narracion) || texto(pedido.guion) || texto(pedido.texto);
    return { titulo, narracion };
}
/** Aviso si el formato no es de HyperFrames; `null` si vale (nunca se inventa un contenedor). */
function avisoDeFormato(formato: string): string | null {
    const limpio = formato.trim().toLowerCase();
    return (FORMATOS_VIDEO as readonly string[]).includes(limpio)
        ? null
        : `El formato «${formato}» no lo renderiza HyperFrames: uso mp4 (${FORMATOS_VIDEO.join(", ")}).`;
}
/** Duración acotada al rango del contrato, con aviso si hubo que tocarla. */
function normalizarDuracion(duracion: number): { duracion: number; aviso?: string } {
    if (!Number.isFinite(duracion)) {
        return { duracion: DURACION_DEFECTO, aviso: `Duración no válida: uso ${DURACION_DEFECTO} s.` };
    }
    const acotada = Math.min(DURACION_MAX, Math.max(DURACION_MIN, duracion));
    return acotada === duracion
        ? { duracion }
        : { duracion: acotada, aviso: `Duración ajustada a ${acotada} s (entre ${DURACION_MIN} y ${DURACION_MAX}).` };
}
/** La petición para `hablar()` de la puerta única; `null` si no hay nada que narrar. */
function pedirVoz(narracion: string, persona?: string): PeticionVoz | null {
    const limpio = narracion.trim();
    if (!limpio) return null;
    return persona ? { texto: limpio, contexto: "lectura", persona } : { texto: limpio, contexto: "lectura" };
}
export function componerVideo({ pedido, duracion, formato, voz }: OpcionesComponer): ComposicionVideo {
    const avisos: string[] = [];
    const { titulo, narracion } = leerPedido(pedido);
    const avisoFormato = avisoDeFormato(texto(formato) || "mp4");
    const duracionFinal = normalizarDuracion(duracion);
    if (avisoFormato) avisos.push(avisoFormato);
    if (duracionFinal.aviso) avisos.push(duracionFinal.aviso);

    const tituloFinal = titulo || "StarSeed";
    if (!titulo) avisos.push("El pedido no trae título: uso «StarSeed».");

    const persona = texto(voz) || undefined;
    const peticionVoz = pedirVoz(narracion, persona);
    if (persona && !peticionVoz) avisos.push("Pediste una voz, pero el pedido no trae texto para narrar.");

    const html = plantillaStarSeed({
        ancho: ANCHO,
        alto: ALTO,
        duracion: duracionFinal.duracion,
        titulo: tituloFinal,
        fondo: "#08040f",
        acento: "#00F0FF",
    });

    const adaptadores = detectarAdaptadores(html);
    if (adaptadores.usados.includes("gsap")) {
        avisos.push("La composición usa GSAP: el OS no la edita ni la renderiza (licencia, §2).");
    }
    if (!adaptadores.editableVisualmente && adaptadores.motivo) avisos.push(adaptadores.motivo);

    return { html, avisos, siguiente: avisos.length ? "lint" : "render", peticionVoz };
}
