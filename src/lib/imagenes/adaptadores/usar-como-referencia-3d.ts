/**
 * Usar como referencia 3D (IMG1011) - adaptador puro.
 * 
 * Exporta una imagen generada como referencia para uso en modelos 3D.
 */
import type { OpcionImagen } from "@/lib/imagenes/plan";

/** Exporta una imagen como referencia 3D */
export async function usarComoReferencia3D(opcion: OpcionImagen): Promise<void> {
  // Implementación simulada - en realidad enviaría la imagen al servidor
  console.log(`Usando como referencia 3D: ${opcion.motor} - ${opcion.semilla}`);
}
