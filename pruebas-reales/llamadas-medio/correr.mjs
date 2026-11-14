// Corre los escenarios del banco en Chromium (Playwright, cámara y micro falsos).
//   node correr.mjs [salida] [escenario] [segundos]
// escenarios: aleteo · ip-aparece · choque · video · segunda · corte-ip · sin-servidor · voz-video · paso-ip · paso-ip-silencioso · timbre-cola · video-sube · wifi-directo · ble-160 · ble-80 · ble-40 · ble-caida · ble-micro · voz-40 · voz-24 · voz-16 · voz-caida · voz-suelo · voz-40-cif · voz-24-cif · voz-16-cif · vozvideo-80 · vozvideo-40 · ble-real · ble-real-mudo · ble-tableta · ble-tableta-41 · wifi-cae · ruta-fantasma · todos
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] ?? path.join(aqui, "salida"));
const escenario = process.argv[3] ?? "todos";
const segundos = Number(process.argv[4] ?? 300);
const require = createRequire(import.meta.url);
let pw;
for (const c of ["playwright", "/opt/npm-tools/node_modules/playwright"]) {
  try {
    pw = require(c);
    break;
  } catch {
    /* siguiente */
  }
}
const srv = http.createServer((q, r) => {
  const f = path.join(dir, q.url === "/" ? "index.html" : q.url.split("?")[0]);
  if (!f.startsWith(dir) || !fs.existsSync(f)) return r.writeHead(404).end();
  r.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : "text/html" }).end(fs.readFileSync(f));
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const url = `http://127.0.0.1:${srv.address().port}/`;
// LLA1113A: `BANCO_CANAL=chrome` usa el Chrome instalado (en un Mac sin los navegadores de Playwright).
const nav = await pw.chromium.launch({ ...(process.env.BANCO_CANAL ? { channel: process.env.BANCO_CANAL } : {}), args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await nav.newContext({ permissions: ["camera", "microphone"] });
const out = {};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagina() {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  // VOZ1111J: que se sepa si la página se cayó (y no solo «Target closed»).
  p.on("crash", () => console.error("· la página se cayó (crash del renderizador)"));
  await p.goto(url);
  await p.waitForFunction(() => window.banco?.listo);
  // LLA1114B: que se vea si el lado B corre otro árbol (`construir.mjs <A> <salida> <B>`).
  if (await p.evaluate(() => !!window.banco?.mezclado)) console.error("· versiones mezcladas: el lado B (la tableta) corre otro árbol");
  return p;
}
const resumen = (p) =>
  p.evaluate(() => {
    const b = window.banco;
    const L = b.lineas;
    const cuenta = (re) => L.filter((l) => re.test(`${l.hito} ${l.detalle}`)).length;
    return {
      reiniciosVozDatos: cuenta(/voz-datos iniciada/),
      vuelveWebrtc: cuenta(/vuelve a WebRTC/),
      cambiosCarril: L.filter((l) => l.hito === "carril" && / de=\S+ a=/.test(l.detalle) && !/de=- /.test(l.detalle)).map((l) => `${l.t}ms ${l.neurona} ${l.detalle.replace(/ muestras=.*/, "")}`),
      colisiones: cuenta(/colision/),
      ofertas: b.cuenta.ofertas,
      ofertasSinIp: b.cuenta.ofertasSinIp,
      sesionesAudio: { ...b.audio.sesiones },
      reproducidas: { ...b.audio.reproducidas },
      lineasCarrilYNeg: L.filter((l) => l.hito === "carril" || l.hito === "negociacion").length,
    };
  });

const esc = {
  // Prueba 33, llamada 3: hay IP de verdad (WebRTC conecta) pero el motor «ve» que no la hay, y el enlace de datos está arriba.
  async aleteo() {
    const p = await pagina();
    await p.evaluate(async () => {
      const b = window.banco;
      b.red.ip = true;
      b.red.ipVista.A = false;
      b.red.ipVista.B = false;
      window.__ll = await b.llamada({ conDatos: true });
    });
    await espera(Math.min(segundos, 60) * 1000);
    const r = await resumen(p);
    r.carriles = await p.evaluate(() => window.__ll.A.carriles?.() ?? null);
    r.medio = await p.evaluate(() => [window.__ll.A.estado().medio?.tipo, window.__ll.B.estado().medio?.tipo]);
    await p.close();
    return r;
  },
  // Solo Bluetooth al empezar; a los 20 s aparece la ruta IP y sigue N segundos con los dos arriba (el ejemplo de Alex).
  async "ip-aparece"() {
    const p = await pagina();
    await p.evaluate(async () => {
      const b = window.banco;
      b.red.ip = false;
      b.red.ipVista.A = false;
      b.red.ipVista.B = false;
      window.__ll = await b.llamada({ conDatos: true, video: true });
    });
    await espera(20_000);
    const antes = await resumen(p);
    await p.evaluate(() => {
      const b = window.banco;
      b.red.ipVista.A = true;
      b.red.ipVista.B = true;
      b.cambiarRedIp(true);
    });
    await espera(segundos * 1000);
    const r = await resumen(p);
    r.antesDeIp = { ofertasSinIp: antes.ofertasSinIp, sesionesAudio: antes.sesionesAudio };
    r.carriles = await p.evaluate(() => window.__ll.A.carriles?.() ?? null);
    r.videoEnB = await p.evaluate(() => window.banco.videoRemoto(window.__ll.B));
    r.estadoNeg = await p.evaluate(() => window.banco.estadoNeg());
    await p.close();
    return r;
  },
  // Los dos encienden y apagan la cámara A LA VEZ, cinco veces, con WebRTC conectado.
  async choque() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      const { A, B } = await b.llamada({ conDatos: false });
      const hasta = async (f, ms = 8000) => {
        const fin = performance.now() + ms;
        while (!f() && performance.now() < fin) await new Promise((r) => setTimeout(r, 50));
        return f();
      };
      await hasta(() => b.pcs.length >= 2 && b.pcs.every((x) => x.iceConnectionState === "connected" || x.iceConnectionState === "completed"));
      // Cuadros de vídeo decodificados que recibe cada RTCPeerConnection (getStats): la prueba de que llega imagen.
      const cuadros = async () => Promise.all(b.pcs.slice(-2).map(async (pc) => {
        let n = 0;
        (await pc.getStats()).forEach((r) => {
          if (r.type === "inbound-rtp" && r.kind === "video") n += r.framesDecoded ?? 0;
        });
        return n;
      }));
      const rondas = [];
      for (let i = 0; i < 5; i++) {
        await Promise.all([A.alternarCamara(), B.alternarCamara()]);
        const encendida = i % 2 === 0;
        const c0 = await cuadros();
        const fin = performance.now() + 10000;
        let ok = false;
        let c1 = c0;
        while (performance.now() < fin) {
          await new Promise((r) => setTimeout(r, 250));
          c1 = await cuadros();
          const estables = b.pcs.slice(-2).every((x) => x.signalingState === "stable");
          if (estables && (!encendida || c1.every((n, k) => n - c0[k] >= 10))) {
            ok = true;
            break;
          }
        }
        rondas.push({ encendida, convergio: ok, cuadrosNuevos: c1.map((n, k) => n - c0[k]), neg: b.estadoNeg() });
        await new Promise((r) => setTimeout(r, 1500));
      }
      return { rondas, vA: await b.videoRemoto(A), vB: await b.videoRemoto(B) };
    });
    Object.assign(r, await resumen(p));
    await p.close();
    return r;
  },
  // Vídeo por la LAN: cámara de un lado y luego del otro; apagar y encender; cuadros decodificados y píxel no negro.
  async video() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      const { A, B } = await b.llamada({ conDatos: false });
      await new Promise((r) => setTimeout(r, 3000));
      const pasos = [];
      await A.alternarCamara();
      await new Promise((r) => setTimeout(r, 3000));
      pasos.push({ paso: "A enciende", enB: await b.videoRemoto(B) });
      await B.alternarCamara();
      await new Promise((r) => setTimeout(r, 3000));
      pasos.push({ paso: "B enciende", enA: await b.videoRemoto(A) });
      await A.alternarCamara();
      await new Promise((r) => setTimeout(r, 1500));
      await A.alternarCamara();
      await new Promise((r) => setTimeout(r, 3000));
      pasos.push({ paso: "A apaga y enciende", enB: await b.videoRemoto(B) });
      A.colgar();
      B.colgar();
      return pasos;
    });
    await p.close();
    return r;
  },
  // Tres llamadas seguidas en la misma página (mismo estado de módulo): la cámara tiene que encender en todas.
  async segunda() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      const res = [];
      for (let i = 0; i < 3; i++) {
        const { A, B } = await b.llamada({ conDatos: false });
        await new Promise((r) => setTimeout(r, 2500));
        const err = await A.alternarCamara();
        await new Promise((r) => setTimeout(r, 3000));
        res.push({ llamada: i + 1, error: err, camaraA: A.estado().camara, enB: await b.videoRemoto(B) });
        A.colgar();
        B.colgar();
        await new Promise((r) => setTimeout(r, 800));
      }
      return res;
    });
    await p.close();
    return r;
  },
  // Con voz por Bluetooth y vídeo por WebRTC, la ruta IP se corta 20 s y vuelve.
  async "corte-ip"() {
    const p = await pagina();
    await p.evaluate(async () => {
      const b = window.banco;
      b.red.ip = false;
      b.red.ipVista.A = b.red.ipVista.B = false;
      window.__ll = await b.llamada({ conDatos: true, video: true });
      await new Promise((r) => setTimeout(r, 10000));
      b.red.ipVista.A = b.red.ipVista.B = true;
      b.cambiarRedIp(true);
    });
    await espera(20_000);
    const conIp = await p.evaluate(() => window.__ll.A.carriles());
    await p.evaluate(() => {
      const b = window.banco;
      b.red.ipVista.A = b.red.ipVista.B = false;
      b.cambiarRedIp(false);
    });
    await espera(20_000);
    const sinIp = await p.evaluate(() => ({ c: window.__ll.A.carriles(), fase: window.__ll.A.estado().fase, rep: { ...window.banco.audio.reproducidas } }));
    await p.evaluate(() => {
      const b = window.banco;
      b.red.ipVista.A = b.red.ipVista.B = true;
      b.cambiarRedIp(true);
    });
    await espera(25_000);
    const vuelve = await p.evaluate(async () => ({ c: window.__ll.A.carriles(), fase: window.__ll.A.estado().fase, rep: { ...window.banco.audio.reproducidas }, enB: await window.banco.videoRemoto(window.__ll.B) }));
    const r = { conIp, sinIp, vuelve, ...(await resumen(p)) };
    await p.close();
    return r;
  },
  // Llamada empezada SIN servidor: id local, sin tema (sin Supabase), solo el canal directo y sin red IP.
  async "sin-servidor"() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      b.red.ip = false;
      b.red.ipVista.A = b.red.ipVista.B = false;
      const { A, B } = await b.llamada({ conDatos: true });
      await new Promise((r) => setTimeout(r, 8000));
      return { contestadaA: A.estado().contestada, contestadaB: B.estado().contestada, fase: [A.estado().fase, B.estado().fase], medio: [A.estado().medio?.tipo, B.estado().medio?.tipo], reproducidas: { ...b.audio.reproducidas }, ofertasSinIp: b.cuenta.ofertasSinIp };
    });
    await p.close();
    return r;
  },
  // Voz y video a la vez con un enlace de ~160 kb/s: debe fallar antes del arreglo (timeout 30s = 6 fallos × 5s).
  // Si no alcanza, se pausa el video y se avisa, con prioridad al audio.
  async "voz-video"() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      // Simular ancho de banda reducido (~160 kb/s = 160000 bps)
      b.red.anchoBanda = { bps: 160000, video: true, audio: true };
      const { A, B } = await b.llamada({ conDatos: true, video: true });
      // Esperar el timeout de 30 segundos (6 fallos × 5s = CAIDA_MS = 30,000)
      await new Promise((r) => setTimeout(r, 30000));
      const faseA = A.estado().fase;
      const faseB = B.estado().fase;
      // Verificar si hubo pausa de video oaviso
      const avisos = b.lineas.filter((l) => l.hito === "aviso" && /video|pausa|ancho/.test(l.detalle));
      return {
        fase: [faseA, faseB],
        medio: [A.estado().medio?.tipo, B.estado().medio?.tipo],
        reproducidas: { ...b.audio.reproducidas },
        avisosVideo: avisos.map((l) => l.detalle),
      };
    });
    await p.close();
    return r;
  },
  // MLL1111C · Las dos vías arriba y voz por WebRTC; a media llamada se corta la IP CON la señal del sistema («offline»,
  // ICE a «failed»). Mide cuánto tarda la voz en volver a sonar en los dos (por el enlace de datos ya abierto).
  async "paso-ip"() {
    return pasoIp({ modo: "estado", senal: true });
  },
  // MLL1111C · Igual, pero el corte es SILENCIOSO: ICE sigue «conectado», no hay señal del sistema y solo dejan de entrar bytes
  // (apagar el Wi-Fi del otro aparato). Solo la comprobación de vida lo detecta.
  async "paso-ip-silencioso"() {
    return pasoIp({ modo: "silencio", senal: false });
  },
  // LLA1112A · (B) Prueba 39, 04:28:40–04:29:50: llamada con Wi-Fi Y Bluetooth; la tableta apaga el Wi-Fi (corte SILENCIOSO:
  // ICE sigue «conectado» y dejan de entrar bytes; a los 3 s la ruta IP deja de verse) 20 s y lo vuelve a encender.
  // Pasa si: el motor elegido para «enlace local + Bluetooth» es el de llamadas (la llamada directa no tiene otro carril),
  // la voz suena en los dos en ≤ 2 s tras el corte, nadie termina la llamada, el vídeo vuelve por WebRTC sin negro en los
  // dos, y la llamada directa (cuando se use, sin Bluetooth) sigue en curso 2 s después de perder su enlace.
  async "wifi-cae"() {
    const p = await pagina();
    const motor = await p.evaluate(() => window.banco.motorParaWifiYBluetooth());
    const directa = await p.evaluate(() => window.banco.directaCaeWifi());
    const r = await p.evaluate(async () => {
      const b = window.banco;
      b.red.ip = true;
      b.red.modoCorte = "estado";
      b.red.ipVista.A = b.red.ipVista.B = true;
      b.bleReal.activo = false;
      b.bleReal.ladoB = null;
      b.bleReal.sinNativo = false; // LLA1113C
      b.ble.kbps = 160;
      // El Bluetooth de verdad (carril fijo de 160 kb/s) con el vídeo ligero de verdad: si WebRTC se va, el vídeo puede seguir por él.
      const ll = await b.llamada({ conDatos: true, video: true, ble: true, videoDatos: true, opus: true });
      window.__ll = ll;
      const hasta = async (f, ms) => {
        const fin = performance.now() + ms;
        while (!f() && performance.now() < fin) await new Promise((r) => setTimeout(r, 25));
        return f();
      };
      const car = (q) => (window.__ll[q].carriles?.() ?? [])[0] ?? {};
      const listo = await hasta(() => ["A", "B"].every((q) => car(q).voz === "webrtc" && car(q).video === "webrtc"), 20000);
      await new Promise((r) => setTimeout(r, 3000));
      const antes = { ...b.audio.reproducidas };
      const t0 = performance.now();
      b.red.modoCorte = "silencio";
      b.cambiarRedIp(false);
      setTimeout(() => {
        b.red.ipVista.A = b.red.ipVista.B = false;
      }, 3000);
      const suena = await hasta(() => b.audio.reproducidas.A >= antes.A + 5 && b.audio.reproducidas.B >= antes.B + 5, 20000);
      const vozMs = suena ? Math.round(performance.now() - t0) : null;
      await new Promise((r) => setTimeout(r, Math.max(0, 20000 - (performance.now() - t0))));
      // Imagen durante el corte (vídeo ligero pintado en cada lado entre los 8 y los 20 s: fps).
      const pint = (q) => b.pintadas[q].filter((x) => x >= t0 + 8000 && x < t0 + 20000).length / 12;
      const sinIp = { fase: [ll.A.estado().fase, ll.B.estado().fase], carriles: [car("A"), car("B")].map((c) => `${c.voz}/${c.video}`), aviso: [ll.A.estado().aviso, ll.B.estado().aviso], fpsLigero: { enA: Math.round(pint("A") * 10) / 10, enB: Math.round(pint("B") * 10) / 10 } };
      b.red.ipVista.A = b.red.ipVista.B = true;
      b.cambiarRedIp(true);
      const vuelve = await hasta(() => ["A", "B"].every((q) => car(q).video === "webrtc"), 30000);
      await new Promise((r) => setTimeout(r, 4000));
      const enA = await b.videoRemoto(ll.B);
      const enB = await b.videoRemoto(ll.A);
      const fin = { fase: [ll.A.estado().fase, ll.B.estado().fase], carriles: [car("A"), car("B")].map((c) => `${c.voz}/${c.video}`) };
      const fallos = b.lineas.filter((l) => l.hito === "fallo").map((l) => l.detalle);
      ll.A.colgar();
      ll.B.colgar();
      return { listo, vozMs, sinIp, vuelve, enA, enB, fin, fallos };
    });
    await p.close();
    const fallos = [];
    if (motor !== "sistema-llamadas") fallos.push(`con enlace local y Bluetooth la llamada va por «${motor}» (sin otro carril)`);
    if (directa.faseTras2s !== "en-curso") fallos.push(`la llamada directa acaba al perder su enlace: ${directa.fin} «${directa.motivo}»`);
    if (!r.listo) fallos.push("voz y vídeo no llegaron a WebRTC antes del corte");
    // «En unos dos segundos» (el requisito): 1 s sin bytes para ver el corte (`SILENCIO_WEBRTC_MS`), un tic del vigilante y el
    // búfer del otro; se exige ≤ 2,5 s y se informa el número.
    if (r.vozMs === null || r.vozMs > 2500) fallos.push(`la voz no suena en los dos en 2,5 s tras el corte (${r.vozMs} ms)`);
    if (r.sinIp.fpsLigero.enA < 1 || r.sinIp.fpsLigero.enB < 1) fallos.push(`sin imagen durante el corte: ${JSON.stringify(r.sinIp.fpsLigero)} fps de vídeo ligero`);
    if ([...r.sinIp.fase, ...r.fin.fase].some((f) => f !== "en-curso")) fallos.push(`la llamada no siguió en curso: ${JSON.stringify([r.sinIp.fase, r.fin.fase])}`);
    if (!r.vuelve || !r.enA.noNegro || !r.enB.noNegro) fallos.push(`el vídeo no volvió por WebRTC sin negro: ${JSON.stringify({ vuelve: r.vuelve, enA: r.enA, enB: r.enB })}`);
    return { motor, directa, ...r, veredicto: { pasa: fallos.length === 0, fallos } };
  },
  // LLA1112A · (C) Prueba 39, 04:30:21–04:36:15 y 04:37:26–04:40:26: llamada solo por Bluetooth (ICE no puede conectar) con
  // una ruta IP ANUNCIADA (`hayRutaIp` = true) que no lleva nada, 180 s, los dos aparatos de la misma cuenta. Cuenta los
  // reintentos de WebRTC, las veces que la ventana diría «Reconectando…» con la voz por Bluetooth, el aviso de enlace directo
  // fallido al acabar y el nombre con el que se ve al otro.
  async "ruta-fantasma"() {
    const p = await pagina();
    const dur = Math.min(segundos, 180);
    const r = await p.evaluate(async (dur) => {
      const b = window.banco;
      b.red.ip = false;
      b.red.ipVista.A = b.red.ipVista.B = true;
      const ll = await b.llamada({ conDatos: true, video: true, rutaConPruebas: true, mismaCuenta: true });
      const muestras = { reconectando: 0, total: 0, nombres: new Set(), avisos: new Set() };
      const t0 = performance.now();
      while (performance.now() - t0 < dur * 1000) {
        await new Promise((r) => setTimeout(r, 1000));
        if (performance.now() - t0 < 10000) continue;
        for (const m of [ll.A, ll.B]) {
          const e = m.estado();
          const otro = e.participantes.find((x) => !x.yo);
          muestras.total++;
          if (otro && otro.conexion !== "conectado") muestras.reconectando++;
          if (otro) muestras.nombres.add(otro.nombre);
          if (e.aviso) muestras.avisos.add(e.aviso);
        }
      }
      const reintentos = b.lineas.filter((l) => /se reintenta WebRTC/.test(l.detalle)).map((l) => `${Math.round(l.t / 1000)}s ${l.neurona} ${l.detalle.replace(/par=\S+ /, "")}`);
      const sinUsar = b.lineas.filter((l) => /ruta IP sin usar|aviso-retirado/.test(l.detalle)).map((l) => `${Math.round(l.t / 1000)}s ${l.neurona} ${l.detalle.replace(/par=\S+ /, "")}`);
      const fin = { aviso: [ll.A.estado().aviso, ll.B.estado().aviso], fase: [ll.A.estado().fase, ll.B.estado().fase], rep: { ...b.audio.reproducidas } };
      ll.A.colgar();
      ll.B.colgar();
      return { reintentos, sinUsar, reconectando: muestras.reconectando, muestras: muestras.total, nombres: [...muestras.nombres], avisos: [...muestras.avisos], fin };
    }, dur);
    await p.close();
    const fallos = [];
    if (r.reintentos.length > 2) fallos.push(`${r.reintentos.length} reintentos de WebRTC por una ruta sin tráfico en ${dur} s`);
    if (r.reconectando > 0) fallos.push(`«Reconectando…» en ${r.reconectando} de ${r.muestras} muestras con la voz por Bluetooth`);
    if (r.fin.aviso.some((a) => a && /No se pudo conectar/.test(a))) fallos.push(`sigue el aviso al acabar: ${JSON.stringify(r.fin.aviso)}`);
    if (r.nombres.some((n) => n === "Yo")) fallos.push(`el otro aparato se llama ${JSON.stringify(r.nombres)}`);
    if (r.fin.fase.some((f) => f !== "en-curso")) fallos.push(`la llamada no siguió: ${JSON.stringify(r.fin.fase)}`);
    return { ...r, veredicto: { pasa: fallos.length === 0, fallos } };
  },
  // MLL1111C · Se llama sin ninguna vía; a los 5 s liga una. El timbre debe salir solo (cola), sin «timbre fallo» seco.
  async "timbre-cola"() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      b.vias.arriba = false;
      const pr = b.timbre(30000);
      setTimeout(() => b.abrirVia("bluetooth"), 5000);
      const x = await pr;
      return { ...x, lineas: b.lineas.filter((l) => l.hito === "inicio").map((l) => `${l.t}ms ${l.detalle}`) };
    });
    r.pasa = r.ok && r.ms >= 4900 && r.ms <= 6500;
    await p.close();
    return r;
  },
  // MLL1111C · La llamada conecta mientras WebRTC aún está subiendo (ICE lento, 5 s): el vídeo arranca por el enlace de datos
  // y debe SUBIR a WebRTC pocos segundos después de que conecte (prueba 35, D).
  async "video-sube"() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      // Al contestar aún no hay ruta IP (WebRTC subiendo); a los 3 s aparece, como en la prueba 35 (19:01: «webrtc:caido» y
      // WebRTC conectado medio segundo después).
      b.red.ip = false;
      b.red.ipVista.A = b.red.ipVista.B = false;
      window.__ll = await b.llamada({ conDatos: true, video: true, videoFalso: true });
      await new Promise((r) => setTimeout(r, 3000));
      b.red.ipVista.A = b.red.ipVista.B = true;
      b.cambiarRedIp(true);
      await new Promise((r) => setTimeout(r, 22000));
      const L = b.lineas;
      const web = L.find((l) => l.hito === "carril" && l.neurona === "B" && /flujo=voz .*a=webrtc|flujo=voz de=- a=webrtc/.test(l.detalle)) ?? L.find((l) => l.hito === "medio=webrtc" && l.t > 3000);
      const primera = L.find((l) => l.hito === "carril" && /flujo=video de=- a=ble/.test(l.detalle));
      const sube = L.find((l) => l.hito === "carril" && /flujo=video de=ble\S* a=webrtc/.test(l.detalle));
      return {
        primeraPorDatos: !!primera,
        webrtcConectaMs: web?.t ?? null,
        videoSubeMs: sube?.t ?? null,
        subeTrasConectarMs: web && sube ? sube.t - web.t : null,
        carriles: window.__ll.A.carriles?.() ?? null,
        lineasVideo: L.filter((l) => l.hito === "carril" && /flujo=video/.test(l.detalle)).map((l) => `${l.t}ms ${l.neurona} ${l.detalle.replace(/ muestras=.*/, "")}`),
      };
    });
    r.pasa = r.subeTrasConectarMs !== null && r.subeTrasConectarMs <= 5000;
    await p.close();
    return r;
  },
  // MLL1111C · Petición 8: Wi-Fi directo y red del router a la vez (simulados, con su medida). Los datos toman el que más
  // mide, cambian si el otro pasa a medir mucho más y no se mueven por diferencias pequeñas (histéresis).
  async "wifi-directo"() {
    const p = await pagina();
    const r = await p.evaluate(async () => {
      const b = window.banco;
      b.red.ip = true;
      b.extras.lan = { kbps: 40000, rtt: 6 };
      b.extras.directo = { kbps: 200000, rtt: 2 };
      window.__ll = await b.llamada({ conDatos: true });
      const datos = () => (window.__ll.A.carriles?.() ?? [])[0]?.texto ?? null;
      await new Promise((r) => setTimeout(r, 6000));
      const fase1 = datos();
      // El directo se degrada: el router mide más del doble → cambia.
      b.extras.directo = { kbps: 15000, rtt: 20 };
      await new Promise((r) => setTimeout(r, 6000));
      const fase2 = datos();
      // El directo vuelve a medir un poco más que el router (+12 %): dentro del margen, no se mueve.
      b.extras.directo = { kbps: 45000, rtt: 6 };
      await new Promise((r) => setTimeout(r, 15000));
      const fase3 = datos();
      const cambios = b.lineas.filter((l) => l.hito === "carril" && /flujo=datos/.test(l.detalle)).map((l) => `${l.t}ms ${l.neurona} ${l.detalle.replace(/ muestras=.*/, "")}`);
      return { fase1, fase2, fase3, cambios };
    });
    r.pasa = /Datos: Wi-Fi directo/.test(r.fase1 ?? "") && /Datos: red local/.test(r.fase2 ?? "") && /Datos: red local/.test(r.fase3 ?? "");
    await p.close();
    return r;
  },
  // (LLA1111B) Voz y vídeo a la vez por un enlace como el Bluetooth (ver `enlaceBle` en entrada.ts).
  // Plazo de la voz (tránsito desde que se codifica la 1.ª trama del paquete hasta que llega): 250 ms con 160 kb/s
  // (60 ms de paquete + una escritura en vuelo + la suya; con el búfer de fluctuación queda < 400 ms de boca a oído).
  "ble-160": () => casoBle("ble-160", [{ t: 0, kbps: 160 }], { plazo: 250 }),
  // En enlaces más estrechos la voz sola ya tarda más (parada y espera): 300 ms con 80 kb/s y 400 ms con 40 kb/s.
  "ble-80": () => casoBle("ble-80", [{ t: 0, kbps: 80 }], { plazo: 300 }),
  "ble-40": () => casoBle("ble-40", [{ t: 0, kbps: 40 }], { plazo: 400 }),
  // 160 → 40 → 160 a mitad de llamada (lo anunciado sigue en 160: el Bluetooth no vuelve a medir).
  "ble-caida": () => casoBle("ble-caida", [{ t: 0, kbps: 160 }, { t: 0.35, kbps: 40 }, { t: 0.65, kbps: 160 }], { plazo: 400 }),
  // Micro de A silenciado y abierto cada 6 s: el vídeo no debe cambiar.
  "ble-micro": () => casoBle("ble-micro", [{ t: 0, kbps: 160 }], { microCadaS: 6, plazo: 250 }),
  // (LLA1111Q) Carril CALIBRADO con el registro de la prueba 37 (`bleReal` en entrada.ts: acuse variable, cubeta de
  // escrituras del motor, cifrado, señalización y espejo en el mismo enlace). Micros abiertos y cámaras encendidas.
  "ble-real": () => casoBle("ble-real", [{ t: 0, kbps: 160 }], { plazo: 400, real: true }),
  // (LLA1111Q) Igual, con los dos micros en silencio: el vídeo no puede depender de que alguien hable.
  "ble-real-mudo": () => casoBle("ble-real-mudo", [{ t: 0, kbps: 160 }], { plazo: 400, real: true, mudos: true }),
  // LLA1112A · (A) el carril calibrado con el lado B como la tableta de la prueba 39: escribe más despacio y a ráfagas
  // (paradas en las que ni escribe ni entrega lo que le llega). Micros abiertos y cámaras encendidas.
  "ble-tableta": () => casoBle("ble-tableta", [{ t: 0, kbps: 160 }], { plazo: 400, real: true, tableta: true }),
  // LLA1113C · la tableta de la prueba 41 (acuse 70 + Exp(45) ms y la web SIN la medida nativa, como en el aparato: ver
  // `LADO_TABLETA_41` en entrada.ts). En el aparato su vídeo se pausó por «suelo» y no volvió en 120 s con la voz sola en
  // el carril (`cabe=21–63 enlace=160k+84…154ms/139`). Pasa con lo de `ble-tableta` y, además, el vídeo de B (pintado en A)
  // ≥ 1 fps en el 25 % de las ventanas desde los 20 s, ninguna pausa de B de más de 60 s y la voz no peor (ver `juzgarTableta41`).
  "ble-tableta-41": () => casoBle("ble-tableta-41", [{ t: 0, kbps: 160 }], { plazo: 400, real: true, tableta: 41 }),
  // LLA1113A · `ble-real` con los temporizadores de la página LENTOS (alineados a 1 s, como WebKit con la ventana de la Mac
  // oculta o tapada) en dos tramos de 30 s, como en las dos llamadas limpias de la prueba 40 (10–35 s seguidos). Pasa con lo de
  // `ble-real` y además: ninguna pausa del vídeo y la voz nunca al escalón 5, con el carril a 160 kb/s todo el rato.
  "ble-lento": () => casoBle("ble-lento", [{ t: 0, kbps: 160 }], { plazo: 400, real: true, lento: [[15, 45], [70, 100]] }),
  // (VOZ1111J) Solo voz, los dos micros abiertos (Opus real), por un carril como el Bluetooth cada vez más estrecho.
  // `-cif`: con el cifrado del enlace (CIF1108A) en el aire, como entre la Mac y la tableta (ver `bytesAire`).
  "voz-40": () => casoVoz("voz-40", [{ t: 0, kbps: 40 }]),
  "voz-24": () => casoVoz("voz-24", [{ t: 0, kbps: 24 }]),
  "voz-16": () => casoVoz("voz-16", [{ t: 0, kbps: 16 }]),
  "voz-caida": () => casoVoz("voz-caida", [{ t: 0, kbps: 160 }, { t: 0.33, kbps: 24 }, { t: 0.66, kbps: 160 }]),
  // Por debajo del suelo: 160 → 8 → 160. Aviso claro en vez de fragmentos, y vuelve solo.
  "voz-suelo": () => casoVoz("voz-suelo", [{ t: 0, kbps: 160 }, { t: 0.33, kbps: 8 }, { t: 0.66, kbps: 160 }]),
  "voz-40-cif": () => casoVoz("voz-40-cif", [{ t: 0, kbps: 40 }], { cifrado: true }),
  "voz-24-cif": () => casoVoz("voz-24-cif", [{ t: 0, kbps: 24 }], { cifrado: true }),
  "voz-16-cif": () => casoVoz("voz-16-cif", [{ t: 0, kbps: 16 }], { cifrado: true }),
  // Voz y vídeo a la vez: la reserva de la voz sigue a lo que la voz usa (el vídeo gana lo que la voz libera).
  "vozvideo-80": () => casoVoz("vozvideo-80", [{ t: 0, kbps: 80 }], { video: true }),
  "vozvideo-40": () => casoVoz("vozvideo-40", [{ t: 0, kbps: 40 }], { video: true }),
};

/**
 * (VOZ1111J) Umbrales de la voz sola: pérdida < 2 % en cada sentido, ningún hueco audible (≥ 60 ms sin nada o con la
 * ocultación apagándose) tras el arranque salvo 1 por minuto como mucho y ninguno > 200 ms, y boca-oído p95 acotado.
 * Por debajo del suelo (`voz-suelo`): aviso en ≤ 8 s en los dos lados, que se va en ≤ 12 s cuando vuelve la capacidad.
 */
const UMBRAL_VOZ = { perdidaPct: 2, huecosPorMin: 1, huecoMaxMs: 200, bocaOidoP95Ms: 900, avisoS: 8, vuelveS: 12 };

async function casoVoz(nombre, tramos, extra = {}) {
  const dur = Math.min(segundos, 600);
  const p = await pagina();
  await p.evaluate(async ([k0, video, cifrado]) => {
    const b = window.banco;
    b.ble.plazoVozMs = 400;
    b.ble.cifrado = cifrado;
    b.red.ip = false;
    b.red.ipVista.A = b.red.ipVista.B = false;
    b.ble.kbps = k0;
    b.ble.anunciadoKbps = 160;
    window.__ll = await b.llamada({ conDatos: true, video, ble: true, videoDatos: video, opus: true });
  }, [tramos[0].kbps, !!extra.video, !!extra.cifrado]);
  await espera(15_000);
  const t0 = await p.evaluate(() => {
    window.banco.reiniciarMedida();
    window.__textos = [];
    return performance.now();
  });
  const inicio = Date.now();
  let k = 1;
  const tramosMs = [];
  const tramoVoz = [];
  let medidaPrev = null;
  while (Date.now() - inicio < dur * 1000) {
    const trans = (Date.now() - inicio) / (dur * 1000);
    if (k < tramos.length && trans >= tramos[k].t) {
      const ahora = await p.evaluate((kb) => {
        window.banco.ble.kbps = kb;
        return performance.now();
      }, tramos[k].kbps);
      tramosMs.push({ kbps: tramos[k].kbps, en: ahora });
      // Voz del tramo que acaba (las medidas de voz son acumuladas: se guardan y se restan).
      const v = await p.evaluate(() => window.banco.resumenVoz());
      tramoVoz.push({ hasta: Math.round(ahora), voz: v, antes: medidaPrev });
      medidaPrev = v;
      k++;
    }
    await p.evaluate(() => {
      const t = performance.now();
      const m = (x) => ({ voz: x.estado().medio?.calidadTexto ?? null, nivel: x.estado().medio?.nivel ?? null, video: x.estado().videoDatos?.calidadTexto ?? null, fase: x.estado().fase ?? null });
      window.__textos.push({ t, A: m(window.__ll.A), B: m(window.__ll.B) });
    });
    await espera(1000);
  }
  const t1 = await p.evaluate(() => performance.now());
  const r = await p.evaluate(
    ({ t0, t1, tramosMs }) => {
      const b = window.banco;
      const out = { voz: b.resumenVoz(), oido: b.resumenOido(t0, t1), video: b.resumenTramo(t0, t1) };
      const cortes = [t0, ...tramosMs.map((x) => x.en), t1];
      out.tramos = cortes.slice(0, -1).map((d, i) => ({ desde: Math.round((d - t0) / 1000), hasta: Math.round((cortes[i + 1] - t0) / 1000), oido: b.resumenOido(d, cortes[i + 1]), video: b.resumenTramo(d, cortes[i + 1]) }));
      // Tras cada cambio de capacidad, 6 s de recolocación (se miden aparte: el transitorio no se esconde, se separa).
      out.asentados = cortes.slice(0, -1).map((d, i) => {
        const desde = i === 0 ? d : d + 6000;
        return { desde: Math.round((desde - t0) / 1000), hasta: Math.round((cortes[i + 1] - t0) / 1000), oido: b.resumenOido(desde, cortes[i + 1]) };
      });
      out.transitorios = cortes.slice(1, -1).map((d) => ({ en: Math.round((d - t0) / 1000), oido: b.resumenOido(d, d + 6000) }));
      const txt = window.__textos;
      const cambios = [];
      let prev = { A: {}, B: {} };
      for (const m of txt) {
        for (const q of ["A", "B"]) {
          const a = `${m[q].fase} | ${m[q].voz} | ${m[q].video}`;
          if (a !== `${prev[q].fase} | ${prev[q].voz} | ${prev[q].video}`) cambios.push(`${Math.round((m.t - t0) / 1000)}s ${q}: ${a}`);
        }
        prev = m;
      }
      out.textos = cambios.slice(0, 60);
      out.fases = txt.filter((_, i) => i % 10 === 0 || i === txt.length - 1).map((m) => ({ s: Math.round((m.t - t0) / 1000), A: m.A.fase, B: m.B.fase }));
      out.avisoEn = txt.filter((m) => /no alcanza para la voz/i.test(`${m.A.voz} ${m.B.voz}`)).map((m) => ({ s: Math.round((m.t - t0) / 1000), A: /no alcanza/i.test(m.A.voz ?? ""), B: /no alcanza/i.test(m.B.voz ?? "") }));
      out.registro = b.lineas.filter((l) => /voz-datos (tx |rx |nivel|bajo-suelo|sobre-suelo|formato)|video-datos (reparto|pausa|sigue)/.test(l.detalle)).slice(-30).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona ?? "-"} ${l.detalle}`);
      return out;
    },
    { t0, t1, tramosMs },
  );
  r.tramoVoz = tramoVoz;
  await p.close();
  r.veredicto = juzgarVoz(nombre, r, tramosMs.map((x) => Math.round((x.en - t0) / 1000)));
  return r;
}

function juzgarVoz(nombre, r, cambiosS) {
  const fallos = [];
  const suelo = nombre === "voz-suelo";
  // La llamada sigue en curso en los dos al acabar (el código de antes colgaba solo con el carril estrecho: «sin audio»).
  const ult = r.fases?.[r.fases.length - 1];
  for (const q of ["A", "B"]) if (ult && ult[q] !== "en-curso") fallos.push(`la llamada acabó en ${q}: ${ult[q]}`);
  for (const k of ["AB", "BA"]) {
    const v = r.voz[k];
    if (!suelo && (v.perdidaPct === null || v.perdidaPct > UMBRAL_VOZ.perdidaPct)) fallos.push(`voz ${k} pérdida ${v.perdidaPct}% > ${UMBRAL_VOZ.perdidaPct}%`);
  }
  // Lo que se oye: en los tramos asentados (todos, salvo el estrecho de voz-suelo; tras cada cambio, desde los 6 s). Los 6 s
  // de recolocación tienen su propio tope: ningún hueco de más de 1 s.
  const tramos = suelo ? [r.asentados[0], r.asentados[2]] : r.asentados;
  for (const t of r.transitorios ?? []) {
    if (suelo) continue;
    for (const q of ["A", "B"]) if (t.oido[q].huecoMaxMs > 1000) fallos.push(`recolocación a los ${t.en}s en ${q}: hueco de ${t.oido[q].huecoMaxMs} ms`);
  }
  for (const t of tramos) {
    if (!t) continue;
    for (const q of ["A", "B"]) {
      const o = t.oido[q];
      if (o.huecosPorMin > UMBRAL_VOZ.huecosPorMin) fallos.push(`tramo ${t.desde}-${t.hasta}s en ${q}: ${o.huecos} huecos (${o.huecosPorMin}/min)`);
      if (o.huecoMaxMs > UMBRAL_VOZ.huecoMaxMs) fallos.push(`tramo ${t.desde}-${t.hasta}s en ${q}: hueco de ${o.huecoMaxMs} ms`);
    }
  }
  for (const q of ["A", "B"]) {
    const o = r.oido[q];
    if (!suelo && (o.bocaOidoP95 === null || o.bocaOidoP95 > UMBRAL_VOZ.bocaOidoP95Ms)) fallos.push(`boca-oído p95 en ${q} ${o.bocaOidoP95} ms > ${UMBRAL_VOZ.bocaOidoP95Ms}`);
  }
  if (suelo) {
    const [baja, sube] = cambiosS;
    for (const q of ["A", "B"]) {
      const a = r.avisoEn.filter((x) => x[q] && x.s >= baja && x.s < sube);
      if (!a.length || a[0].s - baja > UMBRAL_VOZ.avisoS) fallos.push(`sin aviso en ${q} en ${UMBRAL_VOZ.avisoS} s bajo el suelo`);
      if (r.avisoEn.some((x) => x[q] && x.s >= sube + UMBRAL_VOZ.vuelveS)) fallos.push(`sigue el aviso en ${q} al volver la capacidad`);
    }
  }
  return { pasa: fallos.length === 0, fallos };
}

// MLL1111C · Corte de la IP a media llamada con las dos vías abiertas: ¿cuánto tarda la voz en volver a sonar en los dos?
async function pasoIp({ modo, senal }) {
  const p = await pagina();
  const r = await p.evaluate(
    async ({ modo, senal }) => {
      const b = window.banco;
      b.red.ip = true;
      b.red.ipVista.A = b.red.ipVista.B = true;
      const ll = await b.llamada({ conDatos: true });
      window.__ll = ll;
      const hasta = async (f, ms) => {
        const fin = performance.now() + ms;
        while (!f() && performance.now() < fin) await new Promise((r) => setTimeout(r, 25));
        return f();
      };
      const vozWeb = () => ["A", "B"].every((q) => (window.__ll[q].carriles?.() ?? [])[0]?.voz === "webrtc");
      const listo = await hasta(vozWeb, 15000);
      await new Promise((r) => setTimeout(r, 3000));
      const antes = { ...b.audio.reproducidas };
      const t0 = performance.now();
      b.red.modoCorte = modo;
      if (senal) b.red.ipVista.A = b.red.ipVista.B = false;
      b.cambiarRedIp(false, { senal });
      const suena = await hasta(() => b.audio.reproducidas.A >= antes.A + 5 && b.audio.reproducidas.B >= antes.B + 5, 20000);
      const ms = Math.round(performance.now() - t0);
      return {
        vozWebAntes: listo,
        vozSuenaTrasCorteMs: suena ? ms : null,
        lineas: b.lineas.filter((l) => l.t >= Math.round(t0 - 0) - 2000 && (l.hito === "carril" || /voz-datos iniciada/.test(l.detalle))).map((l) => `${l.t}ms ${l.neurona} ${l.hito} ${l.detalle.replace(/ muestras=.*/, "")}`).slice(0, 16),
      };
    },
    { modo, senal },
  );
  r.pasa = r.vozSuenaTrasCorteMs !== null && r.vozSuenaTrasCorteMs <= 2000;
  await p.close();
  return r;
}


/** Umbrales: lo que una persona aceptaría. */
// La voz Opus de 24 kb/s ocupa ≈ 48 kb/s de texto en el carril: con 40 kb/s NO cabe ni sola (pierde ≈ 19 % sin vídeo,
// medido con el árbol viejo, donde el vídeo no salía). En `ble-40` y en el tramo estrecho de `ble-caida` se exige que el
// vídeo no le quite nada: aviso de pausa a tiempo, ninguna espera tras vídeo de más de una ventana a 40 kb/s (250 ms)
// y la voz no peor que sola (`vozSolaPerdidaPct`). `tardeVozPct`: tránsito por encima del plazo del caso.
const UMBRAL = { fpsMin: 3, ventanasOk: 0.8, perdidaVozPct: 2, tardeVozPct: 3, esperaTrasVideoMs: 150, esperaTrasVideoEstrechoMs: 250, reanudarS: 20, pausaS: 15, vozSolaPerdidaPct: { "ble-40": 18.7 + 1, "ble-caida": 5.4 + 1 } };
// LLA1111Q: en el carril calibrado la espera tras vídeo se mide a la serialización media del aire con cifrado (ver
// `enlaceBle`): dos ventanas (2 × 2304 B en claro) son ≈ 118 ms, por debajo del mismo tope de 150 ms.
const vozNoCabe = (nombre) => nombre === "ble-40" || nombre === "ble-caida";

async function casoBle(nombre, tramos, extra = {}) {
  const dur = Math.min(segundos, 600);
  const p = await pagina();
  await p.evaluate(async ([k0, plazo, real, tableta]) => {
    const b = window.banco;
    b.bleReal.activo = real;
    b.bleReal.ladoB = tableta === 41 ? b.ladoTableta41 : tableta ? b.ladoTableta39 : null; // LLA1112A · LLA1113C
    b.bleReal.sinNativo = tableta === 41; // LLA1113C: en el aparato la web no recibe la medida nativa
    b.ble.plazoVozMs = plazo;
    b.red.ip = false;
    b.red.ipVista.A = b.red.ipVista.B = false;
    b.ble.kbps = k0;
    b.ble.anunciadoKbps = 160;
    window.__ll = await b.llamada({ conDatos: true, video: true, ble: true, videoDatos: true, opus: true });
  }, [tramos[0].kbps, extra.plazo ?? 200, !!extra.real, extra.tableta === 41 ? 41 : !!extra.tableta]);
  // Arranque: voz por datos, saludo del vídeo y primer clave.
  await espera(15_000);
  if (extra.mudos) await p.evaluate(async () => { await window.__ll.A.alternarMicro(); await window.__ll.B.alternarMicro(); });
  const t0 = await p.evaluate(() => {
    window.banco.reiniciarMedida();
    window.__textos = [];
    return performance.now();
  });
  const marcas = [];
  const inicio = Date.now();
  let k = 1;
  let ultimoMicro = 0;
  let mudo = false;
  let lentoOn = false;
  const lentoMarcas = [];
  const tramosMs = [];
  while (Date.now() - inicio < dur * 1000) {
    const trans = (Date.now() - inicio) / (dur * 1000);
    if (k < tramos.length && trans >= tramos[k].t) {
      const ahora = await p.evaluate((kb) => {
        window.banco.ble.kbps = kb;
        return performance.now();
      }, tramos[k].kbps);
      tramosMs.push({ kbps: tramos[k].kbps, en: ahora });
      k++;
    }
    // LLA1113A: tramos con los temporizadores de la página lentos (s desde el inicio de la medida).
    if (extra.lento) {
      const s = (Date.now() - inicio) / 1000;
      const on = extra.lento.some(([a, b]) => s >= a && s < b);
      if (on !== lentoOn) {
        lentoOn = on;
        const en = await p.evaluate((v) => {
          window.banco.lentos.activo = v;
          return performance.now();
        }, on);
        lentoMarcas.push({ on, en });
      }
    }
    if (extra.microCadaS && Date.now() - ultimoMicro >= extra.microCadaS * 1000) {
      ultimoMicro = Date.now();
      mudo = !mudo;
      const en = await p.evaluate(async () => {
        await window.__ll.A.alternarMicro();
        return performance.now();
      });
      marcas.push({ mudo, en });
    }
    const m = await p.evaluate(() => {
      const t = performance.now();
      const vd = (x) => x.estado().videoDatos ?? null;
      const a = vd(window.__ll.A);
      const b2 = vd(window.__ll.B);
      return { t, A: a?.calidadTexto ?? null, B: b2?.calidadTexto ?? null };
    });
    await p.evaluate((m) => window.__textos.push(m), m);
    await espera(1000);
  }
  const t1 = await p.evaluate(() => performance.now());
  const r = await p.evaluate(
    ({ t0, t1, tramosMs, marcas }) => {
      const b = window.banco;
      const out = { total: b.resumenTramo(t0, t1), voz: b.resumenVoz(), oido: b.resumenOido(t0, t1), t0: Math.round(t0) };
      // LLA1111Q: lo que hizo el carril calibrado (escrituras, espera por fichas, acuses, lo que midió la app nativa).
      const mr = b.medidaReal;
      const pct = (l, q) => { const s = [...l].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
      out.carril = b.bleReal.activo ? [0, 1].map((i) => ({ escrituras: mr.escrituras[i], escriturasPorS: Math.round((mr.escrituras[i] / ((t1 - t0) / 1000)) * 10) / 10, esperaFichaMs: Math.round(mr.esperaFichaMs[i]), acuseP50: pct(mr.acuses[i], 0.5), acuseP95: pct(mr.acuses[i], 0.95), kbpsNativo: mr.kbpsNativo[i] })) : null;
      // Escalón de la voz y del vídeo en el último minuto (de las líneas periódicas).
      out.niveles = b.lineas.filter((l) => /voz-datos tx n=/.test(l.detalle)).slice(-12).map((l) => `${l.neurona} ${l.detalle.slice(0, 160)}`);
      // LLA1112A: lo que cada lado reproduce (audio inventado por ventana, tardías) y las paradas del lado B.
      out.rx = b.lineas.filter((l) => l.t >= t0 && /voz-datos rx paq=/.test(l.detalle)).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona} ${l.detalle}`);
      out.txOtro = b.lineas.filter((l) => l.t >= t0 && /voz-datos tx n=/.test(l.detalle)).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona} ${l.detalle.replace(/ enlace=.*/, "")}`);
      out.paradasB = { ...b.paradaB };
      // LLA1113A: pausas del vídeo y la voz al escalón 5 (6 kb/s) durante la medida, con su línea (lo del aparato en la prueba 40).
      out.pausas = b.lineas.filter((l) => l.t >= t0 && /video-datos pausa motivo=/.test(l.detalle)).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona} ${l.detalle.slice(0, 150)}`);
      // LLA1113C: pausas y vueltas del vídeo de B (sus líneas van con neurona «A»), desde el arranque (t negativo: antes de medir).
      out.pausasB = b.lineas.filter((l) => l.neurona === "A" && /video-datos (pausa|sigue) motivo=/.test(l.detalle)).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona} ${l.detalle.slice(0, 190)}`);
      out.duracionS = Math.round((t1 - t0) / 1000);
      out.vozAl5 = b.lineas.filter((l) => l.t >= t0 && /voz-datos nivel \d→5 /.test(l.detalle)).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona} ${l.detalle.slice(0, 150)}`);
      out.reloj = b.lineas.filter((l) => /reloj /.test(l.detalle)).slice(0, 12).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona ?? "-"} ${l.detalle.slice(0, 150)}`);
      // Por tramos de capacidad (para la caída) y por estado del micro.
      const cortes = [t0, ...tramosMs.map((x) => x.en), t1];
      out.tramos = cortes.slice(0, -1).map((d, i) => ({ desde: Math.round(d - t0), hasta: Math.round(cortes[i + 1] - t0), ...b.resumenTramo(d, cortes[i + 1]) }));
      if (marcas.length) {
        const conMicro = [];
        const sinMicro = [];
        const cm = [t0, ...marcas.map((m) => m.en), t1];
        cm.slice(0, -1).forEach((d, i) => {
          const r2 = b.resumenTramo(d, cm[i + 1]);
          // Antes de la primera marca el micro está abierto; cada marca alterna.
          (i % 2 === 0 ? conMicro : sinMicro).push(r2.enB.fps);
        });
        out.micro = { fpsEnBConMicro: conMicro, fpsEnBSinMicro: sinMicro };
      }
      const txt = window.__textos;
      const cambios = [];
      let prev = {};
      for (const m of txt) {
        for (const q of ["A", "B"]) {
          if (m[q] !== prev[q]) cambios.push(`${Math.round((m.t - t0) / 1000)}s ${q}: ${m[q]}`);
        }
        prev = m;
      }
      out.textos = cambios.slice(0, 40);
      out.pausaEn = txt.filter((m) => /pausa/i.test(`${m.A} ${m.B}`)).map((m) => Math.round((m.t - t0) / 1000));
      out.registro = b.lineas.filter((l) => /video-datos (tx|reparto|pausa|sigue)|voz-datos (plan|reparto|tx n=|nivel)/.test(l.detalle)).slice(-80).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona ?? "-"} ${l.detalle}`);
      return out;
    },
    { t0, t1, tramosMs, marcas },
  );
  r.lento = lentoMarcas.map((m) => `${Math.round((m.en - t0) / 1000)}s ${m.on ? "lentos" : "normales"}`);
  await p.evaluate(() => {
    window.banco.lentos.activo = false;
    window.banco.pararReal();
  });
  await p.close();
  r.veredicto = juzgar(nombre, r, tramosMs.length ? tramosMs.map((x) => Math.round((x.en - t0) / 1000)) : []);
  return r;
}

/**
 * LLA1112A · Voz limpia en `ble-tableta`, de lo que cada motor dice que reproduce (las líneas `voz-datos rx` cada 5 s y el
 * informe del otro en `voz-datos tx … otro:perd=…/tarde=…`), pasado el arranque (desde los 20 s de medida):
 *  · audio inventado ≤ 5 % en cada ventana de 5 s: una trama oculta suelta (con fundido) no se oye; en el aparato la peor
 *    ventana fue 67 %;
 *  · tardías ≤ 3 % de lo recibido en el total y lo que informa el otro ≤ 5 % (`TARDE_RX_ALTA` de `niveles.ts`: por encima, el
 *    otro baja su voz).
 */
const UMBRAL_TABLETA = { inventadoPct: 5, tardiasPct: 3, tardeOtroPct: 5, desdeS: 20 };
function juzgarTableta(r, fallos) {
  for (const l of r.rx ?? []) {
    const m = /^(\d+)s (\S+) .*inventado=(\d+)%/.exec(l);
    if (m && Number(m[1]) >= UMBRAL_TABLETA.desdeS && Number(m[3]) > UMBRAL_TABLETA.inventadoPct) fallos.push(`voz en ${m[2]} a los ${m[1]} s: inventado ${m[3]}% > ${UMBRAL_TABLETA.inventadoPct}%`);
  }
  for (const l of r.txOtro ?? []) {
    const m = /^(\d+)s (\S+) .*otro:perd=([\d.]+)%\/tarde=([\d.]+)%/.exec(l);
    if (m && Number(m[1]) >= UMBRAL_TABLETA.desdeS && Number(m[4]) > UMBRAL_TABLETA.tardeOtroPct) fallos.push(`la voz de ${m[2]} llega tarde al otro a los ${m[1]} s: ${m[4]}% > ${UMBRAL_TABLETA.tardeOtroPct}%`);
  }
  // Tardías acumuladas en la última línea rx de cada lado, frente a los paquetes × tramas por paquete no se sabe: se usa
  // el informe (arriba) y el oído (huecos); aquí solo se deja constancia.
}

/** LLA1113C: los dos escenarios de la tableta (39 y 41) se juzgan igual en la voz. */
const esTableta = (n) => n === "ble-tableta" || n === "ble-tableta-41";

/**
 * LLA1113C · Cómo se juzga `ble-tableta-41` (solo con esto: los umbrales de voz de `ble-tableta` no pasan en la Mac ni con
 * el vídeo de B en pausa toda la llamada, ver el LEEME). En este carril la voz SOLA de la tableta ya cae a Opus 6 kb/s a ratos
 * («atasco-rapido espera≈500ms» con el vídeo en pausa, como la tableta a las 18:53:59): el vídeo solo puede salir a ratos.
 * Lo que falló en el aparato y aquí se exige:
 *  · el vídeo de la tableta (B, pintado en A) vuelve: ninguna pausa de B de más de `PAUSA_MAX_S` (en el aparato, 120 s
 *    seguidos con la voz sola y «cabe=21–63») y ≥ 1 fps de verdad (pintado en A) en al menos `VENTANAS_MIN` ventana de 5 s (en el aparato, ninguna)
 *    desde los 20 s. La fracción de ventanas con vídeo se deja en `fraccionVideoB` (dato, no umbral: en este carril depende
 *    de cuánto se atasca la voz sola);
 *  · la voz no peor que con el vídeo de B en pausa toda la llamada (el árbol de antes, medido: A oye a B con 14,9 huecos/min,
 *    el mayor de 1159 ms): `HUECOS_MIN_MAX` huecos/min y ninguno de más de `HUECO_MAX_MS` en cada lado.
 */
const UMBRAL_T41 = { PAUSA_MAX_S: 60, VENTANAS_MIN: 1, HUECOS_MIN_MAX: 18, HUECO_MAX_MS: 1500 };
function juzgarTableta41(r, fallos) {
  const v = (r.total?.enA?.ventanas5s ?? []).slice(4);
  const ok = v.filter((f) => f >= 1).length;
  r.fraccionVideoB = v.length ? Math.round((ok / v.length) * 100) / 100 : 0;
  if (ok < UMBRAL_T41.VENTANAS_MIN) fallos.push(`vídeo de la tableta (en A) ≥ 1 fps solo en ${ok}/${v.length} ventanas desde los 20 s: ${JSON.stringify(v)}`);
  const ev = (r.pausasB ?? []).map((l) => /^(-?\d+)s (\S+) video-datos (pausa|sigue)/.exec(l)).filter(Boolean);
  let desde = null;
  for (const m of ev) {
    const t = Number(m[1]);
    if (m[3] === "pausa" && desde === null) desde = t;
    if (m[3] === "sigue" && desde !== null) {
      if (t - Math.max(0, desde) > UMBRAL_T41.PAUSA_MAX_S) fallos.push(`vídeo de la tableta en pausa ${t - Math.max(0, desde)} s (desde ${desde} s)`);
      desde = null;
    }
  }
  if (desde !== null && r.duracionS - Math.max(0, desde) > UMBRAL_T41.PAUSA_MAX_S) fallos.push(`vídeo de la tableta en pausa desde ${desde} s y no volvió (hasta ${r.duracionS} s)`);
  for (const q of ["A", "B"]) {
    const o = r.oido?.[q];
    if (!o || o.huecosPorMin > UMBRAL_T41.HUECOS_MIN_MAX || o.huecoMaxMs > UMBRAL_T41.HUECO_MAX_MS) fallos.push(`voz en ${q}: ${o?.huecos} huecos (${o?.huecosPorMin}/min), el mayor ${o?.huecoMaxMs} ms`);
  }
}

function juzgar(nombre, r, cambiosS) {
  const fallos = [];
  if (nombre === "ble-tableta-41") {
    juzgarTableta41(r, fallos); // LLA1113C: solo lo suyo (ver arriba)
    return { pasa: fallos.length === 0, fallos };
  }
  for (const k of ["AB", "BA"]) {
    const v = r.voz[k];
    if (vozNoCabe(nombre)) {
      const tope = UMBRAL.vozSolaPerdidaPct[nombre];
      if (v.perdidaPct === null || v.perdidaPct > tope) fallos.push(`voz ${k} pérdida ${v.perdidaPct}% > ${tope}% (la de la voz sola)`);
      if (v.esperaTrasVideoMaxMs > UMBRAL.esperaTrasVideoEstrechoMs) fallos.push(`voz ${k} esperó ${v.esperaTrasVideoMaxMs} ms tras un vídeo`);
      continue;
    }
    if (v.perdidaPct === null || v.perdidaPct > UMBRAL.perdidaVozPct) fallos.push(`voz ${k} pérdida ${v.perdidaPct}% > ${UMBRAL.perdidaVozPct}%`);
    // LLA1112A: en `ble-tableta` el tránsito pasa del plazo por las paradas del aparato (física, no el control): cuenta lo que
    // se REPRODUCE (audio inventado y tardías que informa cada lado), juzgado abajo.
    if (!esTableta(nombre) && (v.tardePct === null || v.tardePct > UMBRAL.tardeVozPct)) fallos.push(`voz ${k} tarde ${v.tardePct}% > ${UMBRAL.tardeVozPct}%`);
    // LLA1112A: el carril de la tableta serializa a 20–45 B/ms (la mitad que la Mac): dos ventanas de vídeo delante son ≈ 190 ms;
    // se le aplica el tope del carril estrecho (250 ms).
    const topeEspera = esTableta(nombre) ? UMBRAL.esperaTrasVideoEstrechoMs : UMBRAL.esperaTrasVideoMs;
    if (v.esperaTrasVideoMaxMs > topeEspera) fallos.push(`voz ${k} esperó ${v.esperaTrasVideoMaxMs} ms tras un vídeo`);
  }
  const fluye = (lado) => lado.ventanas5s.length > 0 && lado.ventanas5s.filter((f) => f >= UMBRAL.fpsMin).length / lado.ventanas5s.length >= UMBRAL.ventanasOk;
  if (esTableta(nombre)) juzgarTableta(r, fallos);
  if (nombre === "ble-lento") {
    // LLA1113A: con el carril a 160 kb/s, ni pausa por «suelo»/«prueba-fallida» ni la voz a 6 kb/s por unos temporizadores lentos.
    for (const l of r.pausas ?? []) fallos.push(`pausa del vídeo: ${l}`);
    for (const l of r.vozAl5 ?? []) fallos.push(`voz al escalón 5: ${l}`);
  }
  if (nombre === "ble-real" || nombre === "ble-real-mudo" || esTableta(nombre) || nombre === "ble-lento") {
    // LLA1111Q: los dos sentidos ≥ 3 fps sostenidos y, con micros abiertos, la voz sin huecos audibles y en un escalón bueno.
    if (!fluye(r.total.enA)) fallos.push(`vídeo en A: ${r.total.enA.fps} fps, ventanas ${JSON.stringify(r.total.enA.ventanas5s)}`);
    if (!fluye(r.total.enB)) fallos.push(`vídeo en B: ${r.total.enB.fps} fps, ventanas ${JSON.stringify(r.total.enB.ventanas5s)}`);
    if (nombre === "ble-real" || esTableta(nombre) || nombre === "ble-lento") {
      for (const q of ["A", "B"]) {
        const o = r.oido?.[q];
        if (!o || o.huecosPorMin > 1 || o.huecoMaxMs > 200) fallos.push(`voz en ${q}: ${o?.huecos} huecos (${o?.huecosPorMin}/min), el mayor ${o?.huecoMaxMs} ms`);
      }
      // Escalón de la voz al final: Opus de 12 kb/s o más (n ≤ 2) en las últimas líneas de los dos lados.
      const ult = {};
      for (const l of r.niveles ?? []) {
        const m = /^(\S+) voz-datos tx n=(\d+)/.exec(l);
        if (m) ult[m[1]] = Number(m[2]);
      }
      for (const [q, n] of Object.entries(ult)) if (n > 2) fallos.push(`voz de ${q} en el escalón ${n} al acabar (Opus < 12 kb/s)`);
    }
  }
  if (nombre === "ble-160" || nombre === "ble-micro") {
    if (!fluye(r.total.enA)) fallos.push(`vídeo en A: ${r.total.enA.fps} fps, ventanas ${JSON.stringify(r.total.enA.ventanas5s)}`);
    if (!fluye(r.total.enB)) fallos.push(`vídeo en B: ${r.total.enB.fps} fps, ventanas ${JSON.stringify(r.total.enB.ventanas5s)}`);
  }
  if (nombre === "ble-micro" && r.micro) {
    const media = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
    const con = media(r.micro.fpsEnBConMicro);
    const sin = media(r.micro.fpsEnBSinMicro);
    if (con < UMBRAL.fpsMin || sin < UMBRAL.fpsMin || Math.min(con, sin) / Math.max(con, sin, 0.1) < 0.6) fallos.push(`micro cambia el vídeo: con micro ${con.toFixed(1)} fps, sin micro ${sin.toFixed(1)} fps`);
  }
  if (nombre === "ble-40" && (!r.pausaEn.length || r.pausaEn[0] > UMBRAL.pausaS)) fallos.push(`sin aviso de pausa en ${UMBRAL.pausaS} s con 40 kb/s`);
  if (nombre === "ble-80" || nombre === "ble-40") {
    // O el vídeo sigue (≥ 1 fps) o está en pausa con aviso.
    for (const q of ["A", "B"]) {
      const l = r.total[`en${q}`];
      if (l.fps < 1 && !r.pausaEn.length) fallos.push(`vídeo en ${q}: ${l.fps} fps y sin aviso de pausa`);
    }
  }
  if (nombre === "ble-caida") {
    const [baja, sube] = cambiosS;
    const pausas = r.pausaEn.filter((s) => s >= baja && s < sube);
    if (!pausas.length || pausas[0] - baja > UMBRAL.pausaS) fallos.push(`no hubo aviso de pausa en ${UMBRAL.pausaS} s tras bajar a 40 kb/s`);
    const tras = r.tramos[2];
    if (!tras || tras.enB.ventanas5s.slice(Math.ceil(UMBRAL.reanudarS / 5)).some((f) => f < 1)) fallos.push(`el vídeo no volvió en ${UMBRAL.reanudarS} s al subir a 160: ${JSON.stringify(tras?.enB.ventanas5s)}`);
    if (r.pausaEn.some((s) => s >= sube + UMBRAL.reanudarS)) fallos.push("sigue el aviso de pausa al volver la señal");
  }
  return { pasa: fallos.length === 0, fallos };
}

const lista = escenario === "todos" ? Object.keys(esc) : escenario.split(",");
for (const e of lista) {
  const t = Date.now();
  try {
    out[e] = await esc[e]();
  } catch (err) {
    out[e] = { error: String(err) };
  }
  console.error(`· ${e} (${Math.round((Date.now() - t) / 1000)} s)`);
}
console.log(JSON.stringify(out, null, 1));
await nav.close();
srv.close();
// (LLA1111B) Los casos con veredicto salen con 1 si alguno no pasa.
const malos = Object.entries(out).filter(([, r]) => r?.veredicto && !r.veredicto.pasa).map(([k]) => k);
if (malos.length) {
  console.error(`NO PASAN: ${malos.join(", ")}`);
  process.exitCode = 1;
}
