"use client";

// ════════════════════════════════════════════════════════════════════════════
// Aurora · GENERAR con SERVICIOS por función — clientes defensivos (navegador)
// ----------------------------------------------------------------------------
// Este módulo ENRUTA la generación de Aurora (imagen, workflow, sitio web,
// vídeo) a los SERVICIOS OPEN-SOURCE que el usuario ha configurado por función
// en /servicios. La resolución de "qué servicio/endpoint usar" la hace la capa
// ya existente `resolveServiceFor(category, scope)` de `oss-connections.ts`; aquí
// SÓLO llamamos al servicio resuelto con el formato que espera (Fooocus-API,
// AUTOMATIC1111, n8n…) y, cuando aplica, guardamos el resultado en la Biblioteca.
//
// A diferencia de `content-actions.ts` (que opera 100% local sobre stores/rutas
// del OS), este módulo SÍ hace red — pero de forma DEFENSIVA y HONESTA:
//   • SSR-safe: todo acceso a window/fetch está guardado; en servidor devolvemos
//     un resultado honesto sin tocar la red.
//   • Nunca lanza: fetch con timeout (AbortController) + try/catch en todo.
//   • Degradación honesta: si NO hay servicio/endpoint configurado, NO inventamos
//     un resultado — devolvemos un mensaje decible que guía a configurarlo en
//     /servicios (o, para sitios web, generamos un HTML de plantilla local útil).
//   • Identidad Soberana: lo generado (imagen/HTML) se guarda en la Biblioteca
//     local del usuario (saveResource), como el resto de generación de Aurora.
//
// CONTRATO: cada función devuelve un `ContentOutcome` = { ok, message, data? }
//   • message → frase corta en ESPAÑOL, decible en voz alta.
// aurora-tools.ts adapta ese contrato a IntegrationResult (data.text = message),
// exactamente como con las tools de `content-actions.ts`.
// ════════════════════════════════════════════════════════════════════════════

import { saveResource } from "@/lib/library-store";
import { resolveServiceFor, type OssScope } from "@/lib/services/oss-connections";
import { triggerWebhook } from "@/lib/integrations/services/n8n";
import type { ContentOutcome } from "@/lib/aurora/generate/content-actions";
// Adenda 138 · GRATIS-PRIMERO audiovisual: el motor de generación de imagen que
// SÍ funciona desde la web sin instalar nada (Pollinations por defecto, con
// failover). Ver src/ai/astraura/media/media-gen.ts + SOP
// architecture/generacion-audiovisual-astraura.md.
import { generateImage as generateImageFree } from "@/ai/astraura/media/media-gen";

// Re-exportamos el tipo para conveniencia de quien importe sólo este módulo.
export type { ContentOutcome };

// ── Utilidades base (todas defensivas / SSR-safe) ───────────────────────────

/** ¿Estamos en el navegador (con window)? */
function isClient(): boolean {
  return typeof window !== "undefined";
}

/** ¿Hay localStorage utilizable (para guardar en Biblioteca)? */
function hasLocalStorage(): boolean {
  return isClient() && typeof localStorage !== "undefined";
}

/** Coacciona a texto limpio (nunca lanza). */
function toText(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Genera un id razonablemente único (sin depender de nada). */
let _seq = 0;
function makeId(prefix: string): string {
  try {
    if (isClient() && typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    /* noop */
  }
  return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
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
 * Guarda un recurso en la Biblioteca (data URL o URL http) y avisa a la UI
 * (saveResource ya emite `starseed:library`). Devuelve el id nuevo. Defensivo.
 */
function saveToLibrary(args: {
  kind: string;
  title: string;
  url: string;
  origin?: string;
}): { ok: boolean; id: string } {
  if (!hasLocalStorage()) return { ok: false, id: "" };
  const id = makeId("aurora");
  try {
    saveResource({
      id,
      kind: args.kind,
      title: args.title,
      url: args.url,
      origin: args.origin ?? "Aurora",
    });
    return { ok: true, id };
  } catch {
    return { ok: false, id: "" };
  }
}

/** Resultado uniforme de un fetch defensivo. */
interface SafeFetchResult<T = unknown> {
  ok: boolean;
  status?: number;
  data?: T;
  /** Texto crudo de la respuesta (por si el JSON falla). */
  text?: string;
  /** Motivo de fallo legible (es) si !ok y no hubo respuesta HTTP. */
  reason?: "no-net" | "timeout" | "bad-url" | "http";
}

/**
 * fetch defensivo con timeout (AbortController). Intenta parsear JSON; si no
 * puede, guarda el texto crudo. NUNCA lanza. SSR-safe (sólo se llama en cliente).
 */
async function safeFetch<T = unknown>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<SafeFetchResult<T>> {
  if (!isClient() || typeof fetch === "undefined") {
    return { ok: false, reason: "no-net" };
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: "bad-url" };
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
      // No mandamos cookies de StarSeed a endpoints de terceros/self-host.
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
          data = undefined; // no era JSON; dejamos el texto crudo
        }
      }
    } catch {
      /* cuerpo ilegible: seguimos con lo que tengamos */
    }
    return { ok: res.ok, status: res.status, data, text, reason: res.ok ? undefined : "http" };
  } catch (e: unknown) {
    if (timer) clearTimeout(timer);
    const aborted = (e as { name?: string })?.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "no-net" };
  }
}

/** Mensaje honesto de fallo de red según el motivo (decible). */
function netFailMessage(servicio: string, r: SafeFetchResult, timeoutMs: number): string {
  if (r.reason === "timeout") {
    return `${servicio} no respondió a tiempo (${Math.round(timeoutMs / 1000)} s). ¿Está levantado y accesible desde el navegador?`;
  }
  if (r.reason === "http") {
    return `${servicio} respondió con un error (HTTP ${r.status ?? "?"}). Revisa el endpoint y los parámetros en /servicios.`;
  }
  if (r.reason === "bad-url") {
    return `La URL de ${servicio} no es válida. Configura un endpoint http(s) en /servicios.`;
  }
  return `No pude conectar con ${servicio}. Puede ser CORS, que no esté corriendo, o una URL incorrecta. Revísalo en /servicios.`;
}

// ════════════════════════════════════════════════════════════════════════════
// IMAGEN — resuelve la función 'image' → Fooocus-API o AUTOMATIC1111
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extrae una imagen (base64 o URL) de la respuesta de un servicio de imagen,
 * tolerando las formas más comunes de Fooocus-API y AUTOMATIC1111:
 *   • Fooocus-API: array [{ base64 | url | image | ... }] o { images: [...] }.
 *   • A1111 txt2img: { images: ["<base64 sin prefijo>", ...] }.
 * Devuelve una data/URL lista para guardar, o null si no se reconoce nada.
 */
function extractImageFromResponse(data: unknown, rawText?: string): string | null {
  const asDataUrl = (b64: string): string => {
    const s = b64.trim();
    if (!s) return "";
    if (/^data:/i.test(s) || /^https?:\/\//i.test(s)) return s;
    return `data:image/png;base64,${s}`;
  };

  const pickFromObj = (o: Record<string, unknown>): string | null => {
    // Claves habituales que traen la imagen.
    for (const k of ["base64", "url", "image", "img", "b64", "data"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return asDataUrl(v);
    }
    return null;
  };

  // 1) Array (Fooocus-API async/sync suele devolver una lista de resultados).
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "string" && item.trim()) return asDataUrl(item);
      if (item && typeof item === "object") {
        const got = pickFromObj(item as Record<string, unknown>);
        if (got) return got;
      }
    }
  }

  // 2) Objeto con { images: [...] } (A1111 y algunas variantes de Fooocus).
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const imgs = o.images;
    if (Array.isArray(imgs)) {
      for (const item of imgs) {
        if (typeof item === "string" && item.trim()) return asDataUrl(item);
        if (item && typeof item === "object") {
          const got = pickFromObj(item as Record<string, unknown>);
          if (got) return got;
        }
      }
    }
    // 3) Objeto plano con una clave de imagen directa.
    const flat = pickFromObj(o);
    if (flat) return flat;
  }

  // 4) Texto crudo que ya es una URL/data URL (último recurso).
  if (typeof rawText === "string") {
    const t = rawText.trim();
    if (/^https?:\/\//i.test(t) || /^data:image\//i.test(t)) return asDataUrl(t);
  }
  return null;
}

/**
 * generarImagen — resuelve la función de IMAGEN configurada y genera una imagen
 * a partir de un prompt, guardándola en la Biblioteca.
 *
 * Enrutado (resolveServiceFor('image', scope)):
 *   • Fooocus-API (id `fooocus-api`): POST {endpoint}/v1/generation/text-to-image
 *     con { prompt, ... } (formato Fooocus-API, async_process:false).
 *   • AUTOMATIC1111 (id `automatic1111`): POST {endpoint}/sdapi/v1/txt2img
 *     con { prompt, ... }.
 *   • Otro servicio de imagen con endpoint: intento genérico Fooocus-like.
 * Si NO hay servicio/endpoint configurado, devuelve un mensaje honesto que guía
 * a configurarlo en /servicios (no inventa una imagen).
 *
 * Nunca lanza. Devuelve { ok, message, data? }.
 */
export async function generarImagen(
  prompt: unknown,
  scope: OssScope = "user",
): Promise<ContentOutcome> {
  if (!isClient()) {
    return { ok: false, message: "La generación de imágenes se hace desde el navegador." };
  }
  const p = toText(prompt).trim();
  if (!p) {
    return { ok: false, message: "¿Qué imagen quieres que genere? Descríbemela." };
  }

  const resolved = resolveServiceFor("image", scope);
  const endpoint = trimTrailingSlash(resolved?.endpoint ?? "");
  const serviceId = resolved?.service?.id ?? "";
  const serviceName = resolved?.service?.name ?? "el servicio de imagen";
  // `fromUserConnection` distingue una conexión REAL del usuario (su servidor
  // local/propio) del `defaultEndpoint` de catálogo (p. ej. localhost:8888 de
  // Fooocus, que casi nunca existe). Solo intentamos el endpoint si es una
  // conexión real; si no, vamos directos a GRATIS-PRIMERO (Adenda 138).
  const hasUserConn = !!resolved?.fromUserConnection;

  const timeoutMs = 120000; // la generación de imagen puede tardar
  const title = `Imagen: ${p.slice(0, 60)}`;

  // Sin servicio propio conectado ⇒ GRATIS-PRIMERO: generamos con el motor
  // audiovisual gratis-primero (Pollinations por defecto), que funciona desde
  // la web SIN instalar nada, para cualquier cuenta. Ver media-gen.ts.
  if (!hasUserConn || !endpoint) {
    const free = await generateImageFree({ prompt: p });
    if (free.ok && free.url) {
      const saved = saveToLibrary({ kind: "image", title, url: free.url, origin: `Astraura · ${free.provider}` });
      return {
        ok: true,
        message: saved.ok
          ? `Generé la imagen con el motor gratis de la red (${free.provider}) y la guardé en tu Biblioteca. Dime «abre la biblioteca» para verla. Para más calidad puedes conectar Stable Diffusion o Fooocus en /servicios, o elegir otro servicio en Habilidades → Generación audiovisual.`
          : `Generé la imagen (${free.provider}), pero no pude guardarla en la Biblioteca de este equipo.`,
        data: { id: saved.id || undefined, serviceId: free.provider, kind: "image", url: free.url },
      };
    }
    return {
      ok: false,
      message:
        "No pude generar la imagen ahora mismo. Puedes conectar Fooocus-API o Stable Diffusion (AUTOMATIC1111) en /servicios, o elegir otro servicio en Habilidades → Generación audiovisual.",
      data: { needsConfig: true, category: "image", error: free.error },
    };
  }

  // ── AUTOMATIC1111 (Stable Diffusion WebUI) ────────────────────────────────
  if (serviceId === "automatic1111") {
    const url = joinUrl(endpoint, "/sdapi/v1/txt2img");
    const res = await safeFetch<unknown>(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, steps: 20 }),
      },
      timeoutMs,
    );
    if (!res.ok) {
      return { ok: false, message: netFailMessage(serviceName, res, timeoutMs), data: { serviceId, endpoint } };
    }
    const img = extractImageFromResponse(res.data, res.text);
    if (!img) {
      return {
        ok: false,
        message: `${serviceName} respondió pero no encontré la imagen en el resultado. Revisa el modelo cargado en /servicios.`,
        data: { serviceId, endpoint },
      };
    }
    const saved = saveToLibrary({ kind: "image", title, url: img, origin: serviceName });
    return {
      ok: true,
      message: saved.ok
        ? `Generé la imagen con ${serviceName} y la guardé en tu Biblioteca. Dime «abre la biblioteca» para verla.`
        : `Generé la imagen con ${serviceName}, pero no pude guardarla en la Biblioteca de este equipo.`,
      data: { id: saved.id || undefined, serviceId, kind: "image", url: img },
    };
  }

  // ── Fooocus-API (por id, o cualquier otro servicio de imagen: intento Fooocus-like) ──
  // Fooocus-API expone POST /v1/generation/text-to-image con async_process:false
  // para devolver el resultado en la misma llamada.
  const url = joinUrl(endpoint, "/v1/generation/text-to-image");
  const res = await safeFetch<unknown>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        prompt: p,
        negative_prompt: "",
        async_process: false,
        require_base64: true,
      }),
    },
    timeoutMs,
  );
  if (!res.ok) {
    const isFooocus = serviceId === "fooocus-api";
    return {
      ok: false,
      message: isFooocus
        ? netFailMessage(serviceName, res, timeoutMs)
        : `No pude generar la imagen con ${serviceName} (HTTP ${res.status ?? "?"}). Este servicio quizá use otro formato; revisa la conexión en /servicios.`,
      data: { serviceId, endpoint },
    };
  }
  const img = extractImageFromResponse(res.data, res.text);
  if (!img) {
    return {
      ok: false,
      message: `${serviceName} respondió pero no reconocí la imagen en el resultado. Revisa el servicio en /servicios.`,
      data: { serviceId, endpoint },
    };
  }
  const saved = saveToLibrary({ kind: "image", title, url: img, origin: serviceName });
  return {
    ok: true,
    message: saved.ok
      ? `Generé la imagen con ${serviceName} y la guardé en tu Biblioteca. Dime «abre la biblioteca» para verla.`
      : `Generé la imagen con ${serviceName}, pero no pude guardarla en la Biblioteca de este equipo.`,
    data: { id: saved.id || undefined, serviceId, kind: "image", url: img },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// WORKFLOW — resuelve la función 'workflow' → n8n (triggerWebhook)
// ════════════════════════════════════════════════════════════════════════════

/**
 * lanzarWorkflow — resuelve el servicio de AUTOMATIZACIÓN configurado (n8n) y
 * dispara un workflow por su webhook con un payload.
 *
 * `nombreOpath`: el sub-path del webhook (lo que va tras `/webhook/`) o una URL
 * de webhook completa. Si la conexión tiene un webhook fijo configurado y no se
 * pasa path, se usa ese webhook.
 * `payload`: objeto JSON que se envía como cuerpo (opcional).
 *
 * Si NO hay servicio/instancia configurada, mensaje honesto → /servicios.
 * Nunca lanza. Devuelve { ok, message, data? }.
 */
export async function lanzarWorkflow(
  nombreOpath: unknown,
  payload?: unknown,
  scope: OssScope = "user",
): Promise<ContentOutcome> {
  if (!isClient()) {
    return { ok: false, message: "Los workflows se lanzan desde el navegador." };
  }
  const resolved = resolveServiceFor("workflow", scope);
  const conn = resolved?.connection ?? null;
  const instance = trimTrailingSlash(resolved?.endpoint ?? "");
  const configuredWebhook = (conn?.webhook ?? "").trim();
  const serviceName = resolved?.service?.name ?? "el servicio de automatización";

  const path = toText(nombreOpath).trim();

  // Determinamos a qué disparar:
  //   1) si hay path/URL explícita → se usa (triggerWebhook resuelve URL completa).
  //   2) si no hay path pero la conexión tiene un webhook fijo → ese webhook.
  //   3) si no hay ninguna de las dos y no hay instancia → honesto.
  let targetBase = instance;
  let targetPath = path;
  if (!path && configuredWebhook) {
    // Sin path: usamos el webhook completo configurado como URL.
    targetBase = ""; // no se usa cuando el path ya es una URL completa
    targetPath = configuredWebhook;
  }

  if (!targetPath && !targetBase) {
    return {
      ok: false,
      message:
        "Aún no hay un servicio de automatización conectado. Configura n8n (instancia y/o webhook) en /servicios y dime qué workflow lanzar.",
      data: { needsConfig: true, category: "workflow" },
    };
  }
  if (!targetPath) {
    return {
      ok: false,
      message:
        "¿Qué workflow lanzo? Dime el nombre del webhook (lo que va tras /webhook/) o pega la URL completa. También puedes fijar un webhook por defecto en /servicios.",
      data: { instance: targetBase },
    };
  }

  // Payload defensivo: objeto tal cual, o vacío.
  let data: Record<string, unknown> | unknown = undefined;
  if (payload !== undefined && payload !== null) {
    data = payload;
  }

  const timeoutMs = 15000;
  const res = await triggerWebhook(targetBase, targetPath, data, timeoutMs);
  if (!res.ok) {
    return {
      ok: false,
      message: `No pude lanzar el workflow en ${serviceName}: ${res.message}`,
      data: { instance: targetBase, path: targetPath, status: res.status },
    };
  }
  return {
    ok: true,
    message: `Lancé el workflow «${path || "por defecto"}» en ${serviceName}.`,
    data: { instance: targetBase, path: targetPath, status: res.status, respuesta: res.data },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SITIO WEB — resuelve la función 'website' → servicio, o plantilla local
// ════════════════════════════════════════════════════════════════════════════

/** Escapa texto para insertarlo con seguridad en HTML (evita romper el markup). */
function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Genera un HTML de plantilla LOCAL, estético y autocontenible, a partir de una
 * descripción. Fallback útil cuando no hay un servicio de sitios configurado:
 * NO simula una llamada a un servicio, produce una página real y honesta.
 */
function buildLocalSiteHtml(descripcion: string): { html: string; titulo: string } {
  const desc = descripcion.trim();
  // Título: primera frase/línea corta de la descripción.
  const firstLine = (desc.split(/[.\n]/)[0] || desc).trim();
  const titulo = (firstLine || "Sitio StarSeed").slice(0, 80);
  const safeTitulo = escapeHtml(titulo);
  const safeDesc = escapeHtml(desc);
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitulo}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #e8eefc; background: radial-gradient(1200px 800px at 20% -10%, #1b2a5e 0%, #0a0f24 55%, #05070f 100%);
    display: flex; align-items: center; justify-content: center; padding: 6vw 5vw;
  }
  main {
    max-width: 720px; width: 100%; padding: clamp(24px, 5vw, 56px);
    background: rgba(20, 28, 54, 0.55); border: 1px solid rgba(120, 160, 255, 0.22);
    border-radius: 24px; backdrop-filter: blur(14px);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  }
  h1 {
    margin: 0 0 0.5em; font-size: clamp(28px, 6vw, 48px); line-height: 1.1; letter-spacing: -0.02em;
    background: linear-gradient(120deg, #7fb0ff, #39ff14 120%); -webkit-background-clip: text;
    background-clip: text; color: transparent;
  }
  p { margin: 0 0 1.2em; font-size: clamp(15px, 2.4vw, 18px); line-height: 1.7; color: #c7d2ee; white-space: pre-wrap; }
  .cta {
    display: inline-block; margin-top: 8px; padding: 12px 22px; border-radius: 999px; cursor: pointer;
    font-weight: 600; text-decoration: none; color: #05070f;
    background: linear-gradient(120deg, #7fb0ff, #39ff14); transition: transform 200ms ease, box-shadow 200ms ease;
  }
  .cta:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(127, 176, 255, 0.35); }
  footer { margin-top: 2.5em; font-size: 13px; color: #8a97bd; }
</style>
</head>
<body>
<main>
  <h1>${safeTitulo}</h1>
  <p>${safeDesc}</p>
  <a class="cta" href="#">Empezar</a>
  <footer>Generado por Aurora · StarSeed OS</footer>
</main>
</body>
</html>`;
  return { html, titulo };
}

/** Data URL de un HTML (base64 UTF-8 seguro; cae a URL-encoding). */
function htmlToDataUrl(html: string): string {
  try {
    if (isClient() && typeof btoa === "function") {
      const b64 = btoa(unescape(encodeURIComponent(html)));
      return `data:text/html;charset=utf-8;base64,${b64}`;
    }
  } catch {
    /* cae al encoding de abajo */
  }
  try {
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  } catch {
    return "data:text/html;charset=utf-8,";
  }
}

/** Intenta extraer una URL de sitio publicado o HTML de la respuesta del servicio. */
function extractSiteFromResponse(data: unknown, rawText?: string): { url?: string; html?: string } {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["url", "siteUrl", "site_url", "link", "deployUrl", "deploy_url"]) {
      const v = o[k];
      if (typeof v === "string" && /^https?:\/\//i.test(v.trim())) return { url: v.trim() };
    }
    for (const k of ["html", "content", "body", "markup"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return { html: v };
    }
  }
  if (typeof rawText === "string") {
    const t = rawText.trim();
    if (/^https?:\/\//i.test(t)) return { url: t };
    if (/<html[\s>]/i.test(t) || /<!doctype html/i.test(t)) return { html: t };
  }
  return {};
}

/**
 * generarSitioWeb — resuelve la función de SITIOS WEB configurada. Si hay un
 * servicio con endpoint, lo llama (POST { descripcion/prompt }) y guarda el
 * resultado (URL publicada o HTML) en la Biblioteca. Si NO hay servicio con
 * endpoint (el catálogo trae `starseed-sites` sin endpoint por defecto), genera
 * un HTML de plantilla LOCAL útil y lo guarda en la Biblioteca (fallback honesto,
 * no inventa una publicación remota).
 *
 * Nunca lanza. Devuelve { ok, message, data? }.
 */
export async function generarSitioWeb(
  descripcion: unknown,
  scope: OssScope = "user",
): Promise<ContentOutcome> {
  if (!isClient()) {
    return { ok: false, message: "Los sitios web se generan desde el navegador." };
  }
  const desc = toText(descripcion).trim();
  if (!desc) {
    return { ok: false, message: "¿Qué sitio web quieres? Descríbeme el propósito y el contenido." };
  }

  const resolved = resolveServiceFor("website", scope);
  const endpoint = trimTrailingSlash(resolved?.endpoint ?? "");
  const serviceName = resolved?.service?.name ?? "el generador de sitios";
  const serviceId = resolved?.service?.id ?? "";

  // ── Con endpoint configurado → llamamos al servicio de sitios ─────────────
  if (endpoint) {
    const timeoutMs = 30000;
    // Endpoint genérico de generación; toleramos varias formas de respuesta.
    const url = joinUrl(endpoint, "/generate");
    const res = await safeFetch<unknown>(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ descripcion: desc, prompt: desc }),
      },
      timeoutMs,
    );
    if (res.ok) {
      const site = extractSiteFromResponse(res.data, res.text);
      if (site.url) {
        const saved = saveToLibrary({ kind: "website", title: `Sitio: ${desc.slice(0, 60)}`, url: site.url, origin: serviceName });
        return {
          ok: true,
          message: `Generé el sitio con ${serviceName} y lo guardé en tu Biblioteca. Dime «abre la biblioteca» para abrirlo.`,
          data: { id: saved.id || undefined, serviceId, kind: "website", url: site.url },
        };
      }
      if (site.html) {
        const dataUrl = htmlToDataUrl(site.html);
        const saved = saveToLibrary({ kind: "html", title: `Sitio: ${desc.slice(0, 60)}`, url: dataUrl, origin: serviceName });
        return {
          ok: true,
          message: `${serviceName} generó el sitio y lo guardé en tu Biblioteca.`,
          data: { id: saved.id || undefined, serviceId, kind: "html", url: dataUrl },
        };
      }
      // Respondió OK pero no reconocimos el resultado → caemos a plantilla local.
    }
    // Falló o resultado no reconocido → fallback a plantilla local, avisando.
    const { html, titulo } = buildLocalSiteHtml(desc);
    const dataUrl = htmlToDataUrl(html);
    const saved = saveToLibrary({ kind: "html", title: titulo, url: dataUrl, origin: "Aurora" });
    return {
      ok: true,
      message: `No pude usar ${serviceName} esta vez, así que generé una página base con una plantilla y la guardé en tu Biblioteca. Revisa el servicio en /servicios para publicarlo.`,
      data: { id: saved.id || undefined, serviceId, kind: "html", url: dataUrl, fallback: true },
    };
  }

  // ── Sin endpoint → fallback local honesto (plantilla HTML real y guardada) ──
  const { html, titulo } = buildLocalSiteHtml(desc);
  const dataUrl = htmlToDataUrl(html);
  const saved = saveToLibrary({ kind: "html", title: titulo, url: dataUrl, origin: "Aurora" });
  if (!saved.ok) {
    return { ok: false, message: "No pude guardar el sitio en tu Biblioteca en este equipo." };
  }
  return {
    ok: true,
    message:
      "Generé una página base con una plantilla y la guardé en tu Biblioteca. Para generar y publicar sitios completos, conecta un servicio de sitios web en /servicios.",
    data: { id: saved.id, kind: "html", url: dataUrl, local: true },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// VÍDEO (opcional) — resuelve la función 'video' → servicio, o honesto
// ════════════════════════════════════════════════════════════════════════════

/**
 * generarVideo — resuelve la función de VÍDEO configurada. El catálogo no trae
 * un servicio de vídeo por defecto (category `video` sin servicios), así que en
 * la práctica esto degrada honestamente salvo que el usuario haya conectado uno.
 * Si hay endpoint, POST { prompt } y guarda la URL/base64 resultante; si no,
 * mensaje honesto → /servicios. Nunca lanza.
 */
export async function generarVideo(
  prompt: unknown,
  scope: OssScope = "user",
): Promise<ContentOutcome> {
  if (!isClient()) {
    return { ok: false, message: "La generación de vídeo se hace desde el navegador." };
  }
  const p = toText(prompt).trim();
  if (!p) {
    return { ok: false, message: "¿Qué vídeo quieres que genere? Descríbemelo." };
  }

  const resolved = resolveServiceFor("video", scope);
  const endpoint = trimTrailingSlash(resolved?.endpoint ?? "");
  const serviceName = resolved?.service?.name ?? "el servicio de vídeo";
  const serviceId = resolved?.service?.id ?? "";

  if (!endpoint) {
    return {
      ok: false,
      message:
        "Aún no hay un servicio de vídeo conectado. Conecta un endpoint de generación de vídeo en /servicios y podré crearlo.",
      data: { needsConfig: true, category: "video" },
    };
  }

  const timeoutMs = 120000;
  const url = joinUrl(endpoint, "/generate");
  const res = await safeFetch<unknown>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ prompt: p }),
    },
    timeoutMs,
  );
  if (!res.ok) {
    return { ok: false, message: netFailMessage(serviceName, res, timeoutMs), data: { serviceId, endpoint } };
  }
  // Toleramos { url } o { video } (URL/base64).
  let mediaUrl: string | null = null;
  if (res.data && typeof res.data === "object") {
    const o = res.data as Record<string, unknown>;
    for (const k of ["url", "video", "videoUrl", "video_url", "output", "data"]) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) {
        const s = v.trim();
        mediaUrl = /^data:|^https?:\/\//i.test(s) ? s : `data:video/mp4;base64,${s}`;
        break;
      }
    }
  }
  if (!mediaUrl && typeof res.text === "string" && /^https?:\/\//i.test(res.text.trim())) {
    mediaUrl = res.text.trim();
  }
  if (!mediaUrl) {
    return {
      ok: false,
      message: `${serviceName} respondió pero no reconocí el vídeo en el resultado. Revisa el servicio en /servicios.`,
      data: { serviceId, endpoint },
    };
  }
  const saved = saveToLibrary({ kind: "video", title: `Vídeo: ${p.slice(0, 60)}`, url: mediaUrl, origin: serviceName });
  return {
    ok: true,
    message: saved.ok
      ? `Generé el vídeo con ${serviceName} y lo guardé en tu Biblioteca.`
      : `Generé el vídeo con ${serviceName}, pero no pude guardarlo en la Biblioteca de este equipo.`,
    data: { id: saved.id || undefined, serviceId, kind: "video", url: mediaUrl },
  };
}
