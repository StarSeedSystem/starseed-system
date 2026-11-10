/**
 * puerta/grupos-fuente — de dónde salen los grupos y la lista de neuronas conocidas de cada uno (PTA1110B).
 * Los grupos y comunidades son `os_groups` y mis membresías `os_memberships` (ver `widget-data/os-live.ts`). La malla habla de
 * NEURONAS: un grupo se convierte en la lista de neuronas enlazadas conmigo cuya cuenta es miembro del grupo. Solo con red
 * (consulta a Supabase); sin red se queda la última lista guardada. No es una prueba criptográfica de pertenencia (ver §5.3).
 */

export async function miembrosNeuronasDeGrupo(slug: string): Promise<string[] | null> {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    const { data, error } = await createClient().from("os_memberships").select("user_id").eq("group_slug", slug).limit(2000);
    if (error || !Array.isArray(data)) return null;
    const cuentas = new Set((data as Array<{ user_id: string }>).map((r) => r.user_id));
    const { vinculosDeNeuronas } = await import("@/lib/malla/sincronizacion-neuronas-motor");
    return vinculosDeNeuronas()
      .filter((v) => v.recordado && !!v.sync && !!v.cuenta && cuentas.has(v.cuenta))
      .map((v) => v.sync as string);
  } catch {
    return null;
  }
}
