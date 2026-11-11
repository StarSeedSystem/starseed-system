// Corre los escenarios del banco en Chromium (Playwright, cámara y micro falsos).
//   node correr.mjs [salida] [escenario] [segundos]
// escenarios: aleteo · ip-aparece · choque · video · segunda · corte-ip · sin-servidor · voz-video · todos
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
const nav = await pw.chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await nav.newContext({ permissions: ["camera", "microphone"] });
const out = {};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagina() {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.banco?.listo);
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
};

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
