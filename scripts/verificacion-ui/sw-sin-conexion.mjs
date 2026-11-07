// scripts/verificacion-ui/sw-sin-conexion.mjs — el service worker v8 en un Chrome DE VERDAD (SW1107A · 2026-11-07)
//
// Sin `next build`: levanta una mini app de mentira (HTML, RSC, estáticos, API y /precarga.json) que sirve los
// archivos REALES public/sw-v8.js, public/sw-logica.js y public/offline.html, abre Chrome sin ventana
// (Playwright con el Chrome instalado) y comprueba: registro, precarga sola (sin «forzar»), y con la red caída
// (el servidor corta las conexiones): navegación desde caché, RSC completa, /offline.html con lo guardado, API
// de la lista blanca con respaldo y la de sesión sin él; y al volver la red, la página nueva al momento.
//
// El host es `starseed.test` (resuelto a 127.0.0.1 y tratado como seguro) para que el SW no lo tome por el
// servidor local de la app de escritorio. Uso: node scripts/verificacion-ui/sw-sin-conexion.mjs  (sale 0 si todo va).
import { readFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLICO = join(RAIZ, "public");
const HOST = "starseed.test";
let sinRed = false;
let version = "v1";
const peticiones = [];

const ESTATICOS = {
  "/_next/static/chunks/comun.js": "window.__comun = (window.__comun || 0) + 1;",
  "/_next/static/chunks/esc.js": "window.__esc = true;",
  "/_next/static/chunks/perezoso.js": "/* perezoso */",
  "/_next/static/css/a.css": "body{background:#0A0712;color:#E8E6F0}",
};
const MANIFIESTO = {
  formato: 1,
  buildId: "PRUEBA1",
  generado: new Date().toISOString(),
  estaticos: Object.keys(ESTATICOS),
  tamanos: Object.values(ESTATICOS).map((s) => s.length),
  comunes: [0, 3],
  rutas: [
    { r: "/", e: 1, c: [], b: 2000 },
    { r: "/escritorios", e: 1, c: [1], b: 2000 },
    { r: "/messages", e: 0, c: [], b: 2000 },
  ],
  publicos: ["/offline.html", "/starseed-symbol-192.png"],
  tamanosPublicos: [6000, 20000],
};

const html = (ruta) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${ruta}</title>
<link rel="stylesheet" href="/_next/static/css/a.css"><script src="/_next/static/chunks/comun.js"></script>
${ruta === "/escritorios" ? '<script src="/_next/static/chunks/esc.js"></script>' : ""}</head>
<body><h1 id="t">${ruta} ${version}</h1><script>
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw-v8.js", { scope: "/", updateViaCache: "none" });
</script></body></html>`;

function enviar(res, estado, tipo, cuerpo, extra = {}) {
  res.writeHead(estado, { "Content-Type": tipo, "Cache-Control": "no-cache", ...extra });
  res.end(cuerpo);
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const ruta = url.pathname;
  if (ruta === "/__control/sin-red") { sinRed = true; return enviar(res, 200, "text/plain", "ok"); }
  if (ruta === "/__control/con-red") { sinRed = false; version = "v2"; return enviar(res, 200, "text/plain", "ok"); }
  peticiones.push({ ruta, rsc: req.headers.rsc === "1", arbol: req.headers["next-router-state-tree"] ?? null, sinRed });
  if (sinRed) return req.socket.destroy(); // como si no hubiera red: la conexión se corta
  if (ruta === "/sw-v8.js" || ruta === "/sw-logica.js") {
    return enviar(res, 200, "application/javascript", readFileSync(join(PUBLICO, ruta.slice(1))), { "Service-Worker-Allowed": "/" });
  }
  if (ruta === "/offline.html") return enviar(res, 200, "text/html; charset=utf-8", readFileSync(join(PUBLICO, "offline.html")));
  if (ruta === "/starseed-symbol-192.png") return enviar(res, 200, "image/png", readFileSync(join(PUBLICO, "starseed-symbol-192.png")));
  if (ruta === "/precarga.json") return enviar(res, 200, "application/json", JSON.stringify(MANIFIESTO));
  if (ESTATICOS[ruta]) return enviar(res, 200, ruta.endsWith(".css") ? "text/css" : "application/javascript", ESTATICOS[ruta]);
  if (["/", "/escritorios", "/messages"].includes(ruta)) {
    if (req.headers.rsc === "1") return enviar(res, 200, "text/x-component", `rsc:${ruta}:${req.headers["next-router-state-tree"] ?? "raiz"}:${version}`);
    return enviar(res, 200, "text/html; charset=utf-8", html(ruta));
  }
  if (ruta === "/api/os/versiones" || ruta === "/api/mando/estado") return enviar(res, 200, "application/json", JSON.stringify({ ruta, version }));
  return enviar(res, 404, "text/plain", "no");
});

function control(puerto, que) {
  return new Promise((ok, mal) => {
    request({ host: "127.0.0.1", port: puerto, path: `/__control/${que}` }, (r) => { r.resume(); r.on("end", ok); }).on("error", mal).end();
  });
}

const resultados = [];
function comprobar(nombre, ok, detalle) {
  resultados.push({ nombre, ok: !!ok, detalle });
  // eslint-disable-next-line no-console
  console.log(`${ok ? "✔" : "✘"} ${nombre}${detalle !== undefined ? ` — ${JSON.stringify(detalle)}` : ""}`);
}

async function principal() {
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const puerto = servidor.address().port;
  const base = `http://${HOST}:${puerto}`;
  const navegador = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, `--unsafely-treat-insecure-origin-as-secure=${base}`, "--no-proxy-server"],
  });
  try {
    const pagina = await (await navegador.newContext()).newPage();
    await pagina.goto(`${base}/escritorios`);
    await pagina.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    comprobar("el SW v8 se registra y controla la página", true);

    // Precarga SOLA (sin forzar): el host no es loopback y Chrome de escritorio no dice «datos móviles».
    const estado = await pagina.evaluate(() => new Promise((ok) => {
      const tope = setTimeout(() => ok({ tope: true }), 30000);
      navigator.serviceWorker.addEventListener("message", (e) => {
        const d = e.data;
        if (d && d.tipo === "starseed:precarga" && d.estado && d.estado.fase !== "precargando") { clearTimeout(tope); ok(d.estado); }
      });
      navigator.serviceWorker.controller.postMessage({ tipo: "PRECARGAR" });
    }));
    comprobar("la precarga termina completa", estado.fase === "lista" && estado.completo === true, estado);
    const cache = await pagina.evaluate(async () => {
      const c = await caches.open("starseed-build-PRUEBA1");
      return { cachés: await caches.keys(), claves: (await c.keys()).map((r) => { const u = new URL(r.url); return u.pathname + u.search; }) };
    });
    const esperadas = ["/offline.html", "/_next/static/chunks/comun.js", "/_next/static/css/a.css", "/escritorios", "/escritorios?__ss_rsc=1",
      "/", "/?__ss_rsc=1", "/messages", "/messages?__ss_rsc=1", "/_next/static/chunks/perezoso.js", "/starseed-symbol-192.png"];
    comprobar("la caché de la build tiene páginas, RSC, código y public/", esperadas.every((u) => cache.claves.includes(u)), cache);
    const rscPrecarga = peticiones.filter((p) => p.rsc && p.ruta === "/escritorios");
    comprobar("el RSC se precarga sin árbol del router (carga completa)", rscPrecarga.length > 0 && rscPrecarga.every((p) => p.arbol === null), rscPrecarga);
    const apiConRed = await pagina.evaluate(() => fetch("/api/os/versiones").then((r) => r.json()));
    comprobar("API de la lista blanca con red", apiConRed.version === "v1", apiConRed);

    // ── Sin red ──
    await control(puerto, "sin-red");
    await pagina.goto(`${base}/messages`);
    comprobar("sin red: una página precargada abre desde la caché", (await pagina.textContent("#t")) === "/messages v1");
    await pagina.goto(`${base}/escritorios?vista=2`);
    const esc = await pagina.evaluate(() => ({ t: document.getElementById("t")?.textContent, esc: window.__esc === true, comun: window.__comun === 1 }));
    comprobar("sin red: con consulta, y su código sale de la caché", esc.t === "/escritorios v1" && esc.esc && esc.comun, esc);
    await pagina.goto(`${base}/pagina/nunca-guardada`);
    await pagina.waitForSelector("#guardadas:not([hidden])", { timeout: 5000 }).catch(() => null);
    const sinGuardar = await pagina.evaluate(() => ({
      titulo: document.querySelector("h1")?.textContent,
      ruta: document.getElementById("ruta")?.textContent,
      enlaces: [...document.querySelectorAll("#lista a")].map((a) => a.getAttribute("href")),
    }));
    comprobar("sin red: una página no guardada enseña /offline.html con lo que sí está", sinGuardar.titulo === "Sin conexión" &&
      sinGuardar.ruta === "/pagina/nunca-guardada" && ["/", "/escritorios", "/messages"].every((h) => sinGuardar.enlaces.includes(h)), sinGuardar);
    const rsc = await pagina.evaluate(() => fetch("/escritorios?_rsc=k1", { headers: { RSC: "1", "Next-Router-State-Tree": "%5B%22%22%5D" } })
      .then(async (r) => ({ estado: r.status, tipo: r.headers.get("content-type"), cuerpo: await r.text() })));
    comprobar("sin red: la navegación interna (RSC) recibe la carga completa guardada", rsc.cuerpo === "rsc:/escritorios:raiz:v1" && rsc.tipo === "text/x-component", rsc);
    const rscNo = await pagina.evaluate(() => fetch("/xr?_rsc=1", { headers: { RSC: "1" } }).then((r) => r.status));
    comprobar("sin red: RSC no guardado → 504 (Next navega «a la antigua»)", rscNo === 504, rscNo);
    const api = await pagina.evaluate(() => fetch("/api/os/versiones").then(async (r) => ({ cuerpo: await r.json(), sin: r.headers.get("x-starseed-sin-conexion") })));
    comprobar("sin red: API de la lista blanca, la última buena y marcada", api.cuerpo.version === "v1" && api.sin === "1", api);
    const sesion = await pagina.evaluate(() => fetch("/api/mando/estado").then(() => "respondió", () => "falló"));
    comprobar("sin red: API de consola/sesión NUNCA sale de caché", sesion === "falló", sesion);

    // ── Vuelve la red ──
    await control(puerto, "con-red");
    await pagina.goto(`${base}/escritorios`);
    comprobar("con red: la navegación trae la versión nueva al momento", (await pagina.textContent("#t")) === "/escritorios v2");
  } finally {
    await navegador.close();
    servidor.close();
  }
  const fallos = resultados.filter((r) => !r.ok).length;
  // eslint-disable-next-line no-console
  console.log(`\n${resultados.length - fallos}/${resultados.length} comprobaciones bien`);
  return fallos ? 1 : 0;
}

principal().then((c) => { process.exitCode = c; }, (e) => {
  // eslint-disable-next-line no-console
  console.error("✘ la verificación no pudo correr:", e);
  process.exitCode = 2;
  servidor.close();
});
