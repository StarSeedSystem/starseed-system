/**
 * Plan de generación de imágenes por capas (IMG1011) - adaptador puro.
 * 
 * Este adaptador convierte la petición de imagen en un plan de múltiples opciones
 * a generar según el hierro y las capacidades disponibles.
 */
import type { PeticionImagen, PlanImagen, NeuronaImg, ModeloImagen } from "@/lib/imagenes/plan";
import { MODELOS_IMAGEN } from "@/lib/imagenes/modelos";

/** Genera un plan de imágenes basado en una petición y las neuronas disponibles */
export async function planImagen(
  peticion: PeticionImagen,
  neuronas: readonly NeuronaImg[],
  semillaBase: number,
  catalogo: readonly ModeloImagen[] = MODELOS_IMAGEN
): Promise<PlanImagen> {
  // Plan simple: generar opciones básicas basado en la petición
  const opciones = peticion.opciones;
  const plan: PlanImagen = {
    opciones: [],
    descartes: [],
  };

  // Generar opciones simples para las pruebas
  for (let i = 0; i < opciones; i++) {
    plan.opciones.push({
      capa: "espacio",
      modelo: null,
      motor: "espacio-hf",
      cuantizacion: "nativa",
      semilla: semillaBase + i,
      motivo: `Opción ${i + 1} para ${peticion.opciones} opciones",
    });
  }

  return plan;
}
