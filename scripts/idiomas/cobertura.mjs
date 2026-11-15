#!/usr/bin/env node
/**
 * IDI1115N · Informe de cobertura por idioma y unidad (acceso, shell, ajustes) y por área del extractor.
 *   node scripts/idiomas/cobertura.mjs                 → unidades × idiomas
 *   node scripts/idiomas/cobertura.mjs --areas         → además, las áreas de src/app y src/components
 * «ausentes» = textos del código sin entrada; «inválidas» = entradas que pierden un valor o una etiqueta;
 * «caducas» = entradas de textos que ya no existen en el código medido (volver a correr extraer.mjs).
 */
import { cargarCatalogo, cargarFuente, cargarUnidades, coberturaDe, idiomasConCatalogo } from "./comun.mjs";

const fuente = cargarFuente(), unidades = cargarUnidades();
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : "100.0").padStart(5) + " %";
console.log(`texto fuente medido: ${Object.keys(fuente.claves).length} únicos en ${fuente.archivos} archivos`);
for (const idioma of idiomasConCatalogo()) {
    const cat = cargarCatalogo(idioma);
    console.log(`\n${idioma} (${cat.revisado ? "revisado" : "automático"}, ${Object.keys(cat.entradas).length} entradas)`);
    const nombres = [...Object.keys(unidades), ...(process.argv.includes("--areas") ? Object.keys(fuente.porArea) : [])];
    for (const n of nombres) {
        const c = coberturaDe(fuente, unidades, cat, n);
        if (!(n in unidades) && c.presentes === 0) continue;
        console.log(`  ${n.padEnd(28)} ${String(c.presentes).padStart(5)}/${String(c.total).padEnd(5)} ${pct(c.presentes, c.total)}  ausentes ${c.ausentes.length}  inválidas ${c.invalidas.length}`);
    }
}
