#!/usr/bin/env node
/*
 * capa.mjs — arma y anuncia una CAPA del servidor local de la app (CAP1107A · T1, 2026-11-07).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/apps-autonomas-sin-internet.md §10 · Lo usan native/servidor-local/publicar-capa.sh,
 * .github/workflows/native-build.yml (job `servidor-capa`) y .github/workflows/servidor-capa.yml.
 *
 * Petición de Alex (10-10): «según el cambio se reinician los servidores dentro de la app sin
 * reinstalarla». Una capa es la MISMA carpeta `servidor/` que lleva el instalador (standalone +
 * .next/static + public + envoltorio; sin Node) en un .tar.gz, con un manifiesto que la app verifica
 * con la clave del updater de Tauri antes de usarla.
 *
 *   node native/servidor-local/capa.mjs armar --tar servidor-next.tar --salida dist-capa [--app-minima 0.5.0]
 *     → dist-capa/servidor-capa-<build>.tar.gz   (tar ustar/pax determinista, gzip -9)
 *       dist-capa/servidor-capa-<build>.json     (manifiesto: build, versión, app mínima, protocolo,
 *                                                 SHA-256 del .tar.gz y de CADA archivo) → se firma con
 *                                                 `tauri signer sign` (TAURI_SIGNING_PRIVATE_KEY)
 *   node native/servidor-local/capa.mjs canal --manifiesto dist-capa/servidor-capa-<build>.json \
 *        --firma dist-capa/servidor-capa-<build>.json.sig --base https://github.com/<repo>/releases/download/<tag> \
 *        --salida dist-capa/latest-servidor.json
 *     → el puntero que mira la app (con la firma dentro, como `latest.json` del updater).
 *   node native/servidor-local/capa.mjs podar --assets assets.json --guardar 4 --salida borrar.txt
 *     → de los archivos del Release del canal (`gh release view --json assets`), cuáles sobran: se
 *       quedan las `--guardar` capas más recientes (una app puede estar bajando la anterior).
 *
 * Reglas (las mismas que comprueba Rust, servidor_capas_logica.rs): solo archivos normales; rutas
 * relativas sin `..`, `\`, `:` ni componentes que Windows recortaría; ningún par de rutas que solo
 * cambie en mayúsculas; están los archivos que el arranque necesita. Si algo falla, sale con 1 y no
 * deja nada a medias: el canal no se toca.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { copiarServidor, ejecutar, tarDelSistema, recorrer, versionYCommit, PROTOCOLO } from "./preparar.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Formato del manifiesto y del puntero (FORMATO en Rust). */
export const FORMATO = 1;
/**
 * La app más vieja que sabe usar capas (la primera con T1). Solo se sube cuando una capa necesita
 * algo nuevo de Rust que NO cubre `PROTOCOLO` (p. ej. un comando nuevo que la web llame al arrancar).
 */
export const APP_MINIMA = "0.5.0";
/** Lo que toda capa debe traer (REQUERIDOS en Rust). */
export const REQUERIDOS = ["server.js", ".next/BUILD_ID", "starseed-arranque.cjs", "guarda.cjs", "migracion-origen.js", "starseed-servidor.json"];
/** Release fijo del canal (CANAL en Rust). */
export const ETIQUETA_CANAL = "servidor-local";
export const NOMBRE_CANAL = "latest-servidor.json";

export const nombreArchivo = (build) => `servidor-capa-${build}.tar.gz`;
export const nombreManifiesto = (build) => `servidor-capa-${build}.json`;
export const buildIdSeguro = (b) => typeof b === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b);

// ───────────────────────────── Puro ─────────────────────────────

export function leerArgs(argv) {
  const [orden, ...resto] = argv;
  if (!["armar", "canal", "podar"].includes(orden)) throw new Error("uso: capa.mjs armar|canal|podar …");
  const a = { orden, appMinima: APP_MINIMA };
  for (let i = 0; i < resto.length; i++) {
    const k = resto[i];
    const v = () => {
      const x = resto[++i];
      if (x === undefined) throw new Error(`falta el valor de ${k}`);
      return x;
    };
    if (k === "--tar") a.tar = v();
    else if (k === "--next") a.next = v();
    else if (k === "--salida") a.salida = v();
    else if (k === "--app-minima") a.appMinima = v();
    else if (k === "--manifiesto") a.manifiesto = v();
    else if (k === "--firma") a.firma = v();
    else if (k === "--base") a.base = v();
    else if (k === "--assets") a.assets = v();
    else if (k === "--guardar") a.guardar = Number.parseInt(v(), 10);
    else throw new Error(`opción desconocida: ${k}`);
  }
  if (!a.salida) throw new Error("hace falta --salida");
  if (orden === "armar" && !a.tar === !a.next) throw new Error("hace falta --tar o --next (uno de los dos)");
  if (orden === "canal" && (!a.manifiesto || !a.firma || !a.base)) throw new Error("canal necesita --manifiesto, --firma y --base");
  if (orden === "podar" && (!a.assets || !(a.guardar >= 1))) throw new Error("podar necesita --assets y --guardar ≥ 1");
  if (!/^\d+\.\d+\.\d+$/.test(a.appMinima)) throw new Error(`--app-minima no es una versión x.y.z: ${a.appMinima}`);
  return a;
}

/** null si la ruta (relativa, con «/») es segura; si no, por qué (ruta_segura en Rust). */
export function problemaDeRuta(r) {
  if (!r || Buffer.byteLength(r) > 1024) return "ruta vacía o demasiado larga";
  if (r.startsWith("/")) return "ruta absoluta";
  if (/[\\:\u0000-\u001f\u007f]/.test(r)) return "carácter no admitido";
  for (const p of r.split("/")) {
    if (!p || p === "." || p === "..") return "componente no admitido";
    if (Buffer.byteLength(p) > 255 || p.endsWith(".") || p.endsWith(" ")) return "componente no admitido";
  }
  return null;
}

/** Orden por bytes UTF-8 (el de Rust al comparar `&str`), no por UTF-16. */
export const compararRutas = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** Comprueba la lista ya ordenada: rutas seguras, sin pares en mayúsculas, sin archivo-y-carpeta, con los requeridos. */
export function comprobarLista(lista) {
  const errores = [];
  const minus = new Map();
  for (let i = 0; i < lista.length; i++) {
    const r = lista[i].ruta;
    const p = problemaDeRuta(r);
    if (p) errores.push(`${p}: «${r}»`);
    const m = r.toLowerCase();
    if (minus.has(m)) errores.push(`dos archivos que solo cambian en mayúsculas: «${minus.get(m)}» y «${r}»`);
    else minus.set(m, r);
    if (i > 0 && compararRutas(lista[i - 1].ruta, r) >= 0) errores.push(`lista desordenada o repetida en «${r}»`);
    if (i > 0 && r.startsWith(`${lista[i - 1].ruta}/`)) errores.push(`«${lista[i - 1].ruta}» es archivo y carpeta a la vez`);
  }
  const rutas = new Set(lista.map((a) => a.ruta));
  for (const q of REQUERIDOS) if (!rutas.has(q)) errores.push(`falta ${q}`);
  return errores;
}

function campoOctal(buf, ini, largo, n) {
  buf.write(n.toString(8).padStart(largo - 1, "0") + "\0", ini, largo, "ascii");
}

/**
 * Cabecera ustar de un archivo normal (modo 0644, dueño 0, fecha 0: determinista). Si la ruta no
 * cabe en los 100 bytes del nombre (o no es ASCII), va antes una cabecera pax con `path=`.
 */
export function cabecerasTar(ruta, bytes) {
  const partes = [];
  const nombreBuf = Buffer.from(ruta);
  const ascii = /^[\x20-\x7e]*$/.test(ruta);
  if (nombreBuf.length > 100 || !ascii) {
    const cuerpo = ` path=${ruta}\n`;
    let largo = Buffer.byteLength(cuerpo) + 1;
    while (Buffer.byteLength(`${largo}${cuerpo}`) !== largo) largo++;
    const datos = Buffer.from(`${largo}${cuerpo}`);
    partes.push(cabecera("PaxHeader", datos.length, "x"), datos, Buffer.alloc((512 - (datos.length % 512)) % 512));
    partes.push(cabecera("recortado-por-pax", bytes, "0"));
  } else {
    partes.push(cabecera(ruta, bytes, "0"));
  }
  return Buffer.concat(partes);
}

function cabecera(nombre, bytes, tipo) {
  const c = Buffer.alloc(512);
  c.write(nombre, 0, 100, "utf8");
  campoOctal(c, 100, 8, 0o644);
  campoOctal(c, 108, 8, 0);
  campoOctal(c, 116, 8, 0);
  campoOctal(c, 124, 12, bytes);
  campoOctal(c, 136, 12, 0);
  c.write(tipo, 156, 1, "ascii");
  c.write("ustar\u000000", 257, 8, "binary");
  c.fill(0x20, 148, 156);
  let suma = 0;
  for (const b of c) suma += b;
  c.write(suma.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return c;
}

/** El manifiesto que se firma. `archivos`: [{ruta, bytes, sha256}] ya ordenada. */
export function manifiestoCapa({ buildId, version, commit, creadoMs, appMinima, nodeMayor, archivo, archivos }) {
  return {
    formato: FORMATO,
    build_id: buildId,
    version: version || null,
    commit: commit || null,
    creado_ms: creadoMs,
    app_minima: appMinima,
    protocolo: PROTOCOLO,
    node_mayor: nodeMayor,
    archivo: { nombre: nombreArchivo(buildId), bytes: archivo.bytes, sha256: archivo.sha256 },
    total: { archivos: archivos.length, bytes: archivos.reduce((s, a) => s + a.bytes, 0) },
    archivos: archivos.map((a) => [a.ruta, a.bytes, a.sha256]),
  };
}

/** El puntero `latest-servidor.json`: dónde está todo + la firma del manifiesto (contenido del .sig). */
export function canalDe(m, firma, base) {
  if (!/^https:\/\/[^\s?#]+$/.test(base)) throw new Error(`--base debe ser una URL https sin consulta: ${base}`);
  if (!buildIdSeguro(m.build_id)) throw new Error("el manifiesto no tiene un build_id válido");
  const f = String(firma).trim();
  if (!/^[A-Za-z0-9+/=]+$/.test(f)) throw new Error("la firma no es el base64 de un .sig de minisign");
  const b = base.replace(/\/+$/, "");
  return {
    formato: FORMATO,
    build_id: m.build_id,
    version: m.version,
    commit: m.commit,
    creado_ms: m.creado_ms,
    app_minima: m.app_minima,
    protocolo: m.protocolo,
    manifiesto: `${b}/${nombreManifiesto(m.build_id)}`,
    firma: f,
    archivo: `${b}/${m.archivo.nombre}`,
    bytes: m.archivo.bytes,
    sha256: m.archivo.sha256,
  };
}

/**
 * De los archivos de un Release (`[{name, createdAt}]`), los de capas viejas: se quedan las `guardar`
 * más recientes (por la fecha de su manifiesto) y todo lo que no sea de una capa (el puntero).
 */
export function aPodar(assets, guardar) {
  const capas = new Map();
  for (const a of assets) {
    const m = /^servidor-capa-([A-Za-z0-9_-]{1,64})\.(tar\.gz|json|json\.sig)$/.exec(a.name || "");
    if (!m) continue;
    const c = capas.get(m[1]) || { fecha: "", nombres: [] };
    c.nombres.push(a.name);
    if (m[2] === "json" || !c.fecha) c.fecha = a.createdAt || c.fecha;
    capas.set(m[1], c);
  }
  return [...capas.values()]
    .sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))
    .slice(guardar)
    .flatMap((c) => c.nombres)
    .sort();
}

export function mb(b) {
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ───────────────────────────── Disco ─────────────────────────────

/** Lista ordenada de los archivos de `dir` con su tamaño y SHA-256. Solo archivos normales. */
export function listarArchivos(dir) {
  const lista = [];
  recorrer(dir, (rel, abs) => {
    const st = fs.lstatSync(abs);
    if (!st.isFile()) throw new Error(`«${rel}» no es un archivo normal (enlace o especial): una capa solo lleva archivos`);
    const datos = fs.readFileSync(abs);
    lista.push({ ruta: rel, bytes: datos.length, sha256: createHash("sha256").update(datos).digest("hex") });
  });
  return lista.sort((a, b) => compararRutas(a.ruta, b.ruta));
}

/** Escribe `dir` como .tar.gz (en el orden de `lista`) y devuelve {bytes, sha256} del .tar.gz. */
export async function escribirTarGz(dir, lista, destino) {
  async function* trozos() {
    for (const a of lista) {
      const datos = fs.readFileSync(path.join(dir, a.ruta));
      if (datos.length !== a.bytes) throw new Error(`«${a.ruta}» cambió mientras se empaquetaba`);
      yield cabecerasTar(a.ruta, a.bytes);
      yield datos;
      const relleno = (512 - (a.bytes % 512)) % 512;
      if (relleno) yield Buffer.alloc(relleno);
    }
    yield Buffer.alloc(1024);
  }
  const h = createHash("sha256");
  let bytes = 0;
  const contar = new Transform({
    transform(trozo, _c, cb) {
      h.update(trozo);
      bytes += trozo.length;
      cb(null, trozo);
    },
  });
  await pipeline(Readable.from(trozos()), zlib.createGzip({ level: 9 }), contar, fs.createWriteStream(destino));
  return { bytes, sha256: h.digest("hex") };
}

function salidaGitHub(pares) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(pares).map(([k, v]) => `${k}=${v}\n`).join(""));
}

export async function armar(a) {
  const salida = path.resolve(a.salida);
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), "ss-capa-"));
  const dejados = [];
  try {
    let base = a.next ? path.resolve(a.next) : null;
    if (a.tar) {
      base = path.join(trabajo, "next");
      fs.mkdirSync(base, { recursive: true });
      ejecutar(tarDelSistema(), ["-xf", path.resolve(a.tar), "-C", base]);
    }
    const dir = path.join(trabajo, "servidor");
    const { sinSharp } = copiarServidor(base, dir);
    const buildId = fs.readFileSync(path.join(dir, ".next", "BUILD_ID"), "utf8").trim();
    if (!buildIdSeguro(buildId)) throw new Error(`BUILD_ID no válido para nombrar una capa: «${buildId}»`);
    const { version, commit } = versionYCommit();
    const nodeJson = JSON.parse(fs.readFileSync(path.join(AQUI, "node.json"), "utf8"));
    const nodeMayor = Number.parseInt(String(nodeJson.version), 10) || 0;
    const creadoMs = a.creadoMs ?? Date.now();
    // El mismo manifiesto «de paquete» que escribe preparar.mjs (lo lee servidor_local_estado).
    fs.writeFileSync(
      path.join(dir, "starseed-servidor.json"),
      JSON.stringify({ version, commit, buildId, node: nodeJson.version, plataforma: "capa", imagenes: sinSharp ? "sin-optimizar" : "sharp", protocolo: PROTOCOLO, creado: new Date(creadoMs).toISOString(), creadoMs }, null, 2) + "\n",
    );

    const lista = listarArchivos(dir);
    const errores = comprobarLista(lista);
    if (errores.length) throw new Error(`la capa no se puede publicar:\n  · ${errores.slice(0, 20).join("\n  · ")}`);

    fs.mkdirSync(salida, { recursive: true });
    const rutaArchivo = path.join(salida, nombreArchivo(buildId));
    const rutaManifiesto = path.join(salida, nombreManifiesto(buildId));
    dejados.push(rutaArchivo, rutaManifiesto);
    const archivo = await escribirTarGz(dir, lista, rutaArchivo);
    const m = manifiestoCapa({ buildId, version, commit, creadoMs, appMinima: a.appMinima, nodeMayor, archivo, archivos: lista });
    fs.writeFileSync(rutaManifiesto, JSON.stringify(m) + "\n");

    const resumen = [
      `### Capa del servidor local · build ${buildId}`,
      "",
      "| Pieza | Valor |",
      "|---|---:|",
      `| Archivos | ${m.total.archivos} |`,
      `| Extraída | ${mb(m.total.bytes)} |`,
      `| ${nombreArchivo(buildId)} | ${mb(archivo.bytes)} |`,
      `| Manifiesto | ${mb(fs.statSync(rutaManifiesto).size)} |`,
      "",
      `App mínima ${a.appMinima} · protocolo ${PROTOCOLO} · Node ${nodeMayor} · versión ${version || "?"} · commit ${commit || "?"}`,
    ].join("\n");
    console.log(resumen);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen + "\n");
    salidaGitHub({ build_id: buildId, manifiesto: rutaManifiesto, archivo: rutaArchivo });
    return { buildId, manifiesto: m, rutaArchivo, rutaManifiesto };
  } catch (e) {
    for (const f of dejados) fs.rmSync(f, { force: true });
    throw e;
  } finally {
    fs.rmSync(trabajo, { recursive: true, force: true });
  }
}

export function canal(a) {
  const m = JSON.parse(fs.readFileSync(path.resolve(a.manifiesto), "utf8"));
  const c = canalDe(m, fs.readFileSync(path.resolve(a.firma), "utf8"), a.base);
  fs.writeFileSync(path.resolve(a.salida), JSON.stringify(c, null, 2) + "\n");
  console.log(`· ${path.basename(a.salida)} → ${c.build_id} (${mb(c.bytes)})`);
  return c;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const a = leerArgs(process.argv.slice(2));
    if (a.orden === "armar") await armar(a);
    else if (a.orden === "canal") canal(a);
    else {
      const lista = JSON.parse(fs.readFileSync(path.resolve(a.assets), "utf8"));
      const borrar = aPodar(Array.isArray(lista) ? lista : lista.assets || [], a.guardar);
      fs.writeFileSync(path.resolve(a.salida), borrar.map((n) => `${n}\n`).join(""));
      console.log(`· ${borrar.length} archivos de capas viejas a borrar`);
    }
  } catch (e) {
    console.error(`[capa] ${e && e.message ? e.message : e}`);
    process.exit(1);
  }
}
