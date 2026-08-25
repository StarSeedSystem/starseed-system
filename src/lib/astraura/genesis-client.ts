"use client";

/**
 * genesis-client.ts — cliente del backend de GÉNESIS DE SERES.
 * ----------------------------------------------------------------------------
 * Una función por endpoint del contrato (`genesis-types.ts` — léelo primero,
 * es la única fuente de verdad de rutas y formas). Este fichero NO añade
 * endpoints ni cambia formas: solo los habla.
 *
 * IDIOMA copiado tal cual de `astraura-158-client.ts` (mismo `target` local ·
 * nube, mismo `astraura158Endpoint()`, mismo AbortController con timeout
 * corto, misma regla de oro: **nunca lanza hacia la UI**. Toda función
 * devuelve `GenesisResponse<T>` = `Astraura158Response<T>` — el mismo tipo,
 * reexportado con nombre de dominio — para que `useS158Load`/`runS158`/
 * `useBusy` de `s158/shared.tsx` funcionen con este cliente sin adaptador.
 *
 * Lo que SÍ es propio de Génesis (no está en astraura-158-client.ts):
 *   · El sobre de las mutaciones es `{ ok, <campo>, error? }` — con `ok`, no
 *     `success` — porque así lo define `genesis-types.ts`. `unwrapEnvelope`
 *     lo normaliza.
 *   · Los campos de petición son camelCase (el contrato es propio y nuevo;
 *     no hereda el snake_case del backend 1.58 legado), así que los DTOs se
 *     mandan tal cual, sin traducir nombres.
 *   · Un 404 se interpreta explícitamente como «este backend todavía no
 *     tiene Génesis» — un error legible, no una traza genérica.
 *   · Los endpoints de listado nunca devuelven "undefined" a la UI: si el
 *     backend manda una forma inesperada (viejo, roto, `null`…), se degrada
 *     a lista vacía en vez de reventar el `.map()` de un componente.
 */

import {
  astraura158Endpoint,
  type Astraura158Response,
  type Astraura158Target,
} from "./astraura-158-client";
import type { RasgosAdn } from "./genesis-dna";
import type {
  Comunidad,
  EnrutadoCognitivo,
  Espacio,
  ModeloDisponible,
  NodoLinaje,
  Propuesta,
  Ser,
  SerListado,
  Soberania,
  SolicitudGenesis,
  VerificacionModelo,
  Vinculo,
} from "./genesis-types";

/** Mismo destino que el resto del OS: esta neurona (local) o el proxy de cuenta (nube). */
export type GenesisTarget = Astraura158Target;

/** Mismo sobre que `astraura-158-client.ts`: `{ok:true,data,target,endpoint}` o `{ok:false,error,target,endpoint}`. */
export type GenesisResponse<T> = Astraura158Response<T>;

/** Confirmación sin más payload que el propio `ok`. */
export interface GenesisAck {
  ok: true;
}

/* ════════════════════════════════ Transporte ═══════════════════════════════
 * Copiado del `call()` privado de astraura-158-client.ts: mismo guard SSR,
 * mismo AbortController, misma forma de error. Dos añadidos propios de
 * Génesis: 404 → mensaje reconocible; cuerpo vacío (`DELETE`/acciones sin
 * payload) → `{}` en vez de reventar `res.json()` con "Unexpected end of
 * JSON input".
 * ════════════════════════════════════════════════════════════════════════ */

/** Timeout corto (listar, leer, alternar) — idéntico a astraura-158-client.ts. */
function shortTimeoutMs(target: GenesisTarget): number {
  return target === "nube" ? 12_000 : 4_000;
}

/**
 * Timeout largo — el backend hace trabajo real: crear/engendrar un ser,
 * verificar que un modelo responde de verdad. Mismos números que usa
 * astraura-158-client.ts para sus acciones pesadas (ciclos, informes,
 * lotes): no se inventa otra escala de tiempos.
 */
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
      // Caso explícito: un backend que aún no implementa Génesis responde 404
      // en cualquiera de estas rutas. Decirlo con claridad evita que el
      // usuario lea un "HTTP 404" críptico donde cabe una frase honesta.
      if (res.status === 404) {
        return { ok: false, error: "el backend no tiene Génesis de Seres todavía (404)", target, endpoint };
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
    // `res.json()` a secas revienta con cuerpos vacíos (204, o 200 sin cuerpo
    // en acciones tipo "aceptar"/"descartar"); pasar por texto lo evita.
    const text = await res.text();
    const data = (text ? JSON.parse(text) : {}) as T;
    return { ok: true, data, target, endpoint };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /abort/i.test(msg) ? "sin respuesta (timeout)" : msg.slice(0, 160), target, endpoint };
  }
}

/** Nunca revienta un `.map()`: forma inesperada (backend viejo, `null`, objeto suelto…) ⇒ lista vacía. */
export function asGenesisList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function callList<T>(target: GenesisTarget, path: string, timeoutMs?: number): Promise<GenesisResponse<T[]>> {
  const r = await call<unknown>(target, path, { timeoutMs });
  if (!r.ok) return r;
  return { ok: true, data: asGenesisList<T>(r.data), target: r.target, endpoint: r.endpoint };
}

/** Forma mínima de cualquier sobre de mutación del contrato de Génesis. */
interface AckLike {
  ok?: boolean;
  error?: string;
  message?: string;
}

/**
 * Aplica el sobre `{ ok, <campo>, error? }` que usa TODO el contrato de
 * Génesis: si `ok` es `false` es un fallo aunque el HTTP fuese 200, y si
 * falta el campo esperado (backend a medio implementar) también lo es —
 * nunca se cuela un `undefined` disfrazado de éxito hacia la UI.
 * Exportada porque es lógica no trivial: decide, de una respuesta ya
 * resuelta, si de verdad hubo éxito y con qué dato.
 */
export function unwrapEnvelope<TBody extends AckLike, TOut>(
  r: GenesisResponse<TBody>,
  extract: (body: TBody) => TOut | undefined,
): GenesisResponse<TOut> {
  if (!r.ok) return r;
  if (r.data && r.data.ok === false) {
    return { ok: false, error: r.data.error ?? r.data.message ?? "el backend rechazó la acción", target: r.target, endpoint: r.endpoint };
  }
  const value = r.data ? extract(r.data) : undefined;
  if (value === undefined) {
    return { ok: false, error: "el backend respondió sin los datos esperados", target: r.target, endpoint: r.endpoint };
  }
  return { ok: true, data: value, target: r.target, endpoint: r.endpoint };
}

function unwrapAck<TBody extends AckLike>(r: GenesisResponse<TBody>): GenesisResponse<GenesisAck> {
  return unwrapEnvelope(r, () => ({ ok: true as const }));
}

/* ════════════════════════════════ Seres ═════════════════════════════════ */

/** `GET /api/genesis/seres` — listado ligero para la lista y el mundo 3D. */
export function fetchGenesisSeres(target: GenesisTarget): Promise<GenesisResponse<SerListado[]>> {
  return callList<SerListado>(target, "/api/genesis/seres");
}

/** `GET /api/genesis/seres/{id}` — el ser completo, para la ficha. */
export function fetchGenesisSer(target: GenesisTarget, id: string): Promise<GenesisResponse<Ser>> {
  return call<Ser>(target, `/api/genesis/seres/${encodeURIComponent(id)}`);
}

/** `POST /api/genesis/seres` — el ritual de creación. */
export async function createGenesisSer(target: GenesisTarget, solicitud: SolicitudGenesis): Promise<GenesisResponse<Ser>> {
  const r = await call<{ ok?: boolean; ser?: Ser; error?: string; message?: string }>(target, "/api/genesis/seres", {
    method: "POST",
    body: solicitud,
    timeoutMs: heavyTimeoutMs(target),
  });
  return unwrapEnvelope(r, (b) => b.ser);
}

/**
 * Subconjunto de `Ser` que de verdad se puede configurar por PATCH: sin
 * `id`, `adn` (se deriva; usa `recomputeGenesisAdn`), `linaje`, `experiencia`
 * ni las marcas de tiempo — esos los decide el backend, no el formulario.
 */
export type SerPatch = Partial<{
  nombre: string;
  rol: string;
  esencia: string | null;
  color: string | null;
  estado: Ser["estado"];
  adnAjustes: Partial<RasgosAdn> | null;
  personalidades: Ser["personalidades"];
  cerebros: Ser["cerebros"];
  habilidades: string[];
  herramientas: string[];
  reglas: string[];
  soberania: Partial<Soberania>;
  enrutado: Partial<EnrutadoCognitivo>;
  comunidades: string[];
  espacioHogarId: string | null;
  imaginacion: Ser["imaginacion"];
  recursos: Ser["recursos"];
}>;

/** `PATCH /api/genesis/seres/{id}` — configurar cualquier parte del contrato. */
export async function updateGenesisSer(target: GenesisTarget, id: string, patch: SerPatch): Promise<GenesisResponse<Ser>> {
  const r = await call<{ ok?: boolean; ser?: Ser; error?: string; message?: string }>(target, `/api/genesis/seres/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
    timeoutMs: heavyTimeoutMs(target),
  });
  return unwrapEnvelope(r, (b) => b.ser);
}

/** `DELETE /api/genesis/seres/{id}`. */
export async function deleteGenesisSer(target: GenesisTarget, id: string): Promise<GenesisResponse<GenesisAck>> {
  const r = await call<{ ok?: boolean; error?: string; message?: string }>(target, `/api/genesis/seres/${encodeURIComponent(id)}`, { method: "DELETE" });
  return unwrapAck(r);
}

/** Igual que `SolicitudGenesis` pero sin `progenitorId`: lo fija la ruta. */
export type SolicitudEngendrar = Omit<SolicitudGenesis, "progenitorId">;

/** `POST /api/genesis/seres/{id}/engendrar` — un ser crea otro. */
export async function spawnGenesisSer(target: GenesisTarget, progenitorId: string, solicitud: SolicitudEngendrar): Promise<GenesisResponse<Ser>> {
  const r = await call<{ ok?: boolean; ser?: Ser; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(progenitorId)}/engendrar`,
    { method: "POST", body: solicitud, timeoutMs: heavyTimeoutMs(target) },
  );
  return unwrapEnvelope(r, (b) => b.ser);
}

/** `POST /api/genesis/seres/{id}/adn/recalcular`. */
export async function recomputeGenesisAdn(target: GenesisTarget, id: string): Promise<GenesisResponse<RasgosAdn>> {
  const r = await call<{ ok?: boolean; adn?: RasgosAdn; error?: string; message?: string }>(
    target,
    `/api/genesis/seres/${encodeURIComponent(id)}/adn/recalcular`,
    { method: "POST", body: {} },
  );
  return unwrapEnvelope(r, (b) => b.adn);
}

/* ═══════════════════════════ Linaje y vínculos ══════════════════════════ */

/** `GET /api/genesis/linaje` — árbol completo (para resolver nombres de progenitor/descendientes). */
export function fetchGenesisLinaje(target: GenesisTarget): Promise<GenesisResponse<NodoLinaje[]>> {
  return callList<NodoLinaje>(target, "/api/genesis/linaje");
}

/** `GET /api/genesis/vinculos`. */
export function fetchGenesisVinculos(target: GenesisTarget): Promise<GenesisResponse<Vinculo[]>> {
  return callList<Vinculo>(target, "/api/genesis/vinculos");
}

/** Cuerpo para crear un vínculo: todo `Vinculo` salvo lo que decide el backend. */
export type SolicitudVinculo = Omit<Vinculo, "id" | "creadoEn">;

/** `POST /api/genesis/vinculos`. */
export async function createGenesisVinculo(target: GenesisTarget, solicitud: SolicitudVinculo): Promise<GenesisResponse<Vinculo>> {
  const r = await call<{ ok?: boolean; vinculo?: Vinculo; error?: string; message?: string }>(target, "/api/genesis/vinculos", {
    method: "POST",
    body: solicitud,
  });
  return unwrapEnvelope(r, (b) => b.vinculo);
}

/** `DELETE /api/genesis/vinculos/{id}`. */
export async function deleteGenesisVinculo(target: GenesisTarget, id: string): Promise<GenesisResponse<GenesisAck>> {
  const r = await call<{ ok?: boolean; error?: string; message?: string }>(target, `/api/genesis/vinculos/${encodeURIComponent(id)}`, { method: "DELETE" });
  return unwrapAck(r);
}

/* ═══════════════════════════ Comunidades y espacios ═════════════════════ */

/** `GET /api/genesis/comunidades`. */
export function fetchGenesisComunidades(target: GenesisTarget): Promise<GenesisResponse<Comunidad[]>> {
  return callList<Comunidad>(target, "/api/genesis/comunidades");
}

/** Cuerpo mínimo para crear una comunidad: nombre y propósito son obligatorios. */
export type SolicitudComunidad = Pick<Comunidad, "nombre" | "proposito"> & Partial<Pick<Comunidad, "miembros" | "espacioId" | "color">>;

/** `POST /api/genesis/comunidades`. */
export async function createGenesisComunidad(target: GenesisTarget, solicitud: SolicitudComunidad): Promise<GenesisResponse<Comunidad>> {
  const r = await call<{ ok?: boolean; comunidad?: Comunidad; error?: string; message?: string }>(target, "/api/genesis/comunidades", {
    method: "POST",
    body: solicitud,
  });
  return unwrapEnvelope(r, (b) => b.comunidad);
}

/** `GET /api/genesis/espacios`. */
export function fetchGenesisEspacios(target: GenesisTarget): Promise<GenesisResponse<Espacio[]>> {
  return callList<Espacio>(target, "/api/genesis/espacios");
}

/** Cuerpo mínimo para crear un espacio 3D: nombre y arquetipo son obligatorios. */
export type SolicitudEspacio = Pick<Espacio, "nombre" | "arquetipo"> & Partial<Pick<Espacio, "constructorId" | "semilla">>;

/** `POST /api/genesis/espacios`. */
export async function createGenesisEspacio(target: GenesisTarget, solicitud: SolicitudEspacio): Promise<GenesisResponse<Espacio>> {
  const r = await call<{ ok?: boolean; espacio?: Espacio; error?: string; message?: string }>(target, "/api/genesis/espacios", {
    method: "POST",
    body: solicitud,
  });
  return unwrapEnvelope(r, (b) => b.espacio);
}

/* ════════════════════════════════ Modelos ═══════════════════════════════ */

/** `GET /api/genesis/modelos` — la escalera económica completa, del más barato al más capaz. */
export function fetchGenesisModelos(target: GenesisTarget): Promise<GenesisResponse<ModeloDisponible[]>> {
  return callList<ModeloDisponible>(target, "/api/genesis/modelos");
}

/**
 * `POST /api/genesis/modelos/verificar` — comprueba que un modelo RESPONDE
 * de verdad (no solo que aparece listado). Timeout largo a propósito: es
 * una inferencia real, no una lectura de caché.
 */
export function verifyGenesisModelo(target: GenesisTarget, modeloId: string): Promise<GenesisResponse<VerificacionModelo>> {
  return call<VerificacionModelo>(target, "/api/genesis/modelos/verificar", {
    method: "POST",
    body: { modeloId },
    timeoutMs: heavyTimeoutMs(target),
  });
}

/* ═══════════════════════════════ Propuestas ═════════════════════════════ */

/** `GET /api/genesis/propuestas` — la bandeja de trabajo hecho fuera de dominio. */
export function fetchGenesisPropuestas(target: GenesisTarget): Promise<GenesisResponse<Propuesta[]>> {
  return callList<Propuesta>(target, "/api/genesis/propuestas");
}

/** `POST /api/genesis/propuestas/{id}/aceptar`. */
export async function acceptGenesisPropuesta(target: GenesisTarget, id: string): Promise<GenesisResponse<GenesisAck>> {
  const r = await call<{ ok?: boolean; error?: string; message?: string }>(target, `/api/genesis/propuestas/${encodeURIComponent(id)}/aceptar`, {
    method: "POST",
    body: {},
    timeoutMs: heavyTimeoutMs(target),
  });
  return unwrapAck(r);
}

/** `POST /api/genesis/propuestas/{id}/descartar`. */
export async function discardGenesisPropuesta(target: GenesisTarget, id: string): Promise<GenesisResponse<GenesisAck>> {
  const r = await call<{ ok?: boolean; error?: string; message?: string }>(target, `/api/genesis/propuestas/${encodeURIComponent(id)}/descartar`, {
    method: "POST",
    body: {},
  });
  return unwrapAck(r);
}
