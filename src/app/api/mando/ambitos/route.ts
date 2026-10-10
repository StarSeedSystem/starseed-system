import { createClient } from "@/utils/supabase/server";
import { guardianMando } from "@/lib/mando/guardian";
import { AMBITO_LOCAL } from "@/lib/mando/ambito";
import { esPeticionDeEstaMaquina as esDespliegueLocal } from "@/lib/seguridad/misma-maquina"; // (2026-10-10) solo la propia máquina cuenta como dueña local

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const veto = await guardianMando(request);
  if (veto) return veto;

  const bandera = process.env.STARSEED_MANDO_TODOS === "1";
  const esLocal = esDespliegueLocal(request);
  if (!bandera || esLocal) {
    return Response.json([AMBITO_LOCAL]);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mando_ambitos")
    .select("id,tipo,entidad_tipo,visibilidad,nombre")
    .order("nombre", { ascending: true });

  if (error || !data) {
    return Response.json([AMBITO_LOCAL]);
  }

  const persona = [];
  const grupos = [];
  const paginas = [];

  for (const a of data) {
    const item = { id: a.id, nombre: a.nombre, tipo: a.tipo, visibilidad: a.visibilidad, entidad_tipo: a.entidad_tipo };
    if (a.tipo === "persona") persona.push(item);
    else if (a.entidad_tipo && ["comunidad","grupo","partido","asamblea","ef"].includes(a.entidad_tipo)) grupos.push(item);
    else if (a.entidad_tipo && ["pagina","evento","proyecto"].includes(a.entidad_tipo)) paginas.push(item);
  }

  return Response.json({ persona, grupos, paginas }, { headers: { "Cache-Control": "no-store" } });
}
