/**
 * SIMBOLO-GEOMETRIA — Geometría pura del símbolo oficial StarSeed (Ola 1024D)
 * 
 * Módulo PURO: sin red, disco, reloj ni node:*. 
 * Lienzo 400 × 400, centro (200, 200), r = 80.
 * 
 * Referencia-2 oficial. Solo exports puros para generar rutas SVG.
 */

export interface Punto {
  x: number;
  y: number;
}

export interface Faceta {
  id: string;
  /** Ruta SVG del polígono */
  ruta: string;
  /** Color hexadecimal oficial */
  color: string;
  /** Lado: 'izquierda' | 'derecha' para determinar claro/oscuro */
  lado: 'izquierda' | 'derecha' | 'centro';
  /** Triángulo: 'superior' | 'inferior' */
  triangulo: 'superior' | 'inferior';
}

/** Parámetros base del símbolo */
export const SIMBOLO_BASE = {
  ancho: 400,
  alto: 400,
  centroX: 200,
  centroY: 200,
  radio: 80,
} as const;

/** Centros de los dos círculos */
export const CENTROS_CIRCULOS = {
  superior: { x: 200, y: 160 } as Punto,
  inferior: { x: 200, y: 240 } as Punto,
} as const;

/** Puntos de las esquinas del rombo/lente */
export const ESQUINAS = {
  izquierda: { x: 200 - 69.28, y: 200 } as Punto,
  derecha: { x: 200 + 69.28, y: 200 } as Punto,
} as const;

/** Ápices del rombo (dos triángulos equiláteros) */
export const APICES = {
  superior: { x: 200, y: 80 } as Punto,
  inferior: { x: 200, y: 320 } as Punto,
} as const;

/** Puntos base para las facetas (7 puntos en línea y=200) */
export const PUNTOS_BASE = [
  { x: 200 - 69.28, y: 200 }, // extremo izquierda
  { x: 200 - 51.40, y: 200 },
  { x: 200 - 29.60, y: 200 },
  { x: 200, y: 200 },         // centro
  { x: 200 + 29.60, y: 200 },
  { x: 200 + 51.40, y: 200 },
  { x: 200 + 69.28, y: 200 }, // extremo derecha
] as const;

/** Colores oficiales: cara izquierda la oscura y derecha la clara */
const COLORES_SUPERIOR = {
  rojo: { izquierda: '#A52D2D', derecha: '#CC3737' },
  verde: { izquierda: '#38A52D', derecha: '#51CC37' },
  azul: { izquierda: '#2C2CA8', derecha: '#3636CC' },
} as const;

const COLORES_INFERIOR = {
  rojo: { izquierda: '#A52D2D', derecha: '#CC3737' },
  amarillo: { izquierda: '#C1BD3A', derecha: '#E2D640' },
  azul: { izquierda: '#2C2CA8', derecha: '#3636CC' },
} as const;

/** Discos superiores e inferiores */
export const COLORES_DISCOS = {
  superior: { izquierda: '#CCCCCC', derecha: '#EAEAEA' },
  inferior: { izquierda: '#000000', derecha: '#3A3A3A' },
} as const;

/** Ojo */
export const OJO = {
  contorno: '#DCDCDC',
  blancoCentro: { x: 200, y: 280.8 },
  blancoRadio: 109.4,
  pupila: '#272525',
  pupilaRadio: 40,
  brillo: { x: 213.5, y: 183.9 },
  brilloRadio: 10.5,
} as const;

/** Genera ruta SVG para un polígono de 3 puntos */
function poligonoRuta(p1: Punto, p2: Punto, p3: Punto): string {
  return `M ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} Z`;
}

/** Genera las 12 facetas del símbolo */
export function generarFacetas(): Faceta[] {
  const facetas: Faceta[] = [];
  const apexSuperior = APICES.superior;
  const apexInferior = APICES.inferior;
  const basePuntos = PUNTOS_BASE;

  // Triángulo superior: arriba rojo, verde y azul (cara izquierda la oscura y derecha la clara)
  for (let i = 0; i < basePuntos.length - 1; i++) {
    const p1 = basePuntos[i];
    const p2 = basePuntos[i + 1];
    const lado: Faceta['lado'] = i < 3 ? 'izquierda' : i === 3 ? 'centro' : 'derecha';
    
    let color: string;
    if (i === 0) {
      color = COLORES_SUPERIOR.rojo.izquierda;
    } else if (i === 1) {
      color = COLORES_SUPERIOR.verde.izquierda;
    } else if (i === 2) {
      color = COLORES_SUPERIOR.verde.derecha;
    } else if (i === 3) {
      color = COLORES_SUPERIOR.azul.izquierda;
    } else if (i === 4) {
      color = COLORES_SUPERIOR.azul.derecha;
    } else if (i === 5) {
      color = COLORES_SUPERIOR.rojo.derecha;
    } else {
      color = COLORES_SUPERIOR.azul.derecha;
    }
    
    facetas.push({
      id: `sup-${i}`,
      ruta: poligonoRuta(apexSuperior, p1, p2),
      color,
      lado,
      triangulo: 'superior',
    });
  }

  // Triángulo inferior: abajo rojo, amarillo y azul (cara izquierda la oscura y derecha la clara)
  for (let i = 0; i < basePuntos.length - 1; i++) {
    const p1 = basePuntos[i];
    const p2 = basePuntos[i + 1];
    const lado: Faceta['lado'] = i < 3 ? 'izquierda' : i === 3 ? 'centro' : 'derecha';
    
    let color: string;
    if (i === 0) {
      color = COLORES_INFERIOR.rojo.izquierda;
    } else if (i === 1) {
      color = COLORES_INFERIOR.amarillo.izquierda;
    } else if (i === 2) {
      color = COLORES_INFERIOR.amarillo.derecha;
    } else if (i === 3) {
      color = COLORES_INFERIOR.azul.izquierda;
    } else if (i === 4) {
      color = COLORES_INFERIOR.azul.derecha;
    } else if (i === 5) {
      color = COLORES_INFERIOR.rojo.derecha;
    } else {
      color = COLORES_INFERIOR.azul.derecha;
    }
    
    facetas.push({
      id: `inf-${i}`,
      ruta: poligonoRuta(apexInferior, p2, p1),
      color,
      lado,
      triangulo: 'inferior',
    });
  }

  return facetas;
}

/** Genera todas las rutas SVG del símbolo completo */
export function generarRutasSVG() {
  const facetas = generarFacetas();
  
  return {
    facetas,
    circulos: {
      superior: `M ${CENTROS_CIRCULOS.superior.x},${CENTROS_CIRCULOS.superior.y} m -${SIMBOLO_BASE.radio},0 a ${SIMBOLO_BASE.radio},${SIMBOLO_BASE.radio} 0 1,0 ${SIMBOLO_BASE.radio * 2},0 a ${SIMBOLO_BASE.radio},${SIMBOLO_BASE.radio} 0 1,0 -${SIMBOLO_BASE.radio * 2},0`,
      inferior: `M ${CENTROS_CIRCULOS.inferior.x},${CENTROS_CIRCULOS.inferior.y} m -${SIMBOLO_BASE.radio},0 a ${SIMBOLO_BASE.radio},${SIMBOLO_BASE.radio} 0 1,0 ${SIMBOLO_BASE.radio * 2},0 a ${SIMBOLO_BASE.radio},${SIMBOLO_BASE.radio} 0 1,0 -${SIMBOLO_BASE.radio * 2},0`,
    },
    rombo: {
      superior: poligonoRuta(APICES.superior, ESQUINAS.izquierda, ESQUINAS.derecha),
      inferior: poligonoRuta(APICES.inferior, ESQUINAS.derecha, ESQUINAS.izquierda),
    },
    ojo: {
      contorno: `M ${OJO.blancoCentro.x},${OJO.blancoCentro.y} m -${OJO.blancoRadio},0 a ${OJO.blancoRadio},${OJO.blancoRadio} 0 1,0 ${OJO.blancoRadio * 2},0 a ${OJO.blancoRadio},${OJO.blancoRadio} 0 1,0 -${OJO.blancoRadio * 2},0`,
      pupila: `M ${OJO.blancoCentro.x},${OJO.blancoCentro.y} m -${OJO.pupilaRadio},0 a ${OJO.pupilaRadio},${OJO.pupilaRadio} 0 1,0 ${OJO.pupilaRadio * 2},0 a ${OJO.pupilaRadio},${OJO.pupilaRadio} 0 1,0 -${OJO.pupilaRadio * 2},0`,
      brillo: `M ${OJO.brillo.x},${OJO.brillo.y} m -${OJO.brilloRadio},0 a ${OJO.brilloRadio},${OJO.brilloRadio} 0 1,0 ${OJO.brilloRadio * 2},0 a ${OJO.brilloRadio},${OJO.brilloRadio} 0 1,0 -${OJO.brilloRadio * 2},0`,
    },
  };
}
