"use client";

/**
 * MiniaturaFondo (FON1126A · architecture/fondos-shaders.md §1 y §5): vista previa REAL de un set
 * o efecto dentro de su tarjeta. Quieta por defecto; al pasar el cursor o enfocar se anima con el
 * componente de `shaders` en pequeño. Respeta el ahorro de batería y «movimiento reducido»: sin
 * WebGPU o con movimiento reducido pinta la imagen fija del set o un respaldo con sus colores.
 */
import { useEffect, useState } from "react";
import { CapaShader } from "@/components/backgrounds/capa-shader";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import type { SetFondo } from "@/lib/appearance/sets-fondo";

export interface EntornoMiniatura {
  /** La tarjeta se está mirando (cursor encima o foco del teclado). */
  activa: boolean;
  reducirMovimiento: boolean;
  ahorroBateria: boolean;
}

/** La animación solo se enciende cuando se mira y el aparato puede moverla. */
export function debeAnimarMiniatura(e: EntornoMiniatura): boolean {
  return e.activa && !e.reducirMovimiento && !e.ahorroBateria;
}

/** La primera capa shader con componentes: la que de verdad pinta el efecto del set. */
export function capaShaderDelSet(set?: SetFondo | null): BackgroundLayer | null {
  const capa = set?.capas.find((c) => c.kind === "shader" && (c.preset?.components?.length ?? 0) > 0);
  return capa ?? null;
}

const HEX = /^#[0-9a-f]{3,8}$/i;
const COLOR = /color|tint|light|dark|inside|outside/i;
function coloresDe(lista: unknown, salida: string[]): void {
  if (!Array.isArray(lista)) return;
  for (const c of lista) {
    if (!c || typeof c !== "object") continue;
    const nodo = c as { props?: Record<string, unknown>; children?: unknown };
    for (const [clave, valor] of Object.entries(nodo.props ?? {})) {
      if (typeof valor === "string" && HEX.test(valor) && COLOR.test(clave)) salida.push(valor);
    }
    coloresDe(nodo.children, salida);
  }
}

/** Respaldo fijo cuando no hay imagen del set: un degradado con los colores del propio efecto. */
export function respaldoDeCapa(capa?: BackgroundLayer | null): string {
  const colores: string[] = [];
  coloresDe(capa?.preset?.components ?? [], colores);
  const a = colores[0] ?? "#7c3aed", b = colores[1] ?? "#06b6d4", c = colores[2] ?? "#0f172a";
  return `linear-gradient(135deg, ${a} 0%, ${b} 52%, ${c} 100%)`;
}

function useReducirMovimiento(): boolean {
  const [reducir, setReducir] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const medir = (): void => setReducir(!!mq.matches);
    medir();
    mq.addEventListener?.("change", medir);
    return () => mq.removeEventListener?.("change", medir);
  }, []);
  return reducir;
}

export interface MiniaturaFondoProps {
  set?: SetFondo | null;
  nombre?: string;
  /** El padre enciende la animación al pasar el cursor o enfocar la tarjeta. */
  animar?: boolean;
  /** La persona pidió ahorrar energía en el OS. */
  ahorroBateria?: boolean;
  grande?: boolean;
  className?: string;
}

export function MiniaturaFondo({ set, nombre, animar = false, ahorroBateria = false, grande = false, className }: MiniaturaFondoProps) {
  const reducirMovimiento = useReducirMovimiento();
  const capa = capaShaderDelSet(set);
  const animando = !!capa && debeAnimarMiniatura({ activa: animar, reducirMovimiento, ahorroBateria });
  const etiqueta = nombre ? `Vista previa de ${nombre}` : "Vista previa del fondo";
  const marco = `relative overflow-hidden rounded-lg border border-white/10 bg-black/30 ${className ?? ""}`;
  if (animando)
    return (
      <div className={marco} role="img" aria-label={etiqueta}>
        <CapaShader capa={capa} vistaPrevia={set?.vistaPrevia} ahorroBateria={ahorroBateria} className={grande ? "h-full w-full" : "h-full w-full"} />
      </div>
    );
  if (set?.vistaPrevia)
    // eslint-disable-next-line @next/next/no-img-element -- data URL del set: next/image no aporta nada aquí
    return <img src={set.vistaPrevia} alt={etiqueta} className={marco} />;
  return <div className={marco} role="img" aria-label={etiqueta} style={{ background: respaldoDeCapa(capa) }} />;
}

export default MiniaturaFondo;
