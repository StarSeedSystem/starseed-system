/**
 * MausbotHost: UNA instancia, sigue al puntero, expresa lo que hace Astraura y,
 * mantenido 600 ms, abre el Exocórtex de la personalidad activa (contrato
 * `architecture/mausbot-astraura.md` §4: perezoso, sin WebGL y pointer-events:none).
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/MausbotHost.tsx.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { getActivePersonality, PERSONALITY_CHANGED_EVENT } from "@/lib/aurora/personalities";
import { MausbotAvatar } from "./mausbot-avatar";
import {
  EVENTO_MAUSBOT, disenoParaPersonalidad, fusionarResolucion, leerConfigMausbot,
} from "@/lib/mausbot/config";
import { disenoPorId } from "@/lib/mausbot/disenos";
import { suscribirEstadoMausbot } from "@/lib/mausbot/estado-astraura";
import type { EstadoMausbot } from "@/lib/mausbot/expresiones";

/** Rato de mantener pulsado el asa que abre el Exocórtex. */
const MS_MANTENER = 600;

export function MausbotHost() {
  const [config, setConfig] = useState(() => leerConfigMausbot());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [estado, setEstado] = useState<EstadoMausbot>("idle");
  const [personalidadId, setPersonalidadId] = useState("");
  const mantener = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Expresión desde los medios de Astraura (contrato §6): orbe cuántica + acciones de agente.
    const quitarEstado = suscribirEstadoMausbot(setEstado);
    const personalidad = () => setPersonalidadId(getActivePersonality()?.id ?? "");
    personalidad();
    const refrescar = () => setConfig(leerConfigMausbot());
    window.addEventListener(PERSONALITY_CHANGED_EVENT, personalidad);
    window.addEventListener(EVENTO_MAUSBOT, refrescar);
    const alMover = (e: MouseEvent) => {
      // Quietud si movimiento reducido
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", alMover);
    return () => {
      quitarEstado();
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, personalidad);
      window.removeEventListener(EVENTO_MAUSBOT, refrescar);
      window.removeEventListener("mousemove", alMover);
    };
  }, []);

  useEffect(() => () => { if (mantener.current) clearTimeout(mantener.current); }, []);

  const soltar = () => {
    if (mantener.current) { clearTimeout(mantener.current); mantener.current = null; }
  };
  const mantenerPulsado = () => {
    soltar();
    mantener.current = setTimeout(() => {
      mantener.current = null;
      window.dispatchEvent(new Event(AURORA_EXOCORTEX_OPEN_EVENT));
    }, MS_MANTENER);
  };

  const efectiva = fusionarResolucion(config);
  if (!efectiva.encendido) return null;
  const diseno = disenoPorId(disenoParaPersonalidad(efectiva, personalidadId));
  /** El asa clicable solo acompaña al cursor (§2: en modo cursor, el gesto sería un clic suelto). */
  const acompanante = efectiva.modo === "acompanante";
  const offset = acompanante ? { x: 18, y: 18 } : { x: 0, y: 0 };

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-12 w-12"
      style={{
        transform: `translate(${position.x + offset.x}px, ${position.y + offset.y}px)`,
        willChange: "transform",
      }}
      data-aurora-exclude="true"
    >
      <MausbotAvatar diseno={diseno} estado={estado} />
      {acompanante && (
        <button
          type="button"
          title="Mantener pulsado: abre el Exocórtex de esta personalidad"
          aria-label="Abrir Exocórtex de esta personalidad"
          className="pointer-events-auto cursor-pointer absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-cyan-500/70 shadow transition-opacity duration-150 hover:opacity-90"
          onPointerDown={mantenerPulsado}
          onPointerUp={soltar}
          onPointerLeave={soltar}
          onPointerCancel={soltar}
        />
      )}
    </div>
  );
}
