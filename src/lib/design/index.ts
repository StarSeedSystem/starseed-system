"use client";

export const R = 80;

export const CENTER = { x: 200, y: 200 };

export const APICES = {
  arriba: { x: 200, y: 80 },
  abajo: { x: 200, y: 320 },
};

export interface Faca {
  angulo: number;
  color: string;
}

export const FACETAS: Faca[] = [
  { angulo: 0, color: "#FF0000" },
  { angulo: 13.86, color: "#FF6B00" },
  { angulo: 23.2, color: "#FFD700" },
  { angulo: 30, color: "#00FF00" },
  { angulo: -30, color: "#0000FF" },
  { angulo: -23.2, color: "#8A2BE2" },
  { angulo: -13.86, color: "#FF1493" },
  { angulo: 30, color: "#FF4500" },
  { angulo: 23.2, color: "#32CD32" },
  { angulo: 13.86, color: "#1E90FF" },
  { angulo: -30, color: "#FF8C00" },
  { angulo: -23.2, color: "#DA70D6" },
];

export interface ColoresRombo {
  rojoArriba: string;
  verdeArriba: string;
  azulArriba: string;
  rojoAbajo: string;
  amarilloAbajo: string;
  azulAbajo: string;
}

export const COLORES: ColoresRombo = {
  rojoArriba: "#FF0000",
  verdeArriba: "#00FF00",
  azulArriba: "#0000FF",
  rojoAbajo: "#FF4500",
  amarilloAbajo: "#FFD700",
  azulAbajo: "#8A2BE2",
};
