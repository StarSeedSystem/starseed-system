import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";

/**
 * Protomolécula · ÁTOMO «Opciones de imagen de Astraura» (IMG1011J).
 * Contrato: architecture/astraura-imagenes.md §6 — la tarjeta con todas las opciones
 * vive en la Protomolécula: elegir, variar, editar, guardar. La vista es un
 * COMPONENTE nústero (VISTAS_COMPONENTE["tarjeta-imagenes"]) y su única declaración
 * de parámetros es honesta: cuántas opciones prepara (el prompt no se dicta aquí).
 */

/** El id de la vista en `VISTAS_COMPONENTE` (atomos/index.ts). */
export const ID_VISTA_TARJETA_IMAGENES = "tarjeta-imagenes";

/** Tope honesto: `planImagen` devuelve como mucho 8 opciones por petición (contrato §4). */
export const MIN_OPCIONES_TARJETA = 1;
export const MAX_OPCIONES_TARJETA = 8;

export const TARJETA_IMAGENES: DefinicionAtomo = {
  herramientaId: "astraura-imagenes",
  nombre: "Opciones de imagen de Astraura",
  categoria: "imagen",
  integracion: "servicio-local",
  control: "total",
  vista: { tipo: "componente", id: ID_VISTA_TARJETA_IMAGENES },
  parametros: [
    {
      id: "opciones",
      nombre: "Número de opciones",
      tipo: "entero",
      min: MIN_OPCIONES_TARJETA,
      max: MAX_OPCIONES_TARJETA,
      paso: 1,
      unidad: "",
      defecto: 4,
      sinonimos: ["opciones", "cuantas opciones", "variantes"],
    },
  ],
  entradas: ["texto"],
  salidas: ["imagen"],
  ficha: {
    web: "https://huggingface.co/black-forest-labs/FLUX.1-schnell",
    licencia: "varias, por opción; el contrato §1 las lista",
  },
};

/** Toma el valor del parámetro y lo devuelve dentro de los topes (nunca lanza). */
export function opcionesTarjeta(valor: unknown): number {
  const n = typeof valor === "number" ? Math.floor(valor) : NaN;
  if (!Number.isFinite(n)) return 4;
  return Math.min(MAX_OPCIONES_TARJETA, Math.max(MIN_OPCIONES_TARJETA, n));
}
