/**
 * politica-shader — QUÉ modo corre cada capa shader (Ola 1018F · E).
 * ============================================================================
 * PURO: entrada → salida, nada de navegador ni GPU. La capa (`capa-shader.tsx`)
 * mide sus señales reales (WebGPU, prefers-reduced-motion, batería, visibilidad
 * de la pestaña) y aquí solo se decide, con la cadena del contrato
 * `architecture/fondos-shaders.md` (§1 y §5):
 *
 *  · pausado    — la pestaña está oculta: se conserva la instancia, sin fotogramas.
 *  · fijo       — sin WebGPU, «reducir movimiento», o GPU caída: imagen fija
 *                 (`vistaPrevia` del set) o nada, dejando ver el motor base.
 *  · vivo-30fps — ahorro de batería o batería baja (≤ 20 %): 30 fps como máximo.
 *  · vivo       — el caso bueno: 60 fps del monitor.
 */
import type { CSSProperties } from "react";
import type { ShaderPreset, Transform } from "./background-layers";

export type ModoCapaShader = "vivo" | "vivo-30fps" | "pausado" | "fijo";

/**
 * Señales que alimentan la decisión. `bateriaPct` es el nivel real leído con la
 * Battery API (0-100) o `null` si el navegador no la da (uso frecuente, o una
 * computadora de escritorio conectada siempre).
 */
export interface EntradaPoliticaShader {
  webgpu: boolean;
  reducirMovimiento: boolean;
  ahorroBateria: boolean;
  bateriaPct: number | null;
  visible: boolean; // la pestaña (o la capa misma) está a la vista
}

/** Techo a 30 fps cuando queda poca batería o está encendido el ahorro. */
const BATERIA_BAJA_PCT = 20;

export function modoDeCapa(e: EntradaPoliticaShader): ModoCapaShader {
  if (!e.visible) return "pausado";
  // Sin WebGPU (o con movimiento reducido) NO se crea la instancia: imagen fija.
  if (!e.webgpu || e.reducirMovimiento) return "fijo";
  const pocaBateria = e.ahorroBateria || (e.bateriaPct !== null && e.bateriaPct <= BATERIA_BAJA_PCT);
  return pocaBateria ? "vivo-30fps" : "vivo";
}

/**
 * Estilo CSS de la capa (posición, tamaño, rotación y máscara, todo relativo
 * 0-1 como define `Transform` en background-layers.ts). FUERA del modo «fijo»
 * también vale: la vista previa se encuadra con el mismo encuadre.
 */
export function estiloDeCapa(t?: Transform): CSSProperties {
  const d = t ?? { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 };
  // Todo lo relativo (0-1) pasa a porcentaje: tamaño = ancho/alto × escala.
  // La capa viva y la vista previa fija se encuadran con el MISMO encuadre.
  return {
    left: `${d.x * 100}%`,
    top: `${d.y * 100}%`,
    width: `${d.ancho * d.escala * 100}%`,
    height: `${d.alto * d.escala * 100}%`,
    transform: d.rotacion ? `rotate(${d.rotacion}deg)` : undefined,
    transformOrigin: "center",
  };
}

/**
 * Máscara CSS que recorta la capa (radial u lineal). Se devuelve aparte porque
 * TypeScript no une `WebkitMaskImage` al `CSSProperties` base del React DOM.
 */
export function mascaraCss(mascara?: string): { WebkitMaskImage?: string; maskImage?: string } {
  if (mascara === "radial") {
    const v = "radial-gradient(circle, black 60%, transparent 100%)";
    return { WebkitMaskImage: v, maskImage: v };
  }
  if (mascara === "lineal") {
    const v = "linear-gradient(to bottom, black 40%, transparent 100%)";
    return { WebkitMaskImage: v, maskImage: v };
  }
  return {};
}

/** Firma estructural del preset (tipos e ids de sus componentes), en texto. */
export function firmaEstructura(preset?: ShaderPreset): string {
  const cs = Array.isArray(preset?.components) ? preset.components : [];
  return JSON.stringify(
    cs.map((c: { type?: unknown; id?: unknown }) => ({ t: c?.type ?? "", i: c?.id ?? null })),
  );
}
