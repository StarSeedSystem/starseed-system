#!/usr/bin/env node
/*
 * exportar_formatos.mjs — genera scripts/sociales/estudio/formatos.json a partir del catálogo en TypeScript
 * (src/lib/metageminis/estudio/formatos.ts), que es la única fuente de verdad. El motor de render en Python
 * lee el JSON. Node 22 lee el .ts borrando los tipos (no hace falta compilar).
 *
 * Uso:  node scripts/sociales/estudio/exportar_formatos.mjs          (escribe formatos.json)
 *       node scripts/sociales/estudio/exportar_formatos.mjs --check  (falla si formatos.json está desfasado)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "..", "..", "..");
const modulo = await import(pathToFileURL(path.join(raiz, "src", "lib", "metageminis", "estudio", "formatos.ts")).href);

export function construir() {
  return {
    version: 1,
    generado_desde: "src/lib/metageminis/estudio/formatos.ts",
    fuentes: modulo.FUENTES,
    formatos: modulo.FORMATOS.map((f) => ({
      ...f,
      relacion: modulo.relacion(f.ancho, f.alto),
      formato_pieza: modulo.formatoDePieza(f),
    })),
  };
}

const destino = path.join(aqui, "formatos.json");
const texto = JSON.stringify(construir(), null, 1) + "\n";
if (process.argv.includes("--check")) {
  let actual = "";
  try { actual = readFileSync(destino, "utf8"); } catch { /* no existe */ }
  if (actual !== texto) {
    console.error("formatos.json está desfasado: ejecuta node scripts/sociales/estudio/exportar_formatos.mjs");
    process.exit(1);
  }
  console.log("formatos.json al día");
} else {
  writeFileSync(destino, texto);
  console.log(`formatos.json escrito: ${modulo.FORMATOS.length} formatos, ${modulo.FUENTES.length} fuentes`);
}
