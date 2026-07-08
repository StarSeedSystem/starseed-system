/**
 * astraura-realtime.ts — Integración de Astraura con el Motor de Sincronización
 * Permite que Astraura actúe de manera autónoma y sus cambios se vean en tiempo real
 * en los escritorios, lienzos, y bibliotecas de los usuarios.
 */
import { syncManager } from "@/lib/sync/sync-manager";
import { deviceId } from "@/lib/sync/entity-state";
import { createClient } from "@/utils/supabase/server";

/**
 * Cuando Astraura genera o deduce una "Memoria", se inyecta directamente
 * al sistema de mensajes o contextos usando el gestor de sincronización.
 */
export async function injectAstrauraMemory(
  userId: string, 
  targetKind: 'user' | 'group' | 'page',
  targetId: string, 
  memoryContent: string
) {
  // En servidor, insertamos directamente a DB para que Supabase Realtime 
  // notifique a todos los clientes (sync-manager.ts los captará).
  const supabase = await createClient();
  
  await supabase.from("os_messages").insert({
    thread_id: `${targetKind}_${targetId}_astraura`,
    sender_type: 'ai',
    content: memoryContent,
    metadata: { is_memory: true, origin: 'astraura-router' }
  });
}

/**
 * Lee el contexto relativo actual del usuario (ej. su Dashboard actual)
 * para inyectarlo en el system prompt de Astraura.
 */
export async function getAstrauraContext(userId: string, targetKind: string, targetId: string) {
  const supabase = await createClient();
  
  const { data } = await supabase.from("os_contexts")
    .select("settings")
    .eq("user_id", userId)
    .eq("target_kind", targetKind)
    .eq("target_id", targetId)
    .maybeSingle();

  return data?.settings || {};
}
