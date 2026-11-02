/**
 * StarSeed XR · MÁQUINA DE ESTADOS DEL FLUJO DE VOZ (XR1010T · contrato `architecture/starseed-xr.md` §3 f).
 * Reductor PURO (`siguiente`): entra un evento, salen estado nuevo y EFECTOS para el caller,
 * que entiende con `entenderVoz` y ejecuta con `ejecutarMundo`/`ejecutarCompartir`. Reglas:
 * una orden de varios pasos se confirma UNA vez y se detiene en el primer fallo avisando
 * qué se hizo y qué no; «cancelar» y «deshacer» revierten en orden inverso los pasos hechos.
 */
import type { ContextoVoz, PasoVoz, RefResuelta, ResultadoVoz } from "@/lib/xr/intenciones-tipos";
import { modeloTarjeta, type ModeloTarjeta, type RespuestaTarjeta } from "./estado-tarjeta";
export type DeshacerVoz = () => Promise<void>;
export interface PasoHecho { resumen: string; deshacer?: DeshacerVoz }
export type EstadoFlujo =
    | { fase: "reposo" }
    | { fase: "escuchando" }
    | { fase: "entendiendo"; frase: string }
    | { fase: "tarjeta"; modelo: ModeloTarjeta; pasos: PasoVoz[]; frase: string; dicho: string; elegibles: RefResuelta[] }
    | { fase: "ejecutando"; pasos: PasoVoz[]; indice: number; hechas: PasoHecho[]; confirmado: boolean }
    | { fase: "hecho"; resumen: string; hechas: PasoHecho[]; deshacer?: DeshacerVoz }
    | { fase: "fallo"; motivo: string; hechas: string[] };
export type Efecto =
    | { tipo: "entender"; frase: string; ctx: ContextoVoz | null }
    | { tipo: "mostrar-tarjeta"; modelo: ModeloTarjeta }
    | { tipo: "ejecutar-paso"; paso: PasoVoz; indice: number; confirmado: boolean }
    | { tipo: "avisar"; texto: string }
    | { tipo: "deshacer"; deshacer: DeshacerVoz };
export type EventoFlujo =
    | { tipo: "frase"; frase: string }
    | { tipo: "resultado"; resultado: ResultadoVoz }
    | { tipo: "respuesta"; respuesta: RespuestaTarjeta }
    | { tipo: "paso-ok"; resumen: string; deshacer?: DeshacerVoz }
    | { tipo: "paso-fallo"; motivo: string }
    | { tipo: "cancelar" }
    | { tipo: "deshacer" };
export type Resolucion = { estado: EstadoFlujo; efectos: Efecto[] };
export const REPOSO: EstadoFlujo = { fase: "reposo" };
/** Revertir en ORDEN INVERSO solo lo que tenga deshacer. */
export function deshacerTodo(hechas: PasoHecho[]): DeshacerVoz | undefined {
    const con = hechas.filter((h) => !!h.deshacer);
    if (!con.length) return undefined;
    return async () => { for (let i = con.length - 1; i >= 0; i--) await con[i].deshacer?.(); };
}
const hechoDe = (hs: PasoHecho[]): EstadoFlujo => ({ fase: "hecho", resumen: hs.map((h) => h.resumen).join(" · "), hechas: hs, ...(deshacerTodo(hs) ? { deshacer: deshacerTodo(hs)! } : {}) });
const repartir = (pasos: PasoVoz[], hechas: PasoHecho[], confirmado: boolean): Resolucion =>
    pasos.length
        ? { estado: { fase: "ejecutando", pasos, indice: 0, hechas, confirmado }, efectos: [{ tipo: "ejecutar-paso", paso: pasos[0], indice: 0, confirmado }] }
        : { estado: hechoDe(hechas), efectos: [{ tipo: "avisar", texto: "Hecho." }] };

const DEICTICO = /\b(?:este|esta|ese|esa|aquel|aquella|el|la)\s+(?:grupo|equipo|comunidad|persona|estación|estacion|servidor)(?:\s+de\s+\w+)?/gi;
/** Contexto mínimo para VOLVER a entender tras elegir: solo las listas donde había candidatos. */
const ctxDe = (e: RefResuelta[], x: RefResuelta): ContextoVoz => ({
    grupos: e.filter((c) => c.tipo === "grupo"), contactos: e.filter((c) => c.tipo === "persona"),
    estaciones: e.filter((c) => c.tipo === "estacion"), servidores: e.filter((c) => c.tipo === "servidor"),
    enfoque: { tipo: x.tipo, id: x.id }, mundoActual: null,
});
function tarjetaDe(e: EstadoFlujo, r: ResultadoVoz, pasos: PasoVoz[] = []): Resolucion {
    const modelo = modeloTarjeta(r);
    if (!modelo) return { estado: REPOSO, efectos: [] };
    const frase = e.fase === "entendiendo" || e.fase === "tarjeta" ? e.frase : "";
    const dicho = r.ok ? "" : /«([^»]+)»/.exec(r.pregunta)?.[1] ?? "";
    return { estado: { fase: "tarjeta", modelo, pasos, frase, dicho, elegibles: r.ok ? [] : r.candidatos ?? [] }, efectos: [{ tipo: "mostrar-tarjeta", modelo }] };
}

function elegir(t: Extract<EstadoFlujo, { fase: "tarjeta" }>, id: string): Resolucion {
    const ref = t.elegibles.find((c) => c.id === id);
    if (!ref || !t.frase) return { estado: t, efectos: [] };
    const esc = t.dicho ? t.dicho.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
    let frase = esc ? t.frase.replace(new RegExp(`\\b${esc}\\b`, "gi"), ref.nombre) : t.frase;
    if (frase === t.frase) frase = t.frase.replace(DEICTICO, `«${ref.nombre}»`);
    if (frase === t.frase) return { estado: t, efectos: [{ tipo: "avisar", texto: `Dilo con su nombre: «${ref.nombre}».` }] };
    return { estado: { fase: "entendiendo", frase }, efectos: [{ tipo: "entender", frase, ctx: ctxDe(t.elegibles, ref) }] };
}

function alResultado(e: EstadoFlujo, r: ResultadoVoz): Resolucion {
    if (e.fase === "ejecutando") return { estado: e, efectos: [] };
    if (!r.ok) return tarjetaDe(e, r);
    if (r.confirmar) return tarjetaDe(e, r, r.pasos);
    return repartir(r.pasos, [], false);
}
function alRespuesta(e: EstadoFlujo, r: RespuestaTarjeta): Resolucion {
    if (e.fase !== "tarjeta" || !r) return { estado: e, efectos: [] };
    if (r === "cancelar") return { estado: REPOSO, efectos: [{ tipo: "avisar", texto: "Cancelado." }] };
    if (r === "cambiar") return { estado: { fase: "escuchando" }, efectos: [] };
    if (r === "confirmar" && e.modelo.tipo === "confirmar") return repartir(e.pasos, [], true);
    if (typeof r === "object") return elegir(e, r.elegir);
    return { estado: e, efectos: [] };
}
/** El reductor: en ningún estado cambia algo que no haya pedido un efecto del caller. */
export function siguiente(estado: EstadoFlujo, ev: EventoFlujo): Resolucion {
    switch (ev.tipo) {
        case "frase":
            if (estado.fase === "ejecutando") return { estado, efectos: [] };
            return { estado: { fase: "entendiendo", frase: ev.frase }, efectos: [{ tipo: "entender", frase: ev.frase, ctx: null }] };
        case "resultado": return alResultado(estado, ev.resultado);
        case "respuesta": return alRespuesta(estado, ev.respuesta);
        case "paso-ok": {
            if (estado.fase !== "ejecutando") return { estado, efectos: [] };
            const hechas = [...estado.hechas, { resumen: ev.resumen, ...(ev.deshacer ? { deshacer: ev.deshacer } : {}) }];
            const indice = estado.indice + 1;
            if (indice >= estado.pasos.length) {
                const hecho = hechoDe(hechas);
                return { estado: hecho, efectos: [{ tipo: "avisar", texto: `${hecho.resumen}${hecho.deshacer ? ". Ya puedes decir «deshacer»." : ""}` }] };
            }
            return { estado: { ...estado, indice, hechas }, efectos: [{ tipo: "ejecutar-paso", paso: estado.pasos[indice], indice, confirmado: estado.confirmado }] };
        }
        case "paso-fallo": {
            if (estado.fase !== "ejecutando") return { estado, efectos: [] };
            const previas = estado.hechas.map((h) => h.resumen);
            const texto = previas.length ? `Hecho: ${previas.join("; ")}. No pude: ${ev.motivo}.` : `No pude: ${ev.motivo}.`;
            return { estado: { fase: "fallo", motivo: ev.motivo, hechas: previas }, efectos: [{ tipo: "avisar", texto }] };
        }
        case "cancelar":
            if (estado.fase === "ejecutando" && estado.hechas.length)
                return { estado: REPOSO, efectos: [{ tipo: "deshacer", deshacer: deshacerTodo(estado.hechas)! }, { tipo: "avisar", texto: "Cancelado: revierto lo que ya hice." }] };
            if (estado.fase === "hecho") return { estado, efectos: [{ tipo: "avisar", texto: "Ya estaba hecho. Puedes deshacerlo." }] };
            return { estado: REPOSO, efectos: [] };
        case "deshacer":
            if (estado.fase === "hecho" && estado.deshacer) return { estado: { ...estado, deshacer: undefined }, efectos: [{ tipo: "deshacer", deshacer: estado.deshacer }, { tipo: "avisar", texto: "Deshecho." }] };
            return { estado, efectos: [] };
    }
}
