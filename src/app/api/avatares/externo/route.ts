/**
 * POST /api/avatares/externo (AV1011I) — generación de avatar con un proveedor EXTERNO.
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato `architecture/astraura-avatares-3d.md` §1/§4: Meshy y Tripo son de pago y están
 * APAGADOS por defecto. Solo responden si existen a la vez el permiso
 * (`AVATARES_EXTERNOS_PERMITIDOS=1`) y la clave del proveedor en el entorno
 * (`MESHY_API_KEY` / `TRIPO_API_KEY`). Sin ambas condiciones, «no disponible» con su motivo.
 *
 * Reglas: exige sesión; la clave jamás sale del servidor; tope diario por persona
 * (`TOPE_DIARIO_POR_PERSONA`, contador en memoria por instancia — misma limitación conocida
 * que `src/lib/security/rate-limit.ts`); la procedencia (CC BY 4.0 de Meshy, con atribución)
 * viaja en la respuesta para que el ADN la guarde. Tripo: sin documentación verificada,
 * solo «no disponible». Nada de peticiones en bucle: el cliente consulta la tarea una vez.
 *
 * Cuerpo: `{ proveedor: "meshy" | "tripo", imagenUrl: "https://…" }` (jpg/jpeg/png/webp,
 * lo que acepta Meshy). Devuelve `{ tarea, proveedor, procedencia }` o `{ error }`.
 */

import { createClient } from "@/utils/supabase/server";
import {
  crearTareaExterna, externosPermitidos, procedenciaExterna, registrarUso,
  type ContadorTope, type EntornoExternos,
} from "@/lib/avatares/adaptadores/proveedores-externos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Conteo del tope diario por persona (memoria del proceso; un cold start lo reinicia). */
const CONTADOR: ContadorTope = new Map();

const FORMATO_OK = /^https:\/\/.+\.(jpe?g|png|webp)($|\?)/i;

function entorno(): EntornoExternos {
  return {
    AVATARES_EXTERNOS_PERMITIDOS: process.env.AVATARES_EXTERNOS_PERMITIDOS,
    MESHY_API_KEY: process.env.MESHY_API_KEY,
    TRIPO_API_KEY: process.env.TRIPO_API_KEY,
  };
}

function claveDe(proveedor: string, env: EntornoExternos): string {
  return (proveedor === "meshy" ? env.MESHY_API_KEY : env.TRIPO_API_KEY)?.trim() ?? "";
}

export async function POST(req: Request): Promise<Response> {
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return Response.json({ error: "Necesitas iniciar sesión para usar un proveedor externo." }, { status: 401 });
    }
    userId = data.user.id;
  } catch {
    return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
  }

  // «Apagado por defecto»: sin permiso + clave a la vez, aquí termina todo.
  const env = entorno();
  const config = externosPermitidos(env);
  if (!config.disponible) return Response.json({ error: config.motivo }, { status: 503 });

  let cuerpo: { proveedor?: unknown; imagenUrl?: unknown };
  try {
    cuerpo = (await req.json()) as typeof cuerpo;
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  const proveedor = typeof cuerpo.proveedor === "string" ? cuerpo.proveedor.trim() : "";
  if (!config.ids.includes(proveedor)) {
    return Response.json(
      { error: `El proveedor «${proveedor || "?"}» no está disponible. Activos: ${config.ids.join(", ") || "ninguno"}.` },
      { status: 400 },
    );
  }
  const imagenUrl = typeof cuerpo.imagenUrl === "string" ? cuerpo.imagenUrl.trim() : "";
  if (!FORMATO_OK.test(imagenUrl)) {
    return Response.json({ error: "La imagen debe ser una URL https pública .jpg, .png o .webp." }, { status: 400 });
  }

  if (!registrarUso(CONTADOR, userId, Date.now())) {
    return Response.json(
      { error: "Has llegado al tope diario de generaciones con proveedores externos. Inténtalo mañana." },
      { status: 429 },
    );
  }

  const resultado = await crearTareaExterna(proveedor, imagenUrl, claveDe(proveedor, env));
  if (!resultado.ok) {
    return Response.json({ error: resultado.motivo }, { status: 502 });
  }
  return Response.json(
    { tarea: resultado.tarea, proveedor, procedencia: procedenciaExterna(proveedor) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
