/**
 * ficha-propia — ficha de capacidades MEDIDA de esta neurona y su publicación
 * compartida (AUD1117). Extraída de `device-network-panel.tsx` para que el
 * motor global de la malla pueda publicarla sin abrir ningún panel.
 *
 * La publicación es ÚNICA: el motor la arranca con la capa mesh encendida y la
 * detiene al apagarse; el panel reutiliza la misma sin duplicar latidos.
 */
import {
  crearFichaNodo,
  iniciarPublicacionCapacidades,
  vozMedida,
  type CapacidadesNodo,
  type MedioNodo,
  type OpcionesPublicacionCapacidades,
  type PublicacionCapacidades,
} from "@/lib/network/capacidades-nodo";
import { leerMedidas } from "@/lib/aurora/medidas-voz";
import { neuronDeviceIdActual } from "@/lib/network/identidad-dispositivo";

/** Lo mínimo que hace falta para medir la ficha de este dispositivo. */
export type DispositivoFicha = { id: string; platform: string };

export interface TransporteFichaPropia {
  publicarMalla: (ficha: CapacidadesNodo) => void;
  publicarServidorMalla?: (compacta: string) => void;
}

export type DecisionPublicacionFicha = "arrancar" | "mantener" | "detener";

export interface OpcionesSincronizacionFicha {
  programar?: OpcionesPublicacionCapacidades["programar"];
}

let publicacion: PublicacionCapacidades | null = null;

export function medioDesdePlataforma(platform: string): MedioNodo {
  const p = (platform || "").toLowerCase();
  if (p.includes("android")) return "android";
  if (p.includes("iphone") || p.includes("ios") || p.includes("ipad")) return "ios";
  if (p.includes("linux")) return "linux";
  if (p.includes("nube") || p.includes("cloud")) return "nube";
  if (p.includes("win") || p.includes("chrome") || p.includes("browser")) return "navegador";
  return "mac";
}

/**
 * Mide la ficha de ESTE dispositivo. Lo que el navegador no puede medir
 * (tok/s por capa, RAM libre) queda sin dato («sin medir»), nunca inventado.
 * La voz solo cuenta si fue anotada por ESTA neurona (`neuronDeviceIdActual`).
 */
export async function medirFichaPropia(device: DispositivoFicha): Promise<CapacidadesNodo> {
  let bateriaPct: number | null = null;
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level?: number }> };
    const bat = await nav.getBattery?.();
    if (bat && typeof bat.level === "number") bateriaPct = Math.round(bat.level * 100);
  } catch {
    /* sin API de batería: se anuncia sin dato */
  }
  // Nunca lanza: `vozMedida` devuelve undefined sin medidas válidas y recientes.
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

export function hayPublicacionFichaPropia(): boolean {
  return publicacion !== null;
}

/** Pura: la capa manda; un solo latido aunque haya varias llamadas. */
export function decidirPublicacionFicha(capaEncendida: boolean, activa: boolean): DecisionPublicacionFicha {
  if (capaEncendida && !activa) return "arrancar";
  if (!capaEncendida && activa) return "detener";
  return "mantener";
}

/**
 * Aplica la decisión de la capa sobre la publicación compartida. El transporte
 * es el único medio de salida (malla y, si se da, servidor de malla); este
 * módulo no conoce Supabase, la UI ni el panel. Devuelve lo que hizo.
 */
export function sincronizarPublicacionFicha(
  capaEncendida: boolean,
  dispositivo: DispositivoFicha,
  transporte: TransporteFichaPropia,
  opciones: OpcionesSincronizacionFicha = {},
): DecisionPublicacionFicha {
  const decision = decidirPublicacionFicha(capaEncendida, hayPublicacionFichaPropia());
  if (decision === "arrancar") {
    publicacion = iniciarPublicacionCapacidades({
      obtenerFicha: () => medirFichaPropia(dispositivo),
      publicarMalla: transporte.publicarMalla,
      ...(transporte.publicarServidorMalla ? { publicarServidorMalla: transporte.publicarServidorMalla } : {}),
      ...(opciones.programar ? { programar: opciones.programar } : {}),
    });
  } else if (decision === "detener") {
    detenerPublicacionFichaPropia();
  }
  return decision;
}

export function detenerPublicacionFichaPropia(): void {
  publicacion?.detener();
  publicacion = null;
}
