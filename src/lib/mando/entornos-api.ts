// src/lib/mando/entornos-api.ts
// -----------------------------------------------------------------------------
// API de entorno para el mando del enjambre (Ola 239 · mando completo en la nube).
//
// Proporciona funciones para gestionar entornos completos, incluyendo captura,
// revisión, duplicación, comparación y aplicación de configuraciones de entornos.
//
// ⚠️ Seguridad (innegociable, regla de Alex):
//  • Nunca devuelve claves, tokens, contraseñas ni cadenas de conexión.
//  • Solo NOMBRES de claves de entorno y URLs públicas o locales.
//  • Los volúmenes van por referencia (manifiesto por bandas), nunca su contenido.
//
// Este archivo es lado servidor: `leerEntornoCompleto()` se llama desde la ruta
// `POST /api/mando/entornos`.
// -----------------------------------------------------------------------------

import { SYNCED_KEYS, NEVER_SYNCED_KEYS, isNeverSyncedKey } from "@/lib/settings-sync";
import type { PaqueteSistema } from "@/lib/nucleo";
import {
  EntornoCompleto,
  VolumenEntorno,
  capturarEntorno,
  revisarEntorno,
  duplicarEntorno,
  aplicar,
  diferencia,
  type LectorAjustes,
  type EscritorAjustes,
} from "@/lib/nucleo";

// ---------------------------------------------------------------------------
// Lectores y escritores de entorno para el lado servidor
// ---------------------------------------------------------------------------

/** Lector de entorno del lado servidor: lee desde archivos localStorage */
export async function leerEntornoLocal(): Promise<LectorAjustes> {
  return {
    leer: (clave: string): string | null => {
      try {
        const raw = localStorage.getItem(clave);
        return raw !== null ? raw : null;
      } catch {
        return null;
      }
    },
  };
}

/** Escritor de entorno del lado servidor: escribe en archivos localStorage */
export async function escribirEntornoLocal(clave: string, valor: unknown): Promise<void> {
  try {
    const serialized = typeof valor === "string" ? valor : JSON.stringify(valor);
    localStorage.setItem(clave, serialized);
  } catch {
    // Opciones de silencio: escribir localStorage puede fallar en algunos navegadores
    // pero no debe interrumpir el flujo de trabajo principal
  }
}

// ---------------------------------------------------------------------------
// Funciones API del lado servidor
// ---------------------------------------------------------------------------

/** Lee un entorno completo por ID desde el almacenamiento local */
export async function leerEntornoCompleto(id: string): Promise<EntornoCompleto> {
  // Leer desde localStorage: el formato es JSON con la estructura EntornoCompleto
  try {
    const raw = localStorage.getItem(`entorno:${id}`);
    if (!raw) {
      throw new Error(`Entorno con id '${id}' no encontrado`);
    }
    const entorno = JSON.parse(raw) as EntornoCompleto;
    return entorno;
  } catch (error) {
    throw new Error(`No se pudo leer el entorno '${id}': ${error}`);
  }
}

/** Guarda un entorno completo en localStorage */
export async function guardarEntornoCompleto(entorno: EntornoCompleto): Promise<void> {
  try {
    const clave = `entorno:${entorno.nombre}`;
    localStorage.setItem(clave, JSON.stringify(entorno));
  } catch (error) {
    throw new Error(`No se pudo guardar el entorno: ${error}`);
  }
}

/** Revisa un entorno completo para seguridad e installabilidad */
export async function revisarEntornoCompleto(id: string): Promise<ReturnType<typeof revisarEntorno>> {
  const entorno = await leerEntornoCompleto(id);
  const resultado = revisarEntorno(entorno);
  return resultado;
}

/** Duplica un entorno completo con un nuevo nombre */
export async function duplicarEntornoCompleto(id: string, nuevoNombre: string): Promise<EntornoCompleto> {
  const entornoOriginal = await leerEntornoCompleto(id);
  const entornoDuplicado = duplicarEntorno(entornoOriginal, nuevoNombre);
  await guardarEntornoCompleto(entornoDuplicado);
  return entornoDuplicado;
}

/** Exporta un entorno completo como JSON */
export async function exportarEntorno(id: string): Promise<string> {
  const entorno = await leerEntornoCompleto(id);
  return JSON.stringify(entorno, null, 2);
}

/** Lista todos los entornos completos guardados en localStorage */
export async function listarEntornosCompletos(): Promise<EntornoCompleto[]> {
  const entornos: EntornoCompleto[] = [];
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (clave && clave.startsWith("entorno:")) {
        const raw = localStorage.getItem(clave);
        if (raw) {
          const entorno = JSON.parse(raw) as EntornoCompleto;
          entornos.push(entorno);
        }
      }
    }
  } catch {
    // Si falla la enumeración de localStorage, devolver lista vacía
  }
  
  return entornos;
}