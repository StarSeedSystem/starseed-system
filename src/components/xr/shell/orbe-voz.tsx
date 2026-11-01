"use client";
/**
 * StarSeed XR · ORBE CON VOZ (tarea XR1010P · contrato `architecture/starseed-xr.md` §3 a y f).
 * Conecta lo que YA existía: `useVozXR` (máquina pura probada en `voz-xr.ts`) con `OrbeAstraura`
 * (XR1010O), que dejó el puente `pipeline` a la espera de esta tarea. Escucha, parcial, capa
 * entendida y avisos entran a Zenith por ahí. El ejecutor del mundo (XR1010R) ya se aplica sobre
 * `resultado` (crear/editar, ir a y abrir). XR1010Q: la tarjeta (XR1010T pinta nada, la MONTA
 * aquí) muestra confirmación/pregunta/error con `modeloTarjeta`; las respuestas entran POR
 * `resolverRespuesta` (botones y voz), y lo que sale de la cuenta queda en `correrPendientes`
 * para el flujo final de XR1010T con el ejecutor real de compartir. Cascarón fino de R3F.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { astrauraChat } from "@/ai/astraura/router";
import { leerMundo } from "@/lib/vivo/xr-mundo";
import { ejecutarMundo, pasosDeMundo, refSalaDeUrl, type MundoEnContexto } from "./ejecutor-mundo";
import { saleDeLaCuenta } from "@/lib/xr/intenciones-voz";
import { NivelCalidadContext } from "./panel-cristal";
import { OrbeAstraura, type EmisorOrbe } from "./orbe-astraura";
import { TarjetaVoz } from "./tarjeta-voz";
import { modeloTarjeta, resolverRespuesta, type ModeloTarjeta, type RespuestaTarjeta } from "./estado-tarjeta";
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
    const { estado, parcial, resultado, hablar, reenviar } = useVozXR({
        mundoActual: actual ? { id: actual.refId, nombre: actual.mundo.nombre } : null,
    });
    const emisor = useRef<EmisorOrbe | null>(null);
    const creado = useRef<MundoEnContexto | null>(null);
    const ejecutado = useRef<Reparto | null>(null);
    // La tarjeta (XR1010Q): el modelo sale de `modeloTarjeta` y quien responde es la PERSONA.
    const [modelo, setModelo] = useState<ModeloTarjeta>(null);
    const pendiente = useRef<Extract<Reparto, { frase: string }> | null>(null);
    const procesado = useRef<Reparto | null>(null);
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

    // Lo que sale de la cuenta (invitar, subir) se ejecuta SOLO con la tarjeta ya aceptada.
    // El ejecutor real con sus entidades (sala, mensajes, biblioteca, estación, publicación) lo
    // cablea XR1010T; mientras tanto, `ejecutarMundo` contesta de forma honesta paso a paso.
    const correrPendientes = useCallback((p: Extract<Reparto, { via: "intencion" }>) => {
        void (async () => {
            const enviar = emisor.current;
            if (!p.resultado.ok) return;
            const pasos = p.resultado.pasos.filter((x) => saleDeLaCuenta(x.intencion));
            for (const paso of pasos) {
                const r = await ejecutarMundo(paso, { nivel, razonar, creado: creado.current, mundoActual: actual });
                if (!r.ok) { enviar?.({ tipo: "error", texto: r.motivo }); continue; }
                enviar?.({ tipo: "habla-inicio", texto: r.resumen });
                enviar?.({ tipo: "habla-fin" });
            }
        })();
    }, [nivel, razonar, actual]);

    const alResponder = useCallback((r: Exclude<RespuestaTarjeta, null>) => {
        const p = pendiente.current;
        setModelo(null);
        pendiente.current = null;
        const enviar = emisor.current;
        if (r === "cancelar") { enviar?.({ tipo: "habla-inicio", texto: "Vale: no se ha enviado nada." }); enviar?.({ tipo: "habla-fin" }); return; }
        if (r === "cambiar") { hablar(true); return; }
        if (r === "confirmar") { if (p?.via === "intencion" && p.resultado.ok) correrPendientes(p); return; }
        const c = p?.via === "intencion" && !p.resultado.ok ? p.resultado.candidatos?.find((x) => x.id === r.elegir) : undefined;
        if (p && c) reenviar(p.frase, c); // «¿Cuál?» resuelto: el flujo sigue con SOLO esa referencia.
    }, [hablar, reenviar, correrPendientes]);

    // La voz entra a la TARJETA por `resolverRespuesta` (nunca adivina un «sí» con opciones);
    // si la frase responde a la tarjeta, el resto del reparto no la pisa.
    useEffect(() => {
        if (!resultado || resultado.via === "dictado" || procesado.current === resultado) return;
        procesado.current = resultado;
        if (modelo) {
            const r = resolverRespuesta(modelo, { tipo: "voz", frase: resultado.frase });
            if (r) { setModelo(null); alResponder(r); return; }
        }
        if (resultado.via !== "intencion") { setModelo(null); pendiente.current = null; return; }
        const nuevo = modeloTarjeta(resultado.resultado);
        setModelo(nuevo);
        pendiente.current = nuevo ? resultado : null;
    }, [resultado, modelo, alResponder]);

    // La voz ya entendida se APLICA aquí: crea o edita el mundo y navega al destino; lo que sale
    // de la cuenta (invitar, subir) espera a la tarjeta y se ejecuta solo al confirmar.
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

    return (
        <>
            <OrbeAstraura pipeline={pipeline} hablar={hablar} />
            <TarjetaVoz modelo={modelo} alResponder={alResponder} nivel={nivel} />
        </>
    );
}

export default OrbeVoz;
