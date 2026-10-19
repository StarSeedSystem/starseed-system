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
  // Placeholder implementation
  if (xr) return "xr";
  if (ancho < 430) return "telefono";
  if (ancho < 768) return "tableta";
  if (ancho < 1280) return "escritorio";
  return "grande";
}

export function geometriaVentana(viewport: Viewport, options: GeometriaVentanaOptions): GeometriaVentanaReturn {
  const { tipo, ancho: givenAncho, alto: givenAlto } = options;
  const isPhone = viewport.ancho < 430;
  const horizontalMargin = isPhone ? 16 : 0;
  const availWidth = viewport.ancho - 2 * horizontalMargin;
  const maxWidth = Math.min(availWidth, 1186);

  // Determine width and height based on tipo and provided values
  let width: number;
  let height: number;

  if (givenAncho !== undefined) {
    width = Math.min(givenAncho, maxWidth);
  } else {
    // Default width based on tipo
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
    // Default height based on tipo
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

  // Clamp width and height to not exceed availWidth and viewport.alto (though already done)
  width = Math.min(width, availWidth);
  height = Math.min(height, viewport.alto);

  // Calculate x and y based on tipo
  let x: number;
  let y: number;
  const origen = "top-left"; // We'll use top-left origin for all, meaning x,y is top-left corner

  switch (tipo) {
    case "dialogo":
    case "ventana":
      x = horizontalMargin + (availWidth - width) / 2;
      y = (viewport.alto - height) / 2;
      break;
    case "hoja":
      if (isPhone) {
        // Hoja que sube desde abajo en teléfono: centrado horizontalmente, alineado al fondo
        x = horizontalMargin + (availWidth - width) / 2;
        y = viewport.alto - height;
      } else {
        // On larger screens, treat as dialogo
        x = horizontalMargin + (availWidth - width) / 2;
        y = (viewport.alto - height) / 2;
      }
      break;
    case "panel-lateral":
      // Anchored to the left
      x = horizontalMargin;
      y = 0; // Top aligned to viewport top
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
  // Placeholder implementation
  return {
    x: 0,
    y: viewport.alto - 140,
    ancho: viewport.ancho,
    alto: 140
  };
}