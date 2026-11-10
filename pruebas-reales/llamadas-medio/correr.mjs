// Corre los escenarios del banco en Chromium (Playwright, cámara y micro falsos).
//   node correr.mjs [salida] [escenario] [segundos]
// escenarios: aleteo · ip-aparece · choque · video · segunda · corte-ip · sin-servidor · todos
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
};

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
