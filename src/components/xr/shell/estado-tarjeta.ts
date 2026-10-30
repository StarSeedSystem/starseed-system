/**
 * StarSeed XR · ESTADO DE LA TARJETA DE CONFIRMACIÓN (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Traduce POR LÓGICA PURA lo que `entenderVoz` (`intenciones-voz.ts`) entendió (`ResultadoVoz`) al modelo
 * que pinta `tarjeta-voz.tsx`: confirmación cuando algo sale de la cuenta, pregunta con una opción por
 * candidato cuando hay duda, y el texto del fallo tal cual («sin-contexto», «falta-dato»). También resuelve
 * la respuesta de la persona — botón o voz — reusando `elegirCandidato`: con varias opciones NI UN «sí»
 * ambiguo confirma; cancelar se dice siempre. Módulo PURO: nada de red, disco ni React.
 */
import type { RefResuelta, ResultadoVoz } from "../../../lib/xr/intenciones-tipos";
import { elegirCandidato, limpiar } from "../../../lib/xr/intenciones-ref";

export type AccionTarjeta = "confirmar" | "cambiar" | "cancelar";

export type ModeloTarjeta =
    | { tipo: "confirmar"; titulo: string; lineas: string[]; acciones: AccionTarjeta[] }
    | { tipo: "preguntar"; pregunta: string; opciones: { id: string; etiqueta: string }[] }
    | { tipo: "error"; mensaje: string };

export type Respuesta = "confirmar" | "cambiar" | "cancelar" | { elegir: string };
export type Entrada = { tipo: "boton"; id: string } | { tipo: "voz"; frase: string };

/** «Banda (6 personas)»: la etiqueta que se lee y se pulsa en cada opción de la pregunta. */
export const etiquetaDe = (c: RefResuelta): string =>
    `${c.nombre}${c.miembros ? ` (${c.miembros} ${c.miembros === 1 ? "persona" : "personas"})` : ""}`;

/** Inversa de `etiquetaDe`: `elegirCandidato` compara con el nombre limpio, no con los miembros. */
const nombreDe = (etiqueta: string): string => etiqueta.replace(/\s*\(\d+ personas?\)$/, "").trim();

export function modeloTarjeta(r: ResultadoVoz | null | undefined): ModeloTarjeta | null {
    if (!r) return null;
    if (r.ok) {
        const t = r.tarjeta;
        return t
            ? { tipo: "confirmar", titulo: t.titulo, lineas: t.lineas, acciones: t.acciones }
            : null;
    }
    const opciones = (r.candidatos ?? []).map((c) => ({ id: c.id, etiqueta: etiquetaDe(c) }));
    if (opciones.length) return { tipo: "preguntar", pregunta: r.pregunta, opciones };
    if (r.razon === "vacio" || r.razon === "no-entendido") return { tipo: "error", mensaje: r.pregunta };
    return { tipo: "preguntar", pregunta: r.pregunta, opciones: [] };
}

const NO = /^(?:no|ninguno|ninguna|cancela|cancelar|olvidalo|olvidala|para|paralo)\b/;
const CAMBIAR = /\bcambi(?:ar|a|alo|ala|o)\b/;
const CONFIRMAR = /^(?:si|sip|vale|ok|hazlo|hazla|dale|adelante|confirmo|confirmar|exacto|correcto)\b/;

/** Palabras de cancelación que valen en cualquier tarjeta, con o sin opciones. */
const esNo = (t: string): boolean => NO.test(t);

export function resolverRespuesta(modelo: ModeloTarjeta | null, entrada: Entrada): Respuesta | null {
    if (!modelo || modelo.tipo === "error") return null;
    if (entrada.tipo === "boton") {
        if (modelo.tipo === "confirmar") {
            const accion = modelo.acciones.find((a) => a === entrada.id);
            return accion ?? null;
        }
        if (entrada.id === "cancelar") return "cancelar";
        return modelo.opciones.some((o) => o.id === entrada.id) ? { elegir: entrada.id } : null;
    }
    if (modelo.tipo === "confirmar") {
        const t = limpiar(entrada.frase);
        if (esNo(t)) return "cancelar";
        if (CAMBIAR.test(t)) return "cambiar";
        return CONFIRMAR.test(t) ? "confirmar" : null;
    }
    if (!modelo.opciones.length) return esNo(limpiar(entrada.frase)) ? "cancelar" : null;
    const candidatos = modelo.opciones.map((o) => ({ tipo: "grupo" as const, id: o.id, nombre: nombreDe(o.etiqueta) }));
    const e = elegirCandidato(entrada.frase, candidatos);
    if (e.tipo === "elegido") return { elegir: e.ref.id };
    return e.tipo === "cancelado" ? "cancelar" : null;
}

/** Tamaño del panel en metros para `tarjeta-voz.tsx`; crece con el contenido y nunca por debajo de un mínimo legible. */
export function medidasTarjeta(m: ModeloTarjeta | null, enviaA: string[] = []): { ancho: number; alto: number } {
    if (!m || m.tipo === "error") return m ? { ancho: 0.62, alto: 0.13 } : { ancho: 0, alto: 0 };
    if (m.tipo === "preguntar") return { ancho: 0.66, alto: 0.15 + m.opciones.length * 0.055 };
    const lineasExtra = Math.max(0, m.lineas.length - 1) * 0.04;
    return { ancho: 0.72, alto: 0.19 + lineasExtra + (enviaA.length ? 0.045 : 0) };
}
