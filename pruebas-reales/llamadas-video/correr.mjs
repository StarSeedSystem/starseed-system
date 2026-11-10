/**
 * LLA1110C · corre el banco real de vídeo de llamadas en Chromium (cámara falsa) y mira los PÍXELES.
 * Uso: node pruebas-reales/llamadas-video/correr.mjs [carpeta-capturas] [ruta-playwright]
 * Antes: node pruebas-reales/llamadas-video/construir.mjs <node_modules>
 * Sale con código 1 si algún caso falla. Cada caso deja su captura (PNG) en la carpeta de capturas.
 */
import http from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const capturas = resolve(process.argv[2] ?? join(aqui, "capturas"));
const rutaPw = process.argv[3] ?? process.env.PLAYWRIGHT_MODULO ?? "playwright";
mkdirSync(capturas, { recursive: true });
const { chromium } = await import(rutaPw.startsWith("/") ? pathToFileURL(rutaPw).href : rutaPw);

const salida = join(aqui, "salida");
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = http
  .createServer((q, r) => {
    const f = join(salida, q.url === "/" || q.url.startsWith("/?") ? "index.html" : q.url.split("?")[0]);
    if (!existsSync(f)) {
      r.writeHead(404);
      return r.end();
    }
    r.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream" });
    r.end(readFileSync(f));
  })
  .listen(0);
const puerto = await new Promise((ok) => srv.on("listening", () => ok(srv.address().port)));

const navegador = await chromium.launch({
  args: ["--use-fake-device-for-media-stream=device-count=2", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
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
function anotar(caso, ok, detalle) {
  resultados.push({ caso, ok, detalle });
  console.log(`${ok ? "PASA " : "FALLA"} ${caso} — ${detalle}`);
}

/** Brillo medio, fracción de píxeles no oscuros y cambio entre dos capturas de una región (lo que vería la persona). */
async function medir(p, selector, ignorar = null) {
  const loc = p.locator(selector).first();
  if (!(await loc.count())) return null;
  const caja = await loc.boundingBox();
  if (!caja || caja.width < 4 || caja.height < 4) return { media: 0, claros: 0, cambio: 0, caja };
  const fuera = ignorar && (await p.locator(ignorar).count()) ? await p.locator(ignorar).first().boundingBox() : null;
  const tomar = async () => (await p.screenshot({ clip: caja })).toString("base64");
  const a = await tomar();
  await espera(900);
  const b = await tomar();
  const r = await p.evaluate(
    async ({ a, b, caja, fuera }) => {
      const leer = async (b64) => {
        const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(bm.width, bm.height);
        const x = c.getContext("2d");
        x.drawImage(bm, 0, 0);
        return { d: x.getImageData(0, 0, bm.width, bm.height).data, w: bm.width, h: bm.height };
      };
      const A = await leer(a);
      const B = await leer(b);
      let n = 0, suma = 0, claros = 0, cambio = 0;
      for (let y = 0; y < A.h; y += 2) {
        for (let x = 0; x < A.w; x += 2) {
          const px = caja.x + x, py = caja.y + y;
          if (fuera && px >= fuera.x && px < fuera.x + fuera.width && py >= fuera.y && py < fuera.y + fuera.height) continue;
          const o = (y * A.w + x) * 4;
          const l = 0.299 * A.d[o] + 0.587 * A.d[o + 1] + 0.114 * A.d[o + 2];
          const l2 = 0.299 * B.d[o] + 0.587 * B.d[o + 1] + 0.114 * B.d[o + 2];
          n++;
          suma += l;
          if (l > 40) claros++;
          cambio += Math.abs(l - l2);
        }
      }
      return { media: Math.round(suma / Math.max(1, n)), claros: +(claros / Math.max(1, n)).toFixed(2), cambio: +(cambio / Math.max(1, n)).toFixed(2) };
    },
    { a, b, caja, fuera },
  );
  return { ...r, caja };
}

const REMOTO = "[data-layout] > div";
const LOCAL = '[aria-label="Tu cámara"]';
/** Se ve imagen viva: no negra y moviéndose. */
const viva = (m) => !!m && m.media >= 35 && m.claros >= 0.5 && m.cambio >= 0.4;
const txt = (m) => (m ? `media=${m.media} claros=${m.claros} cambio=${m.cambio} ${Math.round(m.caja.width)}×${Math.round(m.caja.height)}` : "sin elemento");

async function abrirPanel(p) {
  // Si la superficie se recogió en la burbuja, un toque la abre (como haría la persona).
  const burbuja = p.locator('[data-tamano="burbuja"]');
  if (await burbuja.count()) await burbuja.first().click({ position: { x: 30, y: 25 } });
}
async function esperarHasta(p, fn, ms = 20000, arg) {
  try {
    await p.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
    return true;
  } catch {
    return false;
  }
}
async function llamada(sid, o = {}) {
  await mac.evaluate((x) => window.banco.llamar(x), { sid, ...o });
  await espera(300);
  await tableta.evaluate((x) => window.banco.llamar(x), { sid, ...o });
  const ok = (await esperarHasta(mac, () => window.banco.resumen()?.estado === "conectada")) && (await esperarHasta(tableta, () => window.banco.resumen()?.estado === "conectada"));
  if (o.sinIp !== false) {
    await esperarHasta(mac, () => !!window.banco.resumen()?.videoDatos, 15000);
    await esperarHasta(tableta, () => !!window.banco.resumen()?.videoDatos, 15000);
  }
  return ok;
}
async function camara(p) {
  await p.evaluate(() => window.banco.acciones().alternarCamara());
}
async function comprobarRemoto(caso, quien, de, captura) {
  await abrirPanel(quien);
  await esperarHasta(quien, () => (window.banco.resumen()?.videoDatos?.recibiendo ?? true) || true, 1000);
  let m = null;
  for (let i = 0; i < 8; i++) {
    await espera(1500);
    await abrirPanel(quien);
    m = await medir(quien, REMOTO, LOCAL);
    if (viva(m)) break;
  }
  await quien.screenshot({ path: join(capturas, `${captura}.png`) });
  const r = await quien.evaluate(() => window.banco.resumen());
  anotar(caso, viva(m), `${txt(m)} · remoto=${JSON.stringify(r?.remoto)} lienzo=${r?.remotoLienzo} tipo=${r?.tipo} tamaño=${await quien.locator("[data-tamano]").first().getAttribute("data-tamano").catch(() => "?")}`);
  return m;
}
async function comprobarLocal(caso, p, captura) {
  await abrirPanel(p);
  let m = null;
  for (let i = 0; i < 5; i++) {
    await espera(800);
    m = await medir(p, LOCAL);
    if (viva(m)) break;
  }
  if (captura) await p.screenshot({ path: join(capturas, `${captura}.png`) });
  anotar(caso, viva(m), txt(m));
}
function lineas(reg, patron) {
  return reg.filter((l) => patron.test(l));
}

const soloCaso = process.env.CASO ?? "";
try {
  // Cámaras como en la Mac: la del sistema (la primera) es la Desk View del iPhone; la integrada, la segunda.
  for (const p of [mac, tableta]) {
    await p.evaluate(() => {
      // La falsa n.º 0 da imagen verde con movimiento (la integrada); la n.º 1 casi negra (la Desk View, como en la Mac).
      window.banco.camaras.etiquetas = ["FaceTime HD Camera", "iPhone de Prueba Desk View Camera"];
      window.banco.camaras.porDefecto = 1;
      window.banco.camaras.ocultarHastaPermiso = true;
      try { localStorage.clear(); } catch {}
    });
  }

  /* 1 · Bluetooth solo (sin IP): vídeo ligero en los dos sentidos. */
  if (!soloCaso || soloCaso === "ble") {
    const ok = await llamada("ble-1", { sinIp: true });
    anotar("ble · la llamada conecta por el enlace de datos", ok, JSON.stringify(await mac.evaluate(() => window.banco.resumen()?.medio)));
    await camara(tableta);
    await comprobarRemoto("ble · Mac ve la cámara de la tableta (lienzo)", mac, tableta, "01-ble-mac-ve-tableta");
    await comprobarLocal("ble · la tableta ve su vista previa", tableta);
    await camara(mac);
    await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 10000);
    const rMac = await mac.evaluate(() => window.banco.resumen());
    anotar("cámara · la Mac elige su cámara integrada, no la Desk View", /FaceTime/.test(rMac?.pistaCamara ?? ""), `pista=${rMac?.pistaCamara} lista=${JSON.stringify(rMac?.camaras)}`);
    await comprobarRemoto("ble · la tableta ve la cámara de la Mac (lienzo)", tableta, mac, "02-ble-tableta-ve-mac");
    await comprobarLocal("ble · la Mac ve su vista previa", mac, "03-ble-mac-local");
    // Apagar y volver a encender.
    await camara(mac);
    await esperarHasta(mac, () => window.banco.resumen()?.camara === false, 8000);
    await espera(1500);
    await camara(mac);
    await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 8000);
    await comprobarRemoto("ble · cámara apagada y encendida otra vez: la tableta vuelve a ver a la Mac", tableta, mac, "04-ble-reencendida");
    // Cambiar de cámara a mitad de llamada desde el selector.
    const antes = await mac.evaluate(() => window.banco.resumen()?.pistaCamara);
    const otra = await mac.evaluate(() => {
      const v = window.banco.vista();
      return v.dispositivos.camaras.find((c) => c.id !== v.seleccion.camaraId)?.id ?? null;
    });
    if (otra) await mac.evaluate((id) => window.banco.acciones().elegirCamara(id), otra);
    await esperarHasta(mac, (a) => window.banco.resumen()?.pistaCamara !== a, 8000, antes);
    const despues = await mac.evaluate(() => window.banco.resumen());
    anotar("selector · cambia la cámara en vivo sin colgar", !!otra && despues?.pistaCamara !== antes && despues?.fase === "en-curso", `${antes} → ${despues?.pistaCamara}`);
    // La Desk View falsa es casi negra: lo que se exige es que la imagen de la tableta SIGA cambiando (no congelada).
    await espera(4000);
    const mOscura = await medir(tableta, REMOTO, LOCAL);
    anotar("selector · tras cambiar a la Desk View la tableta sigue recibiendo (no congelada)", !!mOscura && mOscura.cambio >= 0.15 && mOscura.media < 35, txt(mOscura));
    await tableta.screenshot({ path: join(capturas, "05-ble-tras-cambiar-deskview.png") });
    await mac.evaluate((id) => window.banco.acciones().elegirCamara(id), antes ? await mac.evaluate((et) => window.banco.vista().dispositivos.camaras.find((c) => c.nombre === et)?.id ?? null, antes) : null);
    await esperarHasta(mac, (a) => window.banco.resumen()?.pistaCamara === a, 8000, antes);
    await comprobarRemoto("selector · de vuelta a la integrada la tableta ve a la Mac", tableta, mac, "05b-ble-de-vuelta");
    const pref = await mac.evaluate(() => {
      try {
        const a = JSON.parse(localStorage.getItem("starseed.llamadas.dispositivos") ?? "{}");
        return Object.values(a.neuronas ?? {}).map((n) => n.camara).find(Boolean) ?? null;
      } catch {
        return null;
      }
    });
    anotar("selector · la elección queda recordada (id y nombre)", !!pref?.id && /FaceTime/.test(pref?.etiqueta ?? ""), JSON.stringify(pref).slice(0, 160));
    const enLista = await mac.evaluate(() => window.banco.vista()?.dispositivos?.camaras?.length ?? 0);
    anotar("selector · durante la llamada lista las cámaras (con nombre)", enLista >= 2, `cámaras en la lista=${enLista}`);
    // Contadores de envío con motivos.
    const reg = await mac.evaluate(() => window.banco.registro);
    const tx = lineas(reg, /video-datos tx capturados/).pop() ?? "";
    anotar("envío · la Mac manda fotogramas y cada descarte tiene motivo", /enviados=[1-9]/.test(tx) && (/descartados=0\b/.test(tx) || /motivos=/.test(tx)), tx.slice(0, 220));
    const vis = lineas(reg, /visibilidad /);
    anotar("telemetría · hay líneas de visibilidad de cada mosaico", vis.length > 0, vis.slice(-2).join(" | ").slice(0, 300));
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
    await espera(1200);

    /* 2 · Segunda llamada tras colgar la primera: la cámara de la Mac vuelve a arrancar. */
    const ok2 = await llamada("ble-2", { sinIp: true });
    anotar("2.ª llamada · conecta", ok2, "");
    await mac.evaluate(() => window.banco.registro.splice(0));
    await camara(mac);
    const on2 = await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 10000);
    anotar("2.ª llamada · la cámara de la Mac se enciende", on2, JSON.stringify(await mac.evaluate(() => ({ aviso: window.banco.resumen()?.aviso, pista: window.banco.resumen()?.pistaCamara }))));
    const reg2 = await mac.evaluate(() => window.banco.registro);
    anotar("2.ª llamada · con etiquetas, la integrada se pide directamente (deviceId exacto)", lineas(reg2, /restr=deviceId-exacto/).length > 0 && /FaceTime/.test(await mac.evaluate(() => window.banco.resumen()?.pistaCamara ?? "")), lineas(reg2, /camara /).slice(0, 2).join(" | ").slice(0, 300));
    await comprobarRemoto("2.ª llamada · la tableta ve a la Mac", tableta, mac, "06-ble-segunda-llamada");
    await camara(tableta);
    await comprobarRemoto("2.ª llamada · la Mac ve a la tableta", mac, tableta, "07-ble-segunda-mac-ve-tableta");
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
    await espera(1200);
  }

  /* 2c · HIPÓTESIS WebKit: una cámara a la vez. Primera vez, sin etiquetas: el sistema abre la Desk View y hay que pasar a la integrada. */
  if (!soloCaso || soloCaso === "unaalavez") {
    for (const p of [mac, tableta]) await p.evaluate(() => { try { localStorage.clear(); } catch {} window.banco.camaras.unaALaVez = true; window.banco.camaras.permiso = false; });
    await llamada("una-1", { sinIp: true });
    await mac.evaluate(() => window.banco.registro.splice(0));
    await camara(mac);
    await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 10000);
    await espera(3000);
    const r = await mac.evaluate(() => window.banco.resumen());
    const reg = await mac.evaluate(() => window.banco.registro);
    anotar("una cámara a la vez (hipótesis WebKit) · la Mac acaba en su integrada", /FaceTime/.test(r?.pistaCamara ?? ""), `pista=${r?.pistaCamara} · ${lineas(reg, /camara /).slice(0, 4).join(" | ").slice(0, 400)}`);
    for (const p of [mac, tableta]) await p.evaluate(() => { window.banco.camaras.unaALaVez = false; });
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
    await espera(1200);
  }

  /* 2b · Wi-Fi sin ruta (ofertas WebRTC por el enlace, sin conectar): la pista WebRTC llega muda y el lienzo debe verse. */
  if (!soloCaso || soloCaso === "fantasma") {
    const ok = await llamada("fantasma-1", { sinIp: true, ipFantasma: true });
    anotar("ip fantasma · conecta por el enlace de datos", ok, JSON.stringify(await mac.evaluate(() => window.banco.resumen()?.medio)));
    await camara(tableta);
    await espera(3000);
    await comprobarRemoto("ip fantasma · la Mac ve a la tableta aunque WebRTC traiga una pista muda", mac, tableta, "06b-fantasma-mac-ve-tableta");
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
    await espera(1200);
  }

  /* 3 · Con IP: el vídeo va por WebRTC (MediaStream) y se ve en el <video>. */
  if (!soloCaso || soloCaso === "webrtc") {
    const ok = await llamada("ip-1", { sinIp: false });
    anotar("webrtc · conecta", ok, JSON.stringify(await mac.evaluate(() => window.banco.resumen()?.medio)));
    await esperarHasta(mac, () => /WebRTC/.test(window.banco.resumen()?.medio ?? ""), 15000);
    await camara(tableta);
    await camara(mac);
    await comprobarRemoto("webrtc · la Mac ve la cámara de la tableta (<video>)", mac, tableta, "08-webrtc-mac-ve-tableta");
    await comprobarRemoto("webrtc · la tableta ve la cámara de la Mac (<video>)", tableta, mac, "09-webrtc-tableta-ve-mac");
    await comprobarLocal("webrtc · la Mac ve su vista previa", mac);
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
  }

  /* 4 · Enlace lento como el de la Mac (acuse por escritura): la cámara sigue mandando y cada descarte tiene motivo. */
  if (!soloCaso || soloCaso === "lento") {
    await llamada("lento-1", { sinIp: true, enlace: { mtu: 512, rttMs: 30 } }); // ≈ 136 kb/s con acuse por escritura (la Mac midió 97–325)
    await camara(mac);
    await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 10000);
    await espera(16000);
    const reg = await mac.evaluate(() => window.banco.registro);
    const tx = lineas(reg, /video-datos tx capturados/).pop() ?? "";
    const cap = +(/capturados=(\d+)/.exec(tx)?.[1] ?? 0);
    const desc = +(/descartados=(\d+)/.exec(tx)?.[1] ?? 0);
    const env = +(/enviados=(\d+)/.exec(tx)?.[1] ?? 0);
    anotar("enlace lento · se envía más de lo que se descarta", env > 0 && env >= desc, tx.slice(0, 220));
    await comprobarRemoto("enlace lento · la tableta ve a la Mac", tableta, mac, "10-lento-tableta-ve-mac");
    void cap;
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
  }
} finally {
  const reg = { mac: await mac.evaluate(() => window.banco.registro).catch(() => []), tableta: await tableta.evaluate(() => window.banco.registro).catch(() => []) };
  writeFileSync(join(capturas, "registro.json"), JSON.stringify(reg, null, 1));
  writeFileSync(join(capturas, "resultados.json"), JSON.stringify(resultados, null, 1));
  await navegador.close();
  srv.close();
}
const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} casos pasan`);
process.exit(fallos ? 1 : 0);
