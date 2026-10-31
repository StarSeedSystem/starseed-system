/**
 * StarSeed XR · ESTADO DE LA TARJETA DE CONFIRMACIÓN (XR1010Q · contrato `architecture/starseed-xr.md`
 * §3 f). Reductor PURO: un `ResultadoVoz` se convierte en el modelo que pinta `tarjeta-voz.tsx`
 * (cascarón fino) y una respuesta — botón o voz — en la acción resultante. «Sí» nunca confirma del
 * todo cuando la tarjeta lista varias opciones: la elección pasa por `elegirCandidato`
 * (`intenciones-ref.ts`), que no adivina. Probable sin React, sin WebGL y sin red; lo monta XR1010T.
 */
import type { Intencion, ResultadoVoz, TarjetaConfirmacion } from "../../../lib/xr/intenciones-tipos";
import { saleDeLaCuenta } from "../../../lib/xr/intenciones-voz";
import { elegirCandidato, limpiar } from "../../../lib/xr/intenciones-ref";

export interface OpcionTarjeta {
    id: string;
    etiqueta: string;
}

export type ModeloTarjeta =
    | { tipo: "confirmar"; titulo: string; lineas: string[]; acciones: TarjetaConfirmacion["acciones"] }
    | { tipo: "preguntar"; pregunta: string; opciones: OpcionTarjeta[] }
    | { tipo: "error"; mensaje: string };

export type RespuestaTarjeta = "confirmar" | "cambiar" | "cancelar" | { elegir: string } | null;

export type EntradaTarjeta =
    | { tipo: "boton"; id: string }
    | { tipo: "voz"; frase: string };

const SUFConta = /\s*\([^)]*\)\s*$/;

/** Nombre exacto bajo la etiqueta: «Banda (6 personas)» → «Banda» (lo que escucha `elegirCandidato`). */
const nombreDeEtiqueta = (etiqueta: string): string => etiqueta.replace(SUFConta, "").trim();

/** Etiqueta visible de una opción: nombre más el tamaño de la sala si lo sabe. */
const etiquetaDe = (r: { nombre: string; miembros?: number }): string =>
    r.miembros ? `${r.nombre} (${String(r.miembros)} personas)` : r.nombre;

/** A quiénes llegará realmente lo que sale de la cuenta, para la línea honesta de la tarjeta. */
function nombresDeSalida(i: Intencion): string[] {
    switch (i.tipo) {
        case "invitar": return i.a.map((r) => r.nombre);
        case "subir": {
            const d = i.destino;
            if (d.donde === "biblioteca") return [];
            if (d.donde === "mensaje") return d.para.map((r) => r.nombre);
            if (d.donde === "estacion") return d.ref ? [d.ref.nombre] : [];
            return d.ref ? [d.ref.nombre] : d.visibilidad === "publica" ? ["todo el mundo"] : ["tu grupo"];
        }
        default: return [];
    }
}

/** Título del envío: la línea extra que la tarjeta añade cuando lo pedido sale de la cuenta. */
const lineaEnvio = (nombres: string[]): string => `Esto se enviará a: ${Array.from(new Set(nombres)).join(", ")}`;

/**
 * El modelo de la tarjeta para un `ResultadoVoz`: confirmación (con `ok: true` y `confirmar`),
 * pregunta — con una opción por candidato si hay — o error. Sin nada que mostrar, `null`.
 */
export function modeloTarjeta(r: ResultadoVoz | null | undefined): ModeloTarjeta | null {
    if (!r) return null;
    if (!r.ok) {
        if (r.candidatos?.length)
            return { tipo: "preguntar", pregunta: r.pregunta, opciones: r.candidatos.map((c) => ({ id: c.id, etiqueta: etiquetaDe(c) })) };
        if (r.razon === "falta-dato" || r.razon === "sin-contexto")
            return { tipo: "preguntar", pregunta: r.pregunta, opciones: [] };
        return { tipo: "error", mensaje: r.pregunta };
    }
    const t = r.tarjeta;
    if (!r.confirmar || !t) return null;
    const nombres = r.pasos.flatMap((p) => (saleDeLaCuenta(p.intencion) ? nombresDeSalida(p.intencion) : []));
    return {
        tipo: "confirmar",
        titulo: t.titulo,
        lineas: nombres.length ? [...t.lineas, lineaEnvio(nombres)] : t.lineas,
        acciones: t.acciones,
    };
}

const SI_YES = /^(?:si|sip|vale|dale|hazlo|hazla|hazle|confirmo|confirmar|adelante|correcto|exacto|ok)\b/;
const CAMBIAR = /^(?:cambia|cambiar|cambiale|cambialo|cambiala|corrige)\b/;
const CANCELAR = /^(?:no|cancela|cancelar|cancelalo|cancelala|para|deja|olvidalo|ninguno|ninguna)\b/;

/** Respuesta hablada a la tarjeta de confirmación: sí/vale/hazlo → confirmar; cambiar; no/cancela → cancelar. */
function dictarConfirmacion(t: string): RespuestaTarjeta {
    if (CANCELAR.test(t)) return "cancelar";
    if (CAMBIAR.test(t)) return "cambiar";
    if (SI_YES.test(t)) return "confirmar";
    return null;
}

/**
 * La respuesta a la tarjeta, sea por botón o por voz. En una pregunta nunca elige solo: «sí» con
 * varias opciones no confirma ni elige (lo resuelve `elegirCandidato`, que vuelve a preguntar).
 */
export function resolverRespuesta(modelo: ModeloTarjeta | null, entrada: EntradaTarjeta): RespuestaTarjeta {
    if (!modelo) return null;
    if (entrada.tipo === "boton") {
        if (entrada.id === "confirmar" || entrada.id === "cambiar" || entrada.id === "cancelar") return entrada.id;
        return modelo.tipo === "preguntar" && modelo.opciones.some((o) => o.id === entrada.id) ? { elegir: entrada.id } : null;
    }
    const t = limpiar(entrada.frase);
    if (modelo.tipo === "confirmar") return dictarConfirmacion(t);
    if (modelo.tipo === "preguntar") {
        const e = elegirCandidato(t, modelo.opciones.map((o) => ({ tipo: "grupo", id: o.id, nombre: nombreDeEtiqueta(o.etiqueta) })));
        if (e.tipo === "cancelado") return "cancelar";
        return e.tipo === "elegido" ? { elegir: e.ref.id } : null;
    }
    return CANCELAR.test(t) ? "cancelar" : null;
}
