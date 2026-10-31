"use client";
/**
 * StarSeed XR · ORBE CON VOZ (tarea XR1010P · contrato `architecture/starseed-xr.md` §3 a y f).
 * Conecta lo que YA existía: `useVozXR` (máquina pura probada en `voz-xr.ts`) con `OrbeAstraura`
 * (XR1010O), que dejó el puente `pipeline` a la espera de esta tarea. Escucha, parcial, capa
 * entendida y avisos entran a Zenith por ahí. El ejecutor del mundo (XR1010R) ya se aplica sobre
 * `resultado` (crear/editar, ir a y abrir); la tarjeta de confirmación y lo que sale de la cuenta
 * lo cablean XR1010Q y XR1010T. Cascarón fino de R3F.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { astrauraChat } from "@/ai/astraura/router";
import { leerMundo } from "@/lib/vivo/xr-mundo";
import { ejecutarMundo, pasosDeMundo, refSalaDeUrl, type MundoEnContexto } from "./ejecutor-mundo";
import { NivelCalidadContext } from "./panel-cristal";
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
    const nivel = useContext(NivelCalidadContext);
    const [actual, setActual] = useState<MundoEnContexto | null>(null);
    const { estado, parcial, resultado, hablar } = useVozXR({
        mundoActual: actual ? { id: actual.refId, nombre: actual.mundo.nombre } : null,
    });
    const emisor = useRef<EmisorOrbe | null>(null);
    const creado = useRef<MundoEnContexto | null>(null);
    const ejecutado = useRef<Reparto | null>(null);
    const pipeline = useCallback((enviar: EmisorOrbe) => {
        emisor.current = enviar;
        return () => { emisor.current = null; };
    }, []);
    useEffect(() => {
        const enviar = emisor.current;
        if (!enviar) return;
        for (const ev of eventosDeCambio(estado, parcial, resultado)) enviar(ev);
    }, [estado, parcial, resultado]);

    // El mundo abierto se lee de la MISMA fila de la sala; sin fila, «mundo-actual» lo dirá.
    useEffect(() => {
        const refId = refSalaDeUrl(window.location.pathname, window.location.search);
        if (!refId) return;
        let vivo = true;
        void leerMundo(refId).then((mundo) => { if (vivo && mundo) setActual({ refId, mundo }); });
        return () => { vivo = false; };
    }, []);

    const razonar = useCallback(
        (p: string) => astrauraChat({ messages: [{ role: "user", content: p }], taskHint: "reasoning", temperature: 0.2 }).then((r) => r.text),
        [],
    );

    // La voz ya entendida se APLICA aquí: crea o edita el mundo y navega al destino; lo que sale
    // de la cuenta (invitar, subir) espera a la tarjeta de XR1010Q y a XR1010T.
    useEffect(() => {
        if (!resultado || resultado.via !== "intencion" || !resultado.resultado.ok || ejecutado.current === resultado) return;
        ejecutado.current = resultado;
        const pasos = pasosDeMundo(resultado.resultado.pasos);
        if (!pasos.length) return;
        void (async () => {
            let destino: string | null = null;
            for (const paso of pasos) {
                const r = await ejecutarMundo(paso, { nivel, razonar, creado: creado.current, mundoActual: actual });
                const enviar = emisor.current;
                if (!r.ok) { enviar?.({ tipo: "error", texto: r.motivo }); continue; }
                if (paso.intencion.tipo === "crear-mundo") {
                    const mundo = await leerMundo(r.refId);
                    if (mundo) creado.current = { refId: r.refId, mundo };
                }
                if (r.ruta && paso.intencion.tipo !== "editar-mundo") destino = r.ruta;
                enviar?.({ tipo: "habla-inicio", texto: r.resumen });
                enviar?.({ tipo: "habla-fin" });
            }
            if (destino) window.location.assign(destino);
        })();
    }, [resultado, nivel, razonar, actual]);

    return <OrbeAstraura pipeline={pipeline} hablar={hablar} />;
}

export default OrbeVoz;
