"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Cliente n8n (automatización / workflows) — DEFENSIVO
// ----------------------------------------------------------------------------
// n8n (https://n8n.io) es una plataforma open-source de automatización de
// workflows. StarSeed OS NO lo instala: lo CONECTA por su endpoint. Hay dos
// caminos honestos de integración:
//
//   • WEBHOOK (siempre): un workflow con un nodo "Webhook" expone una URL del
//     tipo `{baseUrl}/webhook/<path>`. Disparamos el flujo con un POST. No
//     requiere clave, sólo que n8n esté corriendo y el workflow activo.
//   • API REST (opcional): con una API key (header `X-N8N-API-KEY`) podemos
//     LISTAR los workflows vía `{baseUrl}/api/v1/workflows`. Sólo para gestión.
//
// Todo aquí es SSR-safe (usa fetch/AbortController tras guardas) y NUNCA lanza:
// cada función devuelve un resultado con `ok` y un mensaje explicativo. Un fallo
// de red / CORS / timeout se reporta, no rompe la UI.
//
// La resolución de "qué instancia de n8n usar" la hace `resolveServiceFor
// ('workflow')` del registro OSS: este cliente sólo recibe baseUrl/apiKey.
// ════════════════════════════════════════════════════════════════════════════

// ── Tipos de resultado ───────────────────────────────────────────────────────

/** Resultado genérico de una llamada al cliente (nunca lanza). */
export interface N8nResult<T = unknown> {
  ok: boolean;
  /** Código HTTP si hubo respuesta. */
  status?: number;
  /** Milisegundos que tardó la operación. */
  ms: number;
  /** Mensaje legible (es) para la UI. */
  message: string;
  /** Cuerpo/datos devueltos (parseado como JSON si se pudo, si no texto). */
  data?: T;
}

/** Forma mínima y tolerante de un workflow de n8n (la API real trae más). */
export interface N8nWorkflow {
  id: string;
  name: string;
  active?: boolean;
  tags?: string[];
}

// ── Utilidades base (defensivas, SSR-safe) ───────────────────────────────────

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Quita barras finales para componer rutas sin duplicar `/`. */
function trimTrailingSlash(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

/** Une base + path evitando dobles barras. */
function joinUrl(base: string, path: string): string {
  const b = trimTrailingSlash(base);
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * fetch defensivo con timeout (AbortController). Devuelve un `N8nResult`
 * uniforme. Intenta parsear JSON; si no puede, guarda el texto crudo.
 */
async function safeFetch<T = unknown>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  okMessage: (status: number) => string,
): Promise<N8nResult<T>> {
  const started = now();
  const elapsed = () => Math.round(now() - started);

  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      ms: elapsed(),
      message:
        "URL inválida. Configura la instancia de n8n (debe empezar por http:// o https://).",
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
      ...init,
      signal: controller?.signal,
      // No mandamos cookies de StarSeed a un endpoint de terceros.
      credentials: "omit",
      mode: "cors",
    });
    if (timer) clearTimeout(timer);

    let data: T | undefined;
    let text = "";
    try {
      text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          // No es JSON: dejamos el texto crudo como dato.
          data = text as unknown as T;
        }
      }
    } catch {
      /* cuerpo ilegible: seguimos con lo que tengamos */
    }

    return {
      ok: res.ok,
      status: res.status,
      ms: elapsed(),
      data,
      message: res.ok
        ? okMessage(res.status)
        : `n8n respondió con HTTP ${res.status}. ${
            res.status === 404
              ? "¿La ruta del webhook/API es correcta y el workflow está activo?"
              : res.status === 401 || res.status === 403
                ? "Credenciales rechazadas: revisa la API key (X-N8N-API-KEY)."
                : "Revisa el endpoint o el estado del workflow."
          }`,
    };
  } catch (e: unknown) {
    if (timer) clearTimeout(timer);
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      ms: elapsed(),
      message: aborted
        ? `Tiempo de espera agotado (${timeoutMs} ms). ¿n8n está levantado y accesible desde el navegador?`
        : "No se pudo conectar con n8n. Puede ser CORS, que la instancia no esté corriendo, o una URL incorrecta.",
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// API pública del cliente
// ════════════════════════════════════════════════════════════════════════════

/**
 * Dispara un workflow de n8n por su webhook: `POST {baseUrl}/webhook/<path>`.
 *
 * - `baseUrl`: la URL de la instancia de n8n (p.ej. http://localhost:5678).
 * - `path`: el sub-path del webhook (lo que va tras `/webhook/`), o una URL de
 *   webhook completa (si empieza por http, se usa tal cual).
 * - `payload`: objeto JSON que se envía como cuerpo (opcional).
 *
 * Nunca lanza. Devuelve `N8nResult` con la respuesta del flujo si la hubo.
 */
export async function triggerWebhook(
  baseUrl: string,
  path: string,
  payload?: unknown,
  timeoutMs = 12000,
): Promise<N8nResult> {
  const p = (path || "").trim();

  // Permite pegar la URL de webhook completa que da n8n.
  const url = /^https?:\/\//i.test(p)
    ? p
    : joinUrl(baseUrl, `/webhook/${p.replace(/^\/+/, "").replace(/^webhook\//, "")}`);

  let body: string | undefined;
  if (payload !== undefined && payload !== null) {
    try {
      body =
        typeof payload === "string" ? payload : JSON.stringify(payload);
    } catch {
      return {
        ok: false,
        ms: 0,
        message:
          "El payload no se pudo serializar a JSON. Revisa la plantilla del webhook.",
      };
    }
  }

  return safeFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    timeoutMs,
    (status) => `Webhook disparado correctamente (HTTP ${status}).`,
  );
}

/**
 * Lista los workflows de una instancia de n8n vía su API REST.
 * `GET {baseUrl}/api/v1/workflows` con header `X-N8N-API-KEY: <apiKey>`.
 *
 * Requiere una API key (n8n Enterprise/Cloud o self-host con API pública).
 * Nunca lanza. Normaliza la respuesta a un array de `N8nWorkflow`.
 */
export async function listWorkflows(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<N8nResult<N8nWorkflow[]>> {
  if (!apiKey || !apiKey.trim()) {
    return {
      ok: false,
      ms: 0,
      message:
        "Falta la API key de n8n. Necesaria para listar workflows (header X-N8N-API-KEY).",
    };
  }

  const url = joinUrl(baseUrl, "/api/v1/workflows");
  const res = await safeFetch<unknown>(
    url,
    {
      method: "GET",
      headers: {
        "X-N8N-API-KEY": apiKey.trim(),
        Accept: "application/json",
      },
    },
    timeoutMs,
    (status) => `Workflows obtenidos (HTTP ${status}).`,
  );

  if (!res.ok) return res as N8nResult<N8nWorkflow[]>;

  // La API v1 devuelve { data: [...] } normalmente; toleramos también array plano.
  const raw = res.data as { data?: unknown } | unknown[] | undefined;
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { data?: unknown })?.data)
      ? ((raw as { data: unknown[] }).data)
      : [];

  const workflows: N8nWorkflow[] = list
    .map((w) => {
      if (!w || typeof w !== "object") return null;
      const o = w as Record<string, unknown>;
      const id =
        typeof o.id === "string"
          ? o.id
          : typeof o.id === "number"
            ? String(o.id)
            : "";
      if (!id) return null;
      return {
        id,
        name: typeof o.name === "string" ? o.name : `Workflow ${id}`,
        active: typeof o.active === "boolean" ? o.active : undefined,
        tags: Array.isArray(o.tags)
          ? (o.tags as unknown[])
              .map((t) =>
                t && typeof t === "object" && "name" in t
                  ? String((t as { name?: unknown }).name ?? "")
                  : typeof t === "string"
                    ? t
                    : "",
              )
              .filter(Boolean)
          : undefined,
      } as N8nWorkflow;
    })
    .filter((w): w is N8nWorkflow => !!w);

  return {
    ...res,
    data: workflows,
    message: `${workflows.length} workflow(s) encontrados.`,
  };
}

/**
 * Prueba ligera de una instancia de n8n. Si hay API key, intenta listar
 * workflows (prueba fuerte). Si no, hace un GET al `healthz` de n8n
 * (`{baseUrl}/healthz`), que existe en instancias modernas; si no existe,
 * un fallo NO es concluyente y el mensaje lo aclara.
 *
 * Nunca lanza.
 */
export async function testN8n(
  baseUrl: string,
  apiKey?: string,
  timeoutMs = 6000,
): Promise<N8nResult> {
  const base = trimTrailingSlash(baseUrl);
  if (!base || !/^https?:\/\//i.test(base)) {
    return {
      ok: false,
      ms: 0,
      message:
        "Configura primero la URL de la instancia de n8n (http:// o https://).",
    };
  }

  if (apiKey && apiKey.trim()) {
    const wf = await listWorkflows(base, apiKey, timeoutMs);
    return {
      ok: wf.ok,
      status: wf.status,
      ms: wf.ms,
      message: wf.ok
        ? `Conexión con la API de n8n correcta. ${wf.message}`
        : wf.message,
    };
  }

  // Sin API key: sondeo de salud (best-effort; healthz no siempre existe).
  const res = await safeFetch(
    joinUrl(base, "/healthz"),
    { method: "GET", headers: { Accept: "application/json" } },
    timeoutMs,
    (status) => `Instancia de n8n accesible (healthz HTTP ${status}).`,
  );

  if (res.ok) return res;

  // 404 aquí sólo significa que este n8n no expone /healthz; la instancia
  // puede seguir funcionando para webhooks.
  return {
    ...res,
    message:
      res.status === 404
        ? "La instancia responde pero no expone /healthz. Para webhooks probablemente funcione igualmente; añade una API key para verificar vía la API."
        : res.message,
  };
}
