'use client';

/**
 * Sincronización de bots entre local y remoto (BOT1011Y).
 * - fusionarBots: combina bots locales y remotos por id, ganando el más reciente por actualizado.
 * - suscribirBotsEntidad: suscribe a cambios en tiempo real de bots de entidad.
 * - abiertosEnEstaNeurona / marcarAbierto: estado local de bots abiertos en esta neurona.
 */

import type { Bot } from "../tipos";
import { createClient } from "@/utils/supabase/client";

/**
 * Fusiona dos conjuntos de bots (local y remoto) por id.
 * Para cada id, el bot con el timestamp más reciente en `actualizado` gana.
 * Si un bot falta en uno de los lados, se conserva el que exista (ningún borrado se propaga).
 * El predeterminado se garantiza porque los conjuntos de entrada ya lo incluyen (vienen de almacen con migrante).
 */
export function fusionarBots(
  local: { bots: Bot[]; actualizado: Record<string, number> },
  remoto: { bots: Bot[]; actualizado: Record<string, number> }
): { bots: Bot[]; actualizado: Record<string, number> } {
  const actualizado: Record<string, number> = {};
  const botsMap = new Map<string, Bot>();

  // Primero, procesamos el local
  for (const bot of local.bots) {
    botsMap.set(bot.id, bot);
    actualizado[bot.id] = local.actualizado[bot.id] ?? 0;
  }

  // Luego, el remoto: gana si su timestamp es más reciente
  for (const bot of remoto.bots) {
    const remotoTs = remoto.actualizado[bot.id] ?? 0;
    const localTs = actualizado[bot.id] ?? 0;
    if (remotoTs > localTs) {
      botsMap.set(bot.id, bot);
      actualizado[bot.id] = remotoTs;
    }
    // Si no está en el mapa, lo agregamos (pero ya lo hicimos arriba si existía en local)
    if (!botsMap.has(bot.id)) {
      botsMap.set(bot.id, bot);
      actualizado[bot.id] = remotoTs;
    }
  }

  // Construimos el resultado
  const bots: Bot[] = Array.from(botsMap.values());
  return { bots, actualizado };
}

/**
 * Suscribe a cambios en tiempo real de la tabla `astraura_bots` para las entidades dadas.
 * Filtra por dueño (cuentaId y tipo de entidad). Si la tabla no existe, avisa una vez y no lanza.
 * Devuelve una función para desuscribirse.
 */
export function suscribirBotsEntidad(
  entidades: { tipo: string; id: string; cuentaId: string }[],
  cb: (bots: Bot[]) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const supabase = createClient();
  let subscription: any = null;
  let warned = false;

  const suscribir = () => {
    // Construimos el filtro: OR de las condiciones para cada entidad
    const filter = entidades
      .map(
        (e) =>
          `dueno.tipo.eq.${e.tipo}&dueno.id.eq.${e.id}&cuentaId.eq.${e.cuentaId}`
      )
      .join("|");

    try {
      subscription = supabase
        .channel(`astraura-bots-${Math.random()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "astraura_bots", filter },
          (payload) => {
            // Aquí deberíamos obtener la lista actual de bots para las entidades y llamar al cb.
            // Por simplicidad, vamos a volver a leer todas las bots de las entidades.
            // En una implementación real, podríamos mantener un caché o usar el payload.
            // Pero la tarea no especifica los detalles, así que vamos a leer.
            leerBotsDeEntidades(entidades).then((bots) => cb(bots)).catch(() => {
              // Ignoramos errores de lectura para no romper la suscripción.
            });
          }
        )
        .subscribe();

       // Verificamos si la tabla existe intentando una consulta simple.
       const promiseRaw = supabase
         .from("astraura_bots")
         .select("count")
         .limit(1)
         .then(() => {
           // La tabla existe, no hacemos nada.
         });
       const promise = promiseRaw as Promise<void>;
       promise.catch((err) => {
         if (!warned) {
           console.warn(
             "La tabla `astraura_bots` no existe en Supabase. La sincronización de bots de entidad no funcionará."
           );
           warned = true;
         }
       });
    } catch (err) {
      if (!warned) {
        console.warn(
          "Error al suscribirse a bots de entidad:",
          err
        );
        warned = true;
      }
    }
  };

  suscribir();

  return () => {
    if (subscription) {
      supabase.removeChannel(subscription);
    }
  };
}

/**
 * Lee los bots de las entidades dadas desde Supabase.
 * Función auxiliar para suscribirBotsEntidad.
 */
async function leerBotsDeEntidades(
  entidades: { tipo: string; id: string; cuentaId: string }[]
): Promise<Bot[]> {
  const supabase = createClient();
  const promises = entidades.map((e) =>
    supabase
      .from("astraura_bots")
      .select("*")
      .eq("dueno->>tipo", e.tipo)
      .eq("dueno->>id", e.id)
      .eq("cuentaId", e.cuentaId)
  );

  const results = await Promise.all(promises);
  const bots: Bot[] = [];
  for (const res of results) {
    if (res.data) {
      bots.push(...(res.data as Bot[]));
    }
  }
  return bots;
}

/**
 * Devuelve los IDs de los bots actualmente abiertos en esta neurona (dispositivo).
 * Almacenado en localStorage bajo la clave `starseed.astraura.bots.abiertos`.
 */
export function abiertosEnEstaNeurona(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const valor = window.localStorage.getItem(
      "starseed.astraura.bots.abiertos"
    );
    return valor ? JSON.parse(valor) : [];
  } catch {
    return [];
  }
}

/**
 * Marca un bot como abierto o cerrado en esta neurona.
 * @param botId - ID del bot
 * @param abierto - true para marcar como abierto, false para cerrado
 */
export function marcarAbierto(botId: string, abierto: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const actuales = abiertosEnEstaNeurona();
    const index = actuales.indexOf(botId);
    if (abierto && index === -1) {
      actuales.push(botId);
    } else if (!abierto && index !== -1) {
      actuales.splice(index, 1);
    }
    window.localStorage.setItem(
      "starseed.astraura.bots.abiertos",
      JSON.stringify(actuales)
    );
  } catch {
    // Ignoramos errores de escritura en localStorage.
  }
}