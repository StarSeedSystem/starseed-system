// Composición centrada y adaptable por aparato
// Ancho máximo 1186 px y ancho de lectura 65 ch, margen mínimo 16 px en teléfono
export type TipoAparato = "telefono" | "tableta" | "escritorio" | "grande" | "xr";

export type TipoVentana = "dialogo" | "ventana" | "hoja" | "panel-lateral";

export interface Viewport {
  ancho: number;
  alto: number;
}

export interface GeometriaVentanaOptions {
  tipo: TipoVentana;
  ancho?: number;
  alto?: number;
}

export interface GeometriaVentanaReturn {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  origen: string;
}

export function tipoAparato({ ancho, alto, puntero, xr }: { ancho: number; alto: number; puntero: boolean; xr: boolean }): TipoAparato {
  // Realidad extendida tiene prioridad
  if (xr) return "xr";
  // Teléfono siempre por ancho estrecho
  if (ancho < 430) return "telefono";
  // Con puntero, el umbral de tableta sube a escritorio
  if (ancho < 768) {
    return puntero ? "escritorio" : "tableta";
  }
  if (ancho < 1280) return "escritorio";
  return "grande";
}

export function geometriaVentana(viewport: Viewport, options: GeometriaVentanaOptions): GeometriaVentanaReturn {
  const { tipo, ancho: givenAncho, alto: givenAlto } = options;
  const isPhone = viewport.ancho < 430;
  const horizontalMargin = isPhone ? 16 : 0;
  const availWidth = viewport.ancho - 2 * horizontalMargin;
  const maxWidth = Math.min(availWidth, 1186);

  // Determina ancho y alto según tipo y valores proporcionados
  let width: number;
  let height: number;

  if (givenAncho !== undefined) {
    width = Math.min(givenAncho, maxWidth);
  } else {
    // Ancho por defecto según tipo
    switch (tipo) {
      case "dialogo":
      case "ventana":
        width = Math.min(maxWidth * 0.9, availWidth);
        break;
      case "hoja":
        width = isPhone ? availWidth : Math.min(maxWidth * 0.9, availWidth);
        break;
      case "panel-lateral":
        width = Math.min(availWidth * 0.3, 400);
        break;
    }
  }

  if (givenAlto !== undefined) {
    height = Math.min(givenAlto, viewport.alto);
  } else {
    // Alto por defecto según tipo
    switch (tipo) {
      case "dialogo":
      case "ventana":
        height = Math.min(viewport.alto * 0.8, viewport.alto);
        break;
      case "hoja":
        height = isPhone ? Math.min(viewport.alto * 0.6, viewport.alto) : Math.min(viewport.alto * 0.8, viewport.alto);
        break;
      case "panel-lateral":
        height = viewport.alto;
        break;
    }
  }

  // Acota a viewport disponible
  width = Math.min(width, availWidth);
  height = Math.min(height, viewport.alto);

  // Calcula x e y según tipo, con composición centrada
  let x: number;
  let y: number;
  const origen = "top-left";

  switch (tipo) {
    case "dialogo":
    case "ventana":
      x = horizontalMargin + (availWidth - width) / 2;
      y = (viewport.alto - height) / 2;
      break;
    case "hoja":
      if (isPhone) {
        // Hoja que sube desde abajo en teléfono, centrada horizontalmente
        x = horizontalMargin + (availWidth - width) / 2;
        y = viewport.alto - height;
      } else {
        x = horizontalMargin + (availWidth - width) / 2;
        y = (viewport.alto - height) / 2;
      }
      break;
    case "panel-lateral":
      // Anclado a la izquierda, respeta margen
      x = horizontalMargin;
      y = 0;
      break;
  }

  return { x, y, ancho: width, alto: height, origen };
}

export interface ZonaPulgar {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export function zonaPulgar(viewport: Viewport): ZonaPulgar {
  const isPhone = viewport.ancho < 430;
  if (!isPhone) {
    return { x: 0, y: 0, ancho: 0, alto: 0 };
  }
  // Zona inferior para acciones con el pulgar en teléfono
  return {
    x: 0,
    y: viewport.alto - 140,
    ancho: viewport.ancho,
    alto: 140
  };
}