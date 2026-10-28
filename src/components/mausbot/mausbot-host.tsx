"use client";

import { useEffect, useRef, useState } from "react";
import { MausbotAvatar, type EstadoMausbot } from "./mausbot-avatar";
import { resolverMausbot, EVENTO_MAUSBOT } from "@/lib/mausbot/config";
import { PERSONALITY_CHANGED_EVENT } from "@/lib/aurora/personalities";

export function MausbotHost() {
  const config = resolverMausbot();
  const [activo, setActivo] = useState(config.encendido);
  const [modo, setModo] = useState<"cursor" | "acompanante" | "ambos">(config.modo);
  const [diseno, setDiseno] = useState<string>("");
  const [pos, setPos] = useState({ x: 0, y: 0 } as { x: number; y: number });
  const [mirada, setMirada] = useState({ x: 0, y: 0 } as { x: number; y: number });

  const avatarRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!config.encendido) return;
    setActivo(true);
    setDiseno(config.disenoPorDefecto ?? "fabrica-cursor");
    window.addEventListener(EVENTO_MAUSBOT, () => {
      setActivo(c => !c);
    });
    window.addEventListener(PERSONALITY_CHANGED_EVENT, () => {
      const c = resolverMausbot();
      setDiseno(c.disenoPorDefecto ?? "fabrica-cursor");
    });
  }, []);

  useEffect(() => {
    if (!activo || typeof document === "undefined") return;
    if (document.hidden) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const updatePos = (e: MouseEvent) => {
      const rect = document.documentElement.getBoundingClientRect();
      const x = e.clientX - rect.left - 18;
      const y = e.clientY - rect.top - 18;
      lastPosRef.current = { x: Number(x), y: Number(y) };
      setPos({ x: Number(x), y: Number(y) });
    };

    if (modo === "cursor" || modo === "ambos") {
      window.addEventListener("mousemove", updatePos, { passive: true });
    }

    const animate = () => {
      if (!activo || document.hidden) return;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      rafRef.current = requestAnimationFrame(animate);

      const { x, y } = pos;
      if (avatarRef.current) {
        const reduced = (window.matchMedia("(prefers-reduced-motion: reduce)")).matches;
        let tx = x, ty = y;
        if (!reduced) {
          const last = lastPosRef.current;
          tx = last.x;
          ty = last.y;
        }
        avatarRef.current!.style.transform = `translate(${tx}px, ${ty}px)`;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      window.removeEventListener("mousemove", updatePos);
    };
  }, [activo, modo]);

  useEffect(() => {
    if (avatarRef.current) {
      const reduced = (window.matchMedia("(prefers-reduced-motion: reduce)")).matches;
      if (!reduced) {
        avatarRef.current!.style.transition = "transform 0.1s ease-out";
      } else {
        avatarRef.current!.style.transition = "none";
      }
    }
  }, [activo]);

  const avatarStyle = modo === "ambos"
    ? { transform: `translate(${pos.x}px, ${pos.y}px)` }
    : {};

  return (
    <div
      ref={avatarRef}
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
      data-aurora-exclude
    >
      {config.encendido && (
        <MausbotAvatar
          diseno={diseno}
          estado={mirada as unknown as EstadoMausbot}
          mirada={mirada}
          tamano={1}
        />
      )}
    </div>
  );
}