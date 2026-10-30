"use client";
/**
 * StarSeed XR · ORBE CON VOZ (tarea XR1010P · contrato `architecture/starseed-xr.md` §3 a y f).
 * Conecta lo que YA existía: `useVozXR` (máquina pura probada en `voz-xr.ts`) con `OrbeAstraura`
 * (XR1010O), que dejó el puente `pipeline` a la espera de esta tarea. Escucha, parcial, capa
 * entendida y avisos entran a Zenith por ahí. La tarjeta de confirmación (XR1010Q) se monta aquí:
 * `modeloTarjeta` traduce el `Reparto` de intención y `TarjetaVoz` la pinta a 1,2 m. El ejecutor del
 * mundo (XR1010R) ya se aplica sobre `resultado` (crear/editar/navegar); las intenciones que salen
 * de la cuenta las cablea XR1010T. Cascarón fino de R3F.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { astrauraChat } from "@/ai/astraura/router";
import { leerMundo } from "@/lib/vivo/xr-mundo";
import type { Intencion } from "@/lib/xr/intenciones-tipos";
import { OrbeAstraura, type EmisorOrbe } from "./orbe-astraura";
import type { EventoOrbe } from "./estado-orbe";
import { useVozXR } from "./use-voz-xr";
import type { EstadoVoz, Reparto } from "./voz-xr";
import { TarjetaVoz } from "./tarjeta-voz";
import { modeloTarjeta } from "./estado-tarjeta";
import { nombresEnviaA } from "./nombres-envia";
import { ejecutarMundo, type MundoEnContexto } from "./ejecutor-mundo";
import { NivelCalidadContext } from "./panel-cristal";

/** Las intenciones que ejecuta el mundo; las que salen de la cuenta las cablea XR1010T. */
const EN_EL_MUNDO = new Set<Intencion["tipo"]>(["crear-mundo", "editar-mundo", "ir-a", "abrir"]);

/** Sala XR que la URL nombra (`?mundo=<id>` o `/sala-xr/<id>`), para editar el mundo abierto. */
function refDeLaUrl(): string | null {
    if (typeof window === "undefined") return null;
    const deConsulta = new URLSearchParams(window.location.search).get("mundo");
    const enRuta = window.location.pathname.match(/^\/sala-xr\/([^/?#]+)/);
    return deConsulta ?? (enRuta ? decodeURIComponent(enRuta[1]) : null);
}

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
    const refUrl = refDeLaUrl();
    const { estado, parcial, resultado, hablar, cancelar } = useVozXR({ mundoActual: actual ? { id: actual.refId, nombre: actual.mundo.nombre } : null });
    const emisor = useRef<EmisorOrbe | null>(null);
    const creado = useRef<MundoEnContexto | null>(null); const ejecutado = useRef<Reparto | null>(null);
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
        if (!refUrl) return;
        let vivo = true;
        void leerMundo(refUrl).then((mundo) => { if (vivo && mundo) setActual({ refId: refUrl, mundo }); });
        return () => { vivo = false; };
    }, [refUrl]);

    const razonar = useCallback((p: string) => astrauraChat({ messages: [{ role: "user", content: p }], taskHint: "reasoning", temperature: 0.2 }).then((r) => r.text), []);

    // La voz ya entendida se APLICA aquí: crea/edita el mundo, guarda y navega al destino.
    useEffect(() => {
        if (!resultado || resultado.via !== "intencion" || !resultado.resultado.ok || ejecutado.current === resultado) return;
        ejecutado.current = resultado;
        const pasos = resultado.resultado.pasos.filter((p) => EN_EL_MUNDO.has(p.intencion.tipo)); if (!pasos.length) return;
        void (async () => {
            let destino: string | null = null;
            for (const paso of pasos) {
                const r = await ejecutarMundo(paso, { nivel, razonar, creado: creado.current, mundoActual: actual });
                const enviar = emisor.current;
                if (!r.ok) { enviar?.({ tipo: "error", texto: r.motivo }); continue; }
                if (paso.intencion.tipo === "crear-mundo") { const m = await leerMundo(r.refId); if (m) creado.current = { refId: r.refId, mundo: m }; destino = r.ruta; }
                else if (paso.intencion.tipo === "ir-a" || paso.intencion.tipo === "abrir") destino = r.ruta;
                enviar?.({ tipo: "habla-inicio", texto: r.resumen });
                enviar?.({ tipo: "habla-fin" });
            }
            if (destino) window.location.assign(destino);
        })();
    }, [resultado, nivel, razonar, actual]);

    const pasos = resultado?.via === "intencion" ? resultado.resultado : null;
    const modelo = useMemo(() => modeloTarjeta(pasos), [pasos]);
    const enviaA = useMemo(() => (pasos?.ok ? nombresEnviaA(pasos.pasos) : []), [pasos]);
    // La tarjeta espera a la persona; ejecutar lo confirmado es XR1010T: aquí la respuesta la retira.
    const alResponder = useMemo(() => () => cancelar(), [cancelar]);
    return (
        <>
            <OrbeAstraura pipeline={pipeline} hablar={hablar} />
            {modelo && <TarjetaVoz modelo={modelo} enviaA={enviaA} onRespuesta={alResponder} />}
        </>
    );
}

export default OrbeVoz;
