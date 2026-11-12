/**
 * LLA1112B · casos reales de la ventana de llamada: botón de cámara en una videollamada, cámara que no da imagen,
 * carriles con botones. Uso: node correr-1112b.mjs <carpeta-capturas> <ruta-playwright>   (CASO=camara|carriles)
 */
import http from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const capturas = resolve(process.argv[2] ?? join(aqui, "capturas"));
const rutaPw = process.argv[3] ?? "playwright";
mkdirSync(capturas, { recursive: true });
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
const navegador = await chromium.launch({ args: ["--use-fake-device-for-media-stream=device-count=5", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await navegador.newContext({ viewport: { width: 480, height: 640 } });
const paginas = {};
for (const lado of ["mac", "tableta"]) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(`[${lado}] pageerror: ${e.message.slice(0, 200)}`));
  await p.goto(`http://localhost:${puerto}/?lado=${lado}`);
  await p.waitForFunction(() => !!window.banco);
  paginas[lado] = p;
}
const { mac, tableta } = paginas;
const resultados = [];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const anotar = (caso, ok, detalle) => { resultados.push({ caso, ok }); console.log(`${ok ? "PASA " : "FALLA"} ${caso} — ${detalle}`); };
await paginas.mac.setViewportSize({ width: 360, height: 640 });
await paginas.mac.evaluate(() => window.banco.marco(360, 640));
const caso = process.env.CASO ?? "";
async function esperarHasta(p, fn, ms = 20000, arg) { try { await p.waitForFunction(fn, arg, { timeout: ms, polling: 200 }); return true; } catch { return false; } }
async function llamada(sid, o = {}) {
  await mac.evaluate((x) => window.banco.llamar(x), { sid, sinIp: false, ...o });
  await espera(300);
  await tableta.evaluate((x) => window.banco.llamar(x), { sid, sinIp: false, ...o });
  return (await esperarHasta(mac, () => window.banco.resumen()?.estado === "conectada")) && (await esperarHasta(tableta, () => window.banco.resumen()?.estado === "conectada"));
}
async function abrir(p) { const b = p.locator('[data-tamano="burbuja"]'); if (await b.count()) await b.first().click({ position: { x: 30, y: 25 } }); }
async function colgarTodo() { for (const p of [mac, tableta]) await p.evaluate(() => window.banco.colgar()); await espera(800); }
const estadoBoton = (p, nombre) => p.evaluate((n) => { const b = document.querySelector(`[data-controles-llamada] button[aria-label^="${n}"]`); return b ? { aria: b.getAttribute("aria-label"), off: b.disabled, title: b.title } : null; }, nombre);

if (!caso || caso === "camara") {
  // 1 · videollamada: el botón de cámara funciona y dice lo que hace
  const ok = await llamada("c1", { video: true });
  await abrir(mac);
  await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 8000);
  const b1 = await estadoBoton(mac, "Apagar cámara");
  anotar("videollamada · el botón dice «Apagar cámara» y está activo", ok && !!b1 && !b1.off, JSON.stringify(b1));
  await mac.screenshot({ path: join(capturas, "40-videollamada-boton-camara.png") });
  await mac.locator('button[aria-label="Apagar cámara"]').click().catch(() => {});
  anotar("videollamada · pulsarlo apaga la cámara", await esperarHasta(mac, () => window.banco.resumen()?.camara === false, 6000), "");
  await colgarTodo();
  // 2 · llamada de voz: «Encender cámara» activo, un paso
  await llamada("c2", { video: false });
  await abrir(mac);
  const b2 = await estadoBoton(mac, "Encender cámara");
  anotar("llamada de voz · «Encender cámara» está activo", !!b2 && !b2.off, JSON.stringify(b2));
  await mac.locator('button[aria-label="Encender cámara"]').click().catch(() => {});
  anotar("llamada de voz · un toque enciende la cámara", await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 8000), "");
  await colgarTodo();
}

if (!caso || caso === "camaras-malas") {
  for (const p of [mac, tableta]) await p.evaluate(() => { try { localStorage.clear(); } catch {} Object.assign(window.banco.camaras, { etiquetas: ["FaceTime HD Camera", "OBS Virtual Camera", "iPhone de Alex Camera", "Immersed Camera", "Brio 4K"], mudas: "iPhone", negras: "Immersed", tarjeta: "OBS", porDefecto: 0 }); });
  await llamada("m1", { video: true });
  await abrir(mac);
  await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 8000);
  const previa = await mac.evaluate(() => window.banco.resumen()?.pistaCamara);
  const pref0 = await mac.evaluate(() => localStorage.getItem("starseed.llamadas.dispositivos"));
  await mac.getByRole("button", { name: "Puertos" }).click();
  await mac.screenshot({ path: join(capturas, "41-puertos-lista.png") });
  const elegir = async (texto) => { await mac.getByRole("radio", { name: new RegExp(texto, "i") }).first().click(); };
  // iPhone sin cuadros
  await elegir("iPhone");
  await esperarHasta(mac, () => /no da imagen|no llegan/i.test(document.body.innerText), 12000);
  let aviso = await mac.evaluate(() => window.banco.resumen()?.aviso);
  const r1 = await mac.evaluate(() => window.banco.resumen());
  anotar("iPhone sin cuadros · la ventana lo dice con palabras", /iPhone/i.test(aviso ?? "") && /no (da|llegan)|sin imagen|cuadros/i.test(aviso ?? ""), `aviso=${aviso}`);
  anotar("iPhone sin cuadros · se vuelve a la cámara anterior", r1.pistaCamara === previa && r1.camara, `pista=${r1.pistaCamara} previa=${previa}`);
  anotar("iPhone sin cuadros · no cambia la predeterminada", (await mac.evaluate(() => localStorage.getItem("starseed.llamadas.dispositivos"))) === pref0 || !/iPhone/.test(await mac.evaluate(() => localStorage.getItem("starseed.llamadas.dispositivos") ?? "")), "");
  await mac.screenshot({ path: join(capturas, "42-camara-fallida-iphone.png") });
  // negra
  await espera(600);
  await elegir("Immersed");
  await esperarHasta(mac, () => /Immersed[^.]*negra/i.test(document.body.innerText), 12000);
  aviso = await mac.evaluate(() => window.banco.resumen()?.aviso);
  anotar("cámara solo negra · la ventana lo dice", /Immersed/i.test(aviso ?? "") && /negr/i.test(aviso ?? ""), `aviso=${aviso}`);
  await mac.screenshot({ path: join(capturas, "43-camara-fallida-negra.png") });
  // virtual con tarjeta
  await espera(600);
  await elegir("OBS");
  await esperarHasta(mac, () => /«OBS[^»]*» es una cámara virtual/i.test(document.body.innerText), 12000);
  aviso = await mac.evaluate(() => window.banco.resumen()?.aviso);
  anotar("cámara virtual · funciona y la ventana avisa de lo que no puede saber", /OBS/i.test(aviso ?? "") && /virtual/i.test(aviso ?? "") && /tarjeta|no (puede|podemos) saber/i.test(aviso ?? ""), `aviso=${aviso}`);
  const pref1 = await mac.evaluate(() => localStorage.getItem("starseed.llamadas.dispositivos") ?? "");
  anotar("cámara virtual · no queda como predeterminada", !/OBS/.test(pref1), pref1.slice(0, 160));
  await mac.screenshot({ path: join(capturas, "44-camara-virtual-aviso.png") });
  // buena
  await espera(600);
  await elegir("Brio");
  await espera(2500);
  const r2 = await mac.evaluate(() => window.banco.resumen());
  anotar("cámara buena · se queda y es la predeterminada", /Brio/.test(r2.pistaCamara ?? "") && /Brio/.test(await mac.evaluate(() => localStorage.getItem("starseed.llamadas.dispositivos") ?? "")), `pista=${r2.pistaCamara}`);
  await colgarTodo();
}

if (!caso || caso === "carriles") {
  await llamada("k1", { video: true });
  await abrir(mac);
  await mac.getByRole("tab", { name: "Medio" }).first().click();
  await espera(800);
  const n = await mac.evaluate(() => ({ selects: document.querySelectorAll("[data-carriles-flujo] select").length, grupos: document.querySelectorAll('[data-carriles-flujo] [role="radiogroup"]').length }));
  anotar("carriles · sin menús nativos: botones visibles", n.selects === 0 && n.grupos === 3, JSON.stringify(n));
  await mac.screenshot({ path: join(capturas, "45-medio-carriles-360x640.png") });
  await colgarTodo();
}
await navegador.close();
srv.close();
const malos = resultados.filter((r) => !r.ok).length;
console.log(`${resultados.length - malos}/${resultados.length} casos pasan`);
process.exit(malos ? 1 : 0);
