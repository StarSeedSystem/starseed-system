/**
 * /api/conversion — convertir archivos con Filee en ESTA neurona.
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  ?de=<formato o nombre>  → { filee: {instalado, version, donde}, destinos?: {nombre, ids, destinos, conMotor} }
 * POST multipart {archivo, a, calidad?} → el archivo convertido (binario), con
 *      `X-Conversion-Nombre`, `X-Conversion-Salidas` y `X-Conversion-Motor`; si falla, JSON {ok:false, motivo}.
 * Puerta: el guardián de Genesis (sin sesión solo la propia máquina; fuera de local, sesión de
 * MetaGenesis; 404 en un despliegue sin neurona). La conversión gasta la CPU de la neurona.
 * Contrato: `architecture/conversion-archivos.md`. La lógica vive en `src/lib/conversion/`.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { convertirConFilee, destinosFilee, estadoFilee, MAX_BYTES_CONVERSION } from "@/lib/conversion/filee-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby admite 1–300 s: con 900 cada despliegue de producción fallaba en «Deploying outputs»
// (invalid_max_duration, desde el 2026-10-25). En la neurona (`next start`) este valor no limita nada.
export const maxDuration = 300;

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const url = new URL(request.url);
    const est = await estadoFilee(url.searchParams.get("fresco") === "1");
    const filee = { instalado: est.instalado, version: est.version, donde: est.donde };
    const de = url.searchParams.get("de");
    if (!de) return Response.json({ filee }, { headers: SIN_CACHE });
    const destinos = est.instalado ? await destinosFilee(de) : null;
    return Response.json({ filee, destinos }, { headers: SIN_CACHE });
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const largo = Number(request.headers.get("content-length") ?? 0);
    if (largo > MAX_BYTES_CONVERSION + 1024 * 1024) {
        return Response.json({ ok: false, motivo: "El archivo es demasiado grande para convertirlo aquí." }, { status: 413, headers: SIN_CACHE });
    }
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return Response.json({ ok: false, motivo: "Se esperaba un formulario con el archivo." }, { status: 400, headers: SIN_CACHE });
    }
    const archivo = form.get("archivo");
    const a = String(form.get("a") ?? "");
    const calidad = form.get("calidad");
    if (!(archivo instanceof Blob)) {
        return Response.json({ ok: false, motivo: "Falta el archivo." }, { status: 400, headers: SIN_CACHE });
    }
    const nombre = String(form.get("nombre") ?? (archivo as File).name ?? "archivo");
    const r = await convertirConFilee({
        bytes: new Uint8Array(await archivo.arrayBuffer()),
        nombre,
        a,
        calidad: calidad === null ? null : Number(calidad),
    });
    if (!r.ok || !r.bytes) {
        return Response.json({ ok: false, motivo: r.motivo ?? "No se pudo convertir." }, { status: r.status ?? 500, headers: SIN_CACHE });
    }
    const est = await estadoFilee();
    const nombreSalida = r.nombre ?? "convertido";
    // Blob en vez del Uint8Array: BodyInit no acepta un Uint8Array sobre ArrayBufferLike.
    return new Response(new Blob([r.bytes as Uint8Array<ArrayBuffer>]), {
        status: 200,
        headers: {
            ...SIN_CACHE,
            "Content-Type": r.tipo ?? "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombreSalida)}`,
            "X-Conversion-Nombre": encodeURIComponent(nombreSalida),
            "X-Conversion-Salidas": String(r.salidas ?? 1),
            "X-Conversion-Motor": `filee ${est.version ?? ""}`.trim(),
            "X-Conversion-Ms": String(r.ms ?? 0),
        },
    });
}
