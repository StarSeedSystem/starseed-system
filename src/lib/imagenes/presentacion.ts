/**
 * Presentación de imágenes de Astraura (IMG1011J). Contrato: architecture/astraura-imagenes.md §4.
 *
 * Lógica PURA para que la tarjeta y otros puntos (chat, ajustes, Protomolécula) digan lo mismo
 * con las mismas palabras: nada de red, ni disco, ni React — entrada y salida.
 */
import type { OpcionImagen } from "@/lib/imagenes/plan";
import type { UsoLicencia } from "@/lib/avatares/adn/adn";

const NOMBRES_CAPA: Record<OpcionImagen["capa"], string> = {
  dispositivo: "esta neurona", navegador: "la pestaña (WebGPU)", neurona: "otra neurona tuya",
  malla: "la malla", espacio: "Space de Hugging Face", "web-gratis": "la web gratis", externo: "servicio externo",
};

/** Las consultables de una opción: qué capa la sirvió y con qué. */
export function resumenModelo(o: OpcionImagen): string {
  const capa = NOMBRES_CAPA[o.capa];
  const modelo = o.modelo ? o.modelo.nombre : "sin modelo nuevo";
  const cuantizada = o.cuantizacion === "nativa" ? "" : ` · ${o.cuantizacion}`;
  return `${modelo} · ${capa}${cuantizada}`;
}

const USO_TEXTO = {
  libre: "licencia libre", atribucion: "libre con atribución", condicionado: "condicionada",
  "no-comercial": "NO comercial", "restringido-region": "restringida por región",
} as const;

/** Etiqueta humana del uso de licencia, avisando cuando no vale para uso comercial. */
export function etiquetaUso(u: UsoLicencia, comercial: boolean): string {
  const base = USO_TEXTO[u];
  if (comercial && (u === "no-comercial" || u === "restringido-region")) return `${base} — no vale aquí`;
  return base;
}
