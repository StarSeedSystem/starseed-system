"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Cliente Cal.com (calendarios / agendamiento) — DEFENSIVO
// ----------------------------------------------------------------------------
// Cal.com (https://cal.com) es la alternativa open-source a Calendly. StarSeed
// OS lo CONECTA por su API v2 (no lo instala):
//
//   • Base por defecto: https://api.cal.com/v2  (nube) — o tu instancia self-host.
//   • Autenticación: header `Authorization: Bearer <apiKey>`.
//   • Endpoints usados: GET /bookings (reservas), GET /event-types (tipos de evento).
//
// Cal.com API v2 pide además la cabecera `cal-api-version` (fecha de versión)
// en varios endpoints; la enviamos con un valor estable y conservador.
//
// Todo es SSR-safe y NUNCA lanza: cada función devuelve un resultado con `ok` y
// un mensaje explicativo. Además exponemos `toCalendarEvents()` para volcar las
// reservas al formato de eventos del calendario de la red (título/inicio/fin).
// ════════════════════════════════════════════════════════════════════════════

// La versión de la API v2 que pedimos por cabecera. Cal.com versiona por fecha;
// este valor es conservador y ampliamente soportado por los endpoints de lectura.
const CALCOM_API_VERSION = "2024-08-13";

/** Base por defecto de la nube de Cal.com (v2). */
export const CALCOM_DEFAULT_BASE = "https://api.cal.com/v2";

// ── Tipos de resultado ───────────────────────────────────────────────────────

/** Resultado genérico de una llamada al cliente (nunca lanza). */
export interface CalcomResult<T = unknown> {
  ok: boolean;
  status?: number;
  ms: number;
  message: string;
  data?: T;
}

/** Reserva normalizada y tolerante (la API real trae más campos). */
export interface CalcomBooking {
  id: string;
  uid?: string;
  title: string;
  description?: string;
  start?: string; // ISO
  end?: string; // ISO
  status?: string;
  location?: string;
  attendees?: string[];
}

/** Tipo de evento normalizado. */
export interface CalcomEventType {
  id: string;
  title: string;
  slug?: string;
  lengthInMinutes?: number;
}

/** Evento genérico del calendario de la red (formato de destino). */
export interface CalendarEvent {
  id: string;
  title: string;
  start?: string;
  end?: string;
  source: "calcom";
  raw?: unknown;
}

// ── Utilidades base (defensivas, SSR-safe) ───────────────────────────────────

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function trimTrailingSlash(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  const b = trimTrailingSlash(base) || CALCOM_DEFAULT_BASE;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** fetch defensivo con timeout + Bearer. Devuelve un `CalcomResult` uniforme. */
async function safeFetch<T = unknown>(
  url: string,
  apiKey: string,
  timeoutMs: number,
  okMessage: (status: number) => string,
): Promise<CalcomResult<T>> {
  const started = now();
  const elapsed = () => Math.round(now() - started);

  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      ms: elapsed(),
      message:
        "URL inválida. Configura la base de la API de Cal.com (http:// o https://).",
    };
  }
  if (!apiKey || !apiKey.trim()) {
    return {
      ok: false,
      ms: elapsed(),
      message:
        "Falta la API key de Cal.com. Genérala en Settings → Developer → API Keys.",
    };
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      }, timeoutMs)
    : null;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "cal-api-version": CALCOM_API_VERSION,
        Accept: "application/json",
      },
      signal: controller?.signal,
      credentials: "omit",
      mode: "cors",
    });
    if (timer) clearTimeout(timer);

    let data: T | undefined;
    try {
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          data = text as unknown as T;
        }
      }
    } catch {
      /* cuerpo ilegible */
    }

    return {
      ok: res.ok,
      status: res.status,
      ms: elapsed(),
      data,
      message: res.ok
        ? okMessage(res.status)
        : `Cal.com respondió con HTTP ${res.status}. ${
            res.status === 401 || res.status === 403
              ? "Credenciales rechazadas: revisa tu API key."
              : res.status === 404
                ? "Endpoint no encontrado: revisa la base de la API (¿v2?)."
                : "Revisa el endpoint o las credenciales."
          }`,
    };
  } catch (e: unknown) {
    if (timer) clearTimeout(timer);
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      ms: elapsed(),
      message: aborted
        ? `Tiempo de espera agotado (${timeoutMs} ms). ¿La API de Cal.com es accesible desde el navegador?`
        : "No se pudo conectar con Cal.com. Puede ser CORS, la red o una base de API incorrecta.",
    };
  }
}

// ── Normalización de la respuesta v2 (tolerante a envoltorios) ───────────────

/**
 * La API v2 suele envolver en `{ status, data: [...] }`. Toleramos también
 * `{ data: { bookings: [...] } }` y arrays planos.
 */
function unwrapList(raw: unknown, innerKey?: string): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as unknown[];
    if (o.data && typeof o.data === "object") {
      const d = o.data as Record<string, unknown>;
      if (innerKey && Array.isArray(d[innerKey])) return d[innerKey] as unknown[];
      // Busca el primer array dentro de data.
      for (const v of Object.values(d)) if (Array.isArray(v)) return v;
    }
    if (innerKey && Array.isArray(o[innerKey])) return o[innerKey] as unknown[];
  }
  return [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function normalizeBooking(w: unknown): CalcomBooking | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const id =
    typeof o.id === "string"
      ? o.id
      : typeof o.id === "number"
        ? String(o.id)
        : str(o.uid) ?? "";
  if (!id) return null;

  const attendees = Array.isArray(o.attendees)
    ? (o.attendees as unknown[])
        .map((a) =>
          a && typeof a === "object"
            ? str((a as Record<string, unknown>).name) ??
              str((a as Record<string, unknown>).email) ??
              ""
            : typeof a === "string"
              ? a
              : "",
        )
        .filter(Boolean)
    : undefined;

  return {
    id,
    uid: str(o.uid),
    title: str(o.title) ?? str(o.eventTypeId) ?? `Reserva ${id}`,
    description: str(o.description),
    start: str(o.start) ?? str(o.startTime),
    end: str(o.end) ?? str(o.endTime),
    status: str(o.status),
    location: str(o.location),
    attendees: attendees && attendees.length ? attendees : undefined,
  };
}

function normalizeEventType(w: unknown): CalcomEventType | null {
  if (!w || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  const id =
    typeof o.id === "string"
      ? o.id
      : typeof o.id === "number"
        ? String(o.id)
        : "";
  if (!id) return null;
  const len =
    typeof o.lengthInMinutes === "number"
      ? o.lengthInMinutes
      : typeof o.length === "number"
        ? o.length
        : undefined;
  return {
    id,
    title: str(o.title) ?? str(o.slug) ?? `Tipo ${id}`,
    slug: str(o.slug),
    lengthInMinutes: len,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// API pública del cliente
// ════════════════════════════════════════════════════════════════════════════

/**
 * Lista reservas de Cal.com: `GET {baseUrl}/bookings`.
 * Nunca lanza. Normaliza a `CalcomBooking[]`.
 */
export async function listBookings(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<CalcomResult<CalcomBooking[]>> {
  const res = await safeFetch<unknown>(
    joinUrl(baseUrl, "/bookings"),
    apiKey,
    timeoutMs,
    (status) => `Reservas obtenidas (HTTP ${status}).`,
  );
  if (!res.ok) return res as CalcomResult<CalcomBooking[]>;

  const bookings = unwrapList(res.data, "bookings")
    .map(normalizeBooking)
    .filter((b): b is CalcomBooking => !!b);

  return {
    ...res,
    data: bookings,
    message: `${bookings.length} reserva(s) encontradas.`,
  };
}

/**
 * Lista tipos de evento: `GET {baseUrl}/event-types`.
 * Nunca lanza. Normaliza a `CalcomEventType[]`.
 */
export async function listEventTypes(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<CalcomResult<CalcomEventType[]>> {
  const res = await safeFetch<unknown>(
    joinUrl(baseUrl, "/event-types"),
    apiKey,
    timeoutMs,
    (status) => `Tipos de evento obtenidos (HTTP ${status}).`,
  );
  if (!res.ok) return res as CalcomResult<CalcomEventType[]>;

  const eventTypes = unwrapList(res.data, "eventTypes")
    .map(normalizeEventType)
    .filter((e): e is CalcomEventType => !!e);

  return {
    ...res,
    data: eventTypes,
    message: `${eventTypes.length} tipo(s) de evento.`,
  };
}

/**
 * Prueba de conexión de Cal.com. Intenta listar tipos de evento (endpoint
 * ligero y siempre disponible con una key válida). Nunca lanza.
 */
export async function testCalcom(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 6000,
): Promise<CalcomResult> {
  const res = await listEventTypes(baseUrl, apiKey, timeoutMs);
  return {
    ok: res.ok,
    status: res.status,
    ms: res.ms,
    message: res.ok
      ? `Conexión con Cal.com correcta. ${res.message}`
      : res.message,
  };
}

/**
 * Convierte reservas de Cal.com a eventos genéricos del calendario de la red.
 * Función PURA (sin red). Descarta reservas sin fechas utilizables.
 */
export function toCalendarEvents(bookings: CalcomBooking[]): CalendarEvent[] {
  return (bookings || [])
    .filter((b) => !!b && (b.start || b.end))
    .map((b) => ({
      id: `calcom:${b.id}`,
      title: b.title,
      start: b.start,
      end: b.end,
      source: "calcom" as const,
      raw: b,
    }));
}

/**
 * Atajo de alto nivel: lee reservas y las devuelve ya como eventos del
 * calendario de la red. Nunca lanza.
 */
export async function fetchCalendarEvents(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<CalcomResult<CalendarEvent[]>> {
  const res = await listBookings(baseUrl, apiKey, timeoutMs);
  if (!res.ok) return res as CalcomResult<CalendarEvent[]>;
  const events = toCalendarEvents(res.data ?? []);
  return {
    ...res,
    data: events,
    message: `${events.length} evento(s) listos para el calendario.`,
  };
}
