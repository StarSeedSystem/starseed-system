/**
 * MausbotHost: sigue al puntero, UNA instancia, perezoso desde el layout.
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/MausbotHost.tsx.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { MausbotAvatar } from "./mausbot-avatar";
import { fusionarResolucion, leerConfigMausbot } from "@/lib/mausbot/config";
import { disenoParaPersonalidad } from "@/lib/mausbot/config";
import { disenoPorId } from "@/lib/mausbot/disenos";
import { DISENO_POR_DEFECTO } from "@/lib/mausbot/disenos";

export function MausbotHost() {
  const [config, setConfig] = useState(() => leerConfigMausbot());
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Parar si el documento está oculto
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Lógica de pausa (ej: añadir clase, parar animación si hubiera)
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handleMouseMove = (e: MouseEvent) => {
      // Quietud si movimiento reducido
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReducedMotion) return;
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    
    const handleStarseedMausbot = (e: Event) => {
      // Evento de control personalizado del OS
    };
    window.addEventListener("starseed:mausbot", handleStarseedMausbot);
    const handlePersonalityChanged = () => {
      setConfig(leerConfigMausbot());
    };
    window.addEventListener("PERSONALITY_CHANGED_EVENT", handlePersonalityChanged);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("starseed:mausbot", handleStarseedMausbot);
      window.removeEventListener("PERSONALITY_CHANGED_EVENT", handlePersonalityChanged);
    };
  }, []);

  const efectiva = fusionarResolucion(config);
  if (!efectiva.encendido) return null;

  const personalidadIds = Object.keys(efectiva.porPersonalidad);
  const primerId = personalidadIds.length > 0 ? personalidadIds[0] : "";
  const disenoId = primerId ? efectiva.porPersonalidad[primerId] : efectiva.disenoPorDefecto;
  const diseno = disenoPorId(disenoId ?? DISENO_POR_DEFECTO);
  const offset = efectiva.modo === "acompanante" ? { x: 18, y: 18 } : { x: 0, y: 0 };

  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[9999] h-12 w-12"
      style={{
        transform: `translate(${position.x + offset.x}px, ${position.y + offset.y}px)`,
        willChange: "transform",
      }}
      data-aurora-exclude="true"
    >
      <MausbotAvatar diseno={diseno} estado="idle" />
    </div>
  );
}
