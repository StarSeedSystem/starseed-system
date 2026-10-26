/**
 * Generar imagen (IMG1011) - adaptador puro.
 *
 * Ejecuta la generación de una imagen a partir de la opción elegida del plan.
 */
export type ResultadoGeneracion = { ok: true; url: string } | { ok: false; url?: undefined };

/** Genera una imagen con el modelo y la semilla indicados */
export async function generarImagen(peticion: {
  prompt: string;
  modelo: string;
  semilla: number;
}): Promise<ResultadoGeneracion> {
  // Implementación simulada que devuelve una URL para las pruebas
  return {
    ok: true,
    url: `https://imagen.local/${peticion.modelo}/${peticion.semilla}`,
  };
}
