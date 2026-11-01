/**
 * StarSeed XR · ESTADO DE LA TARJETA DE CONFIRMACIÓN (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Traduce un `ResultadoVoz` al modelo que pinta `tarjeta-voz.tsx` y resuelve lo que la persona
 * contesta (botón o voz). Lo que sale de la cuenta (`saleDeLaCuenta`) añade la línea «Esto se
 * enviará a: …». Un «sí» ante varias opciones NUNCA confirma: la voz pasa por `elegirCandidato`.
 * La tarjeta no se cierra sola: sin respuesta clara devuelve `null` y espera. Módulo PURO.
 */
import { elegirCandidato, limpiar } from "../../../lib/xr/intenciones-ref";
import { saleDeLaCuenta } from "../../../lib/xr/intenciones-voz";
import type { Intencion, RefResuelta, ResultadoVoz } from "../../../lib/xr/intenciones-tipos";

export type AccionTarjeta = "confirmar" | "cambiar" | "cancelar";
export type OpcionTarjeta = { id: string; etiqueta: string };
export type ModeloTarjeta =
    | { tipo: "confirmar"; titulo: string; lineas: string[]; acciones: AccionTarjeta[] }
    | { tipo: "preguntar"; pregunta: string; opciones: OpcionTarjeta[] }
    | { tipo: "error"; mensaje: string };
export type Resolucion = AccionTarjeta | { elegir: string };
export type EntradaTarjeta = { tipo: "boton"; id: string } | { tipo: "voz"; frase: string };

const etiquetaDe = (r: RefResuelta): string => (r.miembros ? `${r.nombre} (${r.miembros} personas)` : r.nombre);

/** Nombres de los destinatarios reales de cada intentación que sale de la cuenta. */
function destinosDe(i: Intencion): string[] {
    if (i.tipo === "invitar") return i.a.map((x) => x.nombre);
    if (i.tipo !== "subir") return [];
    const d = i.destino;
    if (d.donde === "estacion") return d.ref ? [d.ref.nombre] : [];
    if (d.donde === "publicacion") return d.ref ? [d.ref.nombre] : [];
    if (d.donde === "mensaje") return d.para.map((x) => x.nombre);
    return [];
}

export function modeloTarjeta(r: ResultadoVoz | null | undefined): ModeloTarjeta | null {
    if (!r) return null;
    if (!r.ok) {
        if (r.razon === "ambiguo" && r.candidatos?.length)
            return { tipo: "preguntar", pregunta: r.pregunta, opciones: r.candidatos.map((c) => ({ id: c.id, etiqueta: etiquetaDe(c) })) };
        if (r.razon === "sin-contexto" || r.razon === "falta-dato") return { tipo: "preguntar", pregunta: r.pregunta, opciones: [] };
        return { tipo: "error", mensaje: r.pregunta };
    }
    if (!r.confirmar || !r.tarjeta) return null;
    const lineas = [...r.tarjeta.lineas];
    const fuera = new Set<string>();
    for (const p of r.pasos) if (saleDeLaCuenta(p.intencion)) for (const n of destinosDe(p.intencion)) fuera.add(n);
    if (fuera.size) lineas.push(`Esto se enviará a: ${[...fuera].join(", ")}`);
    return { tipo: "confirmar", titulo: r.tarjeta.titulo, lineas, acciones: r.tarjeta.acciones };
}

/** Frases cortas de confirmación y de cambio, también con la grafía sin tilde ya limpiada. */
const CONFIRMA = /^(?:si|sip|vale|hazlo|dale|ok|adelante|correcto|confirmo|confirmar)\b/;
const CAMBIA = /^(?:cambio|cambia|cambiar|edita|editar|otra cosa)\b/;
const CANCELA = /^(?:no|cancela|cancelar|olvidalo|para)\b/;

export function resolverRespuesta(modelo: ModeloTarjeta | null, entrada: EntradaTarjeta): Resolucion | null {
    if (!modelo) return null;
    if (entrada.tipo === "boton") {
        if (modelo.tipo === "confirmar") return modelo.acciones.includes(entrada.id as AccionTarjeta) ? (entrada.id as AccionTarjeta) : null;
        return modelo.tipo === "preguntar" && modelo.opciones.some((o) => o.id === entrada.id) ? { elegir: entrada.id } : null;
    }
    const frase = limpiar(entrada.frase);
    if (!frase) return null;
    if (modelo.tipo === "confirmar") {
        if (CONFIRMA.test(frase)) return "confirmar";
        if (CAMBIA.test(frase)) return "cambiar";
        if (CANCELA.test(frase)) return "cancelar";
        return null;
    }
    if (modelo.tipo === "preguntar") {
        // La voz de la pregunta la arbitra `elegirCandidato`: solo elige con resonancia, y «sí»
        // ante varias opciones no confirma (vuelve a preguntar → aquí, `null`).
        const comoRefs = modelo.opciones.map((o) => ({
            tipo: "grupo" as const,
            id: o.id,
            nombre: o.etiqueta.replace(/\s*\(.*\)$/, ""),
        })) as RefResuelta[];
        const e = elegirCandidato(entrada.frase, comoRefs);
        if (e.tipo === "elegido") return { elegir: e.ref.id };
        if (e.tipo === "cancelado") return "cancelar";
        return null;
    }
    return null;
}
