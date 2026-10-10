// Vínculos de entrada XR: gatillos (botón, eje, tecla, frase, gesto) que el
// motor de entrada convierte en acciones. Puro, sin APIs de navegador.
export type ManoGatillo = "izquierda" | "derecha" | "cualquiera";

export type Gesto = "pellizco" | "puno-cerrado" | "palma-a-la-cara" | "tocar-muneca";

export type AccionXR =
  | "seleccionar"
  | "abrir-menu"
  | "cerrar-menu"
  | "teletransportar"
  | "giro-izquierda"
  | "giro-derecha"
  | "salir";

export type Gatillo =
  | { tipo: "boton"; mano: ManoGatillo; indice: number }
  | { tipo: "eje"; mano: ManoGatillo; eje: number; direccion: "+" | "-" }
  | { tipo: "tecla"; codigo: string }
  | { tipo: "frase"; texto: string }
  | { tipo: "gesto"; gesto: Gesto; mano: ManoGatillo };

export interface EntradaMapa {
  gatillo: Gatillo;
  accion: AccionXR;
}

export type MapaEntrada = EntradaMapa[];

// Gestos que el sistema reserva cuando la palma mira a la cara (gesto del
// menú del SO): mientras la palma está hacia ti, el pellizco no dispara.
export const GESTOS_RESERVADOS: Gesto[] = ["pellizco"];

export function claveGatillo(g: Gatillo): string {
  switch (g.tipo) {
    case "boton":
      return `boton:${g.mano}:${g.indice}`;
    case "eje":
      return `eje:${g.mano}:${g.eje}:${g.direccion}`;
    case "tecla":
      return `tecla:${g.codigo}`;
    case "frase":
      return `frase:${g.texto.trim().toLowerCase()}`;
    case "gesto":
      return `gesto:${g.gesto}:${g.mano}`;
  }
}

export const MAPAS_DEFECTO: MapaEntrada = [
  { gatillo: { tipo: "boton", mano: "derecha", indice: 0 }, accion: "seleccionar" },
  { gatillo: { tipo: "boton", mano: "derecha", indice: 1 }, accion: "abrir-menu" },
  { gatillo: { tipo: "boton", mano: "izquierda", indice: 0 }, accion: "teletransportar" },
  { gatillo: { tipo: "eje", mano: "derecha", eje: 2, direccion: "+" }, accion: "giro-derecha" },
  { gatillo: { tipo: "tecla", codigo: "Escape" }, accion: "salir" },
  { gatillo: { tipo: "tecla", codigo: "FlechaIzquierda" }, accion: "giro-izquierda" },
  { gatillo: { tipo: "frase", texto: "salir" }, accion: "salir" },
  { gatillo: { tipo: "gesto", gesto: "pellizco", mano: "cualquiera" }, accion: "seleccionar" },
  { gatillo: { tipo: "gesto", gesto: "palma-a-la-cara", mano: "cualquiera" }, accion: "cerrar-menu" },
];
