/**
 * Plantillas iniciales de avatares 3D (AV1011L · architecture/astraura-avatares-3d.md §9-L).
 * Lista las plantillas VRM CC0 servidas por la Biblioteca pública y su ADN de partida.
 * Colección: Numinia Digital Goods (CC0-1.0, github.com/PabloFMM/numinia-digital-goods-data,
 * verificado en su LICENSE oficial el 2026-10-13). 100Avatars se descartó: no CC0 verificable.
 * PURO: sin red, reloj ni DOM. La malla vive en la Biblioteca; aquí solo referencias.
 */
import { adnPorDefecto, texto, type AdnAvatar, type Procedencia } from "./adn/adn";

export interface PlantillaAvatar {
  /** Id corto; la malla es `biblioteca:avatares/plantillas/<id>.vrm`. */
  id: string;
  nombre: string;
  autor: string;
  tonoAura: number;
  bytesVrm: number;
}

const LICENCIA = "https://github.com/PabloFMM/numinia-digital-goods-data/blob/main/LICENSE";

/** Juego inicial: 6 modelos (~24,6 MB), dentro del límite de 10 modelos y 30 MB. */
export const PLANTILLAS_AVATAR: readonly PlantillaAvatar[] = [
  { id: "inicio-01", nombre: "Numinia Starter 01", autor: "PabloFMM", tonoAura: 260, bytesVrm: 3928908 },
  { id: "arla", nombre: "Avatar Arla", autor: "PabloFMM", tonoAura: 200, bytesVrm: 3908872 },
  { id: "procyon", nombre: "Avatar Procyon", autor: "VIPE - Numen", tonoAura: 320, bytesVrm: 2608148 },
  { id: "senet", nombre: "Avatar Senet 2026", autor: "Numinia", tonoAura: 40, bytesVrm: 8906412 },
  { id: "avocado", nombre: "Avocado", autor: "Numinia", tonoAura: 110, bytesVrm: 1253352 },
  { id: "aii", nombre: "Avatar AII Surprise", autor: "Numinia", tonoAura: 180, bytesVrm: 3972524 },
];

export const refDePlantilla = (id: string): string => `biblioteca:avatares/plantillas/${texto(id, 40)}.vrm`;

export function plantillaPorId(id: string): PlantillaAvatar | null {
  const p = PLANTILLAS_AVATAR.find((x) => x.id === texto(id, 40));
  return p ?? null;
}

function procedenciaPlantilla(p: PlantillaAvatar): Procedencia {
  return { herramienta: "Numinia Digital Goods", licencia: "CC0-1.0", uso: "libre", atribucion: `${p.nombre} · ${p.autor} · CC0 (${LICENCIA})` };
}

/**
 * ADN de partida de una plantilla (`base: vrm` humana, pública-ready en privado).
 * La misma pieza sirve a persona, bot, grupo o página: el dueño lo pone quien la elige.
 */
export function adnDePlantilla(id: string, dueno: AdnAvatar["dueno"], idAdn: string): AdnAvatar | null {
  const p = plantillaPorId(id);
  if (!p) return null;
  const adn = adnPorDefecto(idAdn, p.nombre, dueno, p.tonoAura);
  adn.base = { tipo: "vrm", ref: refDePlantilla(p.id) };
  adn.esqueleto = { tipo: "vrm-humanoide", articulaciones: 55 };
  adn.procedencia = [procedenciaPlantilla(p)];
  return adn;
}
