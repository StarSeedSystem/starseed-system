import { guardianMando } from "@/lib/mando/guardian";
import { encolarTrabajo, estadoDe, listarRecientes, leerSalida, capacidades } from "@/lib/blender3d/cola-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const veto = await guardianMando(req);
  if (veto) return veto;
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const salida = url.searchParams.get("salida");
  if (url.searchParams.get("capacidades") === "1") {
    const caps = await capacidades();
    return Response.json({ capacidades: caps ?? null }, { headers: SIN_CACHE });
  }
  if (id) {
    if (salida) {
      const bytes = await leerSalida(id, salida);
      if (!bytes) return Response.json({ ok: false, motivo: "Salida no encontrada" }, { status: 404, headers: SIN_CACHE });
      return new Response(bytes, { headers: { ...SIN_CACHE, "Content-Type": "application/octet-stream" } });
    }
    const estado = await estadoDe(id);
    if (!estado) return Response.json({ ok: false, motivo: "Trabajo no encontrado" }, { status: 404, headers: SIN_CACHE });
    return Response.json({ id, estado }, { headers: SIN_CACHE });
  }
  const recientes = await listarRecientes(20);
  return Response.json({ recientes }, { headers: SIN_CACHE });
}

export async function POST(req: Request) {
  const veto = await guardianMando(req);
  if (veto) return veto;
  const ct = req.headers.get("content-type") ?? "";
  let trabajo: unknown;
  let entradas: Record<string, Uint8Array> | undefined;
  let confirmado = false;
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const txt = String(form.get("trabajo") ?? "");
      trabajo = JSON.parse(txt);
      const conf = form.get("confirmado");
      if (typeof conf === "string") confirmado = conf === "true" || conf === "1";
      entradas = {};
      for (const [k, v] of form.entries()) {
        if (k.startsWith("entradas-")) {
          if (v instanceof File) {
            entradas[k.replace("entradas-", "")] = new Uint8Array(await v.arrayBuffer());
          }
        }
      }
    } else {
      const json = await req.json();
      trabajo = json.trabajo;
      confirmado = !!json.confirmado;
    }
  } catch {
    return Response.json({ ok: false, motivo: "Datos inválidos" }, { status: 400, headers: SIN_CACHE });
  }
  const res = await encolarTrabajo(trabajo, entradas, confirmado);
  if (!res.ok) {
    if ((res as any).requiereConfirmacion) {
      return Response.json({ ok: false, requiereConfirmacion: true, motivo: (res as any).motivo }, { status: 422, headers: SIN_CACHE });
    }
    return Response.json({ ok: false, motivo: (res as any).motivo ?? "Error al encolar" }, { status: 400, headers: SIN_CACHE });
  }
  return Response.json({ ok: true, id: (res as any).id }, { headers: SIN_CACHE });
}
