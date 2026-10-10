// Motor puro de entrada XR: convierte lecturas crudas en acciones con flancos,
// histéresis de ejes y antirrebote del giro por saltos.
import type { AccionXR, Gesto, MapaEntrada } from "./vinculos-xr";
import { claveGatillo } from "./vinculos-xr";
import type { Mano } from "./gestos";

export type { Mano };

export interface LecturaMando {
  botones: boolean[];
  ejes: number[];
}

export interface MotorEntrada {
  botones(izq: LecturaMando, der: LecturaMando, ahora: number): AccionXR[];
  tecla(codigo: string, ahora: number): AccionXR[];
  frase(texto: string): AccionXR[];
  gesto(g: Gesto, mano: Mano | "cualquiera", sube: boolean): AccionXR[];
}

const EJE_DISPARA = 0.6;
const EJE_SUELTA = 0.3;
const ANTIRREBOTE_GIRO_MS = 250;
const EJES = [2, 3];

type EstadoEje = -1 | 0 | 1;

function accionesDelMapa(mapa: MapaEntrada, claves: string[]): AccionXR[] {
  const salida: AccionXR[] = [];
  for (const entrada of mapa) {
    if (claves.includes(claveGatillo(entrada.gatillo))) salida.push(entrada.accion);
  }
  return salida;
}

export function crearMotorEntrada(mapa: MapaEntrada): MotorEntrada {
  const prevBotones: Record<Mano, boolean[]> = { izquierda: [], derecha: [] };
  const estadoEjes: Record<Mano, EstadoEje[]> = { izquierda: [], derecha: [] };
  let ultimoGiro = -Infinity;

  function procesarMando(mano: Mano, lectura: LecturaMando, ahora: number): AccionXR[] {
    const claves: string[] = [];
    const prev = prevBotones[mano];
    lectura.botones.forEach((pulsado, i) => {
      if (pulsado && !prev[i]) {
        claves.push(`boton:${mano}:${i}`);
      }
    });
    prevBotones[mano] = lectura.botones.slice();
    const estados = estadoEjes[mano];
    for (const eje of EJES) {
      const v = lectura.ejes[eje] ?? 0;
      const previo: EstadoEje = estados[eje] ?? 0;
      const dir: EstadoEje = v > EJE_DISPARA ? 1 : v < -EJE_DISPARA ? -1 : previo;
      const suelto = v > -EJE_SUELTA && v < EJE_SUELTA;
      const firme = suelto ? 0 : dir;
      if (firme !== 0 && previo === 0 && ahora - ultimoGiro >= ANTIRREBOTE_GIRO_MS) {
        claves.push(`eje:${mano}:${eje}:${firme > 0 ? "+" : "-"}`);
        ultimoGiro = ahora;
      }
      estados[eje] = firme;
    }
    estadoEjes[mano] = estados;
    return accionesDelMapa(mapa, claves);
  }

  return {
    botones(izq, der, ahora) {
      return [
        ...procesarMando("izquierda", izq, ahora),
        ...procesarMando("derecha", der, ahora),
      ];
    },
    tecla(codigo, _ahora) {
      return accionesDelMapa(mapa, [`tecla:${codigo}`]);
    },
    frase(texto) {
      return accionesDelMapa(mapa, [`frase:${texto.trim().toLowerCase()}`]);
    },
    gesto(g, mano, sube) {
      if (!sube) return [];
      const tipo = String(g);
      return accionesDelMapa(mapa, [`gesto:${tipo}:${mano}`, `gesto:${tipo}:cualquiera`]);
    },
  };
}
