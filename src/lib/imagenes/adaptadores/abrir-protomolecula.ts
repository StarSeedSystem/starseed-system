/**
 * Abrir en protomolécula (IMG1011) - adaptador puro.
 * 
 * Abre una imagen generada en el editor de protomoléculas para edición 3D.
 */
import type { OpcionImagen } from "@/lib/imagenes/plan";

/** Abre una imagen en el editor de protomoléculas */
export async function abrirEnProtomoleculaEditor(opcion: OpcionImagen): Promise<void> {
  // Implementación simulada - en realidad abriría el editor
  console.log(`Abriendo en protomolecula: ${opcion.motor} - ${opcion.semilla}`);
}
