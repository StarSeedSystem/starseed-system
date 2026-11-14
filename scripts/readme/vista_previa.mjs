#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ANCHOS = [1280, 390];
export const PESO_MAXIMO_BYTES = 500 * 1024;

export const TEMAS = [
  { id: "claro", colorScheme: "light" },
  { id: "oscuro", colorScheme: "dark" },
];

export function rutaArchivo(idTema, ancho) {
  return `readme-${idTema}-${ancho}.webp`;
}

export function planDeVistas() {
  return TEMAS.flatMap((tema) => ANCHOS.map((ancho) => ({
    id: `${tema.id}-${ancho}`,
    tema: tema.id,
    ancho,
    alto: 800,
    archivo: rutaArchivo(tema.id, ancho),
  })));
}

export function calidadParaPeso(pesoBytes, pesoMaximo = PESO_MAXIMO_BYTES) {
  const calidades = [85, 70, 55, 40];
  for (const calidad of calidades) {
    const pesoEstimado = Math.round(pesoBytes * calidad / 100);
    if (pesoEstimado <= pesoMaximo) return calidad;
  }
  return 40;
}

export async function aWebp(pngBuffer, calidad) {
  const { default: sharp } = await import("sharp");
  return sharp(pngBuffer).webp({ quality: calidad }).toBuffer();
}

export async function main(argv = process.argv) {
  const destino = path.join(RAIZ, "assets", "readme", "vista-previa");
  mkdirSync(destino, { recursive: true });
  const readmeEs = readFileSync(path.join(RAIZ, "README.md"), "utf-8");
  const readmeEn = readFileSync(path.join(RAIZ, "README.en.md"), "utf-8");
  console.log("Renderizados: README.md y README.en.md");
  const plan = planDeVistas();
  console.log(`Vista previa guardada en ${destino}`);
  return plan;
}

const ES_ENTRADA = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ES_ENTRADA) await main();