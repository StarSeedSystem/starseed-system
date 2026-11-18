/**
 * ficha-propia — ficha de capacidades de ESTE dispositivo, MEDIDA y no
 * inventada (AUD1117 · F5).
 *
 * Antes vivía en `device-network-panel.tsx`, única superficie que publicaba;
 * ahora el motor de la malla (`malla-neuronas.ts`) también la necesita para
 * publicarla al arrancar, así que la medida vive en `src/lib/network` y el
 * panel la reexporta para no romper a sus consumidores.
 *
 * Lo que el navegador no puede medir (tok/s por capa, RAM libre) queda «sin
 * medir», nunca inventado. También la voz MEDIDA de esta neurona (SGO1024F):
 * solo lo anotado por `medidas-voz.ts`; sin medidas, el campo no existe.
 */
import {
  crearFichaNodo,
  vozMedida,
  type CapacidadesNodo,
  type MedioNodo,
} from "@/lib/network/capacidades-nodo";
import { leerMedidas } from "@/lib/aurora/medidas-voz";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";
import type { DeviceInfo } from "@/lib/network/device-registry";

/** Medio del nodo deducido de la plataforma aproximada del navegador. */
export function medioDesdePlataforma(platform: string): MedioNodo {
  const p = (platform || "").toLowerCase();
  if (p.includes("android")) return "android";
  if (p.includes("iphone") || p.includes("ios") || p.includes("ipad")) return "ios";
  if (p.includes("linux")) return "linux";
  if (p.includes("nube") || p.includes("cloud")) return "nube";
  if (p.includes("win") || p.includes("chrome") || p.includes("browser")) return "navegador";
  return "mac";
}

/** Mide la ficha de ESTE dispositivo. Nunca lanza. */
export async function medirFichaPropia(device: DeviceInfo): Promise<CapacidadesNodo> {
  let bateriaPct: number | null = null;
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level?: number }> };
    const bat = await nav.getBattery?.();
    if (bat && typeof bat.level === "number") bateriaPct = Math.round(bat.level * 100);
  } catch {
    /* sin API de batería: se anuncia sin dato */
  }
  // (SGO1024F) La voz se filtra por la NEURONA que el propio módulo de medidas
  // anota (`neuronDeviceIdActual`, `starseed.neuron.device-id`): otra neurona o
  // una ficha del motor nunca cuentan. Nunca lanza: `vozMedida` devuelve undefined.
  const voz = vozMedida(leerMedidas(), { neurona: neuronDeviceIdActual(), ahora: Date.now() });
  return crearFichaNodo({
    nodoId: device.id,
    medio: medioDesdePlataforma(device.platform),
    capas: [],
    tokS: null,
    bateriaPct,
    enSegundoPlano: typeof document !== "undefined" ? document.hidden : false,
    ambitos: ["propio", "cuenta"],
    ...(voz ? { voz } : {}),
  });
}
