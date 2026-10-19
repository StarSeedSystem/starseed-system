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
  // Placeholder implementation
  const { tipo, ancho: givenAncho, alto: givenAlto } = options;
  const horizontalMargin = viewport.ancho < 430 ? 16 : 0;
  const availWidth = viewport.ancho - 2 * horizontalMargin;
  const maxWidth = Math.min(availWidth, 1186);
  const width = givenAncho ?? Math.min(maxWidth * 0.9, availWidth);
  const height = givenAlto ?? Math.min(viewport.alto * 0.8, viewport.alto);
  let x = horizontalMargin + (availWidth - width) / 2;
  let y = (viewport.alto - height) / 2;
  const origen = "top-left";

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