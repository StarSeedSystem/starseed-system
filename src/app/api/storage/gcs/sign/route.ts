/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — FIRMA DE URLs V4 PARA GOOGLE CLOUD STORAGE (Adenda 66 §13.1)
 * ---------------------------------------------------------------------------
 * Convierte GCS en un backend REAL de almacenamiento (subir / leer / borrar de
 * verdad) SIN exponer jamás una credencial de Google en el navegador.
 *
 * CÓMO FUNCIONA
 *   1. El navegador pide aquí una **URL firmada V4** de vida corta (10 min).
 *   2. Esta ruta (Node runtime, NUNCA edge) verifica que hay **sesión de
 *      Supabase válida** y firma la URL con la credencial del servidor.
 *   3. El navegador hace el PUT/GET/DELETE **directo contra GCS** con esa URL.
 *      La credencial nunca sale del servidor; la URL caduca sola.
 *
 * AISLAMIENTO POR USUARIO (misma regla que `os-files.ts` en Supabase Storage)
 *   Todo objeto vive bajo el prefijo `<uid>/…`. Esta ruta FUERZA ese prefijo y
 *   RECHAZA (403) cualquier ruta que apunte fuera de él (otro uid, `..`, rutas
 *   absolutas…). Un usuario no puede firmar nada sobre los archivos de otro.
 *
 * CREDENCIALES — dos caminos, ambos implementados
 *   · **Cloud Run** (espejo soberano): ADC automática. Firmar V4 sin clave
 *     privada usa la IAM API `signBlob`, así que la service account del
 *     servicio necesita el rol `roles/iam.serviceAccountTokenCreator` SOBRE SÍ
 *     MISMA. Si falta, se devuelve un error CLARO (no se simula éxito).
 *   · **Vercel** (primario): no hay ADC → hace falta `GCP_SA_KEY_JSON` (JSON de
 *     una service account, en texto plano o en base64).
 *   Si no hay ninguno de los dos: 501 con explicación honesta.
 *
 * ENV: GCP_PROJECT_ID (def. gen-lang-client-0222660240)
 *      GCS_BUCKET     (def. starseed-os-334237619848)
 *      GCP_SA_KEY_JSON (solo Vercel / entornos sin ADC)
 *
 * El BUCKET lo decide SIEMPRE el servidor (env), nunca el cliente: si el
 * navegador pudiera elegir bucket, podría firmar escrituras sobre cualquier
 * bucket al que la service account tenga acceso.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PROJECT = "gen-lang-client-0222660240";
const DEFAULT_BUCKET = "starseed-os-334237619848";
/** Vida de la URL firmada. Corta a propósito: 10 minutos. */
const EXPIRES_MS = 10 * 60 * 1000;

type GcsMethod = "GET" | "PUT" | "DELETE";
const METHODS: GcsMethod[] = ["GET", "PUT", "DELETE"];

type CredentialSource = "sa-key" | "adc";

function projectId(): string {
    return process.env.GCP_PROJECT_ID?.trim() || DEFAULT_PROJECT;
}

function bucketName(): string {
    return process.env.GCS_BUCKET?.trim() || DEFAULT_BUCKET;
}

/** Lee `GCP_SA_KEY_JSON` (texto plano o base64). Devuelve null si no está o no es válida. */
function readServiceAccountKey(): { client_email: string; private_key: string; project_id?: string } | null {
    const raw = process.env.GCP_SA_KEY_JSON?.trim();
    if (!raw) return null;
    let text = raw;
    if (!text.startsWith("{")) {
        try {
            text = Buffer.from(raw, "base64").toString("utf8");
        } catch {
            return null;
        }
    }
    try {
        const json = JSON.parse(text) as { client_email?: string; private_key?: string; project_id?: string };
        if (!json.client_email || !json.private_key) return null;
        return {
            client_email: json.client_email,
            // Las claves pegadas en un panel de env suelen traer los \n escapados.
            private_key: json.private_key.replace(/\\n/g, "\n"),
            project_id: json.project_id,
        };
    } catch {
        return null;
    }
}

/**
 * Cliente de Storage + de dónde salió la credencial. `null` si no hay ninguna
 * vía disponible (ni clave de SA ni ADC) — en ese caso NO se simula éxito.
 */
function getStorage(): { storage: Storage; source: CredentialSource } | null {
    const key = readServiceAccountKey();
    if (key) {
        return {
            storage: new Storage({
                projectId: key.project_id || projectId(),
                credentials: { client_email: key.client_email, private_key: key.private_key },
            }),
            source: "sa-key",
        };
    }
    // ADC: en Cloud Run / GCE existe siempre (metadata server). En Vercel NO.
    // Si no hay ADC, `getSignedUrl` fallará y lo reportamos con honestidad.
    const hasAdc =
        !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        !!process.env.K_SERVICE || // Cloud Run
        !!process.env.GAE_SERVICE ||
        !!process.env.GCE_METADATA_HOST ||
        !!process.env.GOOGLE_CLOUD_PROJECT;
    if (!hasAdc) return null;
    return { storage: new Storage({ projectId: projectId() }), source: "adc" };
}

function noCredsResponse() {
    return NextResponse.json(
        {
            ok: false,
            error:
                "Google Cloud Storage no está configurado en este servidor. En Cloud Run funciona automáticamente (ADC); " +
                "en Vercel hace falta la variable de entorno GCP_SA_KEY_JSON con el JSON de una service account " +
                "(texto plano o base64) con permiso de Storage Object Admin sobre el bucket.",
            code: "gcs_not_configured",
        },
        { status: 501 },
    );
}

/** Usuario autenticado (Supabase). null si no hay sesión válida. */
async function currentUserId(): Promise<string | null> {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getUser();
        if (error) return null;
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ResolvedPath {
    ok: boolean;
    /** Ruta final dentro del bucket, SIEMPRE bajo `<uid>/`. */
    path?: string;
    error?: string;
}

/**
 * Aísla al usuario: normaliza la ruta y garantiza el prefijo `<uid>/`.
 * Rechaza `..`, rutas absolutas, control chars y prefijos de OTRO usuario.
 */
function resolveUserPath(rawPath: unknown, uid: string): ResolvedPath {
    if (typeof rawPath !== "string" || !rawPath.trim()) {
        return { ok: false, error: "Falta la ruta del objeto (`path`)." };
    }
    let p = rawPath.trim().replace(/\\/g, "/");
    for (let i = 0; i < p.length; i++) {
        const code = p.charCodeAt(i);
        if (code < 32 || code === 127) return { ok: false, error: "La ruta contiene caracteres no válidos." };
    }
    p = p.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    const segments = p.split("/").filter(Boolean);
    if (segments.length === 0) return { ok: false, error: "Ruta vacía." };
    if (segments.some((s) => s === "." || s === "..")) {
        return { ok: false, error: "Ruta no permitida (no se admite `..`)." };
    }
    // ¿Primer segmento = uuid de OTRO usuario? → prohibido.
    if (UUID_RE.test(segments[0]) && segments[0].toLowerCase() !== uid.toLowerCase()) {
        return { ok: false, error: "No puedes acceder a los archivos de otra cuenta." };
    }
    const full = segments[0].toLowerCase() === uid.toLowerCase() ? segments.join("/") : [uid, ...segments].join("/");
    if (!full.startsWith(`${uid}/`) || full.length <= uid.length + 1) {
        return { ok: false, error: "Ruta fuera de tu espacio de almacenamiento." };
    }
    if (full.length > 900) return { ok: false, error: "La ruta es demasiado larga." };
    return { ok: true, path: full };
}

function humanSignError(e: unknown): string {
    const msg = (e as Error)?.message || String(e);
    if (/iam\.serviceAccounts\.signBlob|permission/i.test(msg)) {
        return (
            "Google rechazó la firma por permisos: la service account necesita el rol " +
            "`roles/iam.serviceAccountTokenCreator` sobre sí misma (firma V4 vía IAM signBlob en Cloud Run), " +
            "o define GCP_SA_KEY_JSON con una clave privada. Detalle: " +
            msg
        );
    }
    if (/Could not load the default credentials|Unable to detect a Project Id|metadata/i.test(msg)) {
        return (
            "No hay credenciales de Google en este servidor (no se detectó ADC). En Vercel define GCP_SA_KEY_JSON. Detalle: " +
            msg
        );
    }
    return `No se pudo firmar la URL de Google Cloud Storage: ${msg}`;
}

/**
 * POST — devuelve una URL firmada V4 (10 min) para `path` y `method`.
 * Body: { path: string, method: "GET"|"PUT"|"DELETE", contentType?: string }
 */
export async function POST(req: NextRequest) {
    const uid = await currentUserId();
    if (!uid) {
        return NextResponse.json(
            { ok: false, error: "Necesitas iniciar sesión para usar el almacenamiento en Google Cloud." },
            { status: 401 },
        );
    }

    let body: { path?: unknown; method?: unknown; contentType?: unknown };
    try {
        body = (await req.json()) as typeof body;
    } catch {
        return NextResponse.json({ ok: false, error: "Petición inválida (no es JSON)." }, { status: 400 });
    }

    const method = String(body.method || "GET").toUpperCase() as GcsMethod;
    if (!METHODS.includes(method)) {
        return NextResponse.json({ ok: false, error: `Método no soportado: ${method}.` }, { status: 400 });
    }

    const resolved = resolveUserPath(body.path, uid);
    if (!resolved.ok || !resolved.path) {
        return NextResponse.json({ ok: false, error: resolved.error ?? "Ruta inválida." }, { status: 403 });
    }

    const creds = getStorage();
    if (!creds) return noCredsResponse();

    const contentType =
        method === "PUT" && typeof body.contentType === "string" && body.contentType.trim()
            ? body.contentType.trim()
            : undefined;

    const expiresAt = Date.now() + EXPIRES_MS;
    try {
        const [url] = await creds.storage
            .bucket(bucketName())
            .file(resolved.path)
            .getSignedUrl({
                version: "v4",
                action: method === "PUT" ? "write" : method === "DELETE" ? "delete" : "read",
                expires: expiresAt,
                ...(contentType ? { contentType } : {}),
            });

        return NextResponse.json({
            ok: true,
            url,
            method,
            path: resolved.path,
            bucket: bucketName(),
            project: projectId(),
            contentType: contentType ?? null,
            expiresAt: new Date(expiresAt).toISOString(),
            credentials: creds.source,
        });
    } catch (e) {
        return NextResponse.json({ ok: false, error: humanSignError(e) }, { status: 502 });
    }
}

/**
 * GET — PRUEBA DE CONEXIÓN REAL (la usa el panel `/almacenes`): firma de verdad
 * una URL de lectura sobre una ruta sonda del propio usuario. Firmar no crea ni
 * lee nada, pero SÍ ejercita la credencial: si esto responde `ok`, subir/leer/
 * borrar funcionará. Cualquier fallo se devuelve tal cual, sin maquillar.
 */
export async function GET() {
    const uid = await currentUserId();
    if (!uid) {
        return NextResponse.json(
            { ok: false, error: "Inicia sesión para comprobar el estado de Google Cloud Storage." },
            { status: 401 },
        );
    }

    const creds = getStorage();
    if (!creds) {
        return NextResponse.json(
            {
                ok: false,
                configured: false,
                credentials: "none",
                bucket: bucketName(),
                project: projectId(),
                error:
                    "Sin credenciales de Google en este servidor. Cloud Run: automático (ADC). " +
                    "Vercel: define GCP_SA_KEY_JSON (JSON de service account, texto o base64).",
            },
            { status: 200 },
        );
    }

    try {
        const [url] = await creds.storage
            .bucket(bucketName())
            .file(`${uid}/.starseed-probe`)
            .getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60_000 });
        return NextResponse.json({
            ok: true,
            configured: true,
            credentials: creds.source,
            bucket: bucketName(),
            project: projectId(),
            signed: typeof url === "string" && url.startsWith("https://"),
        });
    } catch (e) {
        return NextResponse.json({
            ok: false,
            configured: true,
            credentials: creds.source,
            bucket: bucketName(),
            project: projectId(),
            error: humanSignError(e),
        });
    }
}
