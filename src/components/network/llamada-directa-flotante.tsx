"use client";

/**
 * LlamadaDirectaFlotante — timbre y llamada en curso por un enlace LOCAL sin internet (2026-10-10).
 * Montada perezosa desde `MallaNeuronasMount` (todas las rutas menos las de consola) y dentro del
 * panel «Vincular sin internet» (para las rutas donde el montaje global no corre): solo la dibuja
 * una instancia. (LLA1108C) Se pinta con la superficie de llamada común (burbuja/panel/pantalla completa).
 * Lógica en `src/lib/malla/llamada-directa.ts`. Contrato:
 * `architecture/transporte-universal-sin-internet.md`.
 */

import { useEffect, useRef, useState } from "react";
import { avisarFalloMedios } from "@/lib/llamadas/aviso-medios";
import { crearTono, vibrar } from "@/lib/llamadas/sonido";
import { useDecisionTimbre } from "@/lib/llamadas/nativa/use-decision-timbre";
import { BotonesIgnorarSilenciar } from "@/components/llamadas/menu-silenciar";
import { EntradaSilenciada } from "@/components/llamadas/entrada-silenciada";
import { SuperficieLlamada } from "@/components/llamadas/superficie/superficie-llamada";
import { resumirCalidadLlamada } from "@/lib/llamadas/superficie/calidad-llamada";
import { vistaDeDirecta } from "@/lib/llamadas/superficie/adaptador-directa";
import type { AccionesLlamada } from "@/lib/llamadas/superficie/vista";
import { useCifradoNeurona } from "@/lib/malla/use-cifrado-enlace";
import {
  alternarMicro,
  asegurarEscuchaLlamadas,
  colgarLlamada,
  contestarLlamada,
  rechazarLlamada,
  useLlamadaDirecta,
} from "@/lib/malla/llamada-directa";

let duenoLlamada: symbol | null = null;
const oyentesDueno = new Set<() => void>();

/**
 * La llamada flotante puede estar montada dos veces (global y dentro del panel): solo la dibuja
 * la primera instancia; si esa se desmonta, la siguiente la toma.
 */
function useSoyDueno(): boolean {
  const yo = useRef(Symbol("llamada"));
  const [, setN] = useState(0);
  useEffect(() => {
    const intentar = () => {
      if (!duenoLlamada) duenoLlamada = yo.current;
      setN((n) => n + 1);
    };
    oyentesDueno.add(intentar);
    intentar();
    return () => {
      oyentesDueno.delete(intentar);
      if (duenoLlamada === yo.current) {
        duenoLlamada = null;
        for (const g of Array.from(oyentesDueno)) g();
      }
    };
  }, []);
  return duenoLlamada === yo.current;
}

export function LlamadaDirectaFlotante() {
  const ll = useLlamadaDirecta();
  const dueno = useSoyDueno();
  useEffect(() => {
    asegurarEscuchaLlamadas();
  }, []);
  // (LLA1108A) Suena y vibra mientras entra (como el timbre de las llamadas por internet).
  // (LLA1108F) Quién suena (web o nativo, nunca los dos), «Ignorar» y los silencios.
  const quien = { id: ll.id ?? "", nombre: ll.nombre || "Una neurona", neurona: ll.neurona ?? undefined, medio: "red-local" };
  const decision = useDecisionTimbre(quien);
  const sonando = dueno && ll.fase === "entrante" && decision.sonidoWeb;
  useEffect(() => {
    if (!sonando) return;
    const tono = crearTono("entrante");
    tono.iniciar();
    vibrar([220, 140, 220, 900, 220, 140, 220]);
    return () => tono.parar();
  }, [sonando]);
  // La superficie sigue montada con la llamada en reposo: así el resumen de la que acaba (duración y medio) no desaparece solo.
  if (!dueno) return null;
  if (ll.fase === "entrante" && decision.entradaSilenciada) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex justify-center px-4">
        <EntradaSilenciada nombre={quien.nombre} silencio={decision.entradaSilenciada} />
      </div>
    );
  }
  if (ll.fase === "entrante" && !decision.tarjetaWeb) return null;
  return (
    <>
      <SuperficieDirecta ll={ll} />
      {ll.fase === "entrante" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[9999] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-[400px] rounded-2xl p-2" style={{ background: "rgba(12,14,34,.78)" }}>
            <BotonesIgnorarSilenciar quien={quien} />
          </div>
        </div>
      )}
    </>
  );
}

/** Acciones que el motor directo SÍ tiene; el resto de botones de la superficie quedan desactivados con su motivo. */
const ACCIONES_DIRECTA: AccionesLlamada = {
  contestar: async () => {
    const r = await contestarLlamada();
    if (!r.ok && r.motivo) avisarFalloMedios(r.motivo, r.ajustes);
  },
  rechazar: () => rechazarLlamada(),
  colgar: () => colgarLlamada(),
  alternarMicro: () => alternarMicro(),
};

function SuperficieDirecta({ ll }: { ll: ReturnType<typeof useLlamadaDirecta> }) {
  const cifrado = useCifradoNeurona(ll.neurona ?? "");
  const vista = vistaDeDirecta(ll, { medio: "enlace local (sin internet)" });
  vista.calidad = resumirCalidadLlamada({ ruta: null, rttMs: null, bitrateKbps: null, perdidaPct: null, jitterMs: null, codec: null, cifrado: ll.neurona ? cifrado : null });
  vista.textoMedio = "Llamada directa por el enlace local de las dos neuronas, sin pasar por internet.";
  return <SuperficieLlamada vista={vista} acciones={ACCIONES_DIRECTA} />;
}
