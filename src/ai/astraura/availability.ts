"use client";

/**
 * ASTRAURA · Disponibilidad de fuentes de inteligencia.
 * -----------------------------------------------------
 * Aurora, desde el INICIO y para todos los usuarios, detecta qué servicios
 * tiene disponibles cada usuario/contexto (claves configuradas, Ollama o
 * LM Studio corriendo, WebGPU, IA integrada del navegador) para integrar
 * funcionalmente los servicios preferidos del usuario y, por defecto, elegir
 * las mejores opciones GRATUITAS.
 *
 * Sondas con timeout corto y caché en memoria (TTL) para no molestar.
 * Defensivo y SSR-safe: nunca lanza; sin red en SSR.
 */

import { loadConfigs } from "@/ai/client/providerStore";
import type { ProviderConfig } from "@/ai/providers/types";
import { FREE_CATALOG, type CatalogSource } from "./free-catalog";
// (Adenda 71-bis) Catálogo UNIFICADO: combina el curado + OpenRouter vivo
// + fuentes instaladas desde la Biblioteca. El router adaptativo itera ESTE.
import { getUnifiedCatalog } from "./unified-intelligence";
import { chromeAiAvailable, webgpuAvailable } from "./builtin-engines";
import { isDownloadableSource, isModelInstalled } from "./installed-models";
// (Ola 278 · OS6) URL del puente del OS hacia la neurona LOCAL con
// `?destino=local` explícito. Antes la sonda construía `/api/ai/astraura-158`
// a mano (sin el parámetro), y en despliegue local caía al 503 de «no hay nube».
import { urlPuenteLocal } from "@/ai/providers/astraura-158";
// (Ola 367) Fuente `astraura-158-malla`: lista solo si ALGUNA neurona de la
// malla P2P (misma cuenta) anuncia que sirve Astraura — lectura síncrona del
// estado ya publicado por el motor de la malla, sin sondear la red aquí.
import { servidoresAstrauraMalla } from "@/lib/network/astraura-por-malla";
// (Ola 368) Snapshot barato de "qué fuentes están listas ahora" para que la
// ficha de la malla de neuronas lo lea sin sondear de nuevo (módulo sin
// dependencias pesadas: ver su cabecera para el porqué de evitar el ciclo).
import { publicarFuentesListas } from "./ready-sources-snapshot";
// (Adenda 153) Endpoint Astraura 1.58 declarado por ESTA neurona. `neurons.ts`
// solo importa supabase/entity-state (sin ciclo con el router ni con este módulo).
import { settingsFor, thisDeviceId } from "@/lib/neurons/neurons";
// (G1 · 2026-09-26) ¿Esta PÁGINA (no el backend) es un despliegue local? Decide
// si el respaldo por el puente del OS tiene sentido (ver `probeAstraura158Local`).
import { paginaEsLocal } from "@/lib/astraura/destino-local";
import {
  NODOS_INFERENCIA_LOCAL_STORAGE,
  elegirNodo,
  nodoConBase,
  resumenDisponibles,
  type NodoInferenciaLocal,
} from "@/lib/network/inferencia-local";

export interface SourceAvailability {
  source: CatalogSource;
  /** ¿Se puede usar AHORA MISMO? */
  ready: boolean;
  /** Config del usuario que la sirve (si la conectó él). */
  userConfig?: ProviderConfig;
  /** Motivo legible cuando no está lista (transparencia). */
  reason?: string;
}

// (Ola 278 · OS1 · 2026-09-07) Caché de sonda con TTL DISTINTO por resultado:
// éxito 60 s (no volver a sondeos caros a la ligera), fallo 15 s (reintentar
// pronto si el backend acaba de arrancar). Antes era un único TTL de 60 s.
const PROBE_TTL_OK_MS = 60_000;
const PROBE_TTL_FAIL_MS = 15_000;

type ProbeOutcome =
  | { kind: "ok"; data: unknown }
  | { kind: "http"; status: number }
  | { kind: "network" };

const probeCache = new Map<string, { at: number; outcome: ProbeOutcome }>();

/** Sonda JSON con timeout y caché. La usan `probe()` y la sonda Astraura 1.58. */
async function probeJson(url: string, ms = 8000): Promise<ProbeOutcome> {
  if (typeof window === "undefined") return { kind: "network" };
  const hit = probeCache.get(url);
  const ttl = hit ? (hit.outcome.kind === "ok" ? PROBE_TTL_OK_MS : PROBE_TTL_FAIL_MS) : 0;
  if (hit && Date.now() - hit.at < ttl) return hit.outcome;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    let outcome: ProbeOutcome;
    if (!res.ok) {
      outcome = { kind: "http", status: res.status };
    } else {
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = { ok: true };
      }
      outcome = { kind: "ok", data };
    }
    probeCache.set(url, { at: Date.now(), outcome });
    return outcome;
  } catch {
    const outcome: ProbeOutcome = { kind: "network" };
    probeCache.set(url, { at: Date.now(), outcome });
    return outcome;
  }
}

/** Sonda booleana clásica: true solo si el endpoint responde 2xx. */
async function probe(url: string, ms = 1200): Promise<boolean> {
  const outcome = await probeJson(url, ms);
  return outcome.kind === "ok";
}

/**
 * (Ola 278 · OS1 · 2026-09-07) Interpreta la respuesta de `/api/ping` (o de
 * `/api/bitnet/estado`) del backend Astraura 1.58. Función PURA para testear.
 * Reglas: un `ok:false` o un payload no reconocible NO está lista; un BitNet
 * «vivo:false && dormido:true» SÍ cuenta como lista (el chat interactivo lo
 * despierta con `ensure_server` en el primer mensaje), pero se anota el motivo.
 */
export function interpretarPing(json: unknown): { lista: boolean; motivo?: string } {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { lista: false };
  const j = json as Record<string, unknown>;
  // `/api/ping` trae `ok`; `/api/bitnet/estado` trae `vivo`/`dormido`.
  const esPing = typeof j.ok === "boolean" || typeof j.vivo === "boolean" || typeof j.dormido === "boolean";
  if (!esPing) return { lista: false };
  if (j.ok === false) return { lista: false };
  if (j.vivo === false && j.dormido === true) {
    return { lista: true, motivo: "BitNet dormido: despertará al primer mensaje (30-60 s)" };
  }
  return { lista: true };
}

/**
 * (Ola 278 · OS1) Sonda LOCAL de Astraura 1.58: `/api/ping` (< 5 ms) y, si el
 * backend es anterior y responde 404, `/api/bitnet/estado` (3 ms). Nunca el
 * `/api/status` pesado (2,3-3,9 s en reposo, > 20 s con la Mac cargada), que
 * era lo que hacía caer al fallback la fuente local en el router.
 */
function aLaDisponibilidad(ping: { lista: boolean; motivo?: string }): { ready: boolean; reason?: string } {
  return { ready: ping.lista, reason: ping.motivo };
}

// (Ola 278 · OS3 · 2026-09-08) CAUSA RAÍZ: desde el navegador, `fetch` a
// `http://127.0.0.1:8000` LANZA `TypeError: Failed to fetch` porque el origen
// del OS (p.ej. `http://localhost:9002`) no puede abrir red privada. Resultado:
// la sonda marcaba la neurona «no lista» aunque el backend estuviera perfecto.
// La solución: distinguir ese bloqueo (fetch que LANZA o tarda > 1,5 s) de un
// fallo real del backend, y en ese caso REINTENTAR por el proxy del propio OS
// (`/api/ai/astraura-158`), que sí alcanza la neurona desde el servidor.

/** Umbral: si un ping de la neurona tarda más, lo trata como bloqueo/lentitud. */
const PROBE_LOCAL_SLOW_MS = 1500;

/**
 * Sonda cruda de un endpoint: mide si el `fetch` LANZÓ (bloqueo de red privada),
 * si tardó más de `slowMs` o si respondió con HTTP. Almacena en `probeCache`
 * para respetar el TTL compartido (Ola 278 · `PROBE_TTL_OK_MS`/`PROBE_TTL_FAIL_MS`).
 * Nunca lanza.
 */
async function probeCruda(url: string, slowMs = PROBE_LOCAL_SLOW_MS): Promise<{
  ok: boolean;
  data?: unknown;
  status?: number;
  threw: boolean;
  slow: boolean;
}> {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(slowMs, 4000));
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    const slow = Date.now() - t0 > slowMs;
    if (!res.ok) {
      probeCache.set(url, { at: Date.now(), outcome: { kind: "http", status: res.status } });
      return { ok: false, status: res.status, threw: false, slow };
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: true };
    }
    probeCache.set(url, { at: Date.now(), outcome: { kind: "ok", data } });
    return { ok: true, data, threw: false, slow };
  } catch {
    clearTimeout(t);
    probeCache.set(url, { at: Date.now(), outcome: { kind: "network" } });
    return { ok: false, threw: true, slow: Date.now() - t0 > slowMs };
  }
}

/**
 * Ping de la neurona sobre una base (directa o proxy): `/api/ping` (< 5 ms) y,
 * si el backend es anterior (404), `/api/bitnet/estado` (3 ms) como respaldo.
 */
async function pingNeurona(base: string): Promise<{ ok: boolean; data?: unknown; threw: boolean; slow: boolean }> {
  const p = await probeCruda(`${base}/api/ping`);
  if (p.ok) return { ok: true, data: p.data, threw: false, slow: false };
  if (p.status === 404) {
    const e = await probeCruda(`${base}/api/bitnet/estado`);
    if (e.ok) return { ok: true, data: e.data, threw: false, slow: false };
    return { ok: false, threw: e.threw, slow: e.slow };
  }
  return { ok: false, threw: p.threw, slow: p.slow };
}

/** Timeout del respaldo por el puente del OS (Do #3 · G5): 6 s. */
const PROBE_LOCAL_PUENTE_MS = 6_000;

/**
 * (Ola 278 · OS3 · corregido G1 2026-09-26) Sonda LOCAL de Astraura 1.58:
 *   · base directa primero; si responde → lista (via "directo");
 *   · si el fetch LANZA o tarda > 1,5 s (bloqueo de red privada del navegador)
 *     Y la PÁGINA misma es un despliegue local (`paginaEsLocal()`) → reintenta
 *     por `/api/ai/astraura-158` (mismo origen, sin bloqueo): el proxy corre EN
 *     esa misma neurona, así que el respaldo es honesto;
 *   · en un origen PÚBLICO (tablet/móvil cargando la web desplegada) NO se
 *     reintenta por el puente: ese proxy no es esta máquina y, sin nube sana,
 *     serviría la nube bajo la etiqueta «local» sin avisar (el bug de G1). Ahí
 *     un fallo directo es DEFINITIVO — este dispositivo simplemente no tiene
 *     Astraura local — y se dice con honestidad en el motivo.
 */
/** Base de bucle local (`127.0.0.1`, `localhost`, `[::1]`), con o sin puerto. */
function esBucleLocal(base: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(base.trim());
}

/**
 * (2026-09-26) ¿Este dispositivo declaró tener su propia Astraura local? En un origen
 * PÚBLICO (la app o la web en una tablet, un móvil…) sondear `127.0.0.1` a ciegas hace
 * que Chrome pida permiso de «red local» a cada usuario y casi nunca hay nada escuchando.
 * Solo se sondea si la neurona lo dice: un endpoint propio en sus ajustes, o la marca
 * `starseed.astraura.local-en-este-dispositivo` = "1" (la pone quien instala el backend).
 */
export function localDeclaradoEnDispositivo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const s = settingsFor(thisDeviceId()).astraura158;
    if (s && s.enabled !== false && typeof s.endpoint === "string" && s.endpoint.trim()) return true;
  } catch { /* defensivo */ }
  try {
    return window.localStorage.getItem("starseed.astraura.local-en-este-dispositivo") === "1";
  } catch {
    return false;
  }
}

export async function probeAstraura158Local(endpoint: string): Promise<{ ready: boolean; reason?: string; via?: "directo" | "proxy" }> {
  if (!paginaEsLocal() && esBucleLocal(endpoint) && !localDeclaradoEnDispositivo()) {
    return { ready: false, reason: "Este dispositivo no tiene Astraura local; usa la nube o la malla." };
  }
  const local = await pingNeurona(endpoint);
  if (local.ok) return { ...aLaDisponibilidad(interpretarPing(local.data)), via: "directo" };
  if (local.threw || local.slow) {
    if (!paginaEsLocal()) {
      return {
        ready: false,
        reason: "Este dispositivo no tiene Astraura local; usa la nube o la malla.",
      };
    }
    // (Ola 278 · OS6) Reintento por el puente del OS con `?destino=local`
    // explícito (`urlPuenteLocal`), para que el proxy sepa que el destino es la
    // neurona de ESTA máquina y no caiga al 503 de «no hay nube» en local.
    const prox = await pingNeuronaPuente();
    if (prox.ok) return { ...aLaDisponibilidad(interpretarPing(prox.data)), via: "proxy" };
    return {
      ready: false,
      via: "proxy",
      reason: "El navegador bloquea 127.0.0.1 (red privada) y el servidor del OS tampoco alcanza la neurona.",
    };
  }
  // No lanzó ni fue lento: el backend respondió un error HTTP de verdad.
  return { ready: false, reason: "La neurona no responde." };
}

/**
 * (Ola 278 · OS6) Igual que `pingNeurona` pero a través del puente del OS
 * (`/api/ai/astraura-158`), con `?destino=local` en el endpoint para que el
 * proxy enrute a la neurona local. Mantiene el respaldo a `/api/bitnet/estado`
 * (404) y el mismo tratamiento de lanzado/lento que la sonda directa. Solo se
 * llama cuando `paginaEsLocal()` (ver `probeAstraura158Local`).
 */
async function pingNeuronaPuente(): Promise<{ ok: boolean; data?: unknown; threw: boolean; slow: boolean }> {
  const p = await probeCruda(urlPuenteLocal("/api/ping"), PROBE_LOCAL_PUENTE_MS);
  if (p.ok) return { ok: true, data: p.data, threw: false, slow: false };
  if (p.status === 404) {
    const e = await probeCruda(urlPuenteLocal("/api/bitnet/estado"), PROBE_LOCAL_PUENTE_MS);
    if (e.ok) return { ok: true, data: e.data, threw: false, slow: false };
    return { ok: false, threw: e.threw, slow: e.slow };
  }
  return { ok: false, threw: p.threw, slow: p.slow };
}

/** Timeouts de la sonda de NUBE (G5 · 2026-09-26): `/api/ping` por el túnel y, si responde, `/api/cola`. */
const PROBE_NUBE_PING_MS = 4_000;
const PROBE_NUBE_COLA_MS = 3_000;

/**
 * (G5/G10 · 2026-09-26) Sonda de la fuente NUBE: `/api/ping` (4 s — el túnel de
 * la Mac añade latencia, pero `/api/status` tardaba 8,7 s por calcular el
 * estado de todo el motor) y, si contesta, `GET /api/cola` para no marcar
 * lista una nube que el propio backend dice que no admite más peticiones
 * ahora mismo (`admite:false`, cola/memoria llenas) — se trata como
 * "ocupada", no como "caída", con la espera estimada en el motivo.
 */
export async function probeAstraura158Nube(endpoint: string): Promise<{ ready: boolean; reason?: string }> {
  const ping = await probeJson(`${endpoint}/api/ping`, PROBE_NUBE_PING_MS);
  if (ping.kind !== "ok") return { ready: false };
  const interpretado = interpretarPing(ping.data);
  if (!interpretado.lista) return { ready: false };
  const cola = await probeJson(`${endpoint}/api/cola`, PROBE_NUBE_COLA_MS);
  if (cola.kind === "ok" && cola.data && typeof cola.data === "object" && !Array.isArray(cola.data)) {
    const c = cola.data as Record<string, unknown>;
    if (c.admite === false) {
      const espera = typeof c.espera_estimada_s === "number" ? Math.max(0, Math.round(c.espera_estimada_s)) : undefined;
      return {
        ready: false,
        reason:
          typeof espera === "number"
            ? `Astraura en la nube está ocupada ahora mismo (espera estimada ~${espera} s).`
            : "Astraura en la nube está ocupada ahora mismo.",
      };
    }
  }
  // Sin `/api/cola` (backend anterior) o `admite` ausente: no bloquea la disponibilidad.
  return { ready: true, reason: interpretado.motivo };
}

function norm(u: string): string {
  return (u || "").replace(/\/+$/, "").toLowerCase();
}

/** Busca una config del usuario que sirva a esta fuente (por provider/baseUrl). */
export function userConfigForSource(source: CatalogSource, configs?: ProviderConfig[]): ProviderConfig | undefined {
  const list = configs ?? loadConfigs();
  return list.find((c) => {
    if (!c.enabled) return false;
    if (norm(c.baseUrl) === norm(source.baseUrl)) return true;
    // Providers dedicados (groq/google/anthropic/openai/ollama) casan por id.
    // `astraura-158` NO (Adenda 153): tiene DOS fuentes (local y nube) bajo el
    // mismo proveedor; casar por id haría que la nube heredase el baseUrl local.
    // Solo casa por baseUrl (la config local por defecto = 127.0.0.1:8000).
    if (
      source.providerId !== "openai-compatible" &&
      source.providerId !== "starseed" &&
      source.providerId !== "astraura-158" &&
      c.id === source.providerId
    ) return true;
    return false;
  });
}

/**
 * (Adenda 153) Endpoint EFECTIVO de una fuente Astraura 1.58: la neurona puede
 * declarar el suyo (túnel/LAN/Cloud Run propio) para la fuente local; la nube
 * usa `NEXT_PUBLIC_ASTRAURA_158_URL` o el proxy del OS. Import perezoso de
 * `neurons.ts` para no crear ciclos (neurons → supabase; nunca → router).
 */
export function astraura158EndpointFor(source: CatalogSource, userConfig?: ProviderConfig): string {
  const fallback = (userConfig?.baseUrl || source.baseUrl || "").replace(/\/+$/, "");
  if (source.id !== "astraura-158-local") return fallback;
  try {
    if (typeof window === "undefined") return fallback;
    const dev = thisDeviceId();
    const s = settingsFor(dev).astraura158;
    // Ajuste propio de la neurona (túnel/LAN/nube propia) > config de usuario > catálogo.
    if (s && s.enabled !== false && typeof s.endpoint === "string" && s.endpoint.trim()) {
      return s.endpoint.trim().replace(/\/+$/, "");
    }
  } catch { /* defensivo */ }
  return fallback;
}

/** (Adenda 153) ¿La neurona apagó explícitamente su fuente Astraura 1.58 local? */
export function astraura158LocalDisabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return settingsFor(thisDeviceId()).astraura158?.enabled === false;
  } catch {
    return false;
  }
}

/**
 * Calcula la disponibilidad de TODAS las fuentes del catálogo.
 * `fast=true` evita sondas de red (solo claves + capacidades del navegador).
 */
export async function detectAvailability(fast = false): Promise<SourceAvailability[]> {
  const configs = typeof window === "undefined" ? [] : loadConfigs();
  const out: SourceAvailability[] = [];

  for (const source of getUnifiedCatalog()) {
    const userConfig = userConfigForSource(source, configs);

    // ── MODELOS DESCARGABLES (opt-in): NUNCA "ready" salvo que el usuario los
    //    haya INSTALADO. Así el router jamás dispara una descarga enorme solo y
    //    Aurora usa la mejor alternativa gratis mientras. El modal de instalación
    //    se ofrece aparte (installed-models + install-model-modal).
    if (isDownloadableSource(source.id)) {
      const installed = isModelInstalled(source.id);
      const hasEngine =
        source.baseUrl === "builtin://chrome-ai"
          ? (typeof window !== "undefined" && !!(window as any).LanguageModel)
          : webgpuAvailable();
      out.push({
        source,
        ready: installed && hasEngine,
        userConfig,
        reason: !hasEngine
          ? (source.baseUrl === "builtin://chrome-ai" ? "Este navegador no trae la Prompt API (Chrome 148+)." : "Sin WebGPU en este navegador.")
          : installed ? undefined : "Modelo local disponible — instálalo (opcional) para usarlo.",
      });
      continue;
    }
    // ── OmniRoute (proxy local, jul-2026): opt-in explícito vía
    //    IntelligenceSettings.omniRoute — nunca se sondea solo, a diferencia
    //    del resto de fuentes "local", porque requiere que el usuario active la
    //    capa a propósito (documentado en architecture/astraura-inteligencia.md §15.4).
    if (source.id === "omniroute-local") {
      let cfg: { enabled: boolean; endpoint: string } = { enabled: false, endpoint: source.baseUrl.replace(/\/v1$/, "") };
      try {
        const router = await import("./router");
        const settings = router.getIntelligenceSettings();
        if (settings.omniRoute) cfg = settings.omniRoute;
      } catch { /* defensivo: sin ajuste guardado, se trata como deshabilitado */ }
      if (!cfg.enabled) {
        out.push({ source, ready: false, userConfig, reason: "Desactivado (actívalo en Ajustes → Inteligencia si tienes OmniRoute corriendo)." });
        continue;
      }
      const endpoint = (cfg.endpoint || source.baseUrl.replace(/\/v1$/, "")).replace(/\/+$/, "");
      const ok = fast ? true : await probe(`${endpoint}/v1/models`);
      out.push({
        source, ready: ok, userConfig,
        reason: ok ? undefined : `OmniRoute no responde en ${endpoint} (¿está corriendo?).`,
      });
      continue;
    }
    // ── ASTRAURA 1.58-BIT (Adenda 153 · Ola 278 · G5 2026-09-26): sonda HONESTA
    //    y LIGERA. La LOCAL usa `/api/ping` (< 5 ms) con fallback a
    //    `/api/bitnet/estado` (3 ms) si el backend es anterior (404); la NUBE
    //    usa TAMBIÉN `/api/ping` (4 s, por el túnel de la Mac) — ya NO
    //    `/api/status` (8,7 s medidos por el túnel: convertía un backend vivo
    //    en «no responde» sin necesidad) — y, si responde, `GET /api/cola`
    //    para no marcar lista una nube que el propio backend dice que está
    //    ocupada (`admite:false`). Si no responde, NO está lista: ese turno va
    //    a los secundarios y se re-sondea al expirar el TTL.
    if (source.providerId === "astraura-158") {
      const endpoint = astraura158EndpointFor(source, userConfig);
      const isLocal = source.id === "astraura-158-local";
      if (isLocal && astraura158LocalDisabled()) {
        out.push({ source, ready: false, userConfig, reason: "Desactivada en esta neurona (Sistemas de Astraura → Astraura 1.58)." });
        continue;
      }
      let ready: boolean;
      let reason: string | undefined;
      if (fast) {
        ready = isLocal ? !!userConfig : true;
      } else if (isLocal) {
        const r = await probeAstraura158Local(endpoint);
        ready = r.ready;
        reason = r.reason;
        // (Ola 278 · OS3) Si la sonda llegó a la neurona a través del proxy del
        // OS (el navegador bloquea 127.0.0.1), se anota para que Genesis y el
        // chat lo enseñen y no parezca un fallo del backend.
        if (r.via === "proxy") {
          reason = ["Astraura 1.58 responde vía el servidor del OS (el navegador bloquea 127.0.0.1).", reason]
            .filter(Boolean)
            .join(" · ");
        }
        // Guarda la última disponibilidad conocida (memoria de módulo) para que
        // `detectAvailabilitySafe` la conserve si el tope global salta.
        lastLocalAstrauraKnown = { at: Date.now(), ready, reason };
      } else {
        const r = await probeAstraura158Nube(endpoint);
        ready = r.ready;
        reason = r.reason;
        // Igual que con la local (arriba): memoria de módulo para que el tope
        // global de `detectAvailabilitySafe` no tenga que fingir sin haber
        // sondeado nunca (G5).
        lastNubeAstrauraKnown = { at: Date.now(), ready, reason };
      }
      out.push({
        source, ready, userConfig,
        reason: ready
          ? reason
          : isLocal
            ? `El backend Astraura 1.58 no responde en ${endpoint} (¿está arrancado? ./install_and_run.sh).`
            : "La nube de Astraura 1.58 no responde ahora (¿arrancando en frío?); se usan los sistemas secundarios.",
      });
      continue;
    }
    // ── ASTRAURA 1.58 POR LA MALLA P2P (Ola 367): lista solo si algún peer de
    //    la MISMA cuenta, conectado ahora mismo, anuncia `sirveAstraura` en su
    //    ficha. Lectura síncrona (sin sondear red): el motor de la malla ya
    //    mantiene ese estado publicado; sin `MallaNeuronasMount` montado
    //    degrada honestamente a "sin servidor".
    if (source.providerId === "astraura-158-malla") {
      const servidores = servidoresAstrauraMalla();
      out.push({
        source,
        ready: servidores.length > 0,
        userConfig,
        reason: servidores.length > 0 ? undefined : "Ninguna neurona de tu malla ofrece Astraura ahora.",
      });
      continue;
    }
    // ── IA POR LA MALLA P2P, GENÉRICA (Ola 368): nunca entra en el ranking
    //    automático de `rankCandidates` — se marca `ready:false` a propósito.
    //    Solo se usa como candidato MANUAL en los dos casos que documenta
    //    `router.ts` (pin no listo aquí servido por un peer / último recurso),
    //    construidos a mano con `findSource(IA_MALLA_SOURCE_ID)`. Sigue en el
    //    catálogo (y en este listado) para que la UI y `findSource` la vean.
    if (source.providerId === "ia-malla") {
      out.push({
        source,
        ready: false,
        userConfig,
        reason: "Solo se usa como pin de la malla o último recurso (ver capas → mesh).",
      });
      continue;
    }
    if (source.tier === "local") {
      const probeUrl = source.id === "ollama-local"
        ? "http://localhost:11434/api/tags"
        : `${source.baseUrl}/models`;
      const ok = fast ? !!userConfig : await probe(probeUrl);
      out.push({
        source, ready: ok, userConfig,
        reason: ok ? undefined : `${source.label} no responde en este dispositivo.`,
      });
      continue;
    }
    if (!source.requiresKey) {
      // Instant cloud SIN CLAVE (Pollinations, OVHcloud anónimo, LLM7): la red
      // de seguridad universal. Siempre listas salvo que estemos offline.
      // `keyOptional` = si el usuario añadió una clave, se usa para subir
      // límites, pero JAMÁS es requisito para que la fuente esté disponible.
      const online = typeof navigator === "undefined" ? false : navigator.onLine !== false;
      out.push({ source, ready: online, userConfig, reason: online ? undefined : "Sin conexión." });
      continue;
    }
    // free-key / paid: listo si el usuario tiene una config habilitada con clave.
    const ok = !!userConfig && (!!userConfig.encryptedKey || !source.requiresKey);
    out.push({
      source, ready: ok, userConfig,
      reason: ok ? undefined : `Necesita clave gratuita (${source.getKeyUrl ?? "ver ajustes"}).`,
    });
  }
  // (Ola 368) Efecto secundario BARATO: publica los ids `ready` de ESTA pasada
  // para que la ficha de la malla de neuronas (`fuentesServibles`) los lea
  // síncronamente sin sondear de nuevo — ver `ready-sources-snapshot.ts`.
  try {
    publicarFuentesListas(out.filter((a) => a.ready).map((a) => a.source.id));
  } catch {
    /* noop: nunca debe tumbar la disponibilidad por esto */
  }
  return out;
}

// (Ola 278 · OS1) Memoria de módulo: última disponibilidad conocida de la fuente
// LOCAL de Astraura 1.58. `detectAvailabilitySafe` la conserva cuando el tope
// global salta, para no marcar la local «no lista» solo porque la Mac estaba
// ocupada (el fallback global marca no listas todas las fuentes locales).
let lastLocalAstrauraKnown: { at: number; ready: boolean; reason?: string } | undefined;

/**
 * (G5 · 2026-09-26) Misma idea para la NUBE: sin esto, el fallback del tope
 * global la marcaba «lista» a ciegas (`!requiresKey && privacy==="cloud"`, que
 * la fuente nube 1.58 cumple) SIN HABER SONDEADO NUNCA — el bug que hacía que
 * el indicador dijera "nube lista" cuando la sonda real ni siquiera había
 * corrido. Con memoria, sin sonda previa, el fallback la marca «no lista» (sin
 * dato) en vez de blindarla con un sí gratuito.
 */
let lastNubeAstrauraKnown: { at: number; ready: boolean; reason?: string } | undefined;

function applyLocalAstrauraMemory(list: SourceAvailability[]): void {
  for (const a of list) {
    if (a.source.id === "astraura-158-local" && lastLocalAstrauraKnown) {
      a.ready = lastLocalAstrauraKnown.ready;
      a.reason = lastLocalAstrauraKnown.reason;
    }
    if (a.source.id === "astraura-158-nube") {
      // Con sonda previa, se respeta; SIN ELLA, nunca «lista» a ciegas (G5).
      a.ready = lastNubeAstrauraKnown?.ready ?? false;
      a.reason = lastNubeAstrauraKnown?.reason ?? "Sin sonda todavía (tiempo de espera agotado).";
    }
  }
}

/**
 * (Adenda 67 · P0-2) Disponibilidad BLINDADA: `detectAvailability()` se llama en
 * la ruta crítica de CADA respuesta de Aurora. Si lanzara (localStorage corrupto,
 * un `import()` que falla, una sonda que se cuelga), el throw escaparía del
 * failover y Aurora moriría con un error crudo.
 *
 * Esta envoltura garantiza que SIEMPRE se devuelve una lista utilizable:
 *   · con timeout global (las sondas locales nunca bloquean la conversación);
 *   · si todo falla, devuelve al menos las fuentes SIN CLAVE marcadas `ready`
 *     (Pollinations/OVH/LLM7), que es exactamente lo que necesita un invitado.
 * NUNCA lanza.
 */
export async function detectAvailabilitySafe(timeoutMs = 6000): Promise<SourceAvailability[]> {
  // Fallback defensivo: NO usa FREE_CATALOG crudo (estático), sino el catálogo
  // UNIFICADO (que ya incluye los modelos :free VIVOS si applyLiveOpenRouter()
  // corrió). Así la UI de ajustes por contexto refleja el catálogo real aunque
  // el sondeo/fetch falle. (Adenda 71-bis · 2026-07-17)
  const fallback = (): SourceAvailability[] => {
    const list = getUnifiedCatalog().map((source) => ({
      source,
      ready: !source.requiresKey && source.privacy === "cloud" && source.tier !== "paid",
      reason: undefined,
    }));
    // (Ola 278 · OS1) No descartar la local por el tope global: conserva la
    // última disponibilidad conocida en vez de marcarla no lista.
    applyLocalAstrauraMemory(list);
    return list;
  };
  try {
    const timed = new Promise<SourceAvailability[]>((resolve) => {
      setTimeout(() => resolve(fallback()), timeoutMs);
    });
    const list = await Promise.race([detectAvailability().catch(() => fallback()), timed]);
    return aplicarMallaEnVivo(Array.isArray(list) && list.length ? list : fallback());
  } catch {
    return aplicarMallaEnVivo(fallback());
  }
}

/**
 * (2026-09-27) La disponibilidad de la MALLA se mira EN VIVO en cada turno, no en la
 * foto cacheada: medido en producción, una pestaña que cargó antes de que su par con
 * Astraura se vinculara (unos segundos después) seguía creyendo la malla «no lista»
 * durante los 5 min de la caché y el chat se iba a OpenRouter. Es una comprobación
 * síncrona y gratis (fichas ya recibidas por el canal P2P).
 */
function aplicarMallaEnVivo(list: SourceAvailability[]): SourceAvailability[] {
  try {
    const servidores = servidoresAstrauraMalla();
    return list.map((a) =>
      a.source.providerId === "astraura-158-malla"
        ? servidores.length > 0
          ? { ...a, ready: true, reason: undefined }
          : { ...a, ready: false, reason: a.reason ?? "Ninguna neurona de tu malla ofrece Astraura ahora." }
        : a,
    );
  } catch {
    return list;
  }
}

/** Resumen legible de lo detectado (para el panel y para Aurora al presentarse). */
export function summarizeAvailability(list: SourceAvailability[]): string {
  const ready = list.filter((a) => a.ready && a.source.tier !== "paid").map((a) => a.source.label);
  const missing = list.filter((a) => !a.ready && a.source.tier === "free-key").map((a) => a.source.label);
  const parts: string[] = [];
  if (ready.length) parts.push(`Listas: ${ready.join(", ")}.`);
  if (missing.length) parts.push(`Gratis con clave (sin conectar): ${missing.join(", ")}.`);
  return parts.join(" ") || "Sin fuentes detectadas todavía.";
}

/**
 * Detecta y elige un nodo de inferencia PAIR local almacenado en la red mesh.
 */
export function detectarNodoPairLocal(
  opciones?: { modelo?: string; minRamMB?: number }
): { nodo: NodoInferenciaLocal | null; endpoint: string | null } {
  if (typeof window === "undefined") return { nodo: null, endpoint: null };
  try {
    const raw = window.localStorage.getItem(NODOS_INFERENCIA_LOCAL_STORAGE);
    if (!raw) return { nodo: null, endpoint: null };
    const nodos = JSON.parse(raw);
    if (!Array.isArray(nodos) || nodos.length === 0) return { nodo: null, endpoint: null };
    const elegido = elegirNodo(nodos, {
      modelo: opciones?.modelo,
      minRamMB: opciones?.minRamMB,
      requiereGpu: false,
    });
    if (!elegido) return { nodo: null, endpoint: null };
    return { nodo: elegido, endpoint: nodoConBase(elegido) };
  } catch {
    return { nodo: null, endpoint: null };
  }
}
