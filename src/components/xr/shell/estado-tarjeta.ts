/**
 * StarSeed XR · ESTADO DE LA TARJETA DE CONFIRMACIÓN (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Convierte lo que devolvió `entenderVoz` en el modelo que `tarjeta-voz.tsx` pinta a 1,2 m delante,
 * y traduce una entrada (botón del panel o frase hablada) en UNA acción. Reglas del contrato:
 *  - Todo lo que sale de la cuenta pide confirmar/cambiar/cancelar, también por voz.
 *  - Nunca se adivina: un «sí» con varias opciones NO confirma; primero hay que elegir el candidato.
 * Módulo PURO: sin red, sin disco, sin THREE. Probable en node.
 */
import { elegirCandidato, limpiar } from "../../../lib/xr/intenciones-ref";
import { saleDeLaCuenta } from "../../../lib/xr/intenciones-voz";
import type { PasoVoz, RefResuelta, ResultadoVoz } from "../../../lib/xr/intenciones-tipos";

export type ModeloTarjeta =
    | { tipo: "confirmar"; titulo: string; lineas: string[]; acciones: ("confirmar" | "cambiar" | "cancelar")[] }
    | { tipo: "preguntar"; pregunta: string; opciones: { id: string; etiqueta: string }[] }
    | { tipo: "error"; mensaje: string };

export type EntradaTarjeta = { tipo: "boton"; id: string } | { tipo: "voz"; frase: string };
export type RespuestaTarjeta = "confirmar" | "cambiar" | "cancelar" | { elegir: string } | null;

const etiquetaDe = (c: RefResuelta): string => (c.miembros ? `${c.nombre} (${c.miembros} personas)` : c.nombre);

export function modeloTarjeta(r: ResultadoVoz | null | undefined): ModeloTarjeta | null {
    if (!r || typeof r !== "object") return null;
    if (r.ok) {
        // Sin nada que confirmar (guardar en la biblioteca, órdenes de sistema) no hay tarjeta.
        if (!r.confirmar || !r.tarjeta) return null;
        return { tipo: "confirmar", titulo: r.tarjeta.titulo, lineas: [...r.tarjeta.lineas], acciones: [...r.tarjeta.acciones] };
    }
    const candidatos = r.candidatos ?? [];
    if (r.razon === "sin-contexto" || r.razon === "falta-dato" || (r.razon === "ambiguo" && candidatos.length > 0)) {
        return { tipo: "preguntar", pregunta: r.pregunta, opciones: candidatos.map((c) => ({ id: c.id, etiqueta: etiquetaDe(c) })) };
    }
    // «No te he oído» o «no he entendido»: no hay nada que elegir, solo se explica.
    return { tipo: "error", mensaje: r.pregunta };
}

/** Nombres de grupos y personas a los que la orden les llega: la línea «Esto se enviará a: …». */
export function nombresDeEnvio(pasos: PasoVoz[]): string[] {
    const nombres: string[] = [];
    const anadir = (n?: string): void => {
        if (n && !nombres.includes(n)) nombres.push(`«${n}»`);
    };
    for (const p of pasos) {
        const i = p.intencion;
        if (!saleDeLaCuenta(i)) continue;
        if (i.tipo === "invitar") for (const a of i.a) anadir(a.nombre);
        if (i.tipo !== "subir") continue;
        if (i.destino.donde === "estacion" && i.destino.ref) anadir(i.destino.ref.nombre);
        if (i.destino.donde === "publicacion" && i.destino.ref) anadir(i.destino.ref.nombre);
        if (i.destino.donde === "mensaje") for (const a of i.destino.para) anadir(a.nombre);
    }
    return nombres;
}

/** Las respuestas cortas de confirmación se anclan al principio, como en `elegirCandidato`. */
const CANCELA = /^(?:no|cancelar?|olvidalo|para|atr(?:a|á)s)\b/;
const CAMBIA = /^(?:cambia(?:r)?|edita(?:r)?|modifica(?:r)?|otro)\b/;
const CONFIRMA = /^(?:si|sip|vale|dale|hazlo|confirmo|confirmar|adelante|correcto|exacto|ok|acepto)\b/;

function porVozConfirmacion(frase: string): RespuestaTarjeta {
    const t = limpiar(frase);
    if (CANCELA.test(t)) return "cancelar";
    if (CAMBIA.test(t)) return "cambiar";
    if (CONFIRMA.test(t)) return "confirmar";
    return null;
}

export function resolverRespuesta(modelo: ModeloTarjeta | null, entrada: EntradaTarjeta): RespuestaTarjeta {
    if (!modelo || typeof modelo !== "object") return null;
    if (entrada.tipo === "boton") {
        if (modelo.tipo === "confirmar") {
            const r = entrada.id as RespuestaTarjeta;
            return r === "confirmar" || r === "cambiar" || r === "cancelar" ? r : null;
        }
        if (modelo.tipo === "preguntar") {
            return modelo.opciones.some((o) => o.id === entrada.id) ? { elegir: entrada.id } : null;
        }
        return null;
    }
    if (modelo.tipo === "confirmar") return porVozConfirmacion(entrada.frase);
    if (modelo.tipo === "preguntar") {
        // `elegirCandidato` solo lee `id` y `nombre`: el tipo de la referencia no sale de aquí.
        const candidatos: RefResuelta[] = modelo.opciones.map((o) => ({ tipo: "grupo", id: o.id, nombre: o.etiqueta }));
        const eleccion = elegirCandidato(entrada.frase, candidatos);
        if (eleccion.tipo === "elegido") return { elegir: eleccion.ref.id };
        if (eleccion.tipo === "cancelado") return "cancelar";
        return null;
    }
    return null;
}
