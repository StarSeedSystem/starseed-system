"use client";
/** MausbotHost: UNA instancia del cursor-mascota de Astraura; sigue al puntero con un solo
 * `requestAnimationFrame` y `transform`, se para con la pestaña oculta, va sin suavizado con
 * «movimiento reducido» y no intercepta el puntero. Adaptado de OpenMausBot (Copyright 2026
 * Milind Soni y colaboradores, Apache-2.0): src/components/mascot-clock.ts y CursorAvatar.tsx. */
import { useEffect, useRef, useState } from "react";
import { MausbotAvatar } from "./mausbot-avatar";
import { EVENTO_MAUSBOT, disenoParaPersonalidad, resolverMausbot, type ModoMausbot } from "@/lib/mausbot/config";
import { disenoPorId, type DisenoMausbot } from "@/lib/mausbot/disenos";
import { estadoDesdeOrbe, type EstadoMausbot } from "@/lib/mausbot/expresiones";
import { onQuantumOrbState } from "@/lib/aurora/quantum-orb-bus";
import { PERSONALITY_CHANGED_EVENT, resolvePersonalityForContext } from "@/lib/aurora/personalities";
const DESFASE = 18;
const TAMANO = 44;
const OCULTO = -9999;
const SUAVIZADO = 0.28;
export interface PuntoMausbot { x: number; y: number }
interface VistaMausbot { encendido: boolean; modo: ModoMausbot; diseno: DisenoMausbot }
/** Destino en píxeles de viewport: «acompanante» va 18 px abajo a la derecha. */
export function destinoMausbot(modo: ModoMausbot, x: number, y: number): PuntoMausbot {
  return modo === "acompanante" ? { x: x + DESFASE, y: y + DESFASE } : { x, y };
}
/** Interpolación del bucle; con movimiento reducido salta al destino (sin animación). */
export function suavizarMausbot(actual: PuntoMausbot, destino: PuntoMausbot, reducido: boolean): PuntoMausbot {
  if (reducido) return destino;
  const dx = destino.x - actual.x;
  const dy = destino.y - actual.y;
  if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return destino;
  return { x: actual.x + dx * SUAVIZADO, y: actual.y + dy * SUAVIZADO };
}
function leerVista(): VistaMausbot {
  const cfg = resolverMausbot();
  const persona = resolvePersonalityForContext({});
  const id = persona ? disenoParaPersonalidad(cfg, persona.id) : cfg.disenoPorDefecto;
  return { encendido: cfg.encendido, modo: cfg.modo, diseno: disenoPorId(id) };
}
let hostActivo = false;
export function MausbotHost(): React.ReactElement | null {
  const [vista, setVista] = useState<VistaMausbot | null>(null);
  const [estado, setEstado] = useState<EstadoMausbot>("idle");
  const nodoRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (hostActivo) return;
    hostActivo = true;
    const actualizar = () => setVista(leerVista());
    actualizar();
    const soltarOrbe = onQuantumOrbState((voz) => setEstado(estadoDesdeOrbe(voz)));
    window.addEventListener(EVENTO_MAUSBOT, actualizar);
    window.addEventListener(PERSONALITY_CHANGED_EVENT, actualizar);
    return () => {
      hostActivo = false;
      soltarOrbe();
      window.removeEventListener(EVENTO_MAUSBOT, actualizar);
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, actualizar);
    };
  }, []);
  const encendido = vista?.encendido === true;
  const modo = vista?.modo ?? "acompanante";
  useEffect(() => {
    const nodo = nodoRef.current;
    if (!encendido || !nodo || typeof window === "undefined") return;
    let raf = 0;
    let vivo = true;
    let visible = false;
    const pos: PuntoMausbot = { x: OCULTO, y: OCULTO };
    const destino: PuntoMausbot = { x: OCULTO, y: OCULTO };
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const pintar = () => { nodo.style.transform = `translate3d(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px, 0)`; };
    function programar() {
      if (raf === 0 && vivo && !document.hidden) raf = requestAnimationFrame(paso);
    }
    function paso() {
      raf = 0;
      if (!vivo) return;
      const siguiente = suavizarMausbot(pos, destino, mq?.matches === true);
      pos.x = siguiente.x; pos.y = siguiente.y;
      pintar();
      if (Math.abs(destino.x - pos.x) > 0.1 || Math.abs(destino.y - pos.y) > 0.1) programar();
    }
    const movido = (e: PointerEvent) => {
      const d = destinoMausbot(modo, e.clientX, e.clientY);
      destino.x = d.x; destino.y = d.y;
      if (!visible) {
        visible = true;
        pos.x = d.x; pos.y = d.y;
        nodo.style.opacity = "1";
        pintar();
      }
      programar();
    };
    const visibilidad = () => {
      if (!document.hidden) return programar();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    window.addEventListener("pointermove", movido, { passive: true });
    document.addEventListener("visibilitychange", visibilidad);
    return () => {
      vivo = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", movido);
      document.removeEventListener("visibilitychange", visibilidad);
    };
  }, [encendido, modo]);
  if (!vista?.encendido) return null;
  return (
    <div
      ref={nodoRef} aria-hidden="true" data-aurora-exclude=""
      className="pointer-events-none fixed left-0 top-0 z-[260] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      style={{
        width: TAMANO, height: TAMANO, opacity: 0, willChange: "transform",
        transform: `translate3d(${OCULTO}px, ${OCULTO}px, 0)`,
      }}
    >
      <MausbotAvatar diseno={vista.diseno} estado={estado} />
    </div>
  );
}
export default MausbotHost;
