/**
 * Mide en el NAVEGADOR el contexto que decide si es buen momento para aplicar (`momento.ts`).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   · escribiendo → `puedeRecargarSuave()` (campo con foco o `[data-sin-guardar]`), el mismo
 *     criterio que ya usa la recarga por versión nueva;
 *   · llamada → la llamada activa del almacén de llamadas (`src/lib/llamadas/store.ts`, sin colgar),
 *     además de la marca `[data-en-llamada]` o el registro `marcarOcupado()`;
 *   · directo → marca `[data-en-directo]` o `marcarOcupado(id, "directo")`. Lo que no se marca no se
 *     puede saber: hoy ningún directo pone la marca (tarea abierta);
 *   · batería → `navigator.getBattery()` cuando existe (null si el navegador no lo dice);
 *   · Wi-Fi → `navigator.connection.type` (null si no se sabe) y si la conexión es «ahorro de
 *     datos» se trata como con límite.
 *
 * SSR-safe: nada de `window` al importarse. Nunca lanza.
 */

import { puedeRecargarSuave } from "@/lib/pwa/aviso-version";
import type { ContextoMomento } from "./momento";

export const CLAVE_DATOS_PERMITIDOS = "starseed.actualizaciones.datos-moviles.v1";

const ocupados = new Map<string, "llamada" | "directo">();

/** Una llamada o un directo avisan de que empiezan (y devuelven con qué terminar). */
export function marcarOcupado(id: string, tipo: "llamada" | "directo"): () => void {
  ocupados.set(id, tipo);
  return () => {
    ocupados.delete(id);
  };
}

function hayMarca(selector: string): boolean {
  try {
    return typeof document !== "undefined" && !!document.querySelector(selector);
  } catch {
    return false;
  }
}

interface BateriaMin {
  level: number;
  charging: boolean;
}
interface ConexionMin {
  type?: string;
  saveData?: boolean;
}

export function datosMovilesPermitidos(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(CLAVE_DATOS_PERMITIDOS) === "1";
  } catch {
    return false;
  }
}

export function permitirDatosMoviles(si: boolean): void {
  try {
    if (si) localStorage.setItem(CLAVE_DATOS_PERMITIDOS, "1");
    else localStorage.removeItem(CLAVE_DATOS_PERMITIDOS);
  } catch {
    /* modo privado: no se recuerda */
  }
}

/** Hay una llamada en curso en esta pestaña (almacén de llamadas, sin colgar). */
async function hayLlamadaActiva(): Promise<boolean> {
  try {
    const a = (await import("@/lib/llamadas/store")).leerLlamadas().activa;
    return !!a && !a.motor.cerrada;
  } catch {
    return false;
  }
}

/** Foto del momento en este navegador. */
export async function medirMomento(): Promise<ContextoMomento> {
  const tipos = [...ocupados.values()];
  const llamada = await hayLlamadaActiva();
  let bateriaPct: number | null = null;
  let cargando = false;
  let wifi: boolean | null = null;
  try {
    const nav = (typeof navigator !== "undefined" ? navigator : null) as
      | (Navigator & { getBattery?: () => Promise<BateriaMin>; connection?: ConexionMin })
      | null;
    if (nav?.getBattery) {
      const b = await nav.getBattery().catch(() => null);
      if (b && typeof b.level === "number") {
        bateriaPct = Math.round(b.level * 100);
        cargando = !!b.charging;
      }
    }
    const c = nav?.connection;
    if (c?.saveData) wifi = false;
    else if (c?.type === "wifi" || c?.type === "ethernet") wifi = true;
    else if (c?.type === "cellular") wifi = false;
  } catch {
    /* sin APIs: se queda en «no se sabe» */
  }
  return {
    enLlamada: llamada || tipos.includes("llamada") || hayMarca("[data-en-llamada]"),
    enDirecto: tipos.includes("directo") || hayMarca("[data-en-directo]"),
    escribiendo: !puedeRecargarSuave(),
    bateriaPct,
    cargando,
    wifi,
    datosPermitidos: datosMovilesPermitidos(),
  };
}
