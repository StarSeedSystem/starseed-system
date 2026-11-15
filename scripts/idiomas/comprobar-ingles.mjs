#!/usr/bin/env node
/**
 * IDI1115N · Comprobación con Playwright: en inglés, la ventana de acceso y Ajustes › Neuronas no enseñan
 * ningún texto del catálogo fuente (español) a 1280×800 y 360×800, y deja capturas.
 *   1) npx vite --config scripts/idiomas/arnes/vite.config.mjs        (arnés sin Next: monta los componentes reales)
 *   2) node scripts/idiomas/comprobar-ingles.mjs [--base http://localhost:9113] [--salida carpeta] [--chromium ruta]
 * «Duro»: texto visible o atributo que es EXACTAMENTE una clave del catálogo fuente y que el catálogo inglés sí traduce.
 * «Sospechas»: texto con aspecto de español (tildes, ñ, ¿¡, palabras vacías) que ninguna clave cubre: texto armado en
 * el código, que esta capa aún no alcanza; se listan para medirlos, no hacen fallar.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { cargarCatalogo, cargarFuente, sinTraducir } from "./comun.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const base = arg("--base", "http://localhost:9113");
const salida = path.resolve(arg("--salida", "idiomas-capturas"));
fs.mkdirSync(salida, { recursive: true });
const fuente = cargarFuente(), en = cargarCatalogo("en").entradas, exentos = sinTraducir();
const norm = (t) => t.replace(/\s+/g, " ").trim();
const espanol = /[ñ¿¡]|\b(el|la|los|las|del|que|con|para|tu|tus|una|por|sin|más|aquí)\b/i;
const chromiumPath = arg("--chromium", process.env.PLAYWRIGHT_CHROMIUM ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome");
const navegador = await chromium.launch({ executablePath: fs.existsSync(chromiumPath) ? chromiumPath : undefined, args: ["--no-sandbox"] });
let fallos = 0;
for (const vista of ["acceso", "ajustes"]) for (const ancho of [1280, 360]) {
    const p = await navegador.newPage({ viewport: { width: ancho, height: 800 } });
    await p.addInitScript(() => localStorage.setItem("starseed.idioma.neurona.v1", JSON.stringify({ codigo: "en" })));
    await p.goto(`${base}/?vista=${vista}`, { waitUntil: "load", timeout: 120000 });
    await p.waitForFunction(() => document.documentElement.lang === "en" && !document.documentElement.hasAttribute("data-idioma-pendiente"), null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    const { textos, desborda } = await p.evaluate(() => {
        const t = [], v = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim() && n.parentElement && v(n.parentElement) && !n.parentElement.closest("[translate=no],script,style")) t.push(n.data);
        document.querySelectorAll("[aria-label],[placeholder],[title],[alt]").forEach((e) => { if (e.closest("[translate=no]")) return; for (const a of ["aria-label", "placeholder", "title", "alt"]) if (e.getAttribute(a)?.trim()) t.push(e.getAttribute(a)); });
        return { textos: t, desborda: document.documentElement.scrollWidth > window.innerWidth + 1 };
    });
    const unicos = [...new Set(textos.map(norm))];
    const duros = unicos.filter((t) => t in fuente.claves && !exentos.has(t) && en[t] && en[t] !== t);
    const sospechas = unicos.filter((t) => !duros.includes(t) && !(t in fuente.claves) && espanol.test(t) && !exentos.has(t));
    await p.screenshot({ path: path.join(salida, `${vista}-${ancho}-en.png`) });
    console.log(`${vista} ${ancho}px: ${unicos.length} textos visibles · duros ${duros.length} · sospechas ${sospechas.length} · desborde horizontal ${desborda}`);
    duros.slice(0, 10).forEach((t) => console.log(`   ✗ «${t.slice(0, 80)}»`));
    sospechas.slice(0, 12).forEach((t) => console.log(`   ? «${t.slice(0, 80)}»`));
    if (duros.length || desborda) fallos++;
    await p.close();
}
await navegador.close();
process.exit(fallos ? 1 : 0);
