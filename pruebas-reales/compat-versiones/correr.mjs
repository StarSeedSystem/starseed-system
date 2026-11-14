#!/usr/bin/env node
// LLA1114B · «código nuevo contra el último publicado»: llamadas entre neuronas con builds DISTINTAS.
// Uso (desde la raíz del repo; sin Chromium ni `npm install`: solo node y el esbuild de node_modules):
//   node pruebas-reales/compat-versiones/correr.mjs [--segundos 90] [--solo publicado|regresion] [--json salida.json]
// Empareja el árbol de trabajo con (a) el último publicado y (b) la pareja fija `9e489e8d^` (el código de la tableta el
// 13-11), en los dos sentidos, por un carril como el Bluetooth de la Mac ↔ tableta, y falla si el vídeo o la voz de algún
// sentido baja de lo que da ese mismo carril con los DOS lados en el código del que manda. Ver LEEME.md.
// Sale con 0 (todo bien) o 1 (algo mal, o algo que no se pudo comprobar: nunca pasa en silencio).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
const cache = path.join(aqui, ".cache"); // ignorada por git (.gitignore de esta carpeta)
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const SEGUNDOS = Math.max(40, Number(opt("--segundos", "90")));
const SOLO = opt("--solo", null);
const SALIDA_JSON = opt("--json", null);
/** Desde cuándo se mide (s): el arranque (saludos, primer clave, escalera de la voz) no cuenta. */
const DESDE_S = 20;
const URL_PUBLICADO = process.env.COMPAT_URL_VERSION ?? "https://starseed-os.vercel.app/version.json";
/** La pareja fija de la regresión del 13-11: el código que corría la tableta (el de antes de LLA1113C). */
const REGRESION = "9e489e8d^";
/** El mismo commit por su sha completo (en un clon superficial, como en CI, `9e489e8d^` no se resuelve). */
const REGRESION_SHA = "9b3bed477a16e25cd0336f284d200c4722ace5d0";

/*
 * UMBRALES (por qué estos números):
 *  · Vídeo: el sentido mezclado da al menos el 60 % de los fps que da el mismo sentido con los dos lados en el código del
 *    que manda, menos 0,3 fps de margen (con un emisor que ya da casi 0, el margen evita juzgar ruido). En el aparato, la
 *    tableta pasó de 84 imágenes en 125 s a 3 (el 4 %): eso es lo que tiene que saltar; la Mac → tableta, de 5,5 a 4,2
 *    imágenes/s (el 76 %) con la radio de por medio, que el banco no tiene: el 60 % deja sitio a eso sin dejar pasar un
 *    hundimiento. El banco es determinista (semilla fija), así que dos corridas iguales dan lo mismo.
 *  · Voz: la parte de la voz (unidades de 20 ms) que llega a tiempo (≤ 400 ms, el «tarde» del registro) no baja más de 5
 *    puntos de la del mismo sentido con el mismo código. Un receptor que no entiende el formato (p. ej. `voz.b` sin
 *    `fmt`) la deja en 0 y salta.
 *  · Además el anuncio de capacidades: con los dos lados en un código que anuncia, cada lado tiene que haber anotado su
 *    línea «capacidades …» (si no, el anuncio no llegó: falla).
 */
const UMBRAL_VIDEO = 0.6;
const MARGEN_VIDEO_FPS = 0.3;
const UMBRAL_VOZ_PUNTOS = 5;

/* ─────────────────────────── git y árboles ─────────────────────────── */
const git = (...a) => execFileSync("git", ["-C", raiz, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const existe = (sha) => {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
    return true;
  } catch {
    return false;
  }
};
const revisar = (ref) => {
  try {
    return git("rev-parse", "--verify", `${ref}^{commit}`);
  } catch {
    return null;
  }
};

async function shaPublicado() {
  let motivoWeb = "";
  try {
    const r = await fetch(URL_PUBLICADO, { signal: AbortSignal.timeout(8000), headers: { "cache-control": "no-cache" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const sha = typeof j?.sha === "string" && /^[0-9a-f]{7,40}$/i.test(j.sha) ? j.sha : null;
    if (!sha) throw new Error("version.json sin sha");
    if (existe(sha)) return { sha: revisar(sha), fuente: `version.json (${j.build ?? "?"})` };
    motivoWeb = `el sha publicado ${sha.slice(0, 10)} no está en este repositorio (git fetch)`;
  } catch (e) {
    motivoWeb ||= `version.json no responde (${e?.message ?? e})`;
  }
  const om = revisar("origin/main");
  if (om) return { sha: om, fuente: `origin/main (${motivoWeb})` };
  return { sha: null, fuente: `${motivoWeb}; y no hay origin/main` };
}

/** Saca de git lo que el banco necesita de ese commit a `.cache/<sha>/` (nunca a mano, nunca dentro de src/). */
function materializar(sha) {
  const dest = path.join(cache, "arboles", sha);
  const marca = path.join(dest, ".completo");
  if (fs.existsSync(marca)) return dest;
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const rutas = ["src/lib/llamadas", "src/lib/pwa/build-corriendo.ts"].filter((r) => {
    try {
      git("cat-file", "-e", `${sha}:${r}`);
      return true;
    } catch {
      return false;
    }
  });
  const tar = execFileSync("git", ["-C", raiz, "archive", "--format=tar", sha, ...rutas], { maxBuffer: 512 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", dest], { input: tar });
  fs.writeFileSync(marca, sha);
  return dest;
}

/* ─────────────────────────── empaquetado (esbuild) ─────────────────────────── */
let esbuild = null;
for (const c of ["esbuild", path.join(raiz, "node_modules/esbuild"), "/opt/npm-tools/node_modules/esbuild/lib/main.js"]) {
  try {
    esbuild = require(c);
    break;
  } catch {
    /* siguiente */
  }
}

const resolverTs = (p) => {
  for (const e of ["", ".ts", ".tsx", "/index.ts", "/index.tsx", ".js"]) if (fs.existsSync(p + e) && fs.statSync(p + e).isFile()) return p + e;
  return null;
};

async function empaquetar(arbol, nombre) {
  const salida = path.join(cache, "paquetes", `${nombre}.mjs`);
  const permitidos = [path.join(arbol, "src/lib/llamadas") + path.sep];
  const sueltos = [path.join(arbol, "src/lib/pwa/build-corriendo.ts")];
  const permitido = (p) => (permitidos.some((x) => p.startsWith(x)) || sueltos.includes(p)) && !/[\\/](superficie|nativa)[\\/]/.test(p);
  await esbuild.build({
    entryPoints: [path.join(aqui, "lado.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    outfile: salida,
    logLevel: "error",
    plugins: [
      {
        name: "compat",
        setup(b) {
          b.onResolve({ filter: /^@\// }, (a) => {
            const p = resolverTs(path.join(arbol, "src", a.path.slice(2)));
            return p && permitido(p) ? { path: p } : { path: a.path, namespace: "vacio" };
          });
          b.onResolve({ filter: /^\.\.?\// }, (a) => {
            if (a.importer === path.join(aqui, "lado.ts")) return undefined;
            const p = resolverTs(path.resolve(path.dirname(a.importer), a.path));
            return p && permitido(p) ? { path: p } : { path: a.path, namespace: "vacio" };
          });
          b.onResolve({ filter: /^[^./@]|^@[^/]/ }, (a) => ({ path: a.path, namespace: "vacio" }));
          b.onLoad({ filter: /.*/, namespace: "vacio" }, () => ({
            contents: "module.exports = new Proxy({}, { get: (_, k) => k === '__esModule' ? true : k === 'default' ? undefined : () => undefined });",
            loader: "js",
          }));
        },
      },
    ],
  });
  return salida;
}

/* ─────────────────────────── reloj del banco ─────────────────────────── */
const nativo = { setTimeout, setInterval, clearTimeout, clearInterval, setImmediate, dateNow: Date.now, perfNow: performance.now.bind(performance) };
const vaciar = () => new Promise((r) => nativo.setImmediate(r));

class Reloj {
  t = 1_000_000;
  timers = new Set();
  ahora = () => this.t;
  cada = (fn, ms) => {
    const x = { fn, ms: Math.max(1, ms), prox: this.t + Math.max(1, ms), rep: true };
    this.timers.add(x);
    return () => this.timers.delete(x);
  };
  una = (fn, ms) => {
    const x = { fn, ms: 0, prox: this.t + Math.max(0, ms || 0), rep: false };
    this.timers.add(x);
    return x;
  };
  async avanzar(ms) {
    const fin = this.t + ms;
    while (this.t < fin) {
      this.t = Math.min(fin, this.t + 5);
      let algo = true;
      while (algo) {
        algo = false;
        const vencidos = [...this.timers].filter((x) => x.prox <= this.t).sort((a, b) => a.prox - b.prox);
        for (const x of vencidos) {
          if (!this.timers.has(x)) continue;
          if (x.rep) x.prox += x.ms;
          else this.timers.delete(x);
          try {
            x.fn();
          } catch {
            /* un temporizador que lanza no para el banco */
          }
          algo = true;
        }
        await vaciar();
      }
    }
  }
  /** Mientras dura una corrida, los temporizadores y la hora del código probado son los del banco. */
  instalar() {
    const self = this;
    const base = nativo.dateNow() - this.t;
    globalThis.setTimeout = (fn, ms, ...x) => self.una(() => fn(...x), ms);
    globalThis.setInterval = (fn, ms, ...x) => {
      const c = self.cada(() => fn(...x), ms);
      return { cancelar: c };
    };
    globalThis.clearTimeout = (h) => h && self.timers.delete(h);
    globalThis.clearInterval = (h) => h?.cancelar?.();
    Date.now = () => base + self.t;
    performance.now = () => self.t;
  }
  desinstalar() {
    globalThis.setTimeout = nativo.setTimeout;
    globalThis.setInterval = nativo.setInterval;
    globalThis.clearTimeout = nativo.clearTimeout;
    globalThis.clearInterval = nativo.clearInterval;
    Date.now = nativo.dateNow;
    performance.now = nativo.perfNow;
  }
}

function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * ─────────────────────────── el carril (como el Bluetooth de la Mac ↔ tableta) ───────────────────────────
 * El `bleReal` de `pruebas-reales/llamadas-medio/entrada.ts` (calibrado con los registros de las pruebas 37, 39 y 41)
 * pasado a un reloj de banco: parada y espera por escritura (acuse R + serialización), cubeta de escrituras del emisor
 * (36 de ráfaga, 7,2/s), control antes que voz y datos, voz antes que vídeo, cifrado (4/3 + 96 B por escritura), la
 * señalización cada 3,3 s y el espejo del registro cada 30 s por el mismo enlace, sin medida nativa en la web (como en
 * el aparato el 13-11). Lado A: la Mac (R = 25 + Exp(30) ms, tope 115; 35–70 B/ms). Lado B: la tableta de la prueba 41
 * (R = 70 + Exp(45) ms, tope 260; 20–45 B/ms; paradas de 150–450 ms cada ≈ 2 s). Cada sentido con su semilla.
 */
const LADO_MAC = { rMinMs: 25, rExtraMediaMs: 30, rMaxMs: 115, cMinBporMs: 35, cMaxBporMs: 70, parada: null };
const LADO_TABLETA_41 = { rMinMs: 70, rExtraMediaMs: 45, rMaxMs: 260, cMinBporMs: 20, cMaxBporMs: 45, parada: { cadaMs: 2000, minMs: 150, maxMs: 450 } };
const FICHAS_CAP = 36;
const FICHAS_POR_MS = 72 / 10_000;
const MAX_TRAMA = 11_816;
const MAX_POR_LOTE = 32;
const esVideoTxt = (t) => t.startsWith('{"t":"voz.v"');
const aire = (lote) => {
  const cuerpo = lote.length > 1 ? JSON.stringify({ t: "nl.lote", m: lote }).length : lote[0].length;
  return Math.ceil(cuerpo / 3) * 4 + 96;
};

/** Los dos carriles: la Mac con la tableta del 13-11 (su vídeo apenas sale con ningún código) y Mac con Mac (los dos
 *  sentidos con vídeo: así un vídeo que deja de llegar por la mezcla se ve también en el sentido B→A). */
const CARRILES = [
  { nombre: "mac-tableta41", B: LADO_TABLETA_41 },
  { nombre: "mac-mac", B: LADO_MAC },
];

function carril(reloj, semilla, lectorA, lectorB, medida, ladoB) {
  const oy = [new Set(), new Set()];
  const parada = { hasta: 0 };
  const P = [LADO_MAC, ladoB];
  // Paradas del lado B (la tableta): ni escribe ni entrega a su web; al acabar sale todo junto.
  const rndP = azar(semilla + 4242);
  const retenidos = [];
  const programarParada = () => {
    const p = P[1].parada;
    if (!p) return;
    reloj.una(() => {
      parada.hasta = reloj.ahora() + p.minMs + rndP() * (p.maxMs - p.minMs);
      reloj.una(() => {
        for (const x of retenidos.splice(0)) oy[1].forEach((cb) => cb(x));
      }, parada.hasta - reloj.ahora());
      programarParada();
    }, -p.cadaMs * Math.log(1 - rndP() * 0.999));
  };
  programarParada();
  const parado = () => Math.max(0, parada.hasta - reloj.ahora());
  const entregar = (a, t) => {
    if (a === 1 && (parado() > 0 || retenidos.length)) retenidos.push(t);
    else oy[a].forEach((cb) => cb(t));
  };
  const lado = (i) => {
    const sentido = i === 0 ? "AB" : "BA";
    const m = medida[sentido];
    const lector = i === 0 ? lectorA : lectorB; // el que manda sabe leer lo suyo
    const L = P[i];
    const rnd = azar(semilla + i * 7919);
    const voz = [];
    const vid = [];
    const ctl = [];
    const dat = [];
    let fichas = FICHAS_CAP;
    let fichasEn = reloj.ahora();
    let turnoVoz = true;
    let bVoz = 0;
    let bVid = 0;
    let entrados = 0;
    let ultimoVideo = 0;
    let ocupadoHasta = 0;
    let bombeando = false;
    const escrituras = [];
    const juntoVoz = new Set();
    const relleno = (t, n) => JSON.stringify({ t, x: "x".repeat(Math.max(0, n - 20)) });
    reloj.cada(() => {
      ctl.push(relleno("llc.senal", 400));
      bombear();
    }, 3300);
    reloj.cada(() => {
      dat.push(relleno("ble.espejo", 5000));
      bombear();
    }, 30_000);
    const bombear = () => {
      if (bombeando) return;
      if (!(voz.length || vid.length || ctl.length || dat.length)) return;
      bombeando = true;
      const ahora = reloj.ahora();
      fichas = Math.min(FICHAS_CAP, fichas + (ahora - fichasEn) * FICHAS_POR_MS);
      fichasEn = ahora;
      if (fichas < 1) {
        reloj.una(() => {
          bombeando = false;
          bombear();
        }, Math.max(1, Math.ceil((1 - fichas) / FICHAS_POR_MS)));
        return;
      }
      if (i === 1 && parado() > 0) {
        reloj.una(() => {
          bombeando = false;
          bombear();
        }, parado());
        return;
      }
      fichas -= 1;
      let lista;
      if (ctl.length) lista = ctl;
      else if (voz.length && dat.length) {
        lista = turnoVoz ? voz : dat;
        turnoVoz = !turnoVoz;
      } else if (voz.length) lista = voz;
      else if (vid.length) lista = vid;
      else lista = dat;
      const deVoz = lista === voz;
      const deVid = lista === vid;
      const lote = [];
      let n = 0;
      while (lista.length && (n === 0 || (n + lista[0].length <= MAX_TRAMA && lote.length < MAX_POR_LOTE))) {
        n += lista[0].length;
        lote.push(lista.shift());
      }
      const c = L.cMinBporMs + rnd() * (L.cMaxBporMs - L.cMinBporMs);
      const serial = aire(lote) / c;
      const acuse = Math.min(L.rMaxMs, L.rMinMs - L.rExtraMediaMs * Math.log(1 - rnd() * 0.999));
      const t0 = ahora;
      let fin = t0 + serial + acuse;
      // Una parada de la tableta con la escritura en vuelo la alarga hasta que acaba.
      if (i === 1 && parada.hasta > t0) fin += parada.hasta - t0;
      ocupadoHasta = fin;
      reloj.una(() => {
        if (!(deVoz || deVid)) return;
        const ahoraE = reloj.ahora();
        const retenB = i === 0 ? parado() : 0;
        for (const t of lote) {
          if (!esVideoTxt(t)) {
            const p = lector(t, ahoraE);
            if (p) for (const u of p.unidades) if (!m.entregadas.has(u)) m.entregadas.set(u, ahoraE + retenB - p.ts);
          }
          entregar(1 - i, t);
        }
      }, serial + acuse / 2);
      reloj.una(() => {
        if (deVoz || deVid) {
          escrituras.push({ fin: reloj.ahora(), ms: Math.max(1, reloj.ahora() - t0), bytes: n });
          if (escrituras.length > 32) escrituras.splice(0, escrituras.length - 32);
        }
        if (deVoz) bVoz -= n;
        else if (deVid) bVid -= n;
        bombeando = false;
        bombear();
      }, fin - t0);
    };
    const tr = {
      enviar(t) {
        const pv = esVideoTxt(t) ? null : lector(t, reloj.ahora());
        if (pv) for (const u of pv.unidades) m.enviadas.add(u);
        if (esVideoTxt(t)) ultimoVideo = Date.now();
        voz.push(t);
        bVoz += t.length;
        entrados += t.length;
        let tiro = false;
        while (bVoz > 6 * 1024 && voz.length > 1) {
          bVoz -= voz.shift().length;
          tiro = true;
        }
        queueMicrotask(bombear);
        if (!esVideoTxt(t)) for (const cb of Array.from(juntoVoz)) cb(!!pv);
        return tiro ? "descartado" : "ok";
      },
      enviarVideo(t) {
        vid.push(t);
        bVid += t.length;
        ultimoVideo = Date.now();
        let tiro = false;
        while (bVid > 24 * 1024 && vid.length > 1) {
          bVid -= vid.shift().length;
          tiro = true;
        }
        queueMicrotask(bombear);
        return tiro ? "descartado" : "ok";
      },
      ocupado: () => (typeof tr.__vozOcupada === "function" ? tr.__vozOcupada(bVoz, 2048, ultimoVideo || undefined, Date.now()) : bVoz > 2048),
      colaVozBytes: () => bVoz,
      escrituras: () => escrituras.slice(),
      alSalirVoz: (cb) => (juntoVoz.add(cb), () => void juntoVoz.delete(cb)),
      escriturasPorS: () => 7.2,
      colaVideoBytes: () => bVid,
      topeColaVideoBytes: () => 24 * 1024,
      bytesEntrados: () => entrados,
      videoEnCarril: () => Date.now() - ultimoVideo < 2000,
      alRecibir: (cb) => (oy[i].add(cb), () => void oy[i].delete(cb)),
      abierto: () => true,
      info: () => ({ tipo: "ble", cifrada: true }),
      capacidadKbps: () => null,
    };
    return tr;
  };
  return [lado(0), lado(1)];
}

/* ─────────────────────────── una llamada ─────────────────────────── */
let nCarga = 0;
async function cargar(paquete) {
  // Cada lado, su propia instancia del módulo (como dos aparatos): `?lado=N`.
  return import(`${pathToFileURL(paquete).href}?lado=${++nCarga}`);
}

async function llamada(paqA, paqB, ladoB, semilla = 41) {
  const reloj = new Reloj();
  reloj.instalar();
  try {
    const modA = await cargar(paqA);
    const modB = await cargar(paqB);
    const medida = { AB: { enviadas: new Set(), entregadas: new Map() }, BA: { enviadas: new Set(), entregadas: new Map() } };
    const [ta, tb] = carril(reloj, semilla, modA.unidadesVoz, modB.unidadesVoz, medida, ladoB);
    const lineas = { A: [], B: [] };
    const id = "11111111-2222-4333-8444-555555555555";
    const relojSesion = { ahora: () => reloj.ahora(), cada: (fn, ms) => reloj.cada(fn, ms) };
    const A = modA.crearLado({ idLlamada: id, transporte: ta, reloj: relojSesion, anotar: (h) => lineas.A.push(`${Math.round((reloj.ahora() - 1_000_000) / 1000)} ${h}`) });
    const B = modB.crearLado({ idLlamada: id, transporte: tb, reloj: relojSesion, anotar: (h) => lineas.B.push(`${Math.round((reloj.ahora() - 1_000_000) / 1000)} ${h}`) });
    ta.__vozOcupada = A.vozOcupada;
    tb.__vozOcupada = B.vozOcupada;
    await A.iniciar();
    await B.iniciar();
    let q = 0;
    reloj.cada(() => {
      A.tramaMicro(q);
      B.tramaMicro(q);
      q++;
    }, 20);
    const t0 = reloj.ahora();
    await reloj.avanzar(SEGUNDOS * 1000);
    const desde = t0 + DESDE_S * 1000;
    const hasta = reloj.ahora();
    const fps = (pintadas) => Math.round((pintadas.filter((t) => t >= desde).length / ((hasta - desde) / 1000)) * 100) / 100;
    const vozATiempo = (m) => {
      // Unidades que salieron en el tramo medido y llegaron con ≤ 400 ms de tránsito.
      const salidas = [...m.enviadas].filter((u) => u * 20 >= DESDE_S * 1000 - 2000);
      if (!salidas.length) return 0;
      const bien = salidas.filter((u) => (m.entregadas.get(u) ?? Infinity) <= 400).length;
      return Math.round((1000 * bien) / salidas.length) / 10;
    };
    const r = {
      // A→B: lo que pinta / oye B de A.
      AB: { videoFps: fps(B.medida().pintadas), vozATiempo: vozATiempo(medida.AB) },
      BA: { videoFps: fps(A.medida().pintadas), vozATiempo: vozATiempo(medida.BA) },
      capacidades: { A: lineas.A.filter((l) => / capacidades /.test(l)).slice(0, 2), B: lineas.B.filter((l) => / capacidades /.test(l)).slice(0, 2) },
      pausasB: lineas.B.filter((l) => /video-datos pausa motivo=/.test(l)).length,
      pausasA: lineas.A.filter((l) => /video-datos pausa motivo=/.test(l)).length,
      // Para leerlas con `--json` (las de reparto, pausa y vuelta, y el resumen de la voz).
      lineas: { A: lineas.A.filter((l) => /reparto|pausa|sigue|capacidades|voz-datos tx /.test(l)).slice(-80), B: lineas.B.filter((l) => /reparto|pausa|sigue|capacidades|voz-datos tx /.test(l)).slice(-80) },
    };
    A.detener();
    B.detener();
    await reloj.avanzar(50);
    return r;
  } finally {
    reloj.desinstalar();
  }
}

/* ─────────────────────────── juicio ─────────────────────────── */
const fmt = (x) => String(x).replace(".", ",");
function juzgar(mezcla, base) {
  const minVideo = Math.max(0, base.videoFps * UMBRAL_VIDEO - MARGEN_VIDEO_FPS);
  const minVoz = base.vozATiempo - UMBRAL_VOZ_PUNTOS;
  const fallos = [];
  if (mezcla.videoFps < minVideo) fallos.push(`vídeo ${fmt(mezcla.videoFps)} fps < ${fmt(Math.round(minVideo * 100) / 100)}`);
  if (mezcla.vozATiempo < minVoz) fallos.push(`voz a tiempo ${fmt(mezcla.vozATiempo)} % < ${fmt(Math.round(minVoz * 10) / 10)} %`);
  return fallos;
}

async function main() {
  const t0 = nativo.dateNow();
  const resumen = [];
  let mal = false;
  const decir = (l) => {
    resumen.push(l);
    console.log(l);
  };
  if (!esbuild) {
    decir("compat-versiones FALLA: falta esbuild (node_modules/esbuild): no se pudo comprobar nada");
    process.exit(1);
  }
  fs.mkdirSync(path.join(cache, "paquetes"), { recursive: true });
  // Las parejas: el último publicado y la regresión fija del 13-11.
  const parejas = [];
  if (SOLO !== "regresion") {
    const p = await shaPublicado();
    if (!p.sha) {
      decir(`publicado · FALLA: no se pudo saber cuál es el último publicado: ${p.fuente}`);
      mal = true;
    } else parejas.push({ nombre: "publicado", sha: p.sha, fuente: p.fuente });
  }
  if (SOLO !== "publicado") {
    const r = revisar(REGRESION) ?? revisar(REGRESION_SHA);
    if (!r) {
      decir(`regresion · FALLA: ${REGRESION} (${REGRESION_SHA.slice(0, 10)}) no está en este repositorio: git fetch origin ${REGRESION_SHA}`);
      mal = true;
    } else parejas.push({ nombre: "regresion", sha: r, fuente: REGRESION });
  }
  const paqTrabajo = await empaquetar(raiz, "trabajo");
  const cacheLlamadas = new Map();
  const correrPar = async (a, b, c) => {
    const k = `${c.nombre}|${path.basename(a)}|${path.basename(b)}`;
    if (!cacheLlamadas.has(k)) cacheLlamadas.set(k, await llamada(a, b, c.B));
    return cacheLlamadas.get(k);
  };
  const paquetes = [];
  for (const par of parejas) paquetes.push({ ...par, paq: await empaquetar(materializar(par.sha), par.sha) });
  for (const c of CARRILES) {
    const base = await correrPar(paqTrabajo, paqTrabajo, c);
    // Con el código de trabajo en los dos lados, el anuncio tiene que haberse dicho y acordado en cada lado.
    for (const q of ["A", "B"]) {
      const l = base.capacidades[q][0];
      if (!l || !/comunes=todas/.test(l)) {
        decir(`anuncio · ${c.nombre} · FALLA: el lado ${q} (código de trabajo en los dos) no anotó «capacidades … comunes=todas»`);
        mal = true;
      }
    }
    if (c === CARRILES[0] && base.capacidades.A[0]) decir(`anuncio · trabajo↔trabajo · A: ${base.capacidades.A[0].replace(/^\d+ voz voz-datos /, "")}`);
    for (const par of paquetes) {
      const viejo = await correrPar(par.paq, par.paq, c);
      const tn = await correrPar(paqTrabajo, par.paq, c); // A = trabajo (la Mac), B = viejo
      const nt = await correrPar(par.paq, paqTrabajo, c); // A = viejo (la Mac), B = trabajo
      const corto = par.sha.slice(0, 10);
      const ladoB = c.B === LADO_MAC ? "Mac" : "tableta";
      // Cada sentido se compara con el MISMO sentido y carril con los dos lados en el código del que manda.
      const casos = [
        { txt: `trabajo→${corto} (Mac→${ladoB})`, mezcla: tn.AB, base: base.AB },
        { txt: `${corto}→trabajo (${ladoB}→Mac)`, mezcla: tn.BA, base: viejo.BA },
        { txt: `${corto}→trabajo (Mac→${ladoB})`, mezcla: nt.AB, base: viejo.AB },
        { txt: `trabajo→${corto} (${ladoB}→Mac)`, mezcla: nt.BA, base: base.BA },
      ];
      for (const x of casos) {
        const f = juzgar(x.mezcla, x.base);
        if (f.length) mal = true;
        decir(
          `${par.nombre} ${corto} · ${c.nombre} · ${x.txt}: vídeo ${fmt(x.mezcla.videoFps)} fps (mismo código ${fmt(x.base.videoFps)}) · voz a tiempo ${fmt(x.mezcla.vozATiempo)} % (mismo código ${fmt(x.base.vozATiempo)} %) · ${f.length ? `FALLA: ${f.join("; ")}` : "BIEN"}`,
        );
      }
      if (c === CARRILES[0] && tn.capacidades.A[0]) decir(`anuncio · trabajo↔${corto} · A: ${tn.capacidades.A[0].replace(/^\d+ voz voz-datos /, "")}`);
    }
  }
  for (const par of parejas) if (par.fuente !== REGRESION) decir(`(${par.nombre} = ${par.sha.slice(0, 10)} de ${par.fuente})`);
  const s = Math.round((nativo.dateNow() - t0) / 1000);
  decir(`compat-versiones ${mal ? "FALLA" : "BIEN"} · ${SEGUNDOS} s de llamada por pareja · ${s} s`);
  if (SALIDA_JSON) fs.writeFileSync(SALIDA_JSON, JSON.stringify({ resumen, llamadas: Object.fromEntries(cacheLlamadas) }, null, 2));
  process.exit(mal ? 1 : 0);
}

main().catch((e) => {
  console.log(`compat-versiones FALLA: el banco se rompió: ${e?.stack ?? e}`);
  process.exit(1);
});
