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
import { versionesDeEsteMedio } from "@/lib/actualizaciones/versiones-locales";
import {
  AMBITOS_OFERTA,
  CUANDOS_OFERTA,
  crearOfertaAlmacen,
  type OfertaCapacidadAlmacen,
} from "@/lib/almacenes/oferta";
import { uidActual, uidEnCache } from "@/lib/consumo/usuario";
import { settingsFor } from "@/lib/neurons/neurons";

/** Lo mínimo que hace falta para medir la ficha de este dispositivo. */
export type DispositivoFicha = {
  id: string;
  platform: string;
  capas?: string[];
  tokS?: Record<string, number> | null;
  /** Configuración explícita de la oferta; sin ella manda `offerStorage` de esta neurona. */
  ofertaAlmacen?: Partial<OfertaCapacidadAlmacen>;
};

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

/** Bytes que el navegador declara disponibles para este origen; 0 si no hay medida. */
async function bytesLibresMedidos(): Promise<number> {
  try {
    if (typeof navigator === "undefined") return 0;
    const est = await navigator.storage?.estimate?.();
    const cuota = typeof est?.quota === "number" ? est.quota : 0;
    const uso = typeof est?.usage === "number" ? est.usage : 0;
    return Math.max(0, Math.floor(cuota - uso));
  } catch {
    return 0;
  }
}

/**
 * Oferta de almacenamiento de ESTA neurona: apagada salvo que `offerStorage`
 * esté activo (o el llamador pase una configuración explícita). El dueño sale
 * de la sesión, nunca de un dato de la ficha; sin dueño no se anuncia.
 */
export async function ofertaAlmacenPropia(
  device: DispositivoFicha,
  bytesLibres: number,
): Promise<OfertaCapacidadAlmacen | undefined> {
  try {
    const pedida = device.ofertaAlmacen;
    const neuronaId = neuronDeviceIdActual() || device.id;
    const activa = pedida?.activa ?? settingsFor(neuronaId).offerStorage === true;
    if (!activa) return undefined;
    const cuentaId = uidEnCache() ?? (await uidActual()) ?? "";
    if (!cuentaId) return undefined;
    const ambito = AMBITOS_OFERTA.find((a) => a === pedida?.ambito) ?? "privada";
    const cuando = CUANDOS_OFERTA.find((c) => c === pedida?.cuando) ?? "siempre";
    const oferta = crearOfertaAlmacen({
      ...pedida,
      activa: true,
      cuentaId,
      ambito,
      cuando,
      bytesOfrecidos: pedida?.bytesOfrecidos ?? bytesLibres,
      topeBytes: pedida?.topeBytes ?? bytesLibres,
    });
    return oferta.activa ? oferta : undefined;
  } catch {
    return undefined;
  }
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

  // Versiones locales (interfaz, servidor, etc.)
  const versiones = await versionesDeEsteMedio();

  // Rol de prueba desde localStorage (try/catch, por defecto sin rol)
  let rol: "aparato-de-prueba" | "director" | undefined;
  try {
    const v = localStorage.getItem("starseed.pruebas.rol.v1");
    if (v === "aparato-de-prueba" || v === "director") rol = v;
  } catch {
    /* sin localStorage: sin rol */
  }

  // SANITIZAR capas: solo strings no vacios, max 32, únicos, <= 80 caracteres cada uno
  const capasLimpias = device.capas
    ? device.capas
      .map(c => c?.trim())
      .filter((c): c is string => c !== "" && c !== undefined && c !== null)
      .filter((c, i, arr) => arr.indexOf(c) === i) // remover duplicados
      .filter((c, i, arr) => i < 32) // max 32
      .map(c => c.substring(0, 80)) // <= 80 chars
    : [];

  // SANITIZAR tokS: solo keys de capasLimpias, valores finitos > 0; vacio -> null
  let tokSLimpio: Record<string, number> | null = null;
  if (device.tokS && capasLimpias.length > 0) {
    tokSLimpio = {};
    for (const [k, v] of Object.entries(device.tokS)) {
      if (capasLimpias.includes(k) && typeof v === "number" && Number.isFinite(v) && v > 0) {
        tokSLimpio[k] = v;
      }
    }
    tokSLimpio = Object.keys(tokSLimpio).length > 0 ? tokSLimpio : null;
  }

  const ofertaAlmacen = await ofertaAlmacenPropia(device, await bytesLibresMedidos());

  return crearFichaNodo({
    nodoId: device.id,
    medio: medioDesdePlataforma(device.platform),
    capas: capasLimpias,
    tokS: tokSLimpio,
    bateriaPct,
    enSegundoPlano: typeof document !== "undefined" ? document.hidden : false,
    ambitos: ["propio", "cuenta"],
    ...(voz ? { voz } : {}),
    ...(ofertaAlmacen ? { ofertaAlmacen } : {}),
    ...(versiones.servidor?.capaBuild ? { capaBuild: versiones.servidor.capaBuild } : {}),
    ...(versiones.interfaz ? { appVersion: versiones.interfaz } : {}),
    ...(rol ? { rol } : {}),
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
