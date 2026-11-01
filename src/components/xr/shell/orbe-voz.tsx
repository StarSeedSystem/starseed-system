"use client";
/**
 * StarSeed XR · ORBE CON VOZ (tarea XR1010P · contrato `architecture/starseed-xr.md` §3 a y f).
 * Conecta lo que YA existía: `useVozXR` (máquina pura probada en `voz-xr.ts`) con `OrbeAstraura`
 * (XR1010O), que dejó el puente `pipeline` a la espera de esta tarea. Escucha, parcial, capa
 * entendida y avisos entran a Zenith por ahí. El ejecutor del mundo (XR1010R) ya se aplica sobre
 * `resultado` (crear/editar, ir a y abrir); la tarjeta de confirmación (XR1010Q) queda aquí
 * COLGADA hasta que la persona contesta (§3 f) y lo que sale de la cuenta lo ejecuta XR1010T.
 * Cascarón fino de R3F.
 */
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { astrauraChat } from "@/ai/astraura/router";
import { leerMundo } from "@/lib/vivo/xr-mundo";
import { entenderVoz, type ResultadoVoz } from "@/lib/xr/intenciones-voz";
import type { ContextoVoz } from "@/lib/xr/intenciones-tipos";
import { ejecutarMundo, pasosDeMundo, refSalaDeUrl, type MundoEnContexto } from "./ejecutor-mundo";
import { NivelCalidadContext } from "./panel-cristal";
import { OrbeAstraura, type EmisorOrbe } from "./orbe-astraura";
import type { EventoOrbe } from "./estado-orbe";
import { modeloTarjeta, type RespuestaTarjeta } from "./estado-tarjeta";
import TarjetaVoz from "./tarjeta-voz";
import { useVozXR } from "./use-voz-xr";
import type { EstadoVoz, Reparto } from "./voz-xr";

/** Traducción PURA (probable) de un cambio de voz a eventos del orbe: el orbe nunca queda en bucle,
 *  todo desemboca en `reposo` con el texto de la pregunta, la duda o el dictado en el panel. */
export function eventosDeCambio(estado: EstadoVoz, parcial: string, resultado: Reparto | null, tarjetaAbierta = false): EventoOrbe[] {
    const ev: EventoOrbe[] = [];
    if (estado.estado === "escuchando") ev.push({ tipo: "escucha-inicio" });
    if (estado.estado === "procesando") ev.push({ tipo: "escucha-fin" });
    if (estado.estado === "sin-voz") ev.push({ tipo: "error", texto: estado.motivo });
    if (parcial.trim()) ev.push({ tipo: "texto-parcial", texto: parcial });
    if (resultado === null) return ev;
    // Con la tarjeta abierta, la frase contestada la resuelve la TARJETA: el orbe no repite por encima.
    if (tarjetaAbierta && resultado.via !== "intencion") return ev;
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
    const { estado, parcial, resultado, frase: fraseFinal, hablar } = useVozXR({
        mundoActual: actual ? { id: actual.refId, nombre: actual.mundo.nombre } : null,
    });
    const emisor = useRef<EmisorOrbe | null>(null);
    const creado = useRef<MundoEnContexto | null>(null);
    const ejecutado = useRef<ResultadoVoz | null>(null);
    // XR1010Q · la tarjeta COLGADA: confirmación o pregunta con candidatos (§3 f). No se cierra sola.
    const [pendiente, setPendiente] = useState<{ r: ResultadoVoz; frase: string } | null>(null);
    const [reintento, setReintento] = useState<{ r: ResultadoVoz; frase: string } | null>(null);
    const [claveTarjeta, setClaveTarjeta] = useState(0);
    const abiertaRef = useRef(false);
    const fraseRef = useRef<string | null>(null);
    fraseRef.current = fraseFinal;
    const consumidaRef = useRef<string | null>(null);
    const pipeline = useCallback((enviar: EmisorOrbe) => {
        emisor.current = enviar;
        return () => { emisor.current = null; };
    }, []);
    useEffect(() => {
        const enviar = emisor.current;
        if (!enviar) return;
        for (const ev of eventosDeCambio(estado, parcial, resultado, abiertaRef.current)) enviar(ev);
    }, [estado, parcial, resultado]);

    // XR1010Q · lo nuevo con tarjeta de voz SE QUEDA colgado (§3 f: no se cierra sola); la frase
    // que la abrió no se contesta a sí misma, así que la tarjeta solo come frases posteriores.
    // Si la frase ya la CONSUMIÓ la tarjeta (respuesta de voz), el guardia no toca nada.
    useEffect(() => {
        if (!resultado || (consumidaRef.current && consumidaRef.current === fraseRef.current)) return;
        setReintento(null);
        if (resultado.via !== "intencion") return;
        const modelo = modeloTarjeta(resultado.resultado);
        if (modelo?.tipo === "confirmar" || modelo?.tipo === "preguntar") {
            abiertaRef.current = true;
            setPendiente({ r: resultado.resultado, frase: fraseRef.current ?? "" });
            setClaveTarjeta((c) => c + 1);
        } else if (resultado.resultado.ok) { abiertaRef.current = false; setPendiente(null); }
    }, [resultado]);

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
    // de la cuenta (invitar, subir) queda ATRAPADO abajo, tras la tarjeta de XR1010Q y XR1010T.
    useEffect(() => {
        const mandato = reintento?.r ?? (resultado?.via === "intencion" ? resultado.resultado : null);
        if (!mandato || !mandato.ok || ejecutado.current === mandato) return;
        ejecutado.current = mandato;
        const pasos = pasosDeMundo(mandato.pasos);
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
    }, [resultado, reintento, nivel, razonar, actual]);

    // XR1010Q · la decisión de la tarjeta. «elegir» re-resuelve la frase ORIGINAL con SOLO la
    // opción elegida en las listas (nunca adivina); el reto entra por el mismo tubo de arriba.
    const responderTarjeta = useCallback((r: RespuestaTarjeta) => {
        if (!r) return;
        consumidaRef.current = fraseRef.current;
        setReintento(null);
        setPendiente(null);
        const enviar = emisor.current;
        if (r === "cancelar") { abiertaRef.current = false; enviar?.({ tipo: "error", texto: "Cancelado: no se envió nada." }); return; }
        if (r === "cambiar") { abiertaRef.current = false; enviar?.({ tipo: "error", texto: "Vale: repite la orden con otras palabras." }); return; }
        if (r === "confirmar") {
            abiertaRef.current = false;
            // El mundo ya corrió arriba; lo que sale de la cuenta se ejecuta con la tarjeta ACEPTADA:
            // props reales (mensajería, accesos, biblioteca…) las inyecta el flujo final XR1010T.
            enviar?.({ tipo: "habla-inicio", texto: "Confirmado; queda en el flujo por ejecutar." });
            enviar?.({ tipo: "habla-fin" });
            return;
        }
        const ele = pendiente && !pendiente.r.ok ? pendiente.r.candidatos?.find((c) => c.id === r.elegir) : undefined;
        const original = pendiente?.frase;
        enviar?.({ tipo: "error", texto: ele ? `Elijo «${ele.nombre}».` : "No reconozco esa opción; repite la orden." });
        if (!ele || !original) { abiertaRef.current = false; return; }
        const ctxSolo: ContextoVoz = {
            grupos: ele.tipo === "grupo" ? [ele] : [], contactos: ele.tipo === "persona" ? [ele] : [],
            estaciones: ele.tipo === "estacion" ? [ele] : [], servidores: ele.tipo === "servidor" ? [ele] : [],
        };
        const re = entenderVoz(original, ctxSolo);
        const mo = modeloTarjeta(re);
        if (mo?.tipo === "confirmar" || mo?.tipo === "preguntar") {
            setPendiente({ r: re, frase: original });
            setClaveTarjeta((c) => c + 1);
            return;
        }
        setReintento({ r: re, frase: original });
    }, [pendiente]);

    return (
        <>
            <OrbeAstraura pipeline={pipeline} hablar={hablar} />
            {pendiente && (
                <TarjetaVoz
                    key={claveTarjeta}
                    resultado={pendiente.r}
                    frase={fraseFinal && fraseFinal !== pendiente.frase && fraseFinal !== consumidaRef.current ? fraseFinal : ""}
                    alResponder={responderTarjeta}
                />
            )}
        </>
    );
}

export default OrbeVoz;
