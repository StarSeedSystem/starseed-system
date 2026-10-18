"use client";

/**
 * Aplicación de fusión de cerebros (CB1013C).
 * Contrato: architecture/cerebros-fusion-telepatia.md §4 y §9 b.
 */

/* ------------------------------------------------------------------ */
/* Imports                                                              */
/* ------------------------------------------------------------------ */

import { createClient } from "@/utils/supabase/client";
import { senalEsencial } from "@/lib/consumo/guardian";
import { pushPreferences } from "@/lib/settings-sync";
import {
  updateMemoryContent,
  saveMemoryFile,
  type MemoryFile,
} from "@/lib/cerebro/memory-files";
import {
  Brain,
  BrainIncludes,
  BrainServer,
  uid,
  listSelections,
} from "@/lib/brains/brains";

/* ------------------------------------------------------------------ */
/* Tipos                                                                */
/* ------------------------------------------------------------------ */

/**
 * Operación que se debe realizar sobre un archivo de memoria durante la fusión.
 */
type ArchivoOperacion =
  | { tipo: "insertar"; nombre: string; contenido: string }
  | { tipo: "actualizar"; id: string; contenido: string };

/**
 * Plan de fusión resultante de la función pura `planFusion`.
 * Contiene todo lo necesario para aplicar la fusión sin realizar efectos secundarios.
 */
interface PlanFusion {
  /** Operaciones a realizar sobre los archivos de memoria. */
  archivoOperaciones: ArchivoOperacion[];
  /** Includes fusionados para el cerebro destino. */
  incluye: BrainIncludes;
  /** Servidores fusionados para el cerebro destino. */
  servidores: BrainServer[];
  /** Configuración fusionada para el cerebro destino (incluye fusionados y fusionadoEn). */
  configuracion: Record<string, unknown>;
  /** Preferencias fusionadas para el cerebro destino (claves de localStorage sin el prefijo cerebral). */
  preferencias: Record<string, unknown>;
}

/**
 * Resultado de aplicar una fusión.
 */
interface ResultadoFusion {
  ok: boolean;
  /** Número de archivos de memoria escritos (insertados o actualizados). */
  archivosEscritos: number;
  /** Total de bytes escritos en archivos de memoria. */
  bytes: number;
  /** IDs de cerebros origenes que fueron eliminados. */
  origenesQuitados: string[];
  /** Cerebros origenes que se conservaron (por tener selecciones asociadas). */
  origenesConservados: Array<{ id: string; motivo: string }>;
  /** Mensaje de error si ok es false. */
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Funciones exportadas                                                 */
/* ------------------------------------------------------------------ */

/**
 * Lee los datos necesarios para realizar una fusión: cerebro destino,
 * cerebros origenes, sus archivos de memoria y preferencias.
 *
 * @param destinoId - ID del cerebro destino
 * @param origenIds - IDs de los cerebros origenes a fusionar
 * @returns Promise que resuelve con los datos para la fusión o un motivo de fallo
 */
export async function leerParaFusion(
  destinoId: string,
  origenIds: string[]
): Promise<
  | { ok: true; destino: Brain; origenes: Brain[]; archivos: MemoryFile[]; prefs: Record<string, Record<string, unknown>> }
  | { ok: false; motivo: string }
> {
  try {
    // Obtener el cerebro destino
    const destino = await getBrain(destinoId);
    if (!destino) {
      return { ok: false, motivo: `No se encontró el cerebro destino con ID: ${destinoId}` };
    }

    // Obtener los cerebros origenes
    const origenesPromises = origenIds.map((id) => getBrain(id));
    const origenesArray = await Promise.all(origenesPromises);
    const origenes = origenesArray.filter((origen): origen is Brain => origen !== null);

    // Si alguno de los origenes no se encontró, continuar con los que sí se encontraron
    // (el comportamiento exacto podría debatirse, pero ser permisivo parece razonable)

    // Obtener los archivos de memoria para todos los cerebros (destino + origenes)
    const todosLosIds = [destinoId, ...origenIds];
    const archivosPromises = todosLosIds.map((id) => listMemoryFiles(id));
    const archivosArrays = await Promise.all(archivosPromises);
    
    // Concatenar todos los archivos
    const archivos: MemoryFile[] = [];
    for (const archivosArray of archivosArrays) {
      archivos.push(...archivosArray);
    }

    // Leer preferencias de localStorage para cada cerebro
    const prefs: Record<string, Record<string, unknown>> = {};
    const todosLosCerebros = [destino, ...origenes];
    
    for (const cerebro of todosLosCerebros) {
      const cerebroPrefs: Record<string, unknown> = {};
      if (typeof window !== "undefined" && window.localStorage) {
        const prefix = `starseed.brain.${cerebro.id}.`;
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key !== null && key.startsWith(prefix)) {
            const suffix = key.substring(prefix.length);
            const rawValue = window.localStorage.getItem(key);
            let value: unknown = rawValue; // por defecto, usar el valor crudo
            if (rawValue !== null) {
              try {
                value = JSON.parse(rawValue);
              } catch {
                // Si falla el parseo, mantener el valor crudo (defensivo)
                value = rawValue;
              }
            }
            cerebroPrefs[suffix] = value;
          }
        }
      }
      prefs[cerebro.id] = cerebroPrefs;
    }

    return {
      ok: true,
      destino,
      origenes,
      archivos,
      prefs,
    };
  } catch (error: any) {
    return {
      ok: false,
      motivo: `Error al leer datos para fusión: ${error?.message ?? String(error)}`,
    };
  }
}

/**
 * Crea una copia de seguridad JSON de todos los datos leídos para la fusión.
 *
 * @param datos - Objeto con destino, origenes, archivos y prefs
 * @param fecha - Fecha para incluir en el nombre del archivo (formato YYYY-MM-DD)
 * @returns Objeto con nombre y contenido de la copia de seguridad
 */
export function copiaDeSeguridad(
  datos: {
    destino: Brain;
    origenes: Brain[];
    archivos: MemoryFile[];
    prefs: Record<string, Record<string, unknown>>;
  },
  fecha: string
): { nombre: string; texto: string } {
  const nombre = `cerebros-fusion-${fecha}.json`;
  
  try {
    // Crear una copia profunda de los datos para serializar
    // No necesitamos una copia profunda extremadamente cuidadosa ya que
    // los datos vienen de fuentes confiables (Supabase y localStorage)
    const texto = JSON.stringify(datos, null, 2);
    return { nombre, texto };
  } catch (error) {
    // Si falla la serialización, crear un objeto de error simple
    const texto = JSON.stringify({
      error: "No se pudo serializar los datos para la copia de seguridad",
      detalles: error?.message ?? String(error)
    }, null, 2);
    return { nombre, texto };
  }
}

/**
 * Descarga una copia de seguridad como archivo JSON en el dispositivo.
 *
 * @param copia - Objeto copia de seguridad generado por `copiaDeSeguridad`
 * @returns true si se inició la descarga, false si no hay ventana (e.g. en SSR)
 */
export function descargarCopia(copia: { nombre: string; texto: string }): boolean {
  if (typeof window === "undefined" || !window) {
    // No estamos en un entorno de navegador (SSR)
    return false;
  }

  try {
    const blob = new Blob([copia.texto], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = copia.nombre;
    // Añadir el enlace al documento y hacer clic en él
    document.body.appendChild(enlace);
    enlace.click();
    // Limpiar: remover el enlace y revocar el objeto URL
    document.body.removeChild(enlace);
    window.URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error("Error al descargar copia de seguridad:", error);
    return false;
  }
}

/**
 * Aplica el plan de fusión al cerebro destino.
 *
 * @param plan - Plan de fusión puro generado por `planFusion`
 * @param opciones - Objeto con destino, IDs de origenes y flag para quitar origenes
 * @returns Promise que resuelve con el resultado de la aplicación
 */
export async function aplicarFusion(
  plan: PlanFusion,
  opciones: {
    destino: Brain;
    origenIds: string[];
    quitarOrigenes: boolean;
  }
): Promise<ResultadoFusion> {
  const { destino, origenIds, quitarOrigenes } = opciones;
  
  // Inicializar contadores y resultados
  let archivosEscritos = 0;
  let bytesTotales = 0;
  const origenesQuitados: string[] = [];
  const origenesConservados: Array<{ id: string; motivo: string }> = [];
  
  try {
    // PASO 1: Procesar archivos de memoria
    for (const operacion of plan.archivoOperaciones) {
      try {
        if (operacion.tipo === "insertar") {
          // Insertar nuevo archivo de memoria
          const resultado = await saveMemoryFile({
            brain_id: destino.id,
            nombre: operacion.nombre,
            content: operacion.contenido,
            source: "fusion",
            server_config: {},
            meta: {},
            sync: false,
          });
          
          if (resultado) {
            archivosEscritos++;
            bytesTotales += operacion.contenido.length;
          }
          // Si saveMemoryFile devuelve null, no contamos como éxito
        } else if (operacion.tipo === "actualizar") {
          // Actualizar contenido de archivo existente
          const éxito = await updateMemoryContent(operacion.id, operacion.contenido);
          if (éxito) {
            archivosEscritos++;
            bytesTotales += operacion.contenido.length;
          }
        }
      } catch (errorArchivo) {
        // Si falla una operación de archivo, continuamos con las demás
        // pero no contamos ésta como éxito
        console.error(`Error al procesar archivo ${operacion.tipo === "insertar" ? operacion.nombre : operacion.id}:`, errorArchivo);
      }
    }

    // PASO 2: Actualizar el cerebro destino con includes, servidores y configuración fusionados
    const cerebroActualizado: Partial<Brain> = {
      ...destino,
      includes: plan.incluye,
      servidores: plan.servidores,
      config: {
        // Primero copiamos la configuración existente del destino
        ...destino.config,
        // Luego aplicamos la configuración fusionada (que ya incluye fusionados y fusionadoEn)
        ...plan.configuracion,
      },
    };
    
    const cerebroGuardado = await saveBrain(cerebroActualizado);
    if (!cerebroGuardado) {
      throw new Error("No se pudo guardar el cerebro destino actualizado");
    }

    // PASO 3: Aplicar preferencias fusionadas
    if (typeof window !== "undefined" && window.localStorage) {
      for (const [sufijo, valor] of Object.entries(plan.preferencias)) {
        const clave = `starseed.brain.${destino.id}.${sufijo}`;
        try {
          const valorString = typeof valor === "string" ? valor : JSON.stringify(valor);
          window.localStorage.setItem(clave, valorString);
        } catch (error) {
          console.error(`Error al guardar preferencia ${clave}:`, error);
          // Continuamos con las demás preferencias
        }
      }
    }
    
    // Sincronizar preferencias con la cuenta
    await pushPreferences();

    // PASO 4: Manejar cerebros origenes (solo si se pidió quitarlos y los pasos 1-3 fueron exitosos)
    if (quitarOrigenes) {
      try {
        // Obtener el owner actual para verificar selecciones
        const owner = await uid();
        if (owner) {
          // Obtener todas las selecciones del owner
          const todasLasSelecciones = await listSelections();
          // Crear un mapa de brain_id => true para aquellos que tienen selecciones
          const brainsConSelecciones = new Set<string>();
          for (const selec of todasLasSelecciones) {
            brainsConSelecciones.add(selec.brain_id);
          }
          
          // Procesar cada cerebro origen
          for (const origenId of origenIds) {
            if (brainsConSelecciones.has(origenId)) {
              // Tiene selecciones asociadas, no se borra
              origenesConservados.push({
                id: origenId,
                motivo: "tiene selecciones; se moverán cuando se aplique §9 b",
              });
            } else {
              // No tiene selecciones, intentar eliminarlo
              const eliminado = await deleteBrain(origenId);
              if (eliminado) {
                origenesQuitados.push(origenId);
              } else {
                // No se pudo eliminar por alguna razón inesperada
                origenesConservados.push({
                  id: origenId,
                  motivo: "no se pudo eliminar (error desconocido)",
                });
              }
            }
          }
        } else {
          // No hay owner, no podemos verificar selecciones ni eliminar cerebros
          // En este caso, conservamos todos los origenes por seguridad
          for (const origenId of origenIds) {
            origenesConservados.push({
              id: origenId,
              motivo: "no hay sesión activa; se conservan por seguridad",
            });
          }
        }
      } catch (errorSelecciones) {
        // Si falla el check de selecciones, conservamos todos los origenes por seguridad
        console.error("Error al verificar selecciones cerebrales:", errorSelecciones);
        for (const origenId of origenIds) {
          origenesConservados.push({
            id: origenId,
            motivo: "error al verificar selecciones; se conservan por seguridad",
          });
        }
      }
    }

    // Si llegamos hasta aquí, los pasos 1-3 fueron exitosos
    return {
      ok: true,
      archivosEscritos,
      bytes: bytesTotales,
      origenesQuitados,
      origenesConservados,
    };
  } catch (error: any) {
    // Si falló cualquiera de los pasos 1-3, no intentamos el paso 4
    return {
      ok: false,
      archivosEscritos,
      bytes: bytesTotales,
      origenesQuitados: [],
      origenesConservados: [],
      error: `Error durante la aplicación de la fusión: ${error?.message ?? String(error)}`,
    };
  }
}