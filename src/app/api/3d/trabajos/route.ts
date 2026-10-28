/**
 * /api/3d/trabajos — puerta LOCAL de los trabajos 3D (contrato `architecture/blender-3d.md` §7.6).
 * GET  ?capacidades=1        → ficha de Blender de ESTA neurona (o null)
 * GET  ?id=<hex32>           → estado del trabajo;  ?id=&salida=<tipo|salida-N.ext> → descarga la salida
 * GET  (sin parámetros)      → los últimos trabajos con su estado
 * POST JSON {trabajo, confirmado?} o multipart (trabajo como texto JSON + archivos `entradas`)
 *      → {ok:true, id}; si el trabajo es pesado o compartido, pide confirmación humana antes.
 * Solo corre en ESTA máquina (guardián de Genesis: 404 en un despliegue sin neurona). La lógica vive en
 * `src/lib/blender3d/cola-servidor.ts`; el guion de Blender lo genera el ejecutor Python, NUNCA texto libre.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { capacidades, encolarTrabajo, estadoDe, listarRecientes, leerSalida, RE_ID_TRABAJO } from "@/lib/blender3d/cola-servidor";
import type { Entrada } from "@/lib/blender3d/cola-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
const rechazo = (motivo: string, status: number): Response => Response.json({ ok: false, motivo }, { status, headers: SIN_CACHE });

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const salida = url.searchParams.get("salida");
    if (url.searchParams.get("capacidades") === "1") return Response.json({ capacidades: await capacidades() }, { headers: SIN_CACHE });
    if (!id) return Response.json({ trabajos: await listarRecientes(10) }, { headers: SIN_CACHE });
    if (!RE_ID_TRABAJO.test(id)) return rechazo("El id del trabajo no tiene la forma que toca (32 dígitos hexadecimales).", 400);
    if (salida) {
        const leida = await leerSalida(id, salida);
        if (!leida.ok || !leida.bytes) return rechazo(leida.motivo ?? "No se pudo leer la salida.", leida.motivo === "no existe ese trabajo" ? 404 : 400);
        return new Response(new Blob([leida.bytes as Uint8Array<ArrayBuffer>]), { status: 200, headers: { ...SIN_CACHE, "Content-Type": leida.tipo ?? "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(salida)}` } });
    }
    const estado = await estadoDe(id);
    return estado ? Response.json(estado, { headers: SIN_CACHE }) : rechazo("No existe ese trabajo en la cola.", 404);
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    let bruto: unknown, entradas: Entrada[] | undefined, confirmado: boolean | undefined;
    try {
        if (request.headers.get("content-type")?.includes("application/json")) {
            const cuerpo = (await request.json()) as Record<string, unknown>;
            bruto = cuerpo.trabajo;
            confirmado = cuerpo.confirmado === true;
        } else {
            const form = await request.formData();
            bruto = form.has("trabajo") ? JSON.parse(String(form.get("trabajo"))) : undefined;
            confirmado = ["1", "true"].includes(String(form.get("confirmado") ?? "").toLowerCase());
            const archivos = form.getAll("entradas").filter((f): f is File => f instanceof File);
            entradas = await Promise.all(archivos.map(async (f) => ({ nombre: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
        }
    } catch {
        return rechazo("Se esperaba un trabajo válido en JSON (o un formulario con él).", 400);
    }
    const r = await encolarTrabajo(bruto, entradas, confirmado);
    if (!r.ok) return rechazo(r.motivo ?? "No se pudo encolar el trabajo.", 400);
    return Response.json(r, { status: 201, headers: SIN_CACHE });
}
