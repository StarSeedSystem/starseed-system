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

  /* 2d · LLA1111A · la Mac de la prueba.35: la FaceTime y la virtual rechazan el `frameRate` obligatorio (OverconstrainedError). */
  if (!soloCaso || soloCaso === "webkit") {
    const preparar = (o) => mac.evaluate((o) => {
      try { localStorage.clear(); } catch {}
      Object.assign(window.banco.camaras, { permiso: false, rechazan: "FaceTime|OBS|Virtual", ocupadas: null, regla: "fps", pedidas: [] }, o ?? {});
      window.banco.registro.splice(0);
    }, o);
    const encender = async () => {
      await camara(mac);
      await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 12000);
      await espera(2500);
      return { r: await mac.evaluate(() => window.banco.resumen()), reg: await mac.evaluate(() => window.banco.registro), pedidas: await mac.evaluate(() => window.banco.camaras.pedidas) };
    };
    const cortar = async () => {
      await mac.evaluate(() => window.banco.colgar());
      await tableta.evaluate(() => window.banco.colgar());
      await espera(1200);
    };
    const resumenCam = (x) => lineas(x.reg, /camara /).filter((l) => !/visibilidad/.test(l)).slice(0, 6).join(" | ").slice(0, 600);

    // W1 · primera vez (sin etiquetas): el sistema abre la Desk View; hay que acabar en la FaceTime.
    await preparar();
    await llamada("wk-1", { sinIp: true });
    const w1 = await encender();
    anotar("webkit · 1.ª vez sin etiquetas: la Mac acaba en la FaceTime (que rechaza frameRate max)", /FaceTime/.test(w1.r?.pistaCamara ?? "") && w1.r?.camara === true, `pista=${w1.r?.pistaCamara} · ${resumenCam(w1)}`);
    anotar("webkit · ninguna petición lleva facingMode (escritorio) ni un frameRate obligatorio", !w1.pedidas.some((p) => /facingMode|"max"|"exact":\d/.test(p)), w1.pedidas.slice(0, 4).join(" ; ").slice(0, 300));
    await mac.screenshot({ path: join(capturas, "20-webkit-1a-vez.png") });
    await cortar();

    // W2 · segunda llamada (con etiquetas y la FaceTime guardada): se pide por id y abre.
    await mac.evaluate(() => { window.banco.registro.splice(0); window.banco.camaras.pedidas = []; });
    await llamada("wk-2", { sinIp: true });
    const w2 = await encender();
    anotar("webkit · 2.ª llamada: la FaceTime pedida por id abre (antes: elegida-no-abre → sistema)", /FaceTime/.test(w2.r?.pistaCamara ?? "") && !lineas(w2.reg, /elegida-no-abre/).length, `pista=${w2.r?.pistaCamara} · ${resumenCam(w2)}`);
    await cortar();

    // W3 · otra regla posible de WebKit: deviceId exacto + tamaño → rechaza (constraint=width). La escalera baja a «solo-id».
    await preparar({ permiso: true, regla: "id+tamano" });
    await llamada("wk-3", { sinIp: true });
    const w3 = await encender();
    const fallo3 = lineas(w3.reg, /intento .*paso=deseo .*fallo .*constraint=width/);
    const ok3 = lineas(w3.reg, /intento .*paso=solo-id .*ok/);
    anotar("webkit · regla deviceId+tamaño: la escalera registra la restricción y abre la FaceTime con solo el id", /FaceTime/.test(w3.r?.pistaCamara ?? "") && fallo3.length > 0 && ok3.length > 0, `pista=${w3.r?.pistaCamara} · ${(fallo3[0] ?? "sin línea de fallo").slice(0, 200)} | ${(ok3[0] ?? "sin línea ok").slice(0, 160)}`);
    await cortar();

    // W4 · como a las 09:37: sin iPhone que cumpla (todas rechazan) y sin etiquetas: antes «No encontramos ninguna cámara».
    await preparar({ rechazan: "." });
    await llamada("wk-4", { sinIp: true });
    const w4 = await encender();
    const nada = lineas(w4.reg, /No encontramos ninguna c/);
    anotar("webkit · todas rechazan el frameRate obligatorio: igual abre una cámara y nunca «No encontramos»", w4.r?.camara === true && nada.length === 0, `pista=${w4.r?.pistaCamara} aviso=${w4.r?.aviso} · ${resumenCam(w4)}`);
    await mac.screenshot({ path: join(capturas, "21-webkit-todas-rechazan.png") });
    await cortar();

    // W5 · selector: al iPhone y de vuelta a la FaceTime sin colgar; una cámara ocupada dice por qué y deja la anterior.
    await preparar({ permiso: true });
    await llamada("wk-5", { sinIp: true });
    const w5 = await encender();
    const ids = await mac.evaluate(() => { const v = window.banco.vista(); return v.dispositivos.camaras.map((c) => ({ id: c.id, nombre: c.nombre })); });
    const idDe = (re) => ids.find((c) => re.test(c.nombre))?.id ?? null;
    await mac.evaluate((id) => window.banco.acciones().elegirCamara(id), idDe(/Desk View/));
    const aIphone = await esperarHasta(mac, () => /Desk View/.test(window.banco.resumen()?.pistaCamara ?? ""), 8000);
    await mac.evaluate((id) => window.banco.acciones().elegirCamara(id), idDe(/FaceTime/));
    const deVuelta = await esperarHasta(mac, () => /FaceTime/.test(window.banco.resumen()?.pistaCamara ?? ""), 8000);
    const r5 = await mac.evaluate(() => window.banco.resumen());
    anotar("webkit · selector: iPhone y de vuelta a la FaceTime en vivo, sin colgar", aIphone && deVuelta && r5?.fase === "en-curso", `inicio=${w5.r?.pistaCamara} → iPhone=${aIphone} → FaceTime=${deVuelta} fase=${r5?.fase}`);
    await comprobarRemoto("webkit · selector: la tableta ve la FaceTime de nuevo", tableta, mac, "22-webkit-selector-vuelta");
    await mac.evaluate(() => { window.banco.camaras.ocupadas = "Desk View"; });
    await mac.evaluate((id) => window.banco.acciones().elegirCamara(id), idDe(/Desk View/));
    await espera(2500);
    const r6 = await mac.evaluate(() => window.banco.resumen());
    const avisoVisible = await mac.locator('[data-testid="superficie-llamada"] [role="status"]').allTextContents().catch(() => []);
    anotar("webkit · selector: cámara ocupada → dice por qué en palabras y sigue la anterior", /FaceTime/.test(r6?.pistaCamara ?? "") && r6?.camara === true && r6?.fase === "en-curso" && /ocupada|no se pudo/i.test(`${r6?.aviso ?? ""} ${avisoVisible.join(" ")}`), `pista=${r6?.pistaCamara} aviso=${r6?.aviso} textos=${avisoVisible.join(" / ").slice(0, 200)}`);
    await mac.screenshot({ path: join(capturas, "23-webkit-ocupada.png") });
    const pref6 = await mac.evaluate(() => {
      try {
        const a = JSON.parse(localStorage.getItem("starseed.llamadas.dispositivos") ?? "{}");
        return Object.values(a.neuronas ?? {}).map((n) => n.camara).find(Boolean) ?? null;
      } catch {
        return null;
      }
    });
    anotar("webkit · selector: la cámara que no abrió no queda como la guardada", /FaceTime/.test(pref6?.etiqueta ?? ""), JSON.stringify(pref6).slice(0, 160));
    await cortar();
    // Lo elegido en estos casos (la Desk View que no abrió queda recordada por el motor) no pasa a los siguientes.
    for (const p of [mac, tableta]) await p.evaluate(() => { try { localStorage.clear(); } catch {} Object.assign(window.banco.camaras, { ocupadas: null, rechazan: null, regla: "fps", permiso: true }); });
  }

  /* 2e · LLA1111A · la ventana cabe: cada panel abierto a cada tamaño, medido (no a ojo). */
  if (!soloCaso || soloCaso === "ventana") {
    const TAMANOS = [
      { n: "320x568", w: 320, h: 568 },
      { n: "360x640", w: 360, h: 640 },
      { n: "390x844", w: 390, h: 844 },
      { n: "640x360", w: 640, h: 360 },
      { n: "escritorio-1280x800", w: 1280, h: 800 },
    ];
    const PANELES = ["Puertos", "Medio", "Gente", "Invitar", "Grabar", "Astraura", "Chat"];
    await llamada("ven-1", { sinIp: true });
    await camara(mac);
    await camara(tableta);
    await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 10000);
    await espera(3000);
    /** Mide la ventana: cajas fuera de la pantalla sin un antepasado desplazable que las contenga, controles enteros, filas, estado repetido. */
    const medirVentana = (p) => p.evaluate(() => {
      const sec = document.querySelector('[data-testid="superficie-llamada"]');
      if (!sec) return { error: "sin ventana" };
      const W = window.innerWidth, H = window.innerHeight;
      const r = sec.getBoundingClientRect();
      const fuera = (b) => b.top < -0.5 || b.left < -0.5 || b.bottom > H + 0.5 || b.right > W + 0.5;
      const desplazable = (el) => {
        for (let a = el.parentElement; a && a !== sec.parentElement; a = a.parentElement) {
          const cs = getComputedStyle(a);
          const sy = /(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1;
          const sx = /(auto|scroll)/.test(cs.overflowX) && a.scrollWidth > a.clientWidth + 1;
          if ((sy || sx) && !fuera(a.getBoundingClientRect())) return true;
        }
        return false;
      };
      const malos = [];
      for (const el of [sec, ...sec.querySelectorAll("*")]) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (el.closest(".sr-only")) continue;
        if (fuera(b) && !desplazable(el)) malos.push(`${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} ${Math.round(b.top)}..${Math.round(b.bottom)}`);
      }
      const dentro = (b) => b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5 && b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && !fuera(b);
      const ctrls = [...sec.querySelectorAll("footer > button, footer > span > button")].map((b) => b.getBoundingClientRect());
      const filas = new Set(ctrls.map((b) => Math.round(b.top))).size;
      const nombre = sec.querySelector("header h2")?.getBoundingClientRect();
      const colgar = sec.querySelector('footer button[aria-label="Colgar"]')?.getBoundingClientRect();
      const texto = sec.innerText;
      const veces = (t) => (t ? texto.split(t).length - 1 : -1);
      const medio = window.banco.vista()?.textoMedio ?? null;
      const carr = window.banco.vista()?.textoCarriles ?? null;
      return {
        caja: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} de ${W}×${H}`,
        ventanaDentro: !fuera(r),
        malos: malos.slice(0, 6),
        nMalos: malos.length,
        controles: ctrls.length,
        controlesEnteros: ctrls.every(dentro),
        filas,
        cabecera: !!nombre && dentro(nombre),
        colgar: !!colgar && dentro(colgar),
        vecesMedio: veces(medio),
        vecesCarriles: veces(carr),
        tabCalidad: [...sec.querySelectorAll('[role="tab"]')].some((t) => /Calidad/.test(t.textContent ?? "")),
      };
    });
    const abrirPestana = async (p, nombre) => {
      const tab = p.getByRole("tab", { name: nombre, exact: false }).first();
      if (!(await tab.count())) return false;
      if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
      await espera(350);
      return true;
    };
    const cerrarPestana = async (p) => {
      const sel = p.locator('[role="tab"][aria-selected="true"]').first();
      if (await sel.count()) await sel.click();
      await espera(200);
    };
    for (const t of TAMANOS) {
      await mac.setViewportSize({ width: t.w, height: t.h });
      await mac.evaluate(({ w, h }) => window.banco.marco(w, h), t);
      await espera(500);
      await abrirPanel(mac);
      for (const nombre of PANELES) {
        const hay = await abrirPestana(mac, nombre);
        const m = hay ? await medirVentana(mac) : { error: "sin pestaña" };
        const ok = hay && m.ventanaDentro && m.nMalos === 0 && m.controlesEnteros && m.controles > 0 && m.filas <= 2 && m.cabecera && m.colgar && m.vecesMedio <= 1 && m.vecesCarriles <= 1 && !m.tabCalidad;
        anotar(`ventana · ${t.n} · «${nombre}» abierto: cabe, controles enteros, estado una vez`, ok, hay ? `caja=${m.caja} fuera=${m.nMalos}${m.malos.length ? ` [${m.malos.join("; ")}]` : ""} controles=${m.controles} filas=${m.filas} enteros=${m.controlesEnteros} cabecera=${m.cabecera} colgar=${m.colgar} estado×${m.vecesMedio}/${m.vecesCarriles}` : m.error);
        if (nombre === "Medio" || (t.n === "320x568" && nombre === "Puertos")) await mac.screenshot({ path: join(capturas, `30-ventana-${t.n}-${nombre.toLowerCase()}.png`) });
        await cerrarPestana(mac);
      }
    }
    // Pantalla completa con «Medio» abierto (teléfono vertical y apaisado).
    for (const t of [TAMANOS[2], TAMANOS[3]]) {
      await mac.setViewportSize({ width: t.w, height: t.h });
      await mac.evaluate(({ w, h }) => window.banco.marco(w, h), t);
      await espera(400);
      await mac.getByRole("button", { name: "Pantalla completa" }).first().click().catch(() => undefined);
      await espera(500);
      await abrirPestana(mac, "Medio");
      const m = await medirVentana(mac);
      const ok = m.ventanaDentro && m.nMalos === 0 && m.controlesEnteros && m.filas <= 2 && m.cabecera && m.colgar && m.vecesMedio <= 1;
      anotar(`ventana · pantalla completa ${t.n} · «Medio» abierto: cabe`, ok, `caja=${m.caja} fuera=${m.nMalos}${m.malos.length ? ` [${m.malos.join("; ")}]` : ""} controles=${m.controles} filas=${m.filas} cabecera=${m.cabecera} colgar=${m.colgar}`);
      await mac.screenshot({ path: join(capturas, `31-completa-${t.n}-medio.png`) });
      await cerrarPestana(mac);
      await mac.getByRole("button", { name: /Salir de pantalla completa/ }).first().click().catch(() => undefined);
      await espera(300);
    }
    // Carril por flujo, a mano, en «Medio».
    await mac.setViewportSize({ width: 390, height: 844 });
    await mac.evaluate(() => window.banco.marco(390, 844));
    await espera(300);
    await abrirPestana(mac, "Medio");
    const sels = await mac.locator("[data-carriles-flujo] select").count();
    const opcionesVideo = await mac.locator("#carril-video option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent, d: o.disabled })));
    const elegible = opcionesVideo.find((o) => o.v !== "auto" && !o.d);
    if (elegible) await mac.selectOption("#carril-video", elegible.v);
    await espera(600);
    const forzado = await mac.evaluate(() => window.banco.motor()?.carriles()?.[0]?.forzados?.video ?? null);
    const textoActual = await mac.locator('[data-carril-actual="video"]').textContent().catch(() => null);
    await mac.selectOption("#carril-video", "auto");
    await espera(600);
    const auto = await mac.evaluate(() => window.banco.motor()?.carriles()?.[0]?.forzados?.video ?? null);
    const sinEnlace = await mac.locator("[data-sin-enlace-carril]").textContent().catch(() => "");
    const filasMuertas = await mac.locator("[data-carriles-flujo] option[disabled]").count();
    anotar("medio · carril por flujo: voz, vídeo y pantalla; forzar uno y volver a «Automático»", sels === 3 && !!elegible && forzado === elegible?.v && auto === null, `selects=${sels} opciones vídeo=${JSON.stringify(opcionesVideo)} forzado=${forzado} → auto=${auto} actual=«${textoActual}»`);
    anotar("medio · los carriles sin enlace van en una línea, no como filas muertas", /Sin enlace ahora:/.test(sinEnlace ?? "") && filasMuertas === 0, `«${(sinEnlace ?? "").slice(0, 160)}» opciones-deshabilitadas=${filasMuertas}`);
    await mac.screenshot({ path: join(capturas, "32-medio-carriles.png") });
    await cerrarPestana(mac);
    await mac.setViewportSize({ width: 480, height: 640 });
    await mac.evaluate(() => window.banco.marco(480, 640));
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
    await espera(1200);
    for (const p of [mac, tableta]) await p.evaluate(() => { try { localStorage.clear(); } catch {} });
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

  /* 5 · (LLA1110D) Casos combinados: motor con carriles por flujo + ventana real en los dos lados. */
  /** Brillo medio del mosaico remoto cada ~350 ms durante `ms`: cuenta las muestras oscuras (hueco negro o parpadeo). */
  const muestrear = async (p, ms) => {
    const fin = Date.now() + ms;
    const medias = [];
    while (Date.now() < fin) {
      await abrirPanel(p);
      const loc = p.locator(REMOTO).first();
      const caja = (await loc.count()) ? await loc.boundingBox() : null;
      if (!caja || caja.width < 4) {
        medias.push(0);
      } else {
        const b64 = (await p.screenshot({ clip: caja })).toString("base64");
        medias.push(await p.evaluate(async (b64) => {
          const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
          const c = new OffscreenCanvas(bm.width, bm.height);
          const x = c.getContext("2d");
          x.drawImage(bm, 0, 0);
          const d = x.getImageData(0, 0, bm.width, bm.height).data;
          let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) { s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
          return Math.round(s / n);
        }, b64));
      }
      await espera(150);
    }
    const oscuras = medias.filter((m) => m < 35).length;
    return { oscuras, n: medias.length, min: Math.min(...medias), txt: `oscuras=${oscuras}/${medias.length} min=${Math.min(...medias)}` };
  };
  const resumenDe = (p) => p.evaluate(() => window.banco.resumen());
  const lineaCarriles = async (p) => (await p.locator("[data-carriles]").first().textContent().catch(() => null)) ?? null;

  if (!soloCaso || soloCaso === "carriles") {
    const ok = await llamada("car-1", { sinIp: true, ipDinamica: true });
    anotar("carriles · solo Bluetooth: conecta por el enlace de datos", ok, JSON.stringify((await resumenDe(mac))?.medio));
    await camara(mac);
    await camara(tableta);
    await comprobarRemoto("carriles · solo Bluetooth: la tableta ve a la Mac (lienzo)", tableta, mac, "11-car-ble-tableta-ve-mac");
    await comprobarRemoto("carriles · solo Bluetooth: la Mac ve a la tableta (lienzo)", mac, tableta, "12-car-ble-mac-ve-tableta");
    // Aparece la ruta IP en los dos: el vídeo sube a WebRTC (3 s de evidencia), la voz se queda en el enlace de datos.
    await Promise.all([mac.evaluate(() => window.banco.ip(true)), tableta.evaluate(() => window.banco.ip(true))]);
    const relevo = await muestrear(tableta, 14000);
    anotar("carriles · relevo datos → WebRTC sin hueco negro (la tableta mira a la Mac)", relevo.oscuras === 0, relevo.txt);
    await esperarHasta(mac, () => window.banco.resumen()?.carriles?.[0]?.video === "webrtc", 15000);
    const rM = await resumenDe(mac);
    const rT = await resumenDe(tableta);
    anotar("carriles · con Bluetooth e IP la voz SIGUE por el enlace de datos", /enlace de datos|Bluetooth/i.test(rM?.medio ?? "") && rM?.carriles?.[0]?.voz !== "webrtc", `mac medio=${rM?.medio} carriles=${JSON.stringify(rM?.carriles?.[0])}`);
    anotar("carriles · con Bluetooth e IP el vídeo va por WebRTC en los dos", rM?.carriles?.[0]?.video === "webrtc" && rT?.carriles?.[0]?.video === "webrtc", `mac=${rM?.carriles?.[0]?.video} tableta=${rT?.carriles?.[0]?.video}`);
    const linea = await lineaCarriles(mac);
    anotar("carriles · la ventana dice «Voz: … · Vídeo: WebRTC»", !!linea && /^Voz: \S.* · Vídeo: WebRTC$/.test(linea) && !/Voz: WebRTC/.test(linea), `línea=${linea}`);
    await comprobarRemoto("carriles · Bluetooth+IP: la tableta ve a la Mac por WebRTC (<video>)", tableta, mac, "13-car-ip-tableta-ve-mac");
    await comprobarRemoto("carriles · Bluetooth+IP: la Mac ve a la tableta por WebRTC (<video>)", mac, tableta, "14-car-ip-mac-ve-tableta");
    const rT2 = await resumenDe(tableta);
    anotar("carriles · Bluetooth+IP: la tableta pinta el <video> de WebRTC, no el lienzo", rT2?.remotoLienzo === false, `remoto=${JSON.stringify(rT2?.remoto)} lienzo=${rT2?.remotoLienzo}`);
    // La IP se corta a mitad de llamada: el vídeo vuelve al enlace de datos y se sigue viendo.
    await Promise.all([mac.evaluate(() => window.banco.ip(false)), tableta.evaluate(() => window.banco.ip(false))]);
    const corte = await muestrear(tableta, 14000);
    anotar("carriles · corte de IP: la tableta sigue viendo a la Mac (sin hueco negro largo)", corte.oscuras <= 1, corte.txt);
    await comprobarRemoto("carriles · corte de IP: la tableta ve a la Mac por el enlace de datos", tableta, mac, "15-car-corte-tableta-ve-mac");
    const rC = await resumenDe(mac);
    anotar("carriles · corte de IP: la llamada sigue y el vídeo pasa al enlace de datos", rC?.fase === "en-curso" && rC?.carriles?.[0]?.video !== "webrtc", `fase=${rC?.fase} carriles=${JSON.stringify(rC?.carriles?.[0])}`);
    // Vuelve la IP.
    await Promise.all([mac.evaluate(() => window.banco.ip(true)), tableta.evaluate(() => window.banco.ip(true))]);
    const vuelta = await muestrear(tableta, 16000);
    anotar("carriles · vuelve la IP: sin hueco negro", vuelta.oscuras === 0, vuelta.txt);
    await esperarHasta(mac, () => window.banco.resumen()?.carriles?.[0]?.video === "webrtc", 20000);
    await comprobarRemoto("carriles · vuelve la IP: la tableta ve a la Mac por WebRTC", tableta, mac, "16-car-vuelta-tableta-ve-mac");
    const reg = await mac.evaluate(() => window.banco.registro);
    const cambios = lineas(reg, /carril .*flujo=voz de=(?!-)/);
    anotar("carriles · la voz no se movió en toda la llamada", cambios.length === 0, cambios.slice(0, 3).join(" | ").slice(0, 300) || "ninguno");
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
    await espera(1200);
  }

  if (!soloCaso || soloCaso === "tres") {
    for (let i = 1; i <= 3; i++) {
      const ok = await llamada(`tres-${i}`, { sinIp: true });
      await camara(mac);
      const on = await esperarHasta(mac, () => window.banco.resumen()?.camara === true, 10000);
      anotar(`tres llamadas · ${i}.ª: conecta y la cámara de quien llama se enciende`, ok && on, JSON.stringify((await resumenDe(mac))?.pistaCamara));
      await comprobarRemoto(`tres llamadas · ${i}.ª: la tableta ve a la Mac`, tableta, mac, `17-tres-${i}`);
      await mac.evaluate(() => window.banco.colgar());
      await tableta.evaluate(() => window.banco.colgar());
      await espera(1200);
    }
  }

  if (!soloCaso || soloCaso === "sinservidor") {
    // Llama la TABLETA (sin servidor: solo el canal directo, sin tema de Supabase ni IP) y con vídeo desde el principio.
    await tableta.evaluate((x) => window.banco.llamar(x), { sid: "sinserv-1", sinIp: true, video: true });
    await espera(300);
    await mac.evaluate((x) => window.banco.llamar(x), { sid: "sinserv-1", sinIp: true, video: true });
    const ok = (await esperarHasta(tableta, () => window.banco.resumen()?.estado === "conectada")) && (await esperarHasta(mac, () => window.banco.resumen()?.estado === "conectada"));
    anotar("sin servidor · la llamada de la tableta conecta en los dos", ok, JSON.stringify((await resumenDe(tableta))?.medio));
    await comprobarRemoto("sin servidor · la Mac ve a la tableta", mac, tableta, "18-sinserv-mac-ve-tableta");
    await comprobarRemoto("sin servidor · la tableta ve a la Mac", tableta, mac, "19-sinserv-tableta-ve-mac");
    await mac.evaluate(() => window.banco.colgar());
    await tableta.evaluate(() => window.banco.colgar());
    await espera(1200);
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
