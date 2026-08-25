"use client";

/**
 * genesis-client-ola2.ts — cliente de los 8 endpoints NUEVOS de OLA 2 (ver el
 * bloque "OLA 2" al final de `genesis-types.ts`: oficina 3D, bots
 * predeterminados, acceso a internet/herramientas, avatar y cerebros propios
 * de un ser). Una función por endpoint, tipada con las interfaces del
 * contrato — ninguna más.
 * ----------------------------------------------------------------------------
 * MISMO idioma que `genesis-client.ts` — que a su vez copia
 * `astraura-158-client.ts` — a propósito: `GenesisResponse<T>` =
 * `{ok:true,data,target,endpoint} | {ok:false,error,target,endpoint}`,
 * guarda SSR (`typeof window === "undefined"` ⇒ falla limpio y NUNCA llama a
 * `fetch`), `AbortController` con timeout corto (listar/leer) o largo
 * (acción real: instalar bots, buscar avatar, configurar un ser), un 404 se
 * lee como "esto no existe todavía" en vez de un HTTP críptico, y un cuerpo
 * vacío se trata como `{}` en vez de reventar `JSON.parse`. Un backend que no
 * implementa OLA 2 (o la implementa a medias) SIEMPRE produce un
 * `GenesisResponse` de fallo legible — nunca una excepción sin capturar.
 *
 * Reexporta (no reimplementa) `GenesisTarget`, `GenesisResponse`,
 * `asGenesisList` y `unwrapEnvelope` desde `genesis-client.ts`: es
 * literalmente la misma lógica, y bifurcarla sería la fuente de bugs más
 * tonta posible entre dos clientes que hablan el mismo protocolo. Lo único
 * que SÍ se duplica aquí es el `call()`/`callList()` de transporte de más
 * abajo: `genesis-client.ts` los mantiene privados a propósito (mismo motivo
 * que `astraura-158-client.ts` no expone el suyo), así que — tal y como pide
 * el encargo de esta ola — se copian literales en vez de forzar un
 * acoplamiento nuevo entre los clientes de dos olas distintas.
 *
 * Dos de las ocho funciones (`searchGenesisSerAvatar`, `setGenesisSerAvatar`)
 * no las consume nada dentro de `genesis/herramientas/`: las usa
 * `genesis/avatar/`, otra ola en paralelo. Viven aquí de todos modos porque
 * este fichero es el cliente COMPLETO de OLA 2 — una función por endpoint
 * nuevo, sin excepciones, tal y como pide el encargo.
 *
 * CIERRE DE DEUDAS (4 funciones más, al final del fichero): depositar la
 * biblioteca del usuario (`depositGenesisBibliotecaUsuario`) y sincronizar
 * cerebros de verdad — todos (`syncGenesisCerebros`), uno
 * (`syncGenesisSerCerebro`) y quitar uno (`deleteGenesisSerCerebro`). Antes
 * no existían estos tres endpoints de sincronización; ahora sí, y con ellos
 * llega `ViaSincronizacion`/`ResultadoSincronizacion` (`genesis-types.ts`):
 * el sync con R2 está roto de verdad (handshake TLS) y el backend cae a
 * Supabase — así que un resultado "ok" puede convivir con una vía rota por
 * detrás, y eso se enseña, nunca se esconde detrás de un solo check verde.
 */

import { astraura158Endpoint } from "./astraura-158-client";
import {
  asGenesisList,
  unwrapEnvelope,
  type GenesisAck,
  type GenesisResponse,
  type GenesisTarget,
} from "./genesis-client";
import type {
  BotPredeterminado,
  CapacidadInternet,
  CerebroSer,
  DepositoBiblioteca,
  EstadoOficina,
  FuenteAvatar,
  HerramientaDisponible,
  PaqueteBibliotecaUsuario,
  ResultadoSincronizacion,
  Ser,
} from "./genesis-types";

export type { GenesisAck, GenesisResponse, GenesisTarget };

/* ════════════════════════════════ Transporte ═══════════════════════════════
 * Copia literal del `call()`/`callList()`/timeouts privados de
 * `genesis-client.ts` — no se importan porque ese fichero no los exporta (a
 * propósito, ver su cabecera). Cualquier corrección de fondo al transporte
 * (guardia SSR, forma del error, timeouts) debe aplicarse en los TRES sitios
 * a la vez: aquí, en `genesis-client.ts` y en `astraura-158-client.ts`.
 * ════════════════════════════════════════════════════════════════════════ */

/** Timeout corto (listar oficina/bots/herramientas) — idéntico a `genesis-client.ts`. */
function shortTimeoutMs(target: GenesisTarget): number {
  return target === "nube" ? 12_000 : 4_000;
}

/** Timeout largo — el backend hace trabajo real: instalar bots, buscar un avatar, configurar un ser. */
function heavyTimeoutMs(target: GenesisTarget): number {
  return target === "nube" ? 60_000 : 30_000;
}

async function call<T>(
  target: GenesisTarget,
  path: string,
  init?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; timeoutMs?: number },
): Promise<GenesisResponse<T>> {
  const endpoint = astraura158Endpoint(target);
  if (typeof window === "undefined") return { ok: false, error: "SSR", target, endpoint };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? shortTimeoutMs(target));
  try {
    const res = await fetch(`${endpoint}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      // OLA 2 es la más nueva del contrato: un 404 aquí casi siempre significa
      // "el backend SÍ tiene Génesis de Seres (OLA 1 funciona), solo que
      // todavía no llegó a esta ola" — no "no hay conexión". Decirlo así evita
      // que se lea como una caída de red cuando la red va perfectamente.
      if (res.status === 404) {
        return { ok: false, error: "el backend todavía no tiene esta función de OLA 2 (404)", target, endpoint };
      }
      let detail = "";
      try {
        const j = await res.json();
        detail = String(j?.error ?? j?.detail ?? "");
      } catch {
        /* cuerpo no-JSON o vacío: sin detalle extra, el HTTP ya dice bastante */
      }
      return { ok: false, error: `HTTP ${res.status}${detail ? `: ${detail.slice(0, 140)}` : ""}`, target, endpoint };
    }
    // `res.json()` a secas revienta con cuerpos vacíos (acciones tipo
    // "instalar"/"internet" que a veces responden 200 sin cuerpo); pasar por
    // texto primero lo evita.
    const text = await res.text();
    const data = (text ? JSON.parse(text) : {}) as T;
    return { ok: true, data, target, endpoint };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort/i.test(msg) ? "sin respuesta (timeout)" : msg.slice(0, 160), target, endpoint };
  }
}

async function callList<T>(target: GenesisTarget, path: string, timeoutMs?: number): Promise<GenesisResponse<T[]>> {
  const r = await call<unknown>(target, path, { timeoutMs });
  if (!r.ok) return r;
  // Misma tolerancia que `genesis-client.ts`: forma inesperada ⇒ lista vacía, nunca revienta un `.map()`.
  return { ok: true, data: asGenesisList<T>(r.data), target: r.target, endpoint: r.endpoint };
}

/** Forma mínima de cualquier sobre de mutación del contrato de Génesis — copia literal de `genesis-client.ts` (ver la cabecera de este fichero: el transporte se duplica a propósito). */
interface AckLike {
  ok?: boolean;
  error?: string;
  message?: string;
}

/** Copia literal de `unwrapAck` (privado en `genesis-client.ts`) para los DELETE de esta ola que no devuelven más que `{ok}`. */
function unwrapAck<TBody extends AckLike>(r: GenesisResponse<TBody>): GenesisResponse<GenesisAck> {
  return unwrapEnvelope(r, () => ({ ok: true as const }));
}

/* ════════════════════════════════ Oficina ═══════════════════════════════
 * Lectura sin sobre {ok,...}: el objeto viaja tal cual, igual que
 * `fetchGenesisSer`. La consume `genesis/oficina/` (otra ola en paralelo).
 * ════════════════════════════════════════════════════════════════════════ */

/** `GET /api/genesis/oficina` — quién está en qué sala y haciendo qué, ahora mismo. */
export function fetchGenesisOficina(target: GenesisTarget): Promise<GenesisResponse<EstadoOficina>> {
  return call<EstadoOficina>(target, "/api/genesis/oficina");
}

/* ═══════════════════════════ Bots predeterminados ═══════════════════════ */

/** `GET /api/genesis/bots_predeterminados` — los 7 procesos de Imaginación Intuitiva, como bots de fábrica. */
export function fetchGenesisBotsPredeterminados(target: GenesisTarget): Promise<GenesisResponse<BotPredeterminado[]>> {
  return callList<BotPredeterminado>(target, "/api/genesis/bots_predeterminados");
}

/**
 * `POST /api/genesis/bots_predeterminados/instalar` — crea como seres los
 * bots pedidos. `ids` omitido ⇒ se manda `{}` y es el backend quien decide
 * "instala todo lo que falte"; `ids` presente (aunque sea `[]`) ⇒ se manda
 * tal cual, para pedir justo esos y ningún otro.
 *
 * Instalar no debe poder duplicar: es el backend quien tiene la última
 * palabra sobre qué cuenta como "ya instalado", pero el llamador debe
 * mandar solo ids pendientes de verdad — ver `idsPendientesDeInstalar` en
 * `herramientas/herramientas-logic.ts` — para que un doble clic en la UI no
 * dispare dos altas del mismo bot antes de que el backend responda.
 */
export async function installGenesisBotsPredeterminados(target: GenesisTarget, ids?: string[]): Promise<GenesisResponse<string[]>> {
  const r = await call<{ ok?: boolean; creados?: string[]; error?: string; message?: string }>(
    target,
    "/api/genesis/bots_predeterminados/instalar",
    { method: "POST", body: ids !== undefined ? { ids } : {}, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => (Array.isArray(b.creados) ? b.creados : undefined));
}

/* ═════════════════════════ Internet y herramientas ═══════════════════════ */

/** `GET /api/genesis/herramientas` — catálogo de herramientas reales del sistema, con su fuente y disponibilidad. */
export function fetchGenesisHerramientas(target: GenesisTarget): Promise<GenesisResponse<HerramientaDisponible[]>> {
  return callList<HerramientaDisponible>(target, "/api/genesis/herramientas");
}

/** Parche parcial de `CapacidadInternet`: solo los campos que cambiaron, igual que el resto del contrato (ver `SerPatch` en `genesis-client.ts`). */
export type SolicitudInternet = Partial<CapacidadInternet>;

/** `POST /api/genesis/seres/{id}/internet` — concede o retira acceso a internet y herramientas de un ser. */
export async function updateGenesisSerInternet(target: GenesisTarget, id: string, patch: SolicitudInternet): Promise<GenesisResponse<Ser>> {
  const r = await call<{ ok?: boolean; ser?: Ser; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(id)}/internet`,
    { method: "POST", body: patch, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => b.ser);
}

/* ═══════════════════════════════════ Avatar ══════════════════════════════
 * Estas dos no las usa `genesis/herramientas/` — las usa `genesis/avatar/`
 * (ver la nota de cabecera del fichero).
 * ════════════════════════════════════════════════════════════════════════ */

/** `POST /api/genesis/seres/{id}/avatar/buscar` — candidatos reales de avatar para una consulta dada. */
export async function searchGenesisSerAvatar(target: GenesisTarget, id: string, consulta: string): Promise<GenesisResponse<FuenteAvatar[]>> {
  const r = await call<{ ok?: boolean; candidatos?: FuenteAvatar[]; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(id)}/avatar/buscar`,
    { method: "POST", body: { consulta }, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => (Array.isArray(b.candidatos) ? b.candidatos : undefined));
}

/** `POST /api/genesis/seres/{id}/avatar` — fija el avatar elegido (o subido) como el del ser. */
export async function setGenesisSerAvatar(target: GenesisTarget, id: string, fuente: FuenteAvatar): Promise<GenesisResponse<Ser>> {
  const r = await call<{ ok?: boolean; ser?: Ser; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(id)}/avatar`,
    { method: "POST", body: fuente, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => b.ser);
}

/* ═══════════════════════════════ Cerebros propios ════════════════════════ */

/**
 * `POST /api/genesis/seres/{id}/cerebros` — sustituye la lista COMPLETA de
 * cerebros propios del ser (mismo criterio que `personalidades`/`cerebros`
 * en `ser-ficha.tsx`: el llamador manda el array entero ya con el cambio
 * aplicado, no un diff). Se manda bajo la clave `cerebrosPropios` — el mismo
 * nombre que el campo en `Ser` — para que el backend nunca tenga que
 * adivinar a qué lista se refiere.
 */
export async function updateGenesisSerCerebros(target: GenesisTarget, id: string, cerebrosPropios: CerebroSer[]): Promise<GenesisResponse<Ser>> {
  const r = await call<{ ok?: boolean; ser?: Ser; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(id)}/cerebros`,
    { method: "POST", body: { cerebrosPropios }, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => b.ser);
}

/* ═══════════════════ Cierre de deudas: biblioteca del usuario ════════════
 * `GET /api/genesis/herramientas` es honesto hoy: marca "biblioteca del
 * usuario" como no disponible porque esa biblioteca vive en `localStorage`
 * del navegador (`starseed.library.mine.v1`) y el backend en Python no
 * tenía forma de leerla. Esta función es esa forma.
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * `POST /api/genesis/herramientas/biblioteca_usuario` — deposita la
 * biblioteca del usuario en el backend. Manda solo lo mínimo
 * (`PaqueteBibliotecaUsuario`), nunca el paquete completo con su `payload`.
 * Respuesta exacta del contrato: `{ok:true, recibidos, descartados}` — sin
 * envoltorio anidado, así que `recibidos` no numérico ⇒ fallo explícito
 * (el mismo criterio que el resto de `unwrapEnvelope`: nunca se cuela un
 * éxito sin los datos que lo prueban).
 */
export async function depositGenesisBibliotecaUsuario(
  target: GenesisTarget,
  paquetes: PaqueteBibliotecaUsuario[],
): Promise<GenesisResponse<DepositoBiblioteca>> {
  const r = await call<{ ok?: boolean; recibidos?: number; descartados?: number; error?: string; message?: string }>(
    target,
    "/api/genesis/herramientas/biblioteca_usuario",
    { method: "POST", body: { paquetes }, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) =>
    typeof b.recibidos === "number"
      ? { recibidos: b.recibidos, descartados: typeof b.descartados === "number" ? b.descartados : 0 }
      : undefined,
  );
}

/* ═══════════════════ Cierre de deudas: sincronizar cerebros ══════════════
 * Antes no había endpoint para esto — no había botón, y era lo correcto:
 * un botón "sincronizar" sin backend detrás es un botón que miente. Ahora
 * SÍ existen los tres. El contexto que hay que reflejar tal cual en la
 * interfaz: el sync con R2 está roto de verdad (handshake TLS) y el
 * backend cae a Supabase automáticamente — así que "éxito" puede significar
 * "una vía funcionó mientras otra sigue rota por detrás". `vias`, en
 * `ResultadoSincronizacion` y en `CerebroSer.vias`, es la manera de que eso
 * no quede escondido detrás de un solo check verde.
 * ════════════════════════════════════════════════════════════════════════ */

/** `POST /api/genesis/cerebros/sincronizar` — sincroniza TODOS los cerebros del sistema (no solo los de un ser). */
export async function syncGenesisCerebros(target: GenesisTarget): Promise<GenesisResponse<ResultadoSincronizacion>> {
  const r = await call<{ ok?: boolean; resultado?: ResultadoSincronizacion; error?: string; message?: string }>(
    target,
    "/api/genesis/cerebros/sincronizar",
    { method: "POST", body: {}, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => b.resultado);
}

/**
 * `POST /api/genesis/seres/{id}/cerebros/{cerebro_id}/sincronizar` —
 * sincroniza UN cerebro de UN ser. Mismo sobre `{ok, ser}` que el resto de
 * mutaciones sobre un ser: el `Ser` devuelto trae `cerebrosPropios`
 * actualizado con el resultado REAL (estado, error, vías) de este intento.
 */
export async function syncGenesisSerCerebro(target: GenesisTarget, serId: string, cerebroId: string): Promise<GenesisResponse<Ser>> {
  const r = await call<{ ok?: boolean; ser?: Ser; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(serId)}/cerebros/${encodeURIComponent(cerebroId)}/sincronizar`,
    { method: "POST", body: {}, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => b.ser);
}

/** `DELETE /api/genesis/seres/{id}/cerebros/{cerebro_id}` — quita un cerebro propio del ser, de verdad (no solo del array local). */
export async function deleteGenesisSerCerebro(target: GenesisTarget, serId: string, cerebroId: string): Promise<GenesisResponse<GenesisAck>> {
  const r = await call<{ ok?: boolean; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(serId)}/cerebros/${encodeURIComponent(cerebroId)}`,
    { method: "DELETE" },
  );
  return unwrapAck(r);
}
