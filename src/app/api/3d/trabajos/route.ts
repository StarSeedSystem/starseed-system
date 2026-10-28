/**
 * /api/3d/trabajos — puerta LOCAL de los trabajos 3D (contrato `architecture/blender-3d.md` §7.6).
 * GET  ?id= estado · ?id=&salida= descarga una salida · ?capacidades=1 · sin parámetros, los últimos.
 * POST JSON {trabajo, confirmado?} o multipart con `trabajo` (texto JSON) y archivos `entradas`.
 * Solo esta máquina: `guardianMando` en CADA método (404 en un despliegue sin neurona).
 */
import { guardianMando } from "@/lib/mando/guardian";
import { capacidades, conGuardia, encolarTrabajo, estadoDe, leerSalida, listarRecientes, MAX_BYTES_ENTRADAS, responder, SIN_CACHE, type Entradas } from "@/lib/blender3d/cola-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TIPOS: Record<string, string> = { glb: "model/gltf-binary", png: "image/png", exr: "image/x-exr", mp4: "video/mp4" };
const tipoDe = (n: string) => TIPOS[n.slice(n.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";

export async function GET(request: Request): Promise<Response> {
    const veto = await conGuardia(request, guardianMando);
    if (veto) return veto;
    const q = new URL(request.url).searchParams;
    if (q.get("capacidades") === "1") {
        const c = await capacidades();
        return responder(c ? { capacidades: c } : { capacidades: null, motivo: "Blender no está instalado en esta neurona." });
    }
    const id = q.get("id");
    if (!id) return responder({ trabajos: await listarRecientes(20) });
    const nombre = q.get("salida");
    if (nombre) {
        const s = await leerSalida(id, nombre);
        if (!s.ok) return responder({ ok: false, motivo: s.motivo }, 404);
        return new Response(new Blob([s.bytes as Uint8Array<ArrayBuffer>]), {
            headers: { ...SIN_CACHE, "Content-Type": tipoDe(s.nombre), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(s.nombre)}` },
        });
    }
    const estado = await estadoDe(id);
    return estado ? responder({ trabajo: estado }) : responder({ ok: false, motivo: "Ese trabajo no existe o el identificador no es válido." }, 404);
}

export async function POST(request: Request): Promise<Response> {
    const veto = await conGuardia(request, guardianMando);
    if (veto) return veto;
    const largo = Number(request.headers.get("content-length") ?? 0);
    if (largo > MAX_BYTES_ENTRADAS + 1024 * 1024) return responder({ ok: false, motivo: "Las entradas pasan del tope de 50 MB." }, 413);
    let bruto: unknown, confirmado = false, entradas: Entradas | undefined;
    try {
        if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
            const form = await request.formData();
            bruto = JSON.parse(String(form.get("trabajo") ?? ""));
            confirmado = String(form.get("confirmado") ?? "") === "true";
            const archivos = form.getAll("entradas").filter((a): a is File => a instanceof Blob);
            if (archivos.length) { entradas = {}; for (const a of archivos) entradas[a.name] = new Uint8Array(await a.arrayBuffer()); }
        } else {
            const j = (await request.json()) as { trabajo?: unknown; confirmado?: unknown };
            bruto = j.trabajo; confirmado = j.confirmado === true;
        }
    } catch { return responder({ ok: false, motivo: "El cuerpo no es un trabajo 3D válido (JSON o formulario)." }, 400); }
    const r = await encolarTrabajo(bruto, entradas, confirmado);
    if (r.ok) return responder({ ok: true, id: r.id }, 202);
    return responder({ ok: false, motivo: r.motivo, ...(r.requiereConfirmacion ? { requiereConfirmacion: true } : {}), ...(r.motivos ? { motivos: r.motivos } : {}) }, r.requiereConfirmacion ? 409 : 400);
}
