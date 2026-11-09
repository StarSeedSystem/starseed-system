/**
 * lanas-propias — los carriles de ESTA neurona y los que dijeron las vecinas (2026-11-09 · MTZ1109A).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Lo propio se construye con las órdenes nativas (`ble_estado`, `enlace_wifi_capacidades`, `awdl_estado`), así los
 * carriles nuevos de Windows y Linux aparecen solos cuando sus agentes los publican. Se guarda en memoria para que
 * los saludos firmados (`nl.hola`, ficha WebRTC, `neuron_devices.capabilities`) lo lleven SIN esperar a la red.
 * Lo ajeno se guarda por neurona tal como lo anunció su saludo firmado (o inferido si es una app anterior).
 * Contrato: `architecture/matriz-enlaces-directos.md` §3.
 */

import type { CapacidadesWifi } from "./enlace-wifi-directo";
import { decidirPareja, lanaDeEnlace, lanasDeNativo, lanasDeSaludo, lanasInferidas, plataformaMatriz, type LanasAnunciadas, type NeuronaLanas, type PlataformaMatriz } from "./matriz-enlaces";

export interface LanasConPlataforma {
  plataforma: PlataformaMatriz;
  lanas: LanasAnunciadas;
}

/** Plataforma de este aparato por el navegador o el sistema (sin parte nativa: «web»). */
function plataformaDelEntorno(): PlataformaMatriz {
  try {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const ua = `${(nav as unknown as { userAgentData?: { platform?: string } })?.userAgentData?.platform ?? ""} ${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`;
    return plataformaMatriz(ua);
  } catch {
    return "web";
  }
}

let propias: LanasConPlataforma = { plataforma: "web", lanas: lanasInferidas("web") };
let propiasListas = false;
let ultimoRefresco = 0;
const VIDA_REFRESCO_MS = 60_000;

/** Lo que anuncia ESTA neurona ahora (lo último calculado; sin nativo, «web» sin antenas). */
export function lanasPropiasYa(): LanasConPlataforma {
  return propias;
}

export function fijarLanasPropias(x: LanasConPlataforma, ahora: number = Date.now()): void {
  propias = x;
  propiasListas = true;
  ultimoRefresco = ahora;
}

/** Vuelve a leer lo propio solo si pasó más de un minuto (los saludos son frecuentes y las órdenes nativas no son gratis). Nunca lanza. */
export async function refrescarLanasSiViejas(ahora: number = Date.now()): Promise<void> {
  if (propiasListas && ahora - ultimoRefresco < VIDA_REFRESCO_MS) return;
  ultimoRefresco = ahora; // evita tormentas si el refresco tarda
  try {
    await refrescarLanasPropias();
  } catch {
    /* se queda lo que había */
  }
}

export function lanasPropiasListas(): boolean {
  return propiasListas;
}

/** Para el saludo: `{ lanas, plataforma }` listos para esparcir en el cuerpo (vacío mientras no hay parte nativa). */
export function datosHolaLanas(): { lanas?: LanasAnunciadas; plataforma?: PlataformaMatriz } {
  return propiasListas ? { lanas: propias.lanas, plataforma: propias.plataforma } : {};
}

type Llamar = <T>(cmd: string, args?: Record<string, unknown>) => Promise<{ ok: boolean; valor?: T }>;

/**
 * refrescarLanasPropias — vuelve a leer las órdenes nativas y recalcula lo propio. `llamar` y `capWifi` se inyectan
 * en las pruebas; por defecto, el puente de Tauri. Nunca lanza: si algo no responde, ese carril se queda como estaba
 * (no se inventa). Devuelve lo calculado.
 */
export async function refrescarLanasPropias(opciones: { llamar?: Llamar; capWifi?: CapacidadesWifi | null; puntoAcceso?: boolean; plataforma?: unknown } = {}): Promise<LanasConPlataforma> {
  let llamar = opciones.llamar;
  let nativo = !!llamar;
  if (!llamar) {
    try {
      const { esAppNativa, puenteNativo } = await import("@/lib/nativa/puente");
      if (esAppNativa()) {
        const p = puenteNativo();
        llamar = (cmd, args) => p.llamar(cmd, args) as never;
        nativo = true;
      }
    } catch {
      /* sin puente: web */
    }
  }
  if (!llamar || !nativo) {
    // Sin parte nativa no se anuncia nada: el saludo no lleva `lanas` y la web se infiere como «sin antenas».
    return { plataforma: "web", lanas: lanasInferidas("web") };
  }
  const leer = async <T>(cmd: string): Promise<T | null> => {
    try {
      const r = await llamar!<T>(cmd);
      return r.ok ? ((r.valor ?? null) as T | null) : null;
    } catch {
      return null;
    }
  };
  const { leerCapacidades } = await import("./enlace-wifi-directo");
  const [ble, wifiCrudo, awdl] = await Promise.all([
    leer<{ disponible?: unknown; l2cap?: unknown; roles?: unknown; plataforma?: unknown }>("ble_estado"),
    opciones.capWifi !== undefined ? Promise.resolve(opciones.capWifi) : leer<unknown>("enlace_wifi_capacidades"),
    leer<{ disponible?: unknown; activo?: unknown }>("awdl_estado"),
  ]);
  const wifi = wifiCrudo && typeof wifiCrudo === "object" && "ap" in (wifiCrudo as object) ? leerCapacidades(wifiCrudo) : (wifiCrudo as CapacidadesWifi | null);
  let optin = opciones.puntoAcceso;
  if (optin === undefined) {
    try {
      optin = (await import("./punto-acceso-ajuste")).puntoAccesoPermitido();
    } catch {
      optin = false;
    }
  }
  const plataforma = plataformaMatriz(opciones.plataforma ?? wifi?.plataforma ?? ble?.plataforma ?? plataformaDelEntorno());
  const lanas = lanasDeNativo({ plataforma, ble, wifi, awdl, nativo: true, puntoAccesoOptin: optin });
  fijarLanasPropias({ plataforma, lanas });
  return propias;
}

/* ══════════════════════════ Vecinas ══════════════════════════ */

export interface LanasVecina extends LanasConPlataforma {
  /** ¿Las anunció ella (true) o se infirieron de una app anterior (false)? */
  anunciadas: boolean;
  at: number;
}

const vecinas = new Map<string, LanasVecina>();
const oyentes = new Set<() => void>();
let instVecinas: ReadonlyMap<string, LanasVecina> = new Map();

function avisar(): void {
  instVecinas = new Map(vecinas);
  for (const f of Array.from(oyentes)) {
    try {
      f();
    } catch {
      /* */
    }
  }
}

/**
 * Anota los carriles de una vecina desde su saludo firmado (`nl.hola`) o su ficha WebRTC. Sin `lanas` se infieren de
 * su plataforma y de los campos viejos (`cap` = sus capacidades `enlace.wifi.*`). Nunca lanza.
 */
export function registrarLanasVecina(
  neurona: string,
  lanas: unknown,
  plataforma: unknown,
  extras: { cap?: CapacidadesWifi | null; nativo?: boolean; ahora?: number } = {},
): LanasVecina | null {
  if (!neurona) return null;
  try {
    const previo = vecinas.get(neurona);
    // Una ficha anterior no pisa lo que la vecina SÍ anunció.
    const d = lanasDeSaludo(lanas, plataforma ?? previo?.plataforma, { cap: extras.cap, nativo: extras.nativo });
    if (previo?.anunciadas && !d.anunciadas) return previo;
    const v: LanasVecina = { ...d, at: extras.ahora ?? Date.now() };
    vecinas.set(neurona, v);
    avisar();
    return v;
  } catch {
    return null;
  }
}

export function lanasDeVecina(neurona: string): LanasVecina | null {
  return vecinas.get(neurona) ?? null;
}

export function vecinasConLanas(): ReadonlyMap<string, LanasVecina> {
  return instVecinas;
}

export function suscribirLanasVecinas(f: () => void): () => void {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

/** Solo para pruebas. */
export function olvidarLanasVecinas(): void {
  vecinas.clear();
  avisar();
}

/** Vista de la matriz de una neurona (propia o vecina) con su id. */
export function comoNeuronaLanas(id: string, x: LanasConPlataforma): NeuronaLanas {
  return { id, plataforma: x.plataforma, lanas: x.lanas };
}

/**
 * ¿Este enlace va por un carril que la matriz dice que NO cabe con esa vecina? Solo se descarta con datos ciertos
 * (la vecina anunció sus carriles y los propios están listos); sin datos, el enlace se deja (nunca se cierra una puerta a ciegas).
 */
export function enlaceFueraDeMatriz(e: { id: string; tipo: string; alcanza: { neuronDeviceId?: string } }): boolean {
  const lana = lanaDeEnlace(e.id, e.tipo);
  if (!lana || lana === "lan-tcp" || !e.alcanza.neuronDeviceId || !propiasListas) return false;
  const v = vecinas.get(e.alcanza.neuronDeviceId);
  if (!v || !v.anunciadas) return false;
  const d = decidirPareja(comoNeuronaLanas("yo", propias), comoNeuronaLanas(e.alcanza.neuronDeviceId, v), { mismaRed: true });
  // El enlace Bluetooth del transporte es una sola radio: vale si cabe GATT o L2CAP.
  const caben = d.lanas.map((x) => x.lana);
  return lana === "ble-gatt" ? !(caben.includes("ble-gatt") || caben.includes("ble-l2cap")) : !caben.includes(lana);
}
