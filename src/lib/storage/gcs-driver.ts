"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — DRIVER REAL de Google Cloud Storage (Adenda 66 §13.1)
 * ---------------------------------------------------------------------------
 * Primer backend EXTERNO con I/O de verdad (ya no andamiaje): sube, lee y borra
 * objetos en el bucket soberano del OS (`gs://starseed-os-334237619848`).
 *
 * SEGURIDAD — ninguna credencial de Google toca el navegador:
 *   navegador → `/api/storage/gcs/sign` (Node, exige sesión Supabase, aísla al
 *   usuario en su prefijo `<uid>/…`) → URL firmada V4 de 10 min → el navegador
 *   hace el PUT/GET/DELETE **directo contra GCS** con esa URL.
 *
 * HONESTIDAD (regla del repo tras el bug de esta semana): este driver NUNCA
 * devuelve éxito falso. Todo fallo vuelve como `{ ok: false, error }` con el
 * motivo REAL (sin sesión, sin credencial en el servidor, permisos de IAM,
 * CORS, red…) para que la UI pueda enseñarlo. Nada se traga en silencio.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type GcsMethod = "GET" | "PUT" | "DELETE";

export interface GcsSignResult {
    ok: boolean;
    url?: string;
    path?: string;
    bucket?: string;
    project?: string;
    contentType?: string | null;
    expiresAt?: string;
    /** De dónde salió la credencial en el servidor: clave de SA (Vercel) o ADC (Cloud Run). */
    credentials?: "sa-key" | "adc";
    error?: string;
}

export interface GcsResult {
    ok: boolean;
    /** Ruta final dentro del bucket (siempre bajo `<uid>/`). */
    path?: string;
    bucket?: string;
    /** URL firmada de lectura (solo en `getGcsUrl`, caduca en ~10 min). */
    url?: string;
    error?: string;
}

export interface GcsStatus {
    ok: boolean;
    /** Hay credencial en el servidor (aunque la firma pudiera fallar por permisos). */
    configured: boolean;
    credentials: "sa-key" | "adc" | "none";
    bucket?: string;
    project?: string;
    error?: string;
}

const SIGN_ENDPOINT = "/api/storage/gcs/sign";

function isClient(): boolean {
    return typeof window !== "undefined";
}

/** Pide al servidor una URL firmada V4. Nunca lanza: devuelve `{ok:false,error}`. */
export async function signGcs(path: string, method: GcsMethod, contentType?: string): Promise<GcsSignResult> {
    if (!isClient()) return { ok: false, error: "El driver de GCS solo funciona en el navegador." };
    try {
        const res = await fetch(SIGN_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, method, contentType }),
            cache: "no-store",
        });
        let json: GcsSignResult | null = null;
        try {
            json = (await res.json()) as GcsSignResult;
        } catch {
            /* respuesta no-JSON */
        }
        if (!res.ok || !json?.ok || !json.url) {
            return {
                ok: false,
                error:
                    json?.error ||
                    (res.status === 401
                        ? "Inicia sesión para usar Google Cloud Storage."
                        : `El servidor no pudo firmar la URL (HTTP ${res.status}).`),
            };
        }
        return json;
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "Error de red al pedir la URL firmada." };
    }
}

/** PUT del blob a la URL firmada con progreso real (XHR). */
function putWithProgress(
    url: string,
    body: Blob,
    contentType: string,
    onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; status: number; error?: string }> {
    return new Promise((resolve) => {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", url, true);
            // El Content-Type DEBE coincidir con el firmado o GCS responde 403.
            xhr.setRequestHeader("Content-Type", contentType);
            if (xhr.upload && onProgress) {
                xhr.upload.onprogress = (evt) => {
                    if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100));
                };
            }
            xhr.onload = () =>
                resolve({
                    ok: xhr.status >= 200 && xhr.status < 300,
                    status: xhr.status,
                    error:
                        xhr.status >= 200 && xhr.status < 300
                            ? undefined
                            : `Google Cloud Storage respondió ${xhr.status}. ${(xhr.responseText || "").slice(0, 300)}`,
                });
            xhr.onerror = () =>
                resolve({
                    ok: false,
                    status: 0,
                    error:
                        "No se pudo contactar con Google Cloud Storage (red o CORS). El bucket debe permitir el origen " +
                        "de esta app con los métodos PUT/GET/DELETE.",
                });
            xhr.send(body);
        } catch (e) {
            resolve({ ok: false, status: 0, error: (e as Error)?.message || "Error al enviar el archivo a GCS." });
        }
    });
}

/**
 * SUBE un archivo REAL a GCS bajo `<uid>/<path>`. El servidor fuerza el prefijo
 * del usuario, así que `path` puede darse con o sin él.
 */
export async function uploadToGcs(
    file: File | Blob,
    path: string,
    options: { contentType?: string; onProgress?: (pct: number) => void } = {},
): Promise<GcsResult> {
    if (!file) return { ok: false, error: "Archivo inválido." };
    const contentType =
        options.contentType || (file instanceof File ? file.type : (file as Blob).type) || "application/octet-stream";

    const signed = await signGcs(path, "PUT", contentType);
    if (!signed.ok || !signed.url) return { ok: false, error: signed.error ?? "No se pudo firmar la subida." };

    options.onProgress?.(0);
    const put = await putWithProgress(signed.url, file, contentType, options.onProgress);
    if (!put.ok) return { ok: false, path: signed.path, bucket: signed.bucket, error: put.error };
    options.onProgress?.(100);
    return { ok: true, path: signed.path, bucket: signed.bucket };
}

/**
 * URL de LECTURA firmada (10 min) de un objeto propio. El bucket es privado
 * (uniform bucket-level access): no hay URL pública permanente, por diseño.
 */
export async function getGcsUrl(path: string): Promise<GcsResult> {
    const signed = await signGcs(path, "GET");
    if (!signed.ok || !signed.url) return { ok: false, error: signed.error ?? "No se pudo firmar la lectura." };
    return { ok: true, url: signed.url, path: signed.path, bucket: signed.bucket };
}

/** BORRA un objeto propio de GCS. */
export async function deleteFromGcs(path: string): Promise<GcsResult> {
    const signed = await signGcs(path, "DELETE");
    if (!signed.ok || !signed.url) return { ok: false, error: signed.error ?? "No se pudo firmar el borrado." };
    try {
        const res = await fetch(signed.url, { method: "DELETE", cache: "no-store" });
        // 404 = ya no está: para un borrado, el resultado deseado se cumple igual.
        if (res.ok || res.status === 404) return { ok: true, path: signed.path, bucket: signed.bucket };
        const txt = await res.text().catch(() => "");
        return {
            ok: false,
            path: signed.path,
            error: `Google Cloud Storage respondió ${res.status} al borrar. ${txt.slice(0, 300)}`,
        };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "Error de red al borrar en GCS." };
    }
}

/**
 * PRUEBA DE CONEXIÓN REAL: pide al servidor que firme una URL de sonda. Si esto
 * sale `ok`, subir/leer/borrar funciona de verdad (misma credencial, mismo
 * bucket). Si no, devuelve el motivo exacto.
 */
export async function testGcs(): Promise<GcsStatus> {
    if (!isClient()) return { ok: false, configured: false, credentials: "none", error: "Solo en el navegador." };
    try {
        const res = await fetch(SIGN_ENDPOINT, { method: "GET", cache: "no-store" });
        const json = (await res.json()) as Partial<GcsStatus> & { error?: string };
        return {
            ok: !!json.ok,
            configured: !!json.configured,
            credentials: (json.credentials as GcsStatus["credentials"]) ?? "none",
            bucket: json.bucket,
            project: json.project,
            error: json.error,
        };
    } catch (e) {
        return {
            ok: false,
            configured: false,
            credentials: "none",
            error: (e as Error)?.message || "No se pudo consultar el estado de Google Cloud Storage.",
        };
    }
}
