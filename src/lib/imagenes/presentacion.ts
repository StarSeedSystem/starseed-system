/**
 * Presentación de las imágenes de Astraura (IMG1011J). Contrato: architecture/astraura-imagenes.md §6.
 *
 * Funciones PURAS (entrada → salida) para que la tarjeta del chat, los ajustes de la neurona y la
 * Protomolécula digan lo mismo con las mismas palabras: capa, modelo, semilla, licencia y atribución.
 * Nada de red, disco ni React. Sin datos inventados: si una opción no trae url, no se presenta.
 */
import type { OpcionGaleria } from "@/ai/astraura/media/proveedor-neuronas";
import type { UsoLicencia } from "@/lib/avatares/adn/adn";

export interface OpcionPresentable extends OpcionGaleria {
  url: string;
  titulo: string;
  semillaTexto: string;
  licenciaTexto: string;
}

export interface GaleriaPresentable {
  opciones: OpcionPresentable[];
  descartes: string[];
  error?: string;
}

const NOMBRES_CAPA: Record<OpcionGaleria["capa"], string> = {
  dispositivo: "Este aparato",
  navegador: "La pestaña (WebGPU)",
  neurona: "Tu otra neurona",
  malla: "Tu malla",
  espacio: "Space de Hugging Face",
  "web-gratis": "Web gratis",
  externo: "Servicio de pago",
};

const USO_TEXTO: Record<UsoLicencia | "libre", string> = {
  libre: "libre",
  atribucion: "libre con atribución",
  condicionado: "condicionada",
  "restringido-region": "restringida por región",
  "no-comercial": "NO comercial",
};

/** Nombre humano de la capa que sirvió la imagen (nunca un identificador interno). */
export function nombreCapa(capa: OpcionGaleria["capa"]): string {
  return NOMBRES_CAPA[capa] ?? "Capa desconocida";
}

/** Etiqueta de licencia y aviso cuando no sirve para el uso comercial de quien mira. */
export function etiquetaUso(uso: UsoLicencia | "libre", comercial: boolean): string {
  const base = USO_TEXTO[uso] ?? "sin comprobar";
  if (comercial && (uso === "no-comercial" || uso === "restringido-region")) return `${base} — no vale aquí`;
  return base;
}

/** Título de una opción: capa y modelo; la web gratis y los servicios no fingen un modelo. */
export function tituloOpcion(op: OpcionGaleria): string {
  return `${nombreCapa(op.capa)}${op.modelo ? ` · ${op.modelo}` : ""}`;
}

/** Línea de la semilla y el tiempo real de esa opción (sin inventar segundos). */
export function semillaTexto(op: OpcionGaleria): string {
  return `Semilla ${op.semilla}${op.segundos > 0 ? ` · ${op.segundos} s` : ""}`;
}

/** Licencia y atribución visibles tal cual; si falta la atribución, solo la licencia. */
export function licenciaTexto(op: OpcionGaleria): string {
  return `Licencia: ${op.licencia}${op.atribucion ? ` · ${op.atribucion}` : ""}`;
}

/**
 * Lo que de verdad se puede enseñar de una galería: solo las opciones con `url`.
 * Si no hay ninguna, devuelve `null` para que la tarjeta no pinte un hueco vacío.
 */
export function galeriaPresentable(
  galeria: { opciones?: readonly OpcionGaleria[]; descartes?: readonly string[]; error?: string } | null | undefined,
): GaleriaPresentable | null {
  if (!galeria || !Array.isArray(galeria.opciones)) return null;
  const opciones = galeria.opciones
    .filter((op): op is OpcionGaleria & { url: string } => typeof op.url === "string" && op.url.length > 0)
    .map((op) => ({
      ...op,
      titulo: tituloOpcion(op),
      semillaTexto: semillaTexto(op),
      licenciaTexto: licenciaTexto(op),
    }));
  if (!opciones.length) return null;
  return {
    opciones,
    descartes: Array.isArray(galeria.descartes) ? [...galeria.descartes] : [],
    ...(galeria.error ? { error: galeria.error } : {}),
  };
}
