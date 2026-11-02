/**
 * StarSeed XR · MÁQUINA DE ESTADOS del flujo de voz (XR1010T · contrato §3 f).
 * PURA: no ejecuta nada fuera de sí misma; devuelve los efectos que el componente aplica.
 */
import type { PasoVoz, ResultadoVoz } from "../../../lib/xr/intenciones-tipos";
import type { RespuestaTarjeta } from "./estado-tarjeta";

export type EnfoqueVoz = { tipo: "grupo" | "persona" | "estacion" | "servidor"; id: string };
export type DeshacerPaso = () => Promise<void>;
export interface HechoPaso { paso: PasoVoz; resumen: string; deshacer?: DeshacerPaso }

export type EstadoFlujo =
    | { tipo: "reposo" }
    | { tipo: "escuchando" }
    | { tipo: "entendiendo"; frase: string }
    | { tipo: "tarjeta"; modo: "confirmar" | "preguntar"; resultado: ResultadoVoz; pasos: PasoVoz[]; frase: string }
    | { tipo: "ejecutando"; pasos: PasoVoz[]; indice: number; hechos: HechoPaso[] }
    | { tipo: "hecho"; resumen: string; hechos: HechoPaso[]; deshacer: DeshacerPaso[] }
    | { tipo: "fallo"; motivo: string; hechos: HechoPaso[]; pendientes: PasoVoz[] };

export type Efecto =
    | { tipo: "entender"; frase?: string; enfoque?: EnfoqueVoz }
    | { tipo: "mostrar-tarjeta" }
    | { tipo: "ejecutar-paso"; indice: number; total: number; paso: PasoVoz }
    | { tipo: "avisar"; mensaje: string; tono?: "info" | "error" }
    | { tipo: "deshacer"; pasos: DeshacerPaso[] };

export type EventoFlujo =
    | { tipo: "frase"; texto: string }
    | { tipo: "resultado"; resultado: ResultadoVoz }
    | { tipo: "respuesta"; respuesta: RespuestaTarjeta }
    | { tipo: "paso-ok"; resumen: string; deshacer?: DeshacerPaso }
    | { tipo: "paso-fallo"; motivo: string }
    | { tipo: "deshacer" }
    | { tipo: "cancelar" };

export interface SalidaFlujo { estado: EstadoFlujo; efectos: Efecto[] }
export const FLUJO_INICIAL: EstadoFlujo = { tipo: "reposo" };

const quieto = (estado: EstadoFlujo): SalidaFlujo => ({ estado, efectos: [] });
const fraseDe = (e: EstadoFlujo): string => (e.tipo === "entendiendo" || e.tipo === "tarjeta" ? e.frase : "");
const QUE: Record<string, string> = { "crear-mundo": "crear el mundo", "editar-mundo": "cambiar el mundo", invitar: "invitar", subir: "subir el mundo", "ir-a": "ir al destino", abrir: "abrir", sistema: "la orden de sistema" };
const que = (p: PasoVoz): string => QUE[p.intencion.tipo] ?? "completar la orden";
const deshacerDe = (hs: HechoPaso[]): DeshacerPaso[] => [...hs].reverse().flatMap((h) => (h.deshacer ? [h.deshacer] : []));
const hechosDe = (e: EstadoFlujo): HechoPaso[] => (e.tipo === "ejecutando" || e.tipo === "hecho" || e.tipo === "fallo" ? e.hechos : []);

function arrancar(pasos: PasoVoz[]): SalidaFlujo {
    if (!pasos.length) return { estado: { tipo: "hecho", resumen: "No había nada que hacer.", hechos: [], deshacer: [] }, efectos: [{ tipo: "avisar", mensaje: "No había nada que hacer." }] };
    return { estado: { tipo: "ejecutando", pasos, indice: 0, hechos: [] }, efectos: [{ tipo: "ejecutar-paso", indice: 0, total: pasos.length, paso: pasos[0] }] };
}

function terminar(hechos: HechoPaso[]): SalidaFlujo {
    const resumen = `Listo: ${hechos.map((h) => h.resumen).join(" · ")}`;
    return { estado: { tipo: "hecho", resumen, hechos, deshacer: deshacerDe(hechos) }, efectos: [{ tipo: "avisar", mensaje: resumen }] };
}

function cortar(e: Extract<EstadoFlujo, { tipo: "ejecutando" }>, motivo: string): SalidaFlujo {
    const actual = e.pasos[e.indice];
    const pendientes = e.pasos.slice(e.indice);
    const hecho = e.hechos.length ? ` Se hizo: ${e.hechos.map((h) => h.resumen).join(" · ")}.` : " No se hizo nada.";
    const falta = pendientes.length ? ` Quedó sin hacer: ${pendientes.map((p) => que(p)).join(" · ")}.` : "";
    const mensaje = `No pude ${que(actual)}: ${motivo}.${hecho}${falta}`;
    return { estado: { tipo: "fallo", motivo: mensaje, hechos: e.hechos, pendientes }, efectos: [{ tipo: "avisar", mensaje, tono: "error" }] };
}

function cancelar(estado: EstadoFlujo): SalidaFlujo {
    const pasos = deshacerDe(hechosDe(estado));
    const efectos: Efecto[] = pasos.length
        ? [{ tipo: "deshacer", pasos }, { tipo: "avisar", mensaje: "Cancelado: deshice lo que ya se había hecho." }]
        : [{ tipo: "avisar", mensaje: "Cancelado. No se hizo nada." }];
    return { estado: FLUJO_INICIAL, efectos };
}

export function siguiente(estado: EstadoFlujo, evento: EventoFlujo): SalidaFlujo {
    switch (evento.tipo) {
        case "frase": {
            const frase = evento.texto.trim();
            if (!frase) return { estado: { tipo: "escuchando" }, efectos: [{ tipo: "avisar", mensaje: "No te he oído. Vuelve a hablar." }] };
            return { estado: { tipo: "entendiendo", frase }, efectos: [{ tipo: "entender", frase }] };
        }
        case "resultado": {
            if (estado.tipo !== "entendiendo" && estado.tipo !== "escuchando" && estado.tipo !== "reposo") return quieto(estado);
            const r = evento.resultado;
            const frase = fraseDe(estado);
            if (!r.ok) return { estado: { tipo: "tarjeta", modo: "preguntar", resultado: r, pasos: [], frase }, efectos: [{ tipo: "mostrar-tarjeta" }] };
            if (r.confirmar) return { estado: { tipo: "tarjeta", modo: "confirmar", resultado: r, pasos: r.pasos, frase }, efectos: [{ tipo: "mostrar-tarjeta" }] };
            return arrancar(r.pasos);
        }
        case "respuesta": {
            if (estado.tipo !== "tarjeta" || !evento.respuesta) return quieto(estado);
            const r = evento.respuesta;
            if (r === "cancelar") return cancelar(estado);
            if (r === "cambiar") return { estado: { tipo: "escuchando" }, efectos: [{ tipo: "avisar", mensaje: "Dime otra vez cómo lo quieres." }] };
            if (r === "confirmar") return estado.modo === "confirmar" ? arrancar(estado.pasos) : quieto(estado);
            if (estado.modo !== "preguntar" || estado.resultado.ok) return quieto(estado);
            const cand = estado.resultado.candidatos?.find((c) => c.id === r.elegir);
            if (!cand) return quieto(estado);
            const enfoque: EnfoqueVoz = { tipo: cand.tipo, id: cand.id };
            return { estado: { tipo: "entendiendo", frase: estado.frase }, efectos: [{ tipo: "entender", frase: estado.frase, enfoque }] };
        }
        case "paso-ok": {
            if (estado.tipo !== "ejecutando") return quieto(estado);
            const hecho: HechoPaso = { paso: estado.pasos[estado.indice], resumen: evento.resumen, ...(evento.deshacer ? { deshacer: evento.deshacer } : {}) };
            const hechos = [...estado.hechos, hecho];
            const indice = estado.indice + 1;
            if (indice >= estado.pasos.length) return terminar(hechos);
            return { estado: { tipo: "ejecutando", pasos: estado.pasos, indice, hechos }, efectos: [{ tipo: "ejecutar-paso", indice, total: estado.pasos.length, paso: estado.pasos[indice] }] };
        }
        case "paso-fallo":
            return estado.tipo === "ejecutando" ? cortar(estado, evento.motivo) : quieto(estado);
        case "cancelar":
            return cancelar(estado);
        case "deshacer": {
            if (estado.tipo !== "hecho") return quieto(estado);
            const pasos = deshacerDe(estado.hechos);
            const efectos: Efecto[] = pasos.length ? [{ tipo: "deshacer", pasos }, { tipo: "avisar", mensaje: "Deshecho." }] : [{ tipo: "avisar", mensaje: "No había nada que deshacer." }];
            return { estado: FLUJO_INICIAL, efectos };
        }
    }
}
