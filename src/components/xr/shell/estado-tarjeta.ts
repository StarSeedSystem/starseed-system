/**
 * StarSeed XR · ESTADO DE LA TARJETA DE CONFIRMACIÓN (XR1010Q · contrato `architecture/starseed-xr.md` §3 f).
 *
 * Puro: convierte un `ResultadoVoz` de `entenderVoz` en el MODELO 3D de la tarjeta, lista los
 * nombres de lo que saldría de la cuenta y resuelve lo que la persona contesta (botón o frase
 * hablada). Regla de oro: un «sí» con varias opciones NUNCA confirma solo; para elegir se reutiliza
 * `elegirCandidato` (intenciones-ref), que nunca adivina.
 */
import type { Intencion, PasoVoz, RefResuelta, ResultadoVoz, TarjetaConfirmacion } from "../../../lib/xr/intenciones-voz";
import { elegirCandidato, saleDeLaCuenta } from "../../../lib/xr/intenciones-voz";
import { limpiar } from "../../../lib/xr/intenciones-ref";

/** Lo que la persona contestó: una acción, la opción elegida o nada (aún). */
export type RespuestaTarjeta = "confirmar" | "cambiar" | "cancelar" | { elegir: string } | null;

export interface OpcionTarjeta {
    id: string;
    etiqueta: string;
}

export type ModeloTarjeta =
    | { tipo: "confirmar"; titulo: string; lineas: string[]; acciones: TarjetaConfirmacion["acciones"] }
    | {
        tipo: "preguntar";
        pregunta: string;
        opciones: OpcionTarjeta[];
        /** Las referencias de cada opción, para reutilizar `elegirCandidato` al responder por voz. */
        candidatos?: RefResuelta[];
    }
    | { tipo: "error"; mensaje: string }
    | null;

/** Nombre de una referencia con sus miembros: «Banda (6 personas)». */
export const etiquetaDe = (c: RefResuelta): string =>
    c.miembros ? (c.miembros === 1 ? `${c.nombre} (1 persona)` : `${c.nombre} (${c.miembros} personas)`) : c.nombre;

export function modeloTarjeta(r: ResultadoVoz | null | undefined): ModeloTarjeta {
    if (!r || typeof r !== "object") return null;
    if (r.ok) {
        return r.confirmar && r.tarjeta
            ? { tipo: "confirmar", titulo: r.tarjeta.titulo, lineas: [...r.tarjeta.lineas], acciones: [...r.tarjeta.acciones] }
            : null;
    }
    if (r.candidatos?.length) {
        return {
            tipo: "preguntar",
            pregunta: r.pregunta,
            candidatos: r.candidatos,
            opciones: r.candidatos.map((c) => ({ id: c.id, etiqueta: etiquetaDe(c) })),
        };
    }
    if (r.razon === "sin-contexto" || r.razon === "falta-dato") return { tipo: "preguntar", pregunta: r.pregunta, opciones: [] };
    return { tipo: "error", mensaje: r.pregunta };
}

/** Nombres de TODO lo que saldría de la cuenta con estos pasos: la línea «Esto se enviará a: …». */
export function destinatariosDe(pasos: PasoVoz[]): string[] {
    const nombres: string[] = [];
    for (const paso of pasos) {
        const i: Intencion = paso.intencion;
        if (!saleDeLaCuenta(i)) continue;
        if (i.tipo === "invitar") nombres.push(...i.a.map(etiquetaDe));
        else if (i.tipo === "subir") {
            const d = i.destino;
            if (d.donde === "estacion") nombres.push(d.ref?.nombre ?? "una estación nueva");
            else if (d.donde === "publicacion")
                nombres.push(d.ref?.nombre ?? (d.visibilidad === "publica" ? "todo el mundo" : d.visibilidad === "yo" ? "ti" : "tu grupo"));
            else if (d.donde === "mensaje") nombres.push(...d.para.map(etiquetaDe));
        }
    }
    return [...new Set(nombres)];
}

const CANCELA = /^(?:no|ninguno|ninguna|cancela|cancelar|olvidalo|para)\b/;
const CAMBIA = /\b(?:cambiar|cambialo|cambiala|cambiarlo|otro|otra|repite|repitemelo)\b/;
const CONFIRMA = /^(?:si|sip|vale|dale|hazlo|hazla|adelante|venga|va|correcto|confirmo|confirmar|exacto|ok)\b/;

export type EntradaRespuesta = { tipo: "boton"; id: string } | { tipo: "voz"; frase: string };

/**
 * Lo que la persona respondió. Por voz en una tarjeta de confirmación: «confirmar», «sí», «vale»,
 * «hazlo» → confirmar; «cambiar» → cambiar; «no», «cancela» → cancelar. En una pregunta se usa
 * `elegirCandidato`: «el segundo», «la última» o el nombre; con VARIAS opciones un «sí» no
 * confirma nada (devuelve null y la tarjeta sigue esperando).
 */
export function resolverRespuesta(modelo: ModeloTarjeta, entrada: EntradaRespuesta): RespuestaTarjeta {
    if (!modelo || modelo.tipo === "error") return null;
    if (entrada.tipo === "boton") {
        if (modelo.tipo === "confirmar") {
            const a = modelo.acciones.find((x) => x === entrada.id);
            return a ?? null;
        }
        if (entrada.id === "cancelar") return "cancelar";
        return modelo.opciones.some((o) => o.id === entrada.id) ? { elegir: entrada.id } : null;
    }
    if (modelo.tipo === "confirmar") {
        const t = limpiar(entrada.frase);
        if (CANCELA.test(t)) return "cancelar";
        if (CAMBIA.test(t)) return "cambiar";
        if (CONFIRMA.test(t)) return "confirmar";
        return null;
    }
    const e = elegirCandidato(entrada.frase, modelo.candidatos ?? []);
    if (e.tipo === "elegido") return { elegir: e.ref.id };
    if (e.tipo === "cancelado") return "cancelar";
    return null;
}
