// ════════════════════════════════════════════════════════════════
// Postiz — publicación en REDES SOCIALES por endpoint (Adenda 67 · P4-8)
// ----------------------------------------------------------------
// QUÉ ES: gestor open source (AGPL-3.0) de publicación/programación en redes
// sociales — alternativa a Buffer/Hypefury. Soporta ~32 plataformas (X,
// LinkedIn, Instagram, Mastodon, Bluesky, Telegram, Discord, Reddit,
// YouTube, TikTok…). Es un SERVIDOR: el usuario lo auto-hospeda (Docker) o usa
// su nube. No corre en el navegador.
//
// API PÚBLICA REAL (docs.postiz.com/public-api · verificada con curl):
//   Base:  https://api.postiz.com/public/v1     (nube)
//          {BACKEND_URL}/public/v1              (auto-hospedado)
//   Auth:  cabecera `Authorization: <api-key>`  ← ¡EN CRUDO, sin «Bearer»!
//          (verificado: sin clave devuelve 401 {"msg":"No API Key found"})
//   · GET  /integrations   → canales conectados (la UI los llama «channels»,
//                            la API «integrations»).
//   · POST /upload         → sube un fichero (multipart) y devuelve {id, path}.
//   · POST /posts          → crea/programa la publicación.
//   Límite: 90 req/h en crear post (100 en la nube). Configurable con API_LIMIT.
//
// ⚠️ REGLA DE SEGURIDAD DEL OS (irrenunciable): publicar fuera de StarSeed es una
// acción con EFECTOS IRREVERSIBLES en cuentas ajenas al usuario. Este cliente
// NUNCA se invoca solo: siempre detrás de una confirmación EXPLÍCITA del usuario
// (ver src/components/creation/social-crosspost.tsx). Aurora puede PREPARAR el
// borrador, jamás publicarlo por su cuenta.
// ════════════════════════════════════════════════════════════════

import type { IntegrationConfig, IntegrationResult } from "../types";
import { proxyFetch, extra } from "./_proxy";

const ID = "postiz";

/** Base pública por defecto de la nube de Postiz. */
export const POSTIZ_CLOUD = "https://api.postiz.com";

/** Prefijo de la API pública (constante en nube y self-host). */
const API = "/public/v1";

/** Postiz manda la clave EN CRUDO en `Authorization` (no es Bearer). */
function pzHeaders(cfg: IntegrationConfig): Record<string, string> {
  const key = (cfg.apiKey || "").trim();
  return key ? { Authorization: key } : {};
}

/** Un canal/red conectada en Postiz. */
export interface PostizChannel {
  id: string;
  name: string;
  /** Identificador de plataforma (x, linkedin, mastodon, bluesky, telegram…). */
  platform: string;
  picture?: string;
  disabled?: boolean;
}

/** Salud + listado de canales (`GET /integrations`). Es también el "ping" real. */
export async function integrations(cfg: IntegrationConfig): Promise<IntegrationResult> {
  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || POSTIZ_CLOUD,
    method: "GET",
    path: `${API}/integrations`,
    auth: "none",
    headers: pzHeaders(cfg),
    timeoutMs: 12_000,
  });
  if (!res.ok) return res;

  const arr = Array.isArray(res.data) ? res.data : (res.data as any)?.integrations ?? [];
  const channels: PostizChannel[] = (Array.isArray(arr) ? arr : []).map((c: any) => ({
    id: String(c?.id ?? ""),
    name: String(c?.name ?? c?.username ?? "Canal"),
    platform: String(c?.identifier ?? c?.providerIdentifier ?? c?.platform ?? "desconocida"),
    picture: typeof c?.picture === "string" ? c.picture : undefined,
    disabled: c?.disabled === true,
  }));
  return { ok: true, data: { channels } };
}

/** Salud: reutiliza `/integrations` (única ruta pública que confirma la clave). */
export async function health(cfg: IntegrationConfig): Promise<IntegrationResult> {
  if (!(cfg.apiKey || "").trim()) {
    return { ok: false, error: "Postiz necesita tu clave (Ajustes → Desarrolladores → Public API)." };
  }
  const res = await integrations(cfg);
  if (!res.ok) return res;
  const n = (res.data?.channels as PostizChannel[] | undefined)?.length ?? 0;
  return { ok: true, data: { channels: n, message: `Conectado. ${n} canal(es) disponibles.` } };
}

export interface PostizPublishInput {
  /** Texto de la publicación. */
  content: string;
  /** Ids de los canales/integraciones donde publicar (elegidos por el usuario). */
  channelIds: string[];
  /** `now` = publicar ya · `schedule` = programar en `date` (ISO). */
  when?: "now" | "schedule";
  /** Fecha ISO (solo para `schedule`). */
  date?: string;
  /** Imágenes ya subidas ({id, path}) — usa `upload()` antes. */
  images?: { id: string; path: string }[];
  /** `__type` por canal (x, linkedin, mastodon…). Si falta, se manda `{}` mínimo. */
  platformByChannel?: Record<string, string>;
}

/**
 * PUBLICA de verdad en las redes elegidas (`POST /posts`).
 *
 * ⚠️ Efecto irreversible. Este método solo debe llamarse tras una confirmación
 * EXPLÍCITA del usuario, con la lista de canales a la vista.
 */
export async function publish(cfg: IntegrationConfig, input: PostizPublishInput): Promise<IntegrationResult> {
  const content = (input?.content ?? "").trim();
  if (!content) return { ok: false, error: "La publicación está vacía." };
  const ids = (input?.channelIds ?? []).filter((x) => typeof x === "string" && x.trim());
  if (!ids.length) return { ok: false, error: "Elige al menos un canal donde publicar." };
  if (!(cfg.apiKey || "").trim()) return { ok: false, error: "Falta la clave de Postiz." };

  const when = input.when === "schedule" ? "schedule" : "now";
  const date = input.date?.trim() || new Date().toISOString();
  const images = (input.images ?? []).filter((i) => i?.id && i?.path);

  const body = {
    type: when,
    date,
    shortLink: false,
    tags: [] as unknown[],
    posts: ids.map((id) => {
      const platform = input.platformByChannel?.[id];
      return {
        integration: { id },
        value: [{ content, image: images }],
        // El schema exige `settings.__type` con el identificador de la plataforma.
        // Si no lo conocemos, mandamos un objeto vacío: Postiz responde 400 con un
        // mensaje claro y el usuario lo verá tal cual (nada silencioso).
        settings: platform ? { __type: platform } : {},
      };
    }),
  };

  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || POSTIZ_CLOUD,
    method: "POST",
    path: `${API}/posts`,
    body,
    auth: "none",
    headers: pzHeaders(cfg),
    timeoutMs: 20_000,
  });
  if (!res.ok) {
    // 429 = límite horario de creación de posts (90/h por defecto).
    if (/429|Too Many/i.test(res.error || "")) {
      return { ok: false, error: "Postiz ha alcanzado su límite horario de publicaciones (90/h). Inténtalo más tarde." };
    }
    return res;
  }
  return { ok: true, data: { published: ids.length, when, raw: res.data } };
}

/**
 * Sube una imagen a Postiz para adjuntarla a la publicación.
 * NOTA HONESTA: `POST /upload` es multipart. Nuestro proxy JSON no reenvía
 * ficheros binarios, así que aquí solo aceptamos una URL PÚBLICA ya alojada
 * (la de la propia Biblioteca del OS), que es el caso real del crossposting:
 * la imagen ya vive en StarSeed. Si Postiz rechaza la URL, se dice sin adornos.
 */
export async function attachByUrl(cfg: IntegrationConfig, url: string): Promise<IntegrationResult> {
  const u = (url || "").trim();
  if (!/^https?:\/\//i.test(u)) return { ok: false, error: "La imagen debe tener una URL pública (https)." };
  const custom = extra(cfg, "uploadPath");
  const res = await proxyFetch({
    id: ID,
    endpoint: cfg.endpoint || POSTIZ_CLOUD,
    method: "POST",
    path: custom || `${API}/upload`,
    body: { url: u },
    auth: "none",
    headers: pzHeaders(cfg),
    timeoutMs: 20_000,
  });
  if (!res.ok) return res;
  const d = res.data as { id?: string; path?: string } | null;
  if (d?.id && d?.path) return { ok: true, data: { id: String(d.id), path: String(d.path) } };
  return { ok: false, error: "Postiz no devolvió {id, path} para la imagen." };
}
