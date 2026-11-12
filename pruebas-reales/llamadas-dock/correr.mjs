/** LLA1112B · node correr.mjs <capturas> <playwright>. Pulsa cada botón de la ventana con ratón y con dedo, con el dock cerrado y abierto. */
import http from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
const capturas = resolve(process.argv[2] ?? join(aqui, "capturas"));
mkdirSync(capturas, { recursive: true });
const rutaPw = process.argv[3] ?? "playwright";
const { chromium } = await import(rutaPw.startsWith("/") ? pathToFileURL(rutaPw).href : rutaPw);
const salida = join(aqui, "salida");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = http.createServer((q, r) => {
  const f = join(salida, q.url === "/" || q.url.startsWith("/?") ? "index.html" : q.url.split("?")[0]);
  if (!existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream" });
  r.end(readFileSync(f));
}).listen(0);
const puerto = await new Promise((ok) => srv.on("listening", () => ok(srv.address().port)));
const nav = await chromium.launch();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let malos = 0, total = 0;
const anotar = (c, ok, d) => { total++; if (!ok) malos++; console.log(`${ok ? "PASA " : "FALLA"} ${c} — ${d}`); };
const BOTONES = ["Silenciar micrófono", "Encender cámara", "Poner en espera", "Colgar"];

async function escenario(nombre, { w, h, tam, borde, tactil, dockAbierto }) {
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, hasTouch: !!tactil, isMobile: !!tactil });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${puerto}/?borde=${borde}${tam ? `&tam=${tam}` : ""}`);
  await p.waitForFunction(() => !!window.banco);
  await espera(500);
  if (dockAbierto) {
    // El dock se abre como en la app: el puntero se queda en el borde inferior (dwell) fuera de la ventana.
    await p.mouse.move(w * 0.3, h - 3);
    await p.mouse.move(w * 0.31, h - 4);
    await p.waitForSelector("[data-dock]", { timeout: 4000 }).catch(() => undefined);
  }
  const cajas = {};
  for (const b of BOTONES) cajas[b] = await p.locator(`[data-controles-llamada] button[aria-label="${b}"]`).first().boundingBox();
  await p.screenshot({ path: join(capturas, `50-dock-${nombre}.png`) });
  const claves = { "Silenciar micrófono": "micro", "Encender cámara": "camara", "Poner en espera": "espera", Colgar: "colgar" };
  const fallos = [];
  for (const b of BOTONES) {
    const c = cajas[b];
    if (!c) { fallos.push(`${b}: no está`); continue; }
    const x = c.x + c.width / 2, y = c.y + c.height / 2;
    const antes = await p.evaluate((k) => window.banco.clics[k] ?? 0, claves[b]);
    const dockAntes = await p.evaluate(() => window.banco.clics.dock ?? 0);
    if (tactil) await p.touchscreen.tap(x, y); else { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.up(); }
    await espera(150);
    const despues = await p.evaluate((k) => window.banco.clics[k] ?? 0, claves[b]);
    const dockDespues = await p.evaluate(() => window.banco.clics.dock ?? 0);
    if (despues !== antes + 1) fallos.push(`${b} (${Math.round(x)},${Math.round(y)}; a ${Math.round(h - y)} px del borde) no recibió el clic${dockDespues > dockAntes ? " — lo recibió el dock" : ""}`);
  }
  anotar(`dock · ${nombre}`, fallos.length === 0, fallos.length ? fallos.join(" | ") : `4 botones pulsados; el más bajo a ${Math.round(h - Math.max(...Object.values(cajas).filter(Boolean).map((c) => c.y + c.height)))} px del borde`);
  await ctx.close();
}
const casos = [
  ["escritorio-panel-borde20", { w: 1280, h: 800, borde: 20 }],
  ["escritorio-panel-borde100", { w: 1280, h: 800, borde: 100 }],
  ["escritorio-completa-borde20", { w: 1280, h: 800, tam: "completa", borde: 20 }],
  ["escritorio-completa-borde60", { w: 1280, h: 800, tam: "completa", borde: 60 }],
  ["escritorio-panel-dock-abierto", { w: 1280, h: 800, borde: 20, dockAbierto: true }],
  ["movil-360x640-panel-borde60", { w: 360, h: 640, borde: 60, tactil: true }],
  ["movil-360x640-completa-borde60", { w: 360, h: 640, tam: "completa", borde: 60, tactil: true }],
  ["movil-360x640-panel-raton-borde60", { w: 360, h: 640, borde: 60 }],
];
for (const [n, o] of casos) await escenario(n, o);
// Fuera de la ventana el sensor sigue abriendo el dock (no se rompe en otros sitios).
{
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.goto(`http://localhost:${puerto}/?borde=20`);
  await p.waitForFunction(() => !!window.banco);
  await p.mouse.move(500, 797);
  await p.mouse.move(505, 798);
  const abre = await p.waitForSelector("[data-dock]", { timeout: 4000 }).then(() => true, () => false);
  anotar("dock · fuera de la ventana el borde sigue abriendo el dock (800 ms)", abre, abre ? "el dock salió" : "no salió");
  await p.screenshot({ path: join(capturas, "51-dock-abierto-fuera-de-la-ventana.png") });
  await p.evaluate(() => window.banco.quitar());
  await espera(300);
  const z = await p.evaluate(() => getComputedStyle(document.querySelector("[data-trinity-sensor=anchor]")).zIndex);
  anotar("dock · sin llamada el sensor vuelve a su z-index de siempre", z === "9999", `z=${z}`);
  await ctx.close();
}
await nav.close();
srv.close();
console.log(`${total - malos}/${total} casos pasan`);
process.exit(malos ? 1 : 0);
