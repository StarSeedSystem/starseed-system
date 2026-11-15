#!/usr/bin/env node
/**
 * IDI1115N · Rellena lo que falta de un idioma en una unidad o un área con un motor que se pasa por opción.
 *   node scripts/idiomas/rellenar.mjs --idioma de --area ajustes --motor libretranslate --url http://127.0.0.1:5000
 *   node scripts/idiomas/rellenar.mjs --idioma de --area components/settings --motor comando --cmd "mi-traductor"
 *   node scripts/idiomas/rellenar.mjs --idioma de --area acceso --motor archivo --archivo traducciones.json
 * Motores: «libretranslate» (POST {url}/translate por lotes), «comando» (stdin: JSON de textos → stdout: JSON de
 * traducciones, mismo orden), «archivo» (JSON {texto: traducción}). Las marcas (StarSeed, Astraura…) y los
 * valores {n} viajan protegidos; una entrada que pierde un valor, una etiqueta o una rama de plural se RECHAZA y
 * se cuenta, nunca se escribe. Lo que escribe queda como `revisado: false` (automático) hasta que una persona lo revise.
 * Opciones: --seco (no escribe), --limite N.
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { cargarCatalogo, cargarFuente, cargarUnidades, marcas, rechazo, rutaCatalogo, textosDeUnidad } from "./comun.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const idioma = arg("--idioma"), area = arg("--area"), motor = arg("--motor");
if (!idioma || !area || !motor) { console.error("Uso: rellenar.mjs --idioma <código> --area <unidad|components/x> --motor <libretranslate|comando|archivo> [--url|--cmd|--archivo]"); process.exit(2); }

/** Protege marcas y valores como ⟦n⟧ para que el motor no los toque. */
function proteger(t) {
    const guardado = [];
    const sal = t.replace(new RegExp(`${marcas.join("|")}|\\{[^{}]*\\}|<\\/?[a-zA-Z][^>]*>`, "g"), (m) => { guardado.push(m); return `⟦${guardado.length - 1}⟧`; });
    return { sal, guardado };
}
const restaurar = (t, g) => t.replace(/⟦(\d+)⟧/g, (c, i) => g[Number(i)] ?? c);

async function traducir(textos) {
    if (motor === "libretranslate") {
        const url = arg("--url", "http://127.0.0.1:5000");
        const salida = [];
        for (let i = 0; i < textos.length; i += 40) {
            const r = await fetch(`${url}/translate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: textos.slice(i, i + 40), source: "es", target: idioma.split("-")[0], format: "text" }) });
            const j = await r.json();
            salida.push(...(Array.isArray(j.translatedText) ? j.translatedText : [j.translatedText]));
        }
        return salida;
    }
    if (motor === "comando") {
        const r = spawnSync(arg("--cmd"), { shell: true, input: JSON.stringify({ origen: "es", destino: idioma, textos }), encoding: "utf8", maxBuffer: 1 << 28 });
        if (r.status !== 0) throw new Error(`el comando falló: ${r.stderr}`);
        return JSON.parse(r.stdout);
    }
    if (motor === "archivo") { const mapa = JSON.parse(fs.readFileSync(arg("--archivo"), "utf8")); return textos.map((t) => mapa[t] ?? ""); }
    throw new Error(`motor desconocido: ${motor}`);
}

const fuente = cargarFuente(), unidades = cargarUnidades();
const cat = cargarCatalogo(idioma);
let faltan = textosDeUnidad(fuente, unidades, area).filter((t) => !cat.entradas[t]);
if (arg("--limite")) faltan = faltan.slice(0, Number(arg("--limite")));
console.log(`${idioma} · ${area}: faltan ${faltan.length}`);
if (faltan.length === 0) process.exit(0);
const prot = faltan.map(proteger);
const bruto = await traducir(prot.map((p) => p.sal));
let hechas = 0; const rechazadas = [];
faltan.forEach((t, i) => {
    const tr = restaurar(String(bruto[i] ?? ""), prot[i].guardado);
    const motivo = rechazo(t, tr);
    if (motivo) rechazadas.push([t, motivo]); else { cat.entradas[t] = tr; hechas++; }
});
console.log(`escritas ${hechas} · rechazadas ${rechazadas.length}`);
for (const [t, m] of rechazadas.slice(0, 15)) console.log(`  ✗ «${t.slice(0, 60)}» → ${m}`);
if (!process.argv.includes("--seco") && hechas > 0) {
    cat.codigo = idioma; cat.revisado = cat.revisado === true && hechas === 0;
    cat.entradas = Object.fromEntries(Object.entries(cat.entradas).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(rutaCatalogo(idioma), JSON.stringify(cat, null, 1) + "\n");
}
process.exit(rechazadas.length ? 1 : 0);
