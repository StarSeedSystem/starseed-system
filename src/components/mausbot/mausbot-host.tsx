import { useEffect, useRef, useState } from "react";
import { resolverMausbot } from "@/lib/mausbot/config";
import { resolvePersonalityForContext } from "@/lib/aurora/personalities";
import { disenoParaPersonalidad } from "@/lib/mausbot/config";
import { MausbotAvatar } from "./mausbot-avatar";

// Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0): N/A (implementación original basada en la especificación).

export default function MausbotHost() {
  const [cfg, setCfg] = useState(() => resolverMausbot());
  const mouseRef = useRef({ x: 0, y: 0 });
  const botRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const visibleRef = useRef(true);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const updateCfg = () => setCfg(resolverMausbot());
    window.addEventListener("starseed:mausbot", updateCfg);
    const onPers = () => updateCfg();
    window.addEventListener("PERSONALITY_CHANGED_EVENT", onPers);
    return () => {
      window.removeEventListener("starseed:mausbot", updateCfg);
      window.removeEventListener("PERSONALITY_CHANGED_EVENT", onPers);
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => (visibleRef.current = !document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotion = () => (reducedMotionRef.current = mq.matches);
    handleMotion();
    mq.addEventListener("change", handleMotion);

    const handleMouse = (e: MouseEvent) => {
      if (!visibleRef.current || reducedMotionRef.current) return;
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouse);

    const animate = () => {
      if (botRef.current && cfg.encendido) {
        const offsetX = cfg.modo === "acompanante" ? 18 : 0;
        const offsetY = cfg.modo === "acompanante" ? 18 : 0;
        const x = mouseRef.current.x + offsetX;
        const y = mouseRef.current.y + offsetY;
        botRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current!);
      document.removeEventListener("visibilitychange", handleVisibility);
      mq.removeEventListener("change", handleMotion);
      window.removeEventListener("mousemove", handleMouse);
    };
  }, [cfg]);

  if (!cfg.encendido) return null;

  const persona = resolvePersonalityForContext({});
  const disenoId = disenoParaPersonalidad(cfg, persona?.id || "default");
  return (
    <div
      ref={botRef}
      data-aurora-exclude
      className="fixed left-0 top-0 z-[9999] pointer-events-none"
    >
      <MausbotAvatar diseno={disenoId} estado="idle" />
    </div>
  );
}
