"use client";

/**
 * Cerebros · DESTINOS DE SINCRONIZACIÓN de memorias, POR CEREBRO
 * ============================================================================
 * Ver architecture/cerebros-memorias-graphify.md §7. Cada cerebro declara en
 * `Brain.config.memoryDestinations` (jsonb ya existente — SIN migración):
 *
 *   { local: { enabled: true },            // SIEMPRE true — mirror local (memory-offline.ts)
 *     starseed: { enabled: boolean },      // default ON — manifiesto en entity_state
 *     external: ExternalMemoryDestination[] } // 0+ destinos propios ("brain-store")
 *
 * DECISIÓN DE DISEÑO (honesta, ver SOP §7): no se crea ninguna tabla nueva.
 *   - "starseed" se representa con un MANIFIESTO en entity_state (metadatos,
 *     nunca contenido) — la StarSeed store REAL ya es `brain_memory_files`.
 *   - "external" (tipo 'brain-store') reutiliza `Brain.servers[]`
 *     (BrainServer con kind:'own', endpoint, keyRef) + addServer/removeServer
 *     de brains.ts, en vez de duplicar un registro paralelo.
 *
 * Defensivo/SSR-safe: try/catch en todo, nunca lanza a sus llamadores.
 */

import {
  saveBrain,
  addServer,
  removeServer,
  newServerId,
  type Brain,
} from "@/lib/brains/brains";
import { getEntityState, setEntityState, currentUserRef } from "@/lib/sync/entity-state";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
// Adenda 149 · Ola 3 (cableado de runtime): el ALMACÉN elegido por neurona ×
// personalidad (`cerebro.almacen`) decide el destino de este ciclo de sync. Se
// importa SOLO el STORE (que a su vez solo depende de `safe-storage`), NUNCA
// `neuron-persona-systems`: esa capa alta importa `@/ai/astraura/mesh` y la capa
// de neuronas, y este módulo cuelga de `@/lib/brains/brains` — meterla aquí sería
// pedir un ciclo. Mismo criterio que `@/ai/astraura/mesh/persona-antenna-gate.ts`.
import { ALL_PERSONAS, getOverrides } from "@/lib/astraura/neuron-persona-store";
// Reutiliza la config YA guardada del proveedor 'p2p-syncthing' (endpoint +
// clave API, local por dispositivo) — este módulo NO duplica ese registro,
// solo lo consulta para el paso de sincronización best-effort de abajo.
import { getProviderConfig } from "@/ai/astraura/sync-providers";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Destino externo ("brain-store"): una URL propia que respalda el cerebro. */
export interface ExternalMemoryDestination {
  id: string;
  /** Id del BrainServer creado para este destino (kind:'own'), si aplica. */
  serverId?: string;
  url: string;
  label: string;
  /** Nombre de la clave en la bóveda (secrets_vault). Nunca el valor en claro. */
  keyRef?: string;
}

/**
 * Destino "p2p" — espejo del cerebro vía la instancia SYNCTHING del propio
 * usuario (ver `sync-providers.ts::p2pSyncthingProvider`). NO duplica esa
 * config (endpoint/clave API): solo declara SI este cerebro debe pedirle a
 * Syncthing que sincronice, y opcionalmente QUÉ folder le corresponde.
 * Default OFF (a diferencia de `starseed`, que es automático): requiere que
 * el usuario tenga su propio Syncthing configurado.
 */
export interface P2pMemoryDestination {
  enabled: boolean;
  /** Id del folder Syncthing que espeja este cerebro (opcional). */
  folderId?: string;
  label?: string;
}

export interface MemoryDestinationsConfig {
  local: { enabled: true };
  starseed: { enabled: boolean };
  external: ExternalMemoryDestination[];
  /** Espejo por Syncthing (folder local sincronizada) — default OFF. */
  p2p: P2pMemoryDestination;
}

/** Manifiesto honesto del destino StarSeed de un cerebro (solo metadatos). */
export interface StarseedStoreManifest {
  brainId: string;
  fileCount: number;
  provisionedAt: string;
  updatedAt: string;
  /** Límites reales, sin promesas falsas (cuota de cuenta, sin SLA). */
  limits: string;
}

const MANIFEST_KEY_PREFIX = "brain-store:";

/* ------------------------------------------------------------------ */
/* Config por defecto / normalización                                  */
/* ------------------------------------------------------------------ */

export function defaultMemoryDestinations(): MemoryDestinationsConfig {
  return { local: { enabled: true }, starseed: { enabled: true }, external: [], p2p: { enabled: false } };
}

function normalizeP2p(raw: unknown): P2pMemoryDestination {
  if (!raw || typeof raw !== "object") return { enabled: false };
  const r = raw as Partial<P2pMemoryDestination>;
  return {
    enabled: r.enabled === true,
    folderId: typeof r.folderId === "string" && r.folderId ? r.folderId : undefined,
    label: typeof r.label === "string" && r.label ? r.label : undefined,
  };
}

function normalizeExternal(raw: unknown): ExternalMemoryDestination[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalMemoryDestination[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const d = r as Partial<ExternalMemoryDestination>;
    if (!d.id || !d.url) continue;
    out.push({
      id: String(d.id),
      serverId: d.serverId ? String(d.serverId) : undefined,
      url: String(d.url),
      label: d.label ? String(d.label) : "Destino externo",
      keyRef: d.keyRef ? String(d.keyRef) : undefined,
    });
  }
  return out;
}

/** Normaliza cualquier valor de `Brain.config.memoryDestinations`. Nunca lanza. */
export function normalizeMemoryDestinations(raw: unknown): MemoryDestinationsConfig {
  try {
    if (!raw || typeof raw !== "object") return defaultMemoryDestinations();
    const r = raw as Partial<MemoryDestinationsConfig> & { starseed?: { enabled?: boolean } };
    return {
      local: { enabled: true }, // local SIEMPRE activo, no desactivable.
      starseed: { enabled: r.starseed?.enabled !== false }, // default ON.
      external: normalizeExternal(r.external),
      p2p: normalizeP2p(r.p2p), // default OFF (requiere Syncthing propio).
    };
  } catch {
    return defaultMemoryDestinations();
  }
}

/** Lee la config de destinos de un cerebro (defaults si no se configuró nunca). */
export function getMemoryDestinations(brain: Brain | null | undefined): MemoryDestinationsConfig {
  if (!brain) return defaultMemoryDestinations();
  return normalizeMemoryDestinations((brain.config as Record<string, unknown> | undefined)?.memoryDestinations);
}

/** Escribe (merge) la config de destinos de un cerebro. Devuelve el cerebro actualizado. */
export async function setMemoryDestinations(
  brain: Brain,
  patch: Partial<MemoryDestinationsConfig>,
): Promise<Brain | null> {
  try {
    const current = getMemoryDestinations(brain);
    const next: MemoryDestinationsConfig = {
      local: { enabled: true },
      starseed: { enabled: patch.starseed?.enabled ?? current.starseed.enabled },
      external: patch.external ?? current.external,
      p2p: {
        enabled: patch.p2p?.enabled ?? current.p2p.enabled,
        folderId: patch.p2p && "folderId" in patch.p2p ? patch.p2p.folderId : current.p2p.folderId,
        label: patch.p2p && "label" in patch.p2p ? patch.p2p.label : current.p2p.label,
      },
    };
    return await saveBrain({
      ...brain,
      config: { ...(brain.config || {}), memoryDestinations: next },
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* StarSeed (entity_state) — "host gratuito automático"                */
/* ------------------------------------------------------------------ */

/**
 * Aprovisiona/actualiza el manifiesto StarSeed de un cerebro: un registro
 * HONESTO (solo metadatos, nunca contenido) en `entity_state` que documenta
 * que este cerebro tiene almacenamiento StarSeed activo (la store real ya es
 * `brain_memory_files`, gratis por cuenta, sin SLA). Idempotente y defensivo.
 */
export async function provisionStarseedStore(brain: Brain): Promise<StarseedStoreManifest | null> {
  try {
    const ref = await currentUserRef();
    if (!ref) return null;
    const key = `${MANIFEST_KEY_PREFIX}${brain.id}`;
    const existing = await getEntityState<StarseedStoreManifest>(ref, key);
    const files = await listMemoryFiles(brain.id);
    const now = new Date().toISOString();
    const manifest: StarseedStoreManifest = {
      brainId: brain.id,
      fileCount: files.length,
      provisionedAt: existing?.value?.provisionedAt || now,
      updatedAt: now,
      limits:
        "Almacenamiento gestionado por la cuenta StarSeed (tabla brain_memory_files, RLS por " +
        "propietario). Gratis dentro de la cuota razonable de la cuenta; sin SLA garantizado.",
    };
    const row = await setEntityState(ref, key, manifest);
    return row?.value ?? manifest;
  } catch {
    return null;
  }
}

/** Lee el manifiesto StarSeed de un cerebro (o null si no se aprovisionó). */
export async function getStarseedManifest(brainId: string): Promise<StarseedStoreManifest | null> {
  try {
    const ref = await currentUserRef();
    if (!ref) return null;
    const row = await getEntityState<StarseedStoreManifest>(ref, `${MANIFEST_KEY_PREFIX}${brainId}`);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Externo ("brain-store") — reutiliza Brain.servers[]                 */
/* ------------------------------------------------------------------ */

/**
 * Añade un destino externo propio ("brain-store"): crea un BrainServer
 * (kind:'own') con el endpoint dado y lo referencia en memoryDestinations.
 * Devuelve el cerebro actualizado (con el nuevo server + destino), o null.
 */
export async function addExternalDestination(
  brain: Brain,
  input: { url: string; label?: string; keyRef?: string },
): Promise<Brain | null> {
  try {
    if (!input?.url?.trim()) return null;
    const serverId = newServerId();
    const label = input.label?.trim() || "Cerebro-almacén externo";
    const withServer = await addServer(brain, {
      id: serverId,
      kind: "own",
      name: label,
      endpoint: input.url.trim(),
      keyRef: input.keyRef,
      status: "pendiente",
    });
    if (!withServer) return null;
    const dest: ExternalMemoryDestination = {
      id: serverId,
      serverId,
      url: input.url.trim(),
      label,
      keyRef: input.keyRef,
    };
    const current = getMemoryDestinations(withServer);
    return await setMemoryDestinations(withServer, { external: [...current.external, dest] });
  } catch {
    return null;
  }
}

/** Quita un destino externo (y su BrainServer asociado, si lo tiene). */
export async function removeExternalDestination(brain: Brain, destinationId: string): Promise<Brain | null> {
  try {
    const current = getMemoryDestinations(brain);
    const dest = current.external.find((d) => d.id === destinationId);
    let working: Brain | null = brain;
    if (dest?.serverId) {
      working = await removeServer(brain, dest.serverId);
      if (!working) return null;
    }
    const nextExternal = current.external.filter((d) => d.id !== destinationId);
    return await setMemoryDestinations(working, { external: nextExternal });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Orquestador de sincronización (best-effort, nunca lanza)             */
/* ------------------------------------------------------------------ */

export interface MemoryDestinationSyncStep {
  kind: "starseed" | "external" | "local" | "p2p";
  ok: boolean;
  detail: string;
}

export interface MemoryDestinationSyncResult {
  ok: boolean;
  steps: MemoryDestinationSyncStep[];
}

/** ¿Hay fetch disponible en este entorno? (SSR-safe). */
function canFetch(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.fetch === "function";
}

/* ── Adenda 149 · Ola 3 — `cerebro.almacen` decide el destino del sync ──────── */

/** Almacén efectivo de memorias en ESTA neurona para la personalidad activa. */
export type BrainStoreMode = "auto" | "local" | "servidor";

/** Clave del id de neurona (la escribe `thisDeviceId()` en `@/lib/neurons/neurons`). */
const NEURON_DEVICE_ID_KEY = "starseed.neuron.device-id";

/**
 * Id de ESTA neurona leído DIRECTO de localStorage, sin acoplar los cerebros a la
 * capa de neuronas y SIN cache (un `localStorage.clear()` en sesión viva regenera
 * el id y una cache lo dejaría rancio). Patrón de `persona-antenna-gate.ts`.
 * "" ⇒ sin neurona identificada (o SSR) ⇒ camino rápido «auto».
 */
function neuronDeviceId(): string {
  try {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(NEURON_DEVICE_ID_KEY) || "";
  } catch {
    return "";
  }
}

/**
 * Almacén EFECTIVO de este ciclo: `cerebro.almacen` guardado para esta neurona ×
 * personalidad ACTIVA en la ventana «Sistemas de Astraura en esta neurona».
 *
 * La personalidad activa se resuelve con `import()` DINÁMICO y dentro de un
 * try/catch a propósito: `@/lib/aurora/personalities` arrastra la capa de
 * neuronas, el mesh y la inteligencia unificada, y este módulo cuelga de
 * `@/lib/brains/brains`. Hoy NADA de `src/lib/aurora` ni de `src/ai` importa
 * `memory-destinations` (verificado), así que un import estático no cerraría
 * ningún ciclo — pero el dinámico deja el módulo igual de liviano que antes y
 * hace que un futuro import inverso no pueda romperlo. Si no se resuelve
 * personalidad, se usa `"*"` (defaults de la neurona para «Todas»), igual que
 * hace el mesh con el tráfico no atribuible.
 *
 * Sin overrides guardados devuelve `"auto"` ⇒ el ciclo se comporta EXACTAMENTE
 * como antes de esta ola. NUNCA lanza.
 */
async function effectiveBrainStore(): Promise<BrainStoreMode> {
  try {
    const dev = neuronDeviceId();
    if (!dev) return "auto"; // camino rápido (SSR o neurona sin identificar)
    let personaId: string = ALL_PERSONAS;
    try {
      const mod = await import("@/lib/aurora/personalities");
      personaId = mod.getActivePersonality?.()?.id || ALL_PERSONAS;
    } catch {
      /* sin personalidades resolubles → defaults «Todas» de la neurona */
    }
    return getOverrides(dev, personaId).cerebro?.almacen ?? "auto";
  } catch {
    return "auto";
  }
}

/**
 * Sincroniza los destinos de un cerebro: (1) refresca el manifiesto StarSeed
 * si está activo, (2) empuja un bundle ligero a cada destino externo (POST
 * best-effort, contrato laxo `{ ok }`, igual de tolerante que runtime.ts). El
 * mirror LOCAL (§8 del SOP) se gestiona aparte en memory-offline.ts — este
 * orquestador no lo toca para mantener responsabilidades separadas.
 *
 * ── Adenda 149 · Ola 3 — el almacén por neurona × personalidad DECIDE ────────
 * `cerebro.almacen` de la ventana «Sistemas de Astraura en esta neurona» (SOP
 * §9, último pendiente de memoria) manda sobre este ciclo:
 *   · "auto"     ⇒ EXACTAMENTE lo de siempre (camino rápido sin overrides).
 *   · "local"    ⇒ este ciclo NO empuja a StarSeed ni a destinos externos. El
 *                  mirror local (`memory-offline.ts`) ni se toca — es de otro
 *                  módulo y siempre está activo — así que «local» no pierde nada:
 *                  aplaza la salida de datos, no la memoria.
 *   · "servidor" ⇒ push FORZADO: se salta cualquier aplazamiento de este ciclo.
 * Lo que «servidor» NO hace, a propósito: reactivar un destino que el usuario
 * apagó en ESTE cerebro (`starseed.enabled:false`, o cero destinos externos).
 * Eso es una elección explícita por cerebro, no una heurística de aplazamiento,
 * y la UI promete «los servidores de los cerebros», no inventarlos. Cuando la
 * personalidad pide servidor y el cerebro no tiene ninguno activo, se registra
 * un paso HONESTO en fallo en vez de forzar una escritura que nadie pidió.
 *
 * TELEMETRÍA: el registro vivo de este módulo son los `steps` que devuelve (los
 * pinta el toast de `memory-graph.tsx`), así que la decisión se anota ahí — y
 * SOLO cuando hay override, para que en «auto» el resultado sea idéntico al
 * previo, paso a paso.
 */
export async function syncBrainMemoryNow(brain: Brain): Promise<MemoryDestinationSyncResult> {
  const steps: MemoryDestinationSyncStep[] = [];
  try {
    const dest = getMemoryDestinations(brain);
    const almacen = await effectiveBrainStore();
    const soloLocal = almacen === "local";
    const forzarServidor = almacen === "servidor";

    if (soloLocal) {
      steps.push({
        kind: "local",
        ok: true,
        detail:
          "Almacén «local» en esta neurona: este ciclo no envía memorias a StarSeed ni a " +
          "destinos externos (el espejo local sigue intacto).",
      });
    } else if (forzarServidor) {
      const hayServidor = dest.starseed.enabled || dest.external.length > 0;
      steps.push({
        kind: "starseed",
        ok: hayServidor,
        detail: hayServidor
          ? "Almacén «servidor» en esta neurona: sincronización forzada con los destinos del cerebro."
          : "Almacén «servidor» en esta neurona, pero este cerebro no tiene ningún destino de " +
            "servidor activo (actívalo en los destinos del cerebro).",
      });
    }

    if (dest.starseed.enabled && !soloLocal) {
      const manifest = await provisionStarseedStore(brain);
      steps.push({
        kind: "starseed",
        ok: !!manifest,
        detail: manifest
          ? `Manifiesto StarSeed actualizado (${manifest.fileCount} ficheros).`
          : "No se pudo actualizar el manifiesto StarSeed (¿sesión activa?).",
      });
    }

    if (dest.external.length && !soloLocal && canFetch()) {
      const files = await listMemoryFiles(brain.id);
      const bundle = {
        starseedBrainMemory: 1,
        brainId: brain.id,
        brainName: brain.name,
        exportedAt: new Date().toISOString(),
        files: files.map((f) => ({ id: f.id, name: f.name, content: f.content, meta: f.meta })),
      };
      for (const ext of dest.external) {
        try {
          const res = await fetch(ext.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bundle),
          });
          steps.push({
            kind: "external",
            ok: res.ok,
            detail: res.ok
              ? `Bundle enviado a «${ext.label}».`
              : `«${ext.label}» respondió ${res.status}.`,
          });
        } catch (e) {
          steps.push({
            kind: "external",
            ok: false,
            detail: `No se pudo contactar «${ext.label}»: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
    } else if (dest.external.length && !soloLocal) {
      steps.push({ kind: "external", ok: false, detail: "Sin red disponible para sincronizar destinos externos." });
    }

    // Espejo P2P (Syncthing propio) — best-effort, honesto: solo NUDGEA a
    // Syncthing a reescanear/sincronizar el folder; no mueve el contenido de
    // las memorias por aquí (eso lo hace Syncthing por su cuenta, por archivo).
    //
    // A149 · Ola 3: el almacén de la personalidad NO lo toca. Syncthing es la
    // instancia del PROPIO usuario espejando sus archivos entre sus máquinas —
    // no es «el servidor» ni un tercero — y el aviso que se manda aquí es un
    // `POST /rest/db/scan` a su endpoint, sin contenido de memorias. El alcance
    // cableado en esta ola es exactamente el declarado: StarSeed y externos.
    if (dest.p2p.enabled) {
      const cfg = getProviderConfig("p2p-syncthing") as { endpoint?: string; apiKey?: string };
      if (!cfg.endpoint || !cfg.apiKey) {
        steps.push({ kind: "p2p", ok: false, detail: "Syncthing no está configurado (ver Cuenta → Servidor de sincronización)." });
      } else if (!canFetch()) {
        steps.push({ kind: "p2p", ok: false, detail: "Sin red disponible para avisar a Syncthing." });
      } else {
        try {
          const base = cfg.endpoint.trim().replace(/\/+$/, "");
          const qs = dest.p2p.folderId ? `?folder=${encodeURIComponent(dest.p2p.folderId)}` : "";
          const res = await fetch(`${base}/rest/db/scan${qs}`, {
            method: "POST",
            headers: { "X-API-Key": cfg.apiKey },
          });
          steps.push({
            kind: "p2p",
            ok: res.ok,
            detail: res.ok
              ? `Syncthing avisado de sincronizar${dest.p2p.folderId ? ` «${dest.p2p.folderId}»` : ""} (espejo de archivos, no de este manifiesto).`
              : `Syncthing respondió ${res.status} (revisa endpoint/clave API).`,
          });
        } catch (e) {
          steps.push({ kind: "p2p", ok: false, detail: `No se pudo contactar con Syncthing: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    }

    const ok = steps.length === 0 || steps.every((s) => s.ok);
    return { ok, steps };
  } catch (e) {
    steps.push({ kind: "local", ok: false, detail: `Error inesperado: ${e instanceof Error ? e.message : String(e)}` });
    return { ok: false, steps };
  }
}
