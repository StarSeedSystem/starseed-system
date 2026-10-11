/**
 * Bots/dots de Astraura · DISPOSICIÓN DE ORBES (BOT1011C1, 2026-10-11).
 * Puro: sin React, red, DOM, reloj ni `node:*`; ≤ 200 líneas.
 * La orbe flotante es el bot (Astraura); varias a la vez, sin solapar.
 */

export const MAX_ORBES_VISIBLES = 5;

export interface PosOrbe {
  xRatio: number;
  yRatio: number;
}

export interface EntradaOrbe {
  id: string;
  principal?: boolean;
  pos?: PosOrbe;
}

export interface VistaOrbes {
  ancho: number;
  alto: number;
  diametro: number;
}

export interface ResultadoOrbe {
  id: string;
  pos: PosOrbe;
  visible: boolean;
}

const MARGEN_RATIO = 0.06; // margen dentro de la vista (en ratios)
const MIN_DIST_PX_RATIO = 0.0; // se traduce a px con ancho/alto

function aPx(ratio: number, dim: number): number {
  return ratio * dim;
}

function distancia(p1: PosOrbe, p2: PosOrbe, ancho: number, alto: number): number {
  const dx = (p1.xRatio - p2.xRatio) * ancho;
  const dy = (p1.yRatio - p2.yRatio) * alto;
  return Math.sqrt(dx * dx + dy * dy);
}

/** La principal conserva su posición; las demás, arco junto a ella hacia dentro. */
export function disposicionOrbes(
  abiertos: readonly EntradaOrbe[],
  vista: VistaOrbes,
): ResultadoOrbe[] {
  const { ancho, alto, diametro } = vista;
  const distMin = diametro + 8; // distancia mínima entre centros (px)

  // Determinista: orden estable de entrada (mismo orden siempre).
  const orden = [...abiertos];
  const principal = orden.find((o) => o.principal) || orden[0];

  // Posición de la principal: guardada o por defecto centrada-baja.
  const posPrincipal: PosOrbe = principal?.pos
    ? { xRatio: Math.max(MARGEN_RATIO, Math.min(1 - MARGEN_RATIO, principal.pos.xRatio)), yRatio: Math.max(MARGEN_RATIO, Math.min(1 - MARGEN_RATIO, principal.pos.yRatio)) }
    : { xRatio: 0.5, yRatio: 0.5 };

  // Las demás se colocan en arco junto a la principal, hacia dentro de la pantalla.
  const resultado: ResultadoOrbe[] = [];
  const colocadas: PosOrbe[] = [posPrincipal];

  // Función pura para encontrar una posición libre.
  function buscarPosicion(indice: number, base: PosOrbe): PosOrbe {
    // Arco circular alrededor de la principal, hacia el interior del viewport.
    const total = orden.length - 1; // sin la principal
    const angulo = total > 0 ? ((2 * Math.PI * indice) / Math.max(1, total)) : 0;
    // Radio en ratios (adaptado al diámetro para no solaparse).
    const radioRatio = Math.max(0.18, (distMin / Math.min(ancho, alto)) + 0.05);
    const cx = base.xRatio + radioRatio * Math.cos(angulo);
    const cy = base.yRatio + radioRatio * Math.sin(angulo);
    const candidato: PosOrbe = {
      xRatio: Math.max(MARGEN_RATIO + diametro / (2 * ancho), Math.min(1 - MARGEN_RATIO - diametro / (2 * ancho), cx)),
      yRatio: Math.max(MARGEN_RATIO + diametro / (2 * alto), Math.min(1 - MARGEN_RATIO - diametro / (2 * alto), cy)),
    };
    return candidato;
  }

  // Coloca la principal.
  resultado.push({ id: principal.id, pos: posPrincipal, visible: true });

  // Coloca las demás (en orden de entrada, excluyendo la principal).
  const otras = orden.filter((o) => o.id !== principal.id);
  for (let i = 0; i < otras.length; i++) {
    const o = otras[i];
    let candidato = o.pos ? { xRatio: o.pos.xRatio, yRatio: o.pos.yRatio } : buscarPosicion(i, posPrincipal);
    // Ajusta al margen con diámetro.
    candidato.xRatio = Math.max(MARGEN_RATIO + diametro / (2 * ancho), Math.min(1 - MARGEN_RATIO - diametro / (2 * ancho), candidato.xRatio));
    candidato.yRatio = Math.max(MARGEN_RATIO + diametro / (2 * alto), Math.min(1 - MARGEN_RATIO - diametro / (2 * alto), candidato.yRatio));

    // Si la posición guardada se sale de la vista, recoloca en arco.
    if (o.pos) {
      const dentroX = o.pos.xRatio >= MARGEN_RATIO + diametro / (2 * ancho) && o.pos.xRatio <= 1 - MARGEN_RATIO - diametro / (2 * ancho);
      const dentroY = o.pos.yRatio >= MARGEN_RATIO + diametro / (2 * alto) && o.pos.yRatio <= 1 - MARGEN_RATIO - diametro / (2 * alto);
      if (!dentroX || !dentroY) {
        candidato = buscarPosicion(i, posPrincipal);
        candidato.xRatio = Math.max(MARGEN_RATIO + diametro / (2 * ancho), Math.min(1 - MARGEN_RATIO - diametro / (2 * ancho), candidato.xRatio));
        candidato.yRatio = Math.max(MARGEN_RATIO + diametro / (2 * alto), Math.min(1 - MARGEN_RATIO - diametro / (2 * alto), candidato.yRatio));
      }
    }

    // Evita solapamiento: empuja a la siguiente ranura si hay colisión.
    let intentos = 0;
    let libre = false;
    while (!libre && intentos < 30) {
      libre = true;
      for (const colocada of colocadas) {
        if (distancia(candidato, colocada, ancho, alto) < distMin) {
          libre = false;
          // Empuja al siguiente ángulo.
          const anguloBase = (2 * Math.PI * i) / Math.max(1, otras.length);
          const anguloNuevo = anguloBase + (intentos + 1) * (Math.PI / 12);
          const radioRatio = Math.max(0.18, (distMin / Math.min(ancho, alto)) + 0.05);
          candidato = {
            xRatio: Math.max(MARGEN_RATIO + diametro / (2 * ancho), Math.min(1 - MARGEN_RATIO - diametro / (2 * ancho), posPrincipal.xRatio + radioRatio * Math.cos(anguloNuevo))),
            yRatio: Math.max(MARGEN_RATIO + diametro / (2 * alto), Math.min(1 - MARGEN_RATIO - diametro / (2 * alto), posPrincipal.yRatio + radioRatio * Math.sin(anguloNuevo))),
          };
          break;
        }
      }
      intentos++;
    }

    colocadas.push(candidato);
    const visible = i < MAX_ORBES_VISIBLES - 1; // la sexta (i=5) no visible
    resultado.push({ id: o.id, pos: candidato, visible });
  }

  return resultado;
}

/** Pone la orbe enfocada delante en el orden Z. */
export function ordenZ(
  ids: readonly string[],
  enfocado: string,
): string[] {
  const resto = ids.filter((i) => i !== enfocado);
  return enfocado ? [enfocado, ...resto] : [...ids];
}
