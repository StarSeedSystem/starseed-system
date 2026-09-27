"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — DRIVER REAL de Google Drive (Ola 374)
 * ---------------------------------------------------------------------------
 * Segundo backend con I/O de verdad (tras GCS, Adenda 66 §13.1): lee, sube,
 * actualiza y borra archivos en la propia cuenta de Google Drive del usuario.
 *
 * SEGURIDAD — el driver NUNCA ve el refresh token (vive cifrado en servidor,
 * `credenciales-servidor.ts`): recibe solo un ACCESS TOKEN vigente (que su
 * llamador obtiene con `tokenVigente("google-drive")` de `carpetas-remotas.ts`,
 * que a su vez lo renueva contra `/api/storage/oauth/token`) y habla DIRECTO
 * contra `googleapis.com` con ese token — igual que hace ya
 * `listarCarpetasRemotas` para listar carpetas. Alcance real: `drive.file`
 * (Adenda 196) — el OS solo ve lo que él mismo crea o lo que el usuario eligió
 * explícitamente con el selector de Google.
 *
 * HONESTIDAD (misma regla que `gcs-driver.ts`): todo fallo vuelve como
 * `{ ok: false, error }` con el motivo REAL — nunca un éxito fingido.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const BOUNDARY = "starseed-drive-multipart-boundary";
const CARPETA_MIME = "application/vnd.google-apps.folder";

export interface DriveResult {
  ok: boolean;
  error?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  appProperties?: Record<string, string>;
  webViewLink?: string;
}

/** Backoff exponencial simple ante 429/5xx (2 reintentos, ~0.4s/0.8s). */
async function fetchConBackoff(url: string, init: RequestInit, intentos = 3): Promise<Response> {
  let ultima: Response | null = null;
  for (let i = 0; i < intentos; i++) {
    const r = await fetch(url, init);
    if (r.status !== 429 && r.status < 500) return r;
    ultima = r;
    if (i < intentos - 1) await new Promise((res) => setTimeout(res, 400 * 2 ** i));
  }
  return ultima as Response;
}

function auth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

/** Mensaje de error CLARO en español (para reconectar en 401/403). */
async function errorClaro(r: Response): Promise<string> {
  if (r.status === 401) return "La sesión de Google Drive caducó: reconecta tu cuenta.";
  if (r.status === 403) return "Google Drive denegó el acceso (permiso insuficiente, cuota de la API superada, o el archivo no lo creó esta app — recuerda que el alcance es «drive.file»).";
  const texto = await r.text().catch(() => "");
  return `Google Drive respondió ${r.status}.${texto ? ` ${texto.slice(0, 300)}` : ""}`;
}

/** Escapa comillas simples para una cláusula `q=` de la API de Drive. */
function escaparQ(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/* ── Prueba de conexión ──────────────────────────────────────────────────── */

export interface DriveAboutResult extends DriveResult {
  email?: string;
  limiteBytes?: number;
  usoBytes?: number;
}

/** PRUEBA DE CONEXIÓN REAL: `about` con el token vigente. */
export async function probarDrive(token: string): Promise<DriveAboutResult> {
  try {
    const r = await fetchConBackoff(`${API}/about?fields=user,storageQuota`, { headers: auth(token) });
    if (!r.ok) return { ok: false, error: await errorClaro(r) };
    const j = (await r.json()) as { user?: { emailAddress?: string }; storageQuota?: { limit?: string; usage?: string } };
    return {
      ok: true,
      email: j.user?.emailAddress,
      limiteBytes: j.storageQuota?.limit ? Number(j.storageQuota.limit) : undefined,
      usoBytes: j.storageQuota?.usage ? Number(j.storageQuota.usage) : undefined,
    };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al probar Google Drive." };
  }
}

/* ── Carpetas ─────────────────────────────────────────────────────────────── */

async function buscarCarpetaHija(token: string, padre: string, nombre: string): Promise<DriveFile | null> {
  const q = `mimeType='${CARPETA_MIME}' and trashed=false and name='${escaparQ(nombre)}' and '${padre}' in parents`;
  const r = await fetchConBackoff(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`, { headers: auth(token) });
  if (!r.ok) return null;
  const j = (await r.json()) as { files?: DriveFile[] };
  return j.files?.[0] ?? null;
}

async function crearCarpeta(token: string, padre: string, nombre: string, rutaCompleta: string): Promise<DriveFile | null> {
  const r = await fetchConBackoff(`${API}/files?fields=id,name`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: nombre,
      mimeType: CARPETA_MIME,
      parents: [padre],
      appProperties: { starseedRuta: rutaCompleta },
    }),
  });
  if (!r.ok) return null;
  return (await r.json()) as DriveFile;
}

/**
 * Garantiza la ruta de carpetas dada (p. ej. `["StarSeed","cerebros","Mi cerebro"]`),
 * creando solo lo que falte, y devuelve el id de la carpeta FINAL. Cada nivel
 * se busca por nombre bajo su padre (no por `appProperties`: el nombre visible
 * ES la ruta que el usuario ve en su Drive) y se marca con `appProperties.starseedRuta`
 * para que una búsqueda futura no dependa del idioma/orden de argumentos.
 */
export async function asegurarCarpeta(token: string, ruta: string[]): Promise<DriveResult & { folderId?: string }> {
  try {
    let padre = "root";
    const acumulado: string[] = [];
    for (const segmento of ruta) {
      acumulado.push(segmento);
      const existente = await buscarCarpetaHija(token, padre, segmento);
      if (existente) {
        padre = existente.id;
        continue;
      }
      const creada = await crearCarpeta(token, padre, segmento, acumulado.join("/"));
      if (!creada) return { ok: false, error: `No se pudo crear la carpeta «${segmento}» en Google Drive.` };
      padre = creada.id;
    }
    return { ok: true, folderId: padre };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al asegurar la carpeta en Google Drive." };
  }
}

/* ── Búsqueda por metadatos (appProperties) ──────────────────────────────── */

/**
 * Busca archivos (no carpetas) por sus `appProperties` exactas (p. ej.
 * `{ brainId, memoryId }`). Es la clave de deduplicación del sync de memoria:
 * en vez de fiarse del `fileId` guardado localmente (puede estar rancio si el
 * usuario borró/movió el archivo en Drive), se puede reencontrar por estas
 * propiedades.
 */
export async function buscarPorPropiedades(
  token: string,
  props: Record<string, string>,
  opciones?: { carpetaId?: string },
): Promise<DriveResult & { archivos: DriveFile[] }> {
  try {
    const clausulas = Object.entries(props).map(
      ([k, v]) => `appProperties has { key='${escaparQ(k)}' and value='${escaparQ(v)}' }`,
    );
    clausulas.push("trashed=false");
    clausulas.push(`mimeType!='${CARPETA_MIME}'`);
    if (opciones?.carpetaId) clausulas.push(`'${opciones.carpetaId}' in parents`);
    const q = clausulas.join(" and ");
    const url = `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,appProperties,webViewLink)&pageSize=50`;
    const r = await fetchConBackoff(url, { headers: auth(token) });
    if (!r.ok) return { ok: false, error: await errorClaro(r), archivos: [] };
    const j = (await r.json()) as { files?: DriveFile[] };
    return { ok: true, archivos: j.files ?? [] };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al buscar en Google Drive.", archivos: [] };
  }
}

/** Lista los archivos (no carpetas) dentro de una carpeta, con sus metadatos. */
export async function listarArchivosDeCarpeta(token: string, carpetaId: string): Promise<DriveResult & { archivos: DriveFile[] }> {
  try {
    const q = `'${carpetaId}' in parents and trashed=false and mimeType!='${CARPETA_MIME}'`;
    const url = `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,appProperties,webViewLink)&pageSize=200`;
    const r = await fetchConBackoff(url, { headers: auth(token) });
    if (!r.ok) return { ok: false, error: await errorClaro(r), archivos: [] };
    const j = (await r.json()) as { files?: DriveFile[] };
    return { ok: true, archivos: j.files ?? [] };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al listar Google Drive.", archivos: [] };
  }
}

/* ── Subir / actualizar / descargar / borrar ─────────────────────────────── */

/**
 * Cuerpo `multipart/related` (metadatos JSON + contenido) para la subida
 * inicial. Acepta texto (markdown de memorias: un `string`) o binario
 * (réplica de archivos genéricos: un `Blob`) — el resultado siempre es un
 * `Blob` que `fetch` envía igual en ambos casos.
 */
function cuerpoMultipart(metadata: Record<string, unknown>, contenido: string | Blob, mime: string): Blob {
  const cabecera = `--${BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${BOUNDARY}\r\nContent-Type: ${mime}\r\n\r\n`;
  const cierre = `\r\n--${BOUNDARY}--`;
  return new Blob([cabecera, contenido, cierre]);
}

/** SUBE un archivo NUEVO a una carpeta, con `appProperties` para poder reencontrarlo. */
export async function subirArchivo(
  token: string,
  opts: { carpetaId: string; nombre: string; contenido: string | Blob; mime?: string; appProperties?: Record<string, string> },
): Promise<DriveResult & { fileId?: string; modifiedTime?: string }> {
  const mime = opts.mime || (typeof opts.contenido === "string" ? "text/markdown" : "application/octet-stream");
  try {
    const metadata = { name: opts.nombre, parents: [opts.carpetaId], appProperties: opts.appProperties || {} };
    const r = await fetchConBackoff(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime`, {
      method: "POST",
      headers: { ...auth(token), "Content-Type": `multipart/related; boundary=${BOUNDARY}` },
      body: cuerpoMultipart(metadata, opts.contenido, mime),
    });
    if (!r.ok) return { ok: false, error: await errorClaro(r) };
    const j = (await r.json()) as DriveFile;
    return { ok: true, fileId: j.id, modifiedTime: j.modifiedTime };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al subir a Google Drive." };
  }
}

/** ACTUALIZA el CONTENIDO de un archivo existente (no toca metadatos/appProperties). */
export async function actualizarArchivo(
  token: string,
  fileId: string,
  contenido: string | Blob,
  mime?: string,
): Promise<DriveResult & { modifiedTime?: string }> {
  try {
    const contentType = mime || (typeof contenido === "string" ? "text/markdown" : "application/octet-stream");
    const r = await fetchConBackoff(`${UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`, {
      method: "PATCH",
      headers: { ...auth(token), "Content-Type": contentType },
      body: contenido,
    });
    if (!r.ok) return { ok: false, error: await errorClaro(r) };
    const j = (await r.json()) as DriveFile;
    return { ok: true, modifiedTime: j.modifiedTime };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al actualizar en Google Drive." };
  }
}

/** DESCARGA el contenido (texto) de un archivo propio. */
export async function descargar(token: string, fileId: string): Promise<DriveResult & { contenido?: string }> {
  try {
    const r = await fetchConBackoff(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: auth(token) });
    if (!r.ok) return { ok: false, error: await errorClaro(r) };
    return { ok: true, contenido: await r.text() };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al descargar de Google Drive." };
  }
}

/** DESCARGA el contenido BINARIO (Blob) de un archivo propio (réplica de archivos genéricos). */
export async function descargarBlob(token: string, fileId: string): Promise<DriveResult & { blob?: Blob }> {
  try {
    const r = await fetchConBackoff(`${API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: auth(token) });
    if (!r.ok) return { ok: false, error: await errorClaro(r) };
    return { ok: true, blob: await r.blob() };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al descargar de Google Drive." };
  }
}

/** BORRA un archivo (o carpeta) propio. 404 se trata como éxito (ya no está). */
export async function borrar(token: string, fileId: string): Promise<DriveResult> {
  try {
    const r = await fetchConBackoff(`${API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers: auth(token) });
    if (r.ok || r.status === 404) return { ok: true };
    return { ok: false, error: await errorClaro(r) };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al borrar en Google Drive." };
  }
}

/**
 * Enlace para ABRIR el archivo en la interfaz de Google Drive (`webViewLink`).
 * HONESTIDAD: a diferencia de la URL firmada de GCS, esto NO es un blob
 * descargable sin sesión — requiere estar conectado con la cuenta de Google
 * dueña del archivo. Para el contenido en bruto, usa `descargar()`.
 */
export async function obtenerEnlaceVista(token: string, fileId: string): Promise<DriveResult & { url?: string }> {
  try {
    const r = await fetchConBackoff(`${API}/files/${encodeURIComponent(fileId)}?fields=webViewLink`, { headers: auth(token) });
    if (!r.ok) return { ok: false, error: await errorClaro(r) };
    const j = (await r.json()) as { webViewLink?: string };
    return { ok: true, url: j.webViewLink };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error de red al pedir el enlace de Google Drive." };
  }
}
