"use client";
/**
 * StarSeed XR · ORBE CON VOZ (tarea XR1010P · contrato `architecture/starseed-xr.md` §3 a y f).
 * Conecta lo que YA existía: `useVozXR` (máquina pura probada en `voz-xr.ts`) con `OrbeAstraura`
 * (XR1010O), que dejó el puente `pipeline` a la espera de esta tarea. Escucha, parcial, capa
 * entendida y avisos entran a Zenith por ahí; la tarjeta de confirmación y los ejecutores, que
 * actúan sobre `resultado`, los cablean XR1010Q y XR1010T. Cascarón fino de R3F.
 */
import { useCallback, useEffect, useRef } from "react";
import { OrbeAstraura, type EmisorOrbe } from "./orbe-astraura";
import type { EventoOrbe } from "./estado-orbe";
import { useVozXR } from "./use-voz-xr";
import type { EstadoVoz, Reparto } from "./voz-xr";

/** Traducción PURA (probable) de un cambio de voz a eventos del orbe: el orbe nunca queda en bucle,
 *  todo desemboca en `reposo` con el texto de la pregunta, la duda o el dictado en el panel. */
export function eventosDeCambio(estado: EstadoVoz, parcial: string, resultado: Reparto | null): EventoOrbe[] {
    const ev: EventoOrbe[] = [];
    if (estado.estado === "escuchando") ev.push({ tipo: "escucha-inicio" });
    if (estado.estado === "procesando") ev.push({ tipo: "escucha-fin" });
    if (estado.estado === "sin-voz") ev.push({ tipo: "error", texto: estado.motivo });
    if (parcial.trim()) ev.push({ tipo: "texto-parcial", texto: parcial });
    if (resultado === null) return ev;
    if (resultado.via === "preguntar") ev.push({ tipo: "error", texto: resultado.pregunta });
    else if (resultado.via === "dictado") ev.push({ tipo: "error", texto: `Dictado a la Protomolécula: ${resultado.texto}` });
    else if (resultado.resultado.ok) {
        const pasos = resultado.resultado.pasos;
        ev.push({ tipo: "entendido", capa: pasos[pasos.length - 1]?.capa ?? "reflejo" });
    } else {
        // «Este grupo» sin enfoque, sin dato… se pregunta: NUNCA se adivina (contrato §3 f).
        ev.push({ tipo: "error", texto: resultado.resultado.pregunta });
    }
    return ev;
}

/** El nodo Zenith de la Trinity: Astraura con la voz de la cuenta. Se monta desde el contenido
 *  de `RigTrinity` (XR1010J) en `escena-os.tsx`; así uikit/vive solo en la ruta `/xr/os`. */
export function OrbeVoz() {
    const { estado, parcial, resultado, hablar } = useVozXR();
    const emisor = useRef<EmisorOrbe | null>(null);
    const pipeline = useCallback((enviar: EmisorOrbe) => {
        emisor.current = enviar;
        return () => { emisor.current = null; };
    }, []);
    useEffect(() => {
        const enviar = emisor.current;
        if (!enviar) return;
        for (const ev of eventosDeCambio(estado, parcial, resultado)) enviar(ev);
    }, [estado, parcial, resultado]);
    return <OrbeAstraura pipeline={pipeline} hablar={hablar} />;
}

export default OrbeVoz;
