"use client";

/**
 * StarSeed OS — Red Mesh · PUERTA DE ANTENAS POR PERSONALIDAD (Adenda 149).
 * ============================================================================
 * Cablea la pestaña «Señales» de «Sistemas de Astraura en esta neurona»
 * (`neuron-persona-store.ts` → `senales.porAntena`) con los ROUTERS reales del
 * subsistema mesh. Hasta ahora esas reglas se guardaban y se pintaban, pero
 * NINGÚN router las leía (hueco 1 de la revisión adversarial de la A149).
 *
 * CONTRATO DE HONESTIDAD — sin overrides guardados esto NO cambia NADA:
 * `antennaRuleFor` devuelve los defaults (activada · entrada · salida · auto),
 * `outboundAllowed`/`inboundAllowed` devuelven `true` y `preferredRouteFor`
 * devuelve `"auto"`, de modo que ningún branch nuevo del router llega a tomarse.
 * Solo cuando el usuario apaga una antena (o le fija una ruta) en la pestaña
 * Señales aparece un efecto real. Las reglas SOLO pueden RESTAR vías: jamás
 * habilitan una que la conectividad del contexto tenga prohibida.
 *
 * MÓDULO LIVIANO a propósito: importa SOLO el store de overrides (que a su vez
 * solo depende de `safe-storage`), así el mesh no crea ciclos con
 * `neuron-persona-systems` (que importa `@/ai/astraura/mesh`) ni con
 * `@/lib/neurons/neurons`. Por eso el id de la neurona se lee AQUÍ directamente
 * de `localStorage` (`starseed.neuron.device-id`, la MISMA clave que escribe
 * `thisDeviceId()`), con try/catch — mismo patrón que `server-relay.ts`.
 *
 * SSR-safe. NUNCA lanza.
 */

import {
  ALL_PERSONAS,
  getOverrides,
  type AntennaRouteMode,
  type AntennaRule,
} from "@/lib/astraura/neuron-persona-store";

/** Clave del id de neurona (la escribe `thisDeviceId()` en `@/lib/neurons/neurons`). */
const NEURON_DEVICE_ID_KEY = "starseed.neuron.device-id";

/** Antena LÓGICA de la malla: manda sobre el enlace físico concreto. */
export const MESH_ANTENNA = "lora";

/** Defaults del contrato A149: campos ausentes ⇒ activada, entrada+salida, auto. */
export const DEFAULT_ANTENNA_RULE: Required<AntennaRule> = Object.freeze<Required<AntennaRule>>({
  enabled: true,
  entrada: true,
  salida: true,
  ruta: "auto",
});

/**
 * Orden de ESPECIFICIDAD de las antenas para `preferredRouteFor`: de la más
 * dedicada (una radio que solo sirve a la malla) a la más general (la red
 * externa, que sirve a todo). Es un array FIJO a propósito — la decisión no
 * puede depender del orden de claves de un objeto venido de disco.
 */
const ANTENNA_SPECIFICITY: readonly string[] = ["lora", "serial", "bluetooth", "daemon", "wifi"];

function neuronDeviceId(): string {
  // SIN cache (rev. A149·B1): un `localStorage.clear()` en sesión viva regenera
  // el id de neurona y una cache lo dejaría rancio (reglas nuevas ignoradas
  // hasta recargar). `getItem` es barato y este camino ya es el lento (solo se
  // llega aquí cuando HAY overrides de señales guardados).
  try {
    if (typeof window === "undefined") return "";
    // Lectura DIRECTA (sin acoplar el mesh a la capa de neuronas). `thisDeviceId()`
    // escribe esta clave con `localStorage.setItem` directo, así que aquí basta
    // `getItem`.
    return window.localStorage.getItem(NEURON_DEVICE_ID_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Reglas por antena guardadas para esta neurona × personalidad, o `null` si no
 * hay ninguna (CAMINO RÁPIDO: sin neurona identificada o sin overrides de
 * señales no se hace más trabajo y todo el módulo cae a los defaults).
 * `personaId` ausente ⇒ `"*"` (los defaults de la neurona para «Todas las
 * personalidades»); con personalidad, `getOverrides` ya fusiona `"*"` + propia.
 */
function savedRules(personaId?: string | null): Record<string, AntennaRule> | null {
  try {
    const dev = neuronDeviceId();
    if (!dev) return null;
    const porAntena = getOverrides(dev, personaId || ALL_PERSONAS).senales?.porAntena;
    return porAntena && Object.keys(porAntena).length > 0 ? porAntena : null;
  } catch {
    return null;
  }
}

/** Regla EFECTIVA de una antena (misma semántica que `effectiveAntennaRule`). */
export function antennaRuleFor(antena: string, personaId?: string | null): Required<AntennaRule> {
  const r = savedRules(personaId)?.[antena];
  if (!r) return DEFAULT_ANTENNA_RULE; // camino rápido: sin regla guardada
  return {
    enabled: r.enabled !== false,
    entrada: r.entrada !== false,
    salida: r.salida !== false,
    ruta: r.ruta ?? "auto",
  };
}

/** ¿Puede SALIR tráfico por esta antena? (antena activa + salida permitida) */
export function outboundAllowed(antena: string, personaId?: string | null): boolean {
  const r = antennaRuleFor(antena, personaId);
  return r.enabled && r.salida;
}

/** ¿Puede ENTRAR tráfico por esta antena? (antena activa + entrada permitida) */
export function inboundAllowed(antena: string, personaId?: string | null): boolean {
  const r = antennaRuleFor(antena, personaId);
  return r.enabled && r.entrada;
}

/**
 * Antena de la neurona que corresponde al transporte de malla activo. El
 * simulador y «sin transporte» se tratan como la radio LoRa (antena lógica).
 */
export function antennaForTransport(kind: string | null | undefined): string {
  switch (kind) {
    case "serial":
      return "serial";
    case "ble":
      return "bluetooth";
    case "daemon":
      return "daemon";
    default:
      return MESH_ANTENNA;
  }
}

/**
 * ¿Puede esta neurona EMITIR por la malla con el transporte activo? Exige la
 * antena LÓGICA de malla ("lora") **y** la del enlace físico concreto: apagar
 * «Radio LoRa (malla P2P)» detiene la malla venga por USB, BLE o daemon; apagar
 * «Serie/USB» solo la detiene cuando se está usando ese enlace.
 */
export function meshOutboundAllowed(transportKind: string | null | undefined, personaId?: string | null): boolean {
  if (!outboundAllowed(MESH_ANTENNA, personaId)) return false;
  const link = antennaForTransport(transportKind);
  return link === MESH_ANTENNA || outboundAllowed(link, personaId);
}

/** Simétrica de `meshOutboundAllowed` para la RECEPCIÓN por la malla. */
export function meshInboundAllowed(transportKind: string | null | undefined, personaId?: string | null): boolean {
  if (!inboundAllowed(MESH_ANTENNA, personaId)) return false;
  const link = antennaForTransport(transportKind);
  return link === MESH_ANTENNA || inboundAllowed(link, personaId);
}

/**
 * Ruta preferida que se desprende de las reglas de antena.
 *
 * CRITERIO (simple y determinista, documentado a propósito): se recorren las
 * antenas en el orden FIJO de `ANTENNA_SPECIFICITY` — de la más específica
 * (lora) a la más general (wifi) — y se devuelve la `ruta` de la PRIMERA antena
 * que (a) esté activa, (b) pueda emitir (`salida`) y (c) tenga una ruta ≠ auto.
 * Una antena apagada o sin salida no puede inclinar nada: la ruta describe por
 * dónde SALE el tráfico. Si ninguna la define ⇒ `"auto"` (sin cambios).
 */
export function preferredRouteFor(personaId?: string | null): AntennaRouteMode {
  const rules = savedRules(personaId);
  if (!rules) return "auto"; // camino rápido
  for (const id of ANTENNA_SPECIFICITY) {
    const r = rules[id];
    if (!r || !r.ruta || r.ruta === "auto") continue;
    if (r.enabled === false || r.salida === false) continue;
    return r.ruta;
  }
  return "auto";
}
