/**
 * Avatares 3D · CAMBIOS EN PALABRAS (AV1011J). Contrato: architecture/astraura-avatares-3d.md §7 y §9-J.
 *
 * Quien vota un avatar no debe leer jerga: cada `CambioAvatar` se cuenta en una frase clara, con su valor.
 * PURO: sin React, red, reloj ni aleatorio.
 */
import type { CambioAvatar } from "./cambios";

const ETIQUETAS: Record<string, string> = {
  altura: "altura", complexion: "complexión", cabeza: "tamaño de cabeza", hombros: "hombros",
  cintura: "cintura", piernas: "piernas", brazos: "brazos", estilizado: "estilizado",
  piel: "piel", cabello: "cabello", ojos: "ojos", "ropa-1": "ropa 1", "ropa-2": "ropa 2",
  acento: "acento", aura: "aura", color: "color", metal: "metal", rugosidad: "rugosidad",
  emisivo: "brillo emisivo", energia: "energía", amplitud: "amplitud", ritmo: "ritmo",
  postura: "postura", neutral: "neutral", happy: "alegría", angry: "enfado", sad: "tristeza",
  relaxed: "calma", surprised: "sorpresa", aa: "boca A", ih: "boca I", ou: "boca U",
  ee: "boca E", oh: "boca O", blink: "parpadeo", blinkLeft: "parpadeo izquierdo",
  blinkRight: "parpadeo derecho", lookUp: "mirada arriba", lookDown: "mirada abajo",
  lookLeft: "mirada a la izquierda", lookRight: "mirada a la derecha", tono: "tono",
  intensidad: "intensidad", ligadaEmocion: "ligada a la emoción",
};

const VISIBILIDAD: Record<string, string> = { privado: "privado", grupo: "solo el grupo", publico: "público" };
const etiqueta = (clave: string): string => ETIQUETAS[clave] ?? clave.replace(/-/g, " ");

/** Números con coma decimal y sin ruido (0,5 en vez de 0,5000000001). */
export function numeroEnPalabras(valor: number): string {
  return String(Math.round(valor * 100) / 100).replace(".", ",");
}

export function describirCambioAvatar(cambio: CambioAvatar): string {
  switch (cambio.op) {
    case "nombre":
      return `Nombre: «${cambio.valor}»`;
    case "visibilidad":
      return `Visibilidad: ${VISIBILIDAD[cambio.valor] ?? cambio.valor}`;
    case "base":
      return `Base: ${cambio.tipo}${cambio.ref ? ` (${cambio.ref})` : ""}`;
    case "morfologia":
      return `Morfología · ${etiqueta(cambio.clave)}: ${numeroEnPalabras(cambio.valor)}`;
    case "expresion":
      return `Expresión · ${etiqueta(cambio.clave)}: ${numeroEnPalabras(cambio.valor)}`;
    case "material": {
      const valor = cambio.campo === "color" ? String(cambio.valor) : numeroEnPalabras(Number(cambio.valor));
      return `Material · ${etiqueta(cambio.slot)} · ${etiqueta(String(cambio.campo))}: ${valor}`;
    }
    case "pieza":
      return `Pieza · ${etiqueta(cambio.slot)}: ${cambio.ref ?? "se quita"}${cambio.tinte ? ` · tinte ${cambio.tinte}` : ""}`;
    case "aura":
      if (cambio.campo === "tono") return `Aura · tono: ${Math.round(Number(cambio.valor))}°`;
      if (cambio.campo === "intensidad") return `Aura · intensidad: ${numeroEnPalabras(Number(cambio.valor))}`;
      return `Aura ligada a la emoción: ${cambio.valor ? "sí" : "no"}`;
    case "movimiento":
      return `Movimiento · ${etiqueta(cambio.campo)}: ${numeroEnPalabras(cambio.valor)}`;
  }
}
