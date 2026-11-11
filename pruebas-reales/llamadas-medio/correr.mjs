// Corre los escenarios del banco en Chromium (Playwright, cámara y micro falsos).
//   node correr.mjs [salida] [escenario] [segundos]
// escenarios: aleteo · ip-aparece · choque · video · segunda · corte-ip · sin-servidor · voz-video · paso-ip · paso-ip-silencioso · timbre-cola · video-sube · wifi-directo · ble-160 · ble-80 · ble-40 · ble-caida · ble-micro · voz-40 · voz-24 · voz-16 · voz-caida · voz-suelo · voz-40-cif · voz-24-cif · voz-16-cif · vozvideo-80 · vozvideo-40 · todos
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
  // VOZ1111J: que se sepa si la página se cayó (y no solo «Target closed»).
  p.on("crash", () => console.error("· la página se cayó (crash del renderizador)"));
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
const vozNoCabe = (nombre) => nombre === "ble-40" || nombre === "ble-caida";

async function casoBle(nombre, tramos, extra = {}) {
  const dur = Math.min(segundos, 600);
  const p = await pagina();
  await p.evaluate(async ([k0, plazo]) => {
    const b = window.banco;
    b.ble.plazoVozMs = plazo;
    b.red.ip = false;
    b.red.ipVista.A = b.red.ipVista.B = false;
    b.ble.kbps = k0;
    b.ble.anunciadoKbps = 160;
    window.__ll = await b.llamada({ conDatos: true, video: true, ble: true, videoDatos: true, opus: true });
  }, [tramos[0].kbps, extra.plazo ?? 200]);
  // Arranque: voz por datos, saludo del vídeo y primer clave.
  await espera(15_000);
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
      const out = { total: b.resumenTramo(t0, t1), voz: b.resumenVoz(), t0: Math.round(t0) };
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
      out.registro = b.lineas.filter((l) => /video-datos (tx|reparto|pausa|sigue)|voz-datos (plan|reparto)/.test(l.detalle)).slice(-80).map((l) => `${Math.round((l.t - t0) / 1000)}s ${l.neurona ?? "-"} ${l.detalle}`);
      return out;
    },
    { t0, t1, tramosMs, marcas },
  );
  await p.close();
  r.veredicto = juzgar(nombre, r, tramosMs.length ? tramosMs.map((x) => Math.round((x.en - t0) / 1000)) : []);
  return r;
}

function juzgar(nombre, r, cambiosS) {
  const fallos = [];
  for (const k of ["AB", "BA"]) {
    const v = r.voz[k];
    if (vozNoCabe(nombre)) {
      const tope = UMBRAL.vozSolaPerdidaPct[nombre];
      if (v.perdidaPct === null || v.perdidaPct > tope) fallos.push(`voz ${k} pérdida ${v.perdidaPct}% > ${tope}% (la de la voz sola)`);
      if (v.esperaTrasVideoMaxMs > UMBRAL.esperaTrasVideoEstrechoMs) fallos.push(`voz ${k} esperó ${v.esperaTrasVideoMaxMs} ms tras un vídeo`);
      continue;
    }
    if (v.perdidaPct === null || v.perdidaPct > UMBRAL.perdidaVozPct) fallos.push(`voz ${k} pérdida ${v.perdidaPct}% > ${UMBRAL.perdidaVozPct}%`);
    if (v.tardePct === null || v.tardePct > UMBRAL.tardeVozPct) fallos.push(`voz ${k} tarde ${v.tardePct}% > ${UMBRAL.tardeVozPct}%`);
    if (v.esperaTrasVideoMaxMs > UMBRAL.esperaTrasVideoMs) fallos.push(`voz ${k} esperó ${v.esperaTrasVideoMaxMs} ms tras un vídeo`);
  }
  const fluye = (lado) => lado.ventanas5s.length > 0 && lado.ventanas5s.filter((f) => f >= UMBRAL.fpsMin).length / lado.ventanas5s.length >= UMBRAL.ventanasOk;
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
