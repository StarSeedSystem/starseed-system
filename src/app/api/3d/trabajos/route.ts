/**
 * /api/3d/trabajos — la puerta local de los trabajos 3D (contrato §7.6).
 * GET  ?id= estado · ?id=&salida= descarga · ?capacidades=1 · sin parámetros: últimos.
 * POST JSON {trabajo, confirmado?} o multipart {trabajo, entradas}.
 * Solo esta máquina; la lógica vive en `src/lib/blender3d/cola-servidor.ts`.
 */
import { guardianMando } from "@/lib/mando/guardian";
import {
    capacidades,
    encolarTrabajo,
    estadoDe,
    leerSalida,
    listarRecientes,
    tipoDeSalida,
    type Entrada3D,
} from "@/lib/blender3d/cola-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
const json = (datos: unknown, status = 200): Response => Response.json(datos, { status, headers: SIN_CACHE });

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const url = new URL(request.url);
    if (url.searchParams.get("capacidades")) return json({ capacidades: await capacidades() });
    const id = url.searchParams.get("id");
    if (!id) return json({ trabajos: await listarRecientes(Number(url.searchParams.get("n") ?? 10)) });
    const salida = url.searchParams.get("salida");
    if (salida) {
        const r = await leerSalida(id, salida);
        if (!r.ok) return json({ ok: false, motivo: r.motivo }, 404);
        return new Response(new Blob([r.bytes as Uint8Array<ArrayBuffer>]), {
            headers: {
                ...SIN_CACHE,
                "Content-Type": tipoDeSalida(r.nombre),
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.nombre)}`,
            },
        });
    }
    const estado = await estadoDe(id);
    return estado ? json({ ok: true, trabajo: estado }) : json({ ok: false, motivo: "No existe ese trabajo." }, 404);
}

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    let bruto: unknown = null, confirmado = false;
    const entradas: Entrada3D[] = [];
    try {
        if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
            const form = await request.formData();
            bruto = JSON.parse(String(form.get("trabajo") ?? "null"));
            confirmado = String(form.get("confirmado") ?? "") === "true";
            for (const f of form.getAll("entradas")) {
                if (f instanceof Blob) entradas.push({ nombre: "name" in f ? String((f as File).name) : "entrada", bytes: new Uint8Array(await f.arrayBuffer()) });
            }
        } else {
            const cuerpo = (await request.json()) as { trabajo?: unknown; confirmado?: unknown };
            bruto = cuerpo?.trabajo;
            confirmado = cuerpo?.confirmado === true;
        }
    } catch {
        return json({ ok: false, motivo: "El cuerpo no es un JSON válido." }, 400);
    }
    const r = await encolarTrabajo(bruto, entradas, confirmado);
    if (r.ok) return json({ ok: true, id: r.id }, 201);
    return json(
        { ok: false, motivos: r.motivos, motivo: r.motivo ?? "El trabajo no se pudo encolar.", requiereConfirmacion: r.requiereConfirmacion === true },
        r.requiereConfirmacion ? 409 : 400,
    );
}
