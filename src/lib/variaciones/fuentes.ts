import { createClient } from "@/utils/supabase/client";
import type { Variacion } from "./orden";
import type { PublicItem } from "@/lib/library/public-catalog";

/**
 * Tipo para representar una variación de fuente.
 * Extiende la interfaz general de variación con campos específicos de fuentes si es necesario.
 */
export interface FuenteVariacion extends Variacion {
  // Campos específicos de fuentes pueden añadirse aquí si se necesitan
  // Por ejemplo: tipoDeFuente, estilo, etc.
}

/**
 * Convierte un PublicItem en una FuenteVariacion.
 * Asumimos que el PublicItem representa una fuente.
 * @param item - Ítem público del catálogo.
 * @returns La variación de fuente correspondiente.
 */
function publicItemFuenteVariacion(item: PublicItem): FuenteVariacion {
  // Mapeamos los campos del PublicItem a la interfaz FuenteVariacion.
  // Nota: Algunos campos pueden requerir adaptación o valores por defecto.
  return {
    id: item.id,
    titulo: item.name,
    descripcion: item.payload.description ?? "",
    version: "1.0.0", // Asumimos una versión por defecto; en realidad podría venir del payload o de otro lugar.
    familia: "fuente", // Hardcodeado por ahora; en realidad podría derivarse de la categoría o tipo.
    licencia: "OFL", // Licencia por defecto para fuentes; en realidad podría venir del payload o de otro lugar.
    etiquetas: item.tags,
    creado: new Date(item.createdAt),
    descargas: 0, // No tenemos este dato en el PublicItem; por ahora 0.
    valoracionMedia: 0, // No tenemos este dato en el PublicItem; por ahora 0.
    valoracionCount: 0, // No tenemos este dato en el PublicItem; por ahora 0.
  };
}

/**
 * Función pura que filtra un array de variaciones por clave de elemento.
 * Esta función no tiene efectos secundarios y depende únicamente de sus entradas.
 * @param variaciones - Array de variaciones a filtrar.
 * @param clave - La clave canónica del elemento (formato: <familia>:<id>[#<parte>]).
 * @returns Un nuevo array con las variaciones que coinciden con la clave.
 */
export function filtrarFuentesPorClave(variaciones: FuenteVariacion[], clave: string): FuenteVariacion[] {
  // Implementación de filtrado basada en la clave.
  // Como no tenemos un campo de clave en la interfaz FuenteVariacion, asumimos que cada variación tiene un campo `clave` o similar.
  // Sin embargo, la interfaz Variacion de orden.ts no tiene un campo de clave.
  // Necesitamos definir cómo se asocia una variación con una clave.
  // Para ahora, devolvemos un array vacío ya que no tenemos la estructura de datos completa.
  // En una implementación futura, cada FuenteVariacion debería tener un campo `claveElemento` o similar.
  return variaciones.filter(variacion => {
    // Placeholder: siempre devuelve falso hasta que definamos cómo obtener la clave de una variación.
    return false;
  });
}

/**
 * Obtiene las variaciones de fuente públicas del catálogo.
 * Esta función es impura porque utiliza el cliente de Supabase.
 * @param clienteSupabase - Opcional: cliente de Supabase para inyección de dependencias (para pruebas).
 * @returns Una promesa que se resuelve con un array de variaciones de fuente.
 */
export async function getFuentesPublicas(
  clienteSupabase: ReturnType<typeof createClient> = createClient()
): Promise<FuenteVariacion[]> {
  try {
    const supabase = clienteSupabase;
    const { data, error } = await supabase
      .from("library_public_items")
      .select("*")
      .eq("category", "design")
      .eq("kind", "font");

    if (error || !data) {
      console.error("Error al obtener fuentes públicas:", error);
      return [];
    }

    const publicItems = data as PublicItem[];
    return publicItems.map(publicItemFuenteVariacion);
  } catch (error) {
    console.error("Error al obtener fuentes públicas:", error);
    return [];
  }
}

/**
 * Obtiene las variaciones de fuente públicas para una clave de elemento dada.
 * Esta función combina la obtención de fuentes públicas y el filtrado por clave.
 * @param clave - La clave canónica del elemento (formato: <familia>:<id>[#<parte>]).
 * @param clienteSupabase - Opcional: cliente de Supabase para inyección de dependencias (para pruebas).
 * @returns Una promesa que se resuelve con un array de variaciones de fuente que coinciden con la clave.
 */
export async function getFuentesPorClave(
  clave: string,
  clienteSupabase: ReturnType<typeof createClient> = createClient()
): Promise<FuenteVariacion[]> {
  const fuentes = await getFuentesPublicas(clienteSupabase);
  return filtrarFuentesPorClave(fuentes, clave);
}