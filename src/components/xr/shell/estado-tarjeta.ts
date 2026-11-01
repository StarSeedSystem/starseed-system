/**
 * StarSeed XR · ESTADO DE LA TARJETA DE CONFIRMACIÓN 3D (XR1010Q · contrato §3 f).
 * Reductor puro entre `ResultadoVoz` (núcleo `intenciones-voz`) y la tarjeta que XR1010T pinta
 * en Zenith: confirmación (Confirmar/Cambiar/Cancelar), pregunta de elección («¿Cuál?») o error.
 * La voz entra por `resolverRespuesta`, que REUTILIZA `elegirCandidato` y JAMÁS interpreta un
 * «sí» ambiguo cuando la tarjeta lista varias opciones: no se adivina. Módulo PURO.
 */
import { limpiar, elegirCandidato, type Eleccion } from "../../../lib/xr/intenciones-ref";
import { saleDeLaCuenta, tarjetaDe } from "../../../lib/xr/intenciones-voz";
import type { PasoVoz, RefResuelta, ResultadoVoz, TarjetaConfirmacion } from "../../../lib/xr/intenciones-tipos";

export interface ModeloConfirmar {
    tipo: "confirmar";
    titulo: string;
    lineas: string[];
    acciones: TarjetaConfirmacion["acciones"];
    /** Nombres de los destinos de los pasos que salen de la cuenta (contrato §3 f). */
    envia?: string[];
}
export interface ModeloPreguntar {
    tipo: "preguntar";
    pregunta: string;
    opciones: { id: string; etiqueta: string }[];
    /** Mismos candidatos, en el MISMO orden que `opciones`; sirve para la respuesta por voz. */
    candidatos?: RefResuelta[];
}
export interface ModeloError {
    tipo: "error";
    mensaje: string;
}
export type ModeloTarjeta = ModeloConfirmar | ModeloPreguntar | ModeloError | null;

export type RespuestaTarjeta = "confirmar" | "cambiar" | "cancelar" | { elegir: string } | null;
export type EntradaTarjeta = { tipo: "boton"; id: string } | { tipo: "voz"; frase: string };

const etiquetaDe = (c: RefResuelta): string =>
    `${c.nombre}${c.miembros !== undefined ? ` (${c.miembros} personas)` : ""}`;

/** Nombres de los pasos que salen de la cuenta («esto se enviará a: …»). */
export function destinatarios(pasos: PasoVoz[]): string[] {
    const nombres: string[] = [];
    for (const p of pasos) {
        if (!saleDeLaCuenta(p.intencion)) continue;
        const i = p.intencion;
        if (i.tipo === "invitar") nombres.push(...i.a.map((r) => r.nombre));
        else if (i.tipo === "subir") {
            const d = i.destino;
            if (d.donde === "estacion") nombres.push(d.nueva ? "una estación nueva" : (d.ref?.nombre ?? "la estación"));
            else if (d.donde === "publicacion") nombres.push(d.visibilidad === "publica" ? "todo el mundo" : (d.ref?.nombre ?? "tu grupo"));
            else if (d.donde === "mensaje") nombres.push(...d.para.map((r) => r.nombre));
        }
    }
    return [...new Set(nombres)];
}

export function modeloTarjeta(r: ResultadoVoz | null | undefined): ModeloTarjeta {
    if (!r) return null;
    if (!r.ok) {
        if (r.razon === "vacio" || r.razon === "no-entendido") return { tipo: "error", mensaje: r.pregunta };
        const candidatos = r.candidatos ?? undefined;
        return {
            tipo: "preguntar",
            pregunta: r.pregunta,
            opciones: candidatos?.map((c) => ({ id: c.id, etiqueta: etiquetaDe(c) })) ?? [],
            ...(candidatos ? { candidatos } : {}),
        };
    }
    if (!r.confirmar) return null;
    const t = r.tarjeta ?? tarjetaDe(r.pasos);
    const envia = destinatarios(r.pasos);
    return { tipo: "confirmar", titulo: t.titulo, lineas: t.lineas, acciones: t.acciones, ...(envia.length ? { envia } : {}) };
}

const SI = /^(?:si|sip|vale|dale|hazlo|correcto|exacto|ok|confirmo|confirmar)\b/;
const CAMBIAR = /^cambia(?:r)\b/;
const NO = /^(?:no|ninguno|ninguna|cancela|cancelar|olvidalo|para)\b/;

export function resolverRespuesta(modelo: ModeloTarjeta, entrada: EntradaTarjeta): RespuestaTarjeta {
    if (!modelo || modelo.tipo === "error") return null;
    if (entrada.tipo === "boton") {
        if (modelo.tipo === "confirmar")
            return (modelo.acciones as readonly string[]).includes(entrada.id) ? (entrada.id as "confirmar" | "cambiar" | "cancelar") : null;
        return modelo.opciones.some((o) => o.id === entrada.id) ? { elegir: entrada.id } : null;
    }
    const t = limpiar(entrada.frase);
    if (modelo.tipo === "confirmar") {
        if (NO.test(t)) return "cancelar";
        if (CAMBIAR.test(t)) return "cambiar";
        return SI.test(t) ? "confirmar" : null;
    }
    const e: Eleccion = elegirCandidato(t, modelo.candidatos ?? []);
    if (e.tipo === "elegido") return { elegir: e.ref.id };
    return e.tipo === "cancelado" ? "cancelar" : null;
}
