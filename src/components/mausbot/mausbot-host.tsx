/**
 * MausbotHost: sigue al puntero, UNA instancia, perezoso desde el layout.
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/MausbotHost.tsx.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { MausbotAvatar } from "./mausbot-avatar";
import { disenoPorId } from "@/lib/mausbot/disenos";
import { EVENTO_MAUSBOT, disenoParaPersonalidad, fusionarResolucion, leerConfigMausbot } from "@/lib/mausbot/config";
import { suscribirEstadoMausbot, type EstadoMausbot } from "@/lib/mausbot/estado-astraura";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";

/** Cuánto hay que mantener pulsado el Mausbot para abrir el Exocórtex (contrato §6). */
const MANTENER_MS = 600;

export function MausbotHost() {
  const [config, setConfig] = useState(() => leerConfigMausbot());
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [estado, setEstado] = useState<EstadoMausbot>("idle");
  const [personaId, setPersonaId] = useState("");
  const cronometro = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado vivo desde la orbe y las acciones de los bots de Astraura.
  useEffect(() => suscribirEstadoMausbot(setEstado), []);

  // La personalidad activa decide su diseño (contrato §3/§4): carga perezosa.
  useEffect(() => {
    let vivo = true;
    const fijarPersona = async () => {
      try {
        const { getActivePersonality } = await import("@/lib/aurora/personalities");
        if (vivo) setPersonaId(getActivePersonality()?.id ?? "");
      } catch { /* sin personalidad activa: sigue el diseño por defecto */ }
    };
    fijarPersona();
    window.addEventListener("starseed:aurora-personality", fijarPersona);
    return () => {
      vivo = false;
      window.removeEventListener("starseed:aurora-personality", fijarPersona);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Quietud si movimiento reducido
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) return;
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Los ajustes del Mausbot (EVENTO_MAUSBOT de config.ts) cambian al momento.
    const handleStarseedMausbot = () => setConfig(leerConfigMausbot());
    window.addEventListener(EVENTO_MAUSBOT, handleStarseedMausbot);
    const handlePersonalityChanged = () => {
      setConfig(leerConfigMausbot());
    };
    window.addEventListener("PERSONALITY_CHANGED_EVENT", handlePersonalityChanged);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener(EVENTO_MAUSBOT, handleStarseedMausbot);
      window.removeEventListener("PERSONALITY_CHANGED_EVENT", handlePersonalityChanged);
    };
  }, []);

  /** Mantener pulsado 600 ms abre el Exocórtex de la personalidad activa (§6). */
  const pararPulso = () => {
    if (cronometro.current) clearTimeout(cronometro.current);
    cronometro.current = null;
  };
  const empezarPulso = () => {
    pararPulso();
    cronometro.current = setTimeout(() => {
      cronometro.current = null;
      try {
        window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT));
      } catch { /* defensivo */ }
    }, MANTENER_MS);
  };

  const efectiva = fusionarResolucion(config);
  if (!efectiva.encendido) return null;

  const acompana = efectiva.modo === "acompanante";
  const diseno = disenoPorId(disenoParaPersonalidad(efectiva, personaId));
  const offset = acompana ? { x: 18, y: 18 } : { x: 0, y: 0 };

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-12 w-12"
      style={{
        transform: `translate(${position.x + offset.x}px, ${position.y + offset.y}px)`,
        willChange: "transform",
      }}
      data-aurora-exclude="true"
    >
      {/* Solo en modo acompañante hay asa clicable: como cursor, el puntero es el OS. */}
      <div
        className={`h-full w-full cursor-pointer${acompana ? " pointer-events-auto" : ""}`}
        data-testid="mausbot-asa"
        aria-label="Abrir el Exocórtex de Astraura"
        onPointerDown={acompana ? empezarPulso : undefined}
        onPointerUp={acompana ? pararPulso : undefined}
        onPointerLeave={acompana ? pararPulso : undefined}
        onPointerCancel={acompana ? pararPulso : undefined}
      >
        <MausbotAvatar diseno={diseno} estado={estado} />
      </div>
    </div>
  );
}
