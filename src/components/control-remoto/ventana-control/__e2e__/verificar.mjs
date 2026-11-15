// VEN1115L · comprobación con Playwright a 1280×800 y 360×800. Uso: node verificar.mjs <carpeta de trabajo>
// Empaqueta el arnés con esbuild y el CSS con tailwind (sin Next), abre la página y mira capturas y envíos.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const salida = path.resolve(process.argv[2] ?? "./ven-e2e");
const aqui = path.dirname(new URL(import.meta.url).pathname);
const raiz = path.resolve(aqui, "../../../../..");
mkdirSync(salida, { recursive: true });
const bin = (n) => path.join(raiz, "node_modules/.bin", n);
execFileSync(bin("esbuild"), [path.join(aqui, "arnes.tsx"), "--bundle", "--outfile=" + path.join(salida, "arnes.js"), "--jsx=automatic", "--define:process.env.NODE_ENV=\"production\"", "--tsconfig=" + path.join(raiz, "tsconfig.json")], { stdio: "inherit", cwd: raiz });
writeFileSync(path.join(salida, "in.css"), "@tailwind base;@tailwind components;@tailwind utilities;");
execFileSync(bin("tailwindcss"), ["-i", path.join(salida, "in.css"), "-o", path.join(salida, "arnes.css"), "--content", path.join(aqui, "../*.tsx")], { stdio: "inherit", cwd: raiz });
writeFileSync(path.join(salida, "index.html"), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="arnes.css"><div id="raiz"></div><script src="arnes.js"></script>');

const { chromium } = createRequire(path.join(raiz, "package.json"))("playwright");
const nav = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const fallos = [];
const ok = (c, m) => { if (!c) fallos.push(m); console.log((c ? "OK   " : "FALLA ") + m); };

for (const [ancho, alto] of [[1280, 800], [360, 800]]) {
    for (const modo of ["flotante", "pagina"]) {
        const pag = await nav.newPage({ viewport: { width: ancho, height: alto } });
        const errores = [];
        pag.on("pageerror", (e) => errores.push(String(e)));
        await pag.goto(`file://${salida}/index.html?modo=${modo}`);
        await pag.waitForSelector('[data-testid="ventana-control"]');
        await pag.waitForTimeout(600);
        const v = await pag.locator('[data-testid="ventana-control"]').boundingBox();
        ok(v.x >= -0.5 && v.x + v.width <= ancho + 0.5, `${modo} ${ancho}: cabe a lo ancho (${Math.round(v.x)}..${Math.round(v.x + v.width)})`);
        const sinDesborde = await pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        ok(sinDesborde, `${modo} ${ancho}: sin desplazamiento horizontal`);
        // pulsar y arrastrar sobre la pantalla
        const pant = await pag.locator('[data-testid="ventana-control-imagen"]').boundingBox();
        ok(!!pant && pant.width > 20, `${modo} ${ancho}: la imagen tiene tamaño`);
        const antes = await pag.locator('[data-testid="registro-enviado"]').textContent();
        await pag.mouse.move(pant.x + pant.width * 0.25, pant.y + pant.height * 0.25);
        await pag.mouse.down();
        await pag.mouse.move(pant.x + pant.width * 0.5, pant.y + pant.height * 0.5, { steps: 6 });
        await pag.mouse.up();
        await pag.waitForTimeout(150);
        const reg = await pag.locator('[data-testid="registro-enviado"]').textContent();
        ok(reg !== antes && reg.includes('"sigue":false') && reg.includes('"tipo":"gesto"'), `${modo} ${ancho}: el arrastre sale como gesto con final`);
        const m = reg.match(/\[0\.2\d*,0\.2\d*,0\]/);
        ok(!!m, `${modo} ${ancho}: el primer punto es ~(0.25, 0.25)`);
        const mandos = await pag.getByRole("button", { name: "Inicio" }).count();
        if (modo === "flotante") await pag.getByRole("button", { name: "Mandos" }).click();
        await pag.getByRole("button", { name: "Inicio" }).click();
        const reg2 = await pag.locator('[data-testid="registro-enviado"]').textContent();
        ok(reg2.includes('"cual":"inicio"'), `${modo} ${ancho}: el botón Inicio envía su tecla (mandos antes: ${mandos})`);
        await pag.waitForTimeout(100);
        await pag.screenshot({ path: path.join(salida, `${modo}-${ancho}.png`) });
        ok(errores.length === 0, `${modo} ${ancho}: sin errores de página ${errores.join("|")}`);
        await pag.close();
    }
}
// giro 90 en 1280: la imagen es apaisada
const pag = await nav.newPage({ viewport: { width: 1280, height: 800 } });
await pag.goto(`file://${salida}/index.html?modo=pagina&giro=90`);
await pag.waitForSelector('[data-testid="ventana-control-imagen"]');
await pag.waitForTimeout(500);
const im = await pag.locator('[data-testid="ventana-control-imagen"]').boundingBox();
ok(im.width > im.height, `pagina giro 90: la imagen se ve apaisada (${Math.round(im.width)}x${Math.round(im.height)})`);
await pag.screenshot({ path: path.join(salida, "pagina-giro90-1280.png") });
await nav.close();
console.log(fallos.length ? `FALLOS: ${fallos.length}` : "TODO OK");
process.exit(fallos.length ? 1 : 0);
