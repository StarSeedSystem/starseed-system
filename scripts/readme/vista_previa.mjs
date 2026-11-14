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

async function ghApiMarkdown(markdown, context = "StarSeedSystem/starseed-system") {
  const response = await fetch("https://api.github.com/markdown", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json" },
    body: JSON.stringify({ text: markdown, mode: "gfm", context }),
  });
  if (!response.ok) throw new Error(`gh api markdown failed: ${response.status}`);
  return response.text();
}

export async function main(argv = process.argv) {
  const destino = path.join(RAIZ, "assets", "readme", "vista-previa");
  mkdirSync(destino, { recursive: true });
  const RAIZ_README_ES = path.join(RAIZ, "README.md");
  const RAIZ_README_EN = path.join(RAIZ, "README.en.md");
  const readmeEs = readFileSync(RAIZ_README_ES, "utf-8");
  const readmeEn = existsSync(RAIZ_README_EN) ? readFileSync(RAIZ_README_EN, "utf-8") : readmeEs;
  const htmlEs = await ghApiMarkdown(readmeEs, "StarSeedSystem/starseed-system");
  const htmlEn = await ghApiMarkdown(readmeEn, "StarSeedSystem/starseed-system");
  console.log("Renderizados: README.md y README.en.md");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const plan = planDeVistas();
  for (const vista of plan) {
    const context = await browser.newContext({ colorScheme: vista.tema === "oscuro" ? "dark" : "light" });
    const page = await context.newPage();
    const html = vista.id.startsWith("claro-") || (!vista.id.includes("en") && vista.tema === "claro") ? htmlEs : htmlEn;
    await page.setViewportSize({ width: vista.ancho, height: vista.alto });
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/github-markdown-css@5.2.0/dist/github-markdown-${vista.tema}.min.css"></head><body class="markdown-body">${html}</body></html>`, { waitUntil: "networkidle" });
    await page.waitForSelector(".markdown-body", { state: "attached", timeout: 5000 }).catch(() => {});
    const pngBuffer = await page.screenshot({ type: "png" });
    const calidad = calidadParaPeso(pngBuffer.length, PESO_MAXIMO_BYTES);
    const webp = await aWebp(pngBuffer, calidad);
    writeFileSync(path.join(destino, rutaArchivo(vista.tema, vista.ancho)), webp);
    await context.close();
  }
  await browser.close();
  console.log(`Vista previa guardada en ${destino}`);
  return plan;
}

const ES_ENTRADA = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (ES_ENTRADA) await main();