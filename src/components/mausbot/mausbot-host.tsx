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
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
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
