#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Canal de pruebas de las apps nativas (ACT1108A, 2026-11-08)
// ---------------------------------------------------------------------------
// Contrato: architecture/centro-versiones-1105.md §9. Lo usa native-build.yml con `canal=pruebas`.
//
// QUÉ: cada build de pruebas sale con su propia versión semver (`<base>-prueba.<n.º de ejecución>`,
// p. ej. 0.5.1-prueba.23, con base = la versión oficial + 1 parche) y se sube a UNA prerelease fija
// (`canal-pruebas`, nunca «Latest»), con dos manifiestos que miran las apps instaladas de pruebas:
//   · latest-prueba.json          → updater de Tauri (escritorio), firmado con la clave del updater
//                                   (es el latest.json de tauri-action con las notas de la prueba);
//   · latest-prueba-android.json  → { version, versionCode, apk, sha256, bytes, notas, pub_date }.
//
// versionCode de Android (Android solo instala ENCIMA un versionCode mayor o igual):
//   · c(v) = mayor·1 000 000 + menor·1 000 + parche (lo que calcula Tauri por defecto: 0.5.0 → 5000).
//   · oficial  = c(v) · 1000                (0.5.1 → 5 001 000)
//   · pruebas  ∈ [(c(base) − 1)·1000 + 1, c(base)·1000 − 1] y siempre mayor que la prueba anterior
//               (0.5.1-prueba.* → 5 000 001 … 5 000 999).
//   Así: oficial 0.5.0 (5000 de antes, o 5 000 000) < cualquier prueba de 0.5.1 < oficial 0.5.1.
//
// Uso (CI):
//   node canal-pruebas.mjs plan --conf tauri.conf.json --ejecucion N [--anterior <versionCode>]
//   node canal-pruebas.mjs sellar --conf tauri.conf.json [--cargo Cargo.toml] --version V --codigo N [--wix W]
//   node canal-pruebas.mjs sellar --conf tauri.conf.json --oficial
//   node canal-pruebas.mjs android --apk F --version V --codigo N --repo owner/repo [--notas-archivo F] --salida F
//   GITHUB_TOKEN=… REPO=… VERSION=… node canal-pruebas.mjs publicar [--notas-archivo F]
// ═══════════════════════════════════════════════════════════════════════════

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

export const ETIQUETA = "canal-pruebas";
export const MANIFIESTO_ESCRITORIO = "latest-prueba.json";
export const MANIFIESTO_ANDROID = "latest-prueba-android.json";
export const MARCA = "-prueba.";
export const REPO_POR_DEFECTO = "StarSeedSystem/starseed-system";
export const ENDPOINT_OFICIAL = `https://github.com/${REPO_POR_DEFECTO}/releases/latest/download/latest.json`;
export const ENDPOINT_PRUEBAS = `https://github.com/${REPO_POR_DEFECTO}/releases/download/${ETIQUETA}/${MANIFIESTO_ESCRITORIO}`;
export const FACTOR = 1000;
export const CODIGO_MAXIMO = 2_100_000_000;

const RE_SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** PURA. «0.5.1-prueba.3» → { mayor, menor, parche, pre }. null si no es semver. */
export function parsearSemver(v) {
  const m = RE_SEMVER.exec(String(v ?? "").trim());
  if (!m) return null;
  return { mayor: Number(m[1]), menor: Number(m[2]), parche: Number(m[3]), pre: m[4] ?? null };
}

function exigir(v) {
  const s = parsearSemver(v);
  if (!s) throw new Error(`«${v}» no es una versión semver`);
  return s;
}

/** PURA. La base de las pruebas: la oficial + 1 parche (0.5.0 → 0.5.1). Si ya trae prerelease, sin ella. */
export function baseDePrueba(versionOficial) {
  const s = exigir(versionOficial);
  return s.pre ? `${s.mayor}.${s.menor}.${s.parche}` : `${s.mayor}.${s.menor}.${s.parche + 1}`;
}

/** PURA. 0.5.0 + ejecución 23 → 0.5.1-prueba.23 */
export function versionDePrueba(versionOficial, ejecucion) {
  const n = Number(ejecucion);
  if (!Number.isInteger(n) || n < 1) throw new Error(`Número de ejecución no válido: «${ejecucion}»`);
  return `${baseDePrueba(versionOficial)}${MARCA}${n}`;
}

/** PURA. ¿Es una versión del canal de pruebas? */
export function esDePrueba(v) {
  return String(v ?? "").includes(MARCA) && parsearSemver(v) !== null;
}

/** PURA. El versionCode que Tauri calcula por defecto (sin la prerelease). */
export function codigoSemver(v) {
  const s = exigir(v);
  if (s.menor > 999 || s.parche > 999) throw new Error(`«${v}»: menor y parche deben ser < 1000 para el versionCode`);
  return s.mayor * 1_000_000 + s.menor * 1_000 + s.parche;
}

/** PURA. versionCode de un APK oficial: c(v) · 1000 (por encima de todas las pruebas de esa base). */
export function codigoAndroidOficial(v) {
  const c = codigoSemver(v) * FACTOR;
  if (c > CODIGO_MAXIMO) throw new Error(`versionCode ${c} pasa del máximo de Android (${CODIGO_MAXIMO})`);
  return c;
}

/** PURA. Rango de versionCode de las pruebas de una base. */
export function rangoPrueba(base) {
  const c = codigoSemver(base);
  if (c < 1) throw new Error(`La base «${base}» no puede tener pruebas`);
  return { min: (c - 1) * FACTOR + 1, max: c * FACTOR - 1 };
}

/**
 * PURA. versionCode de esta prueba: el mínimo del rango o, si la prueba anterior ya está en él, el
 * siguiente. Falla en alto si se acaba el rango (999 pruebas sobre la misma base: publica la oficial).
 */
export function codigoAndroidPrueba(base, anterior) {
  const { min, max } = rangoPrueba(base);
  const previo = Number(anterior);
  const n = Number.isInteger(previo) && previo >= min ? previo + 1 : min;
  if (n > max) throw new Error(`Se acabaron los versionCode de pruebas para ${base} (${min}…${max}): publica la versión oficial ${base} o sube la base.`);
  return n;
}

/** PURA. Versión del MSI de Windows (solo números: x.y.z.n, con n ≤ 65535). */
export function versionWix(base, ejecucion) {
  const s = exigir(base);
  if (s.mayor > 255 || s.menor > 255 || s.parche > 65535) throw new Error(`«${base}» no cabe en una versión de MSI`);
  return `${s.mayor}.${s.menor}.${s.parche}.${Number(ejecucion) % 65536}`;
}

/** PURA. El plan de una prueba (lo que sale como outputs del job). */
export function plan(versionOficial, ejecucion, anterior) {
  const base = baseDePrueba(versionOficial);
  return {
    version: versionDePrueba(versionOficial, ejecucion),
    base,
    codigo: codigoAndroidPrueba(base, anterior),
    wix: versionWix(base, ejecucion),
  };
}

/** PURA. tauri.conf.json sellado (no muta el original). */
export function sellarConf(conf, { version, codigo, wix } = {}) {
  const c = JSON.parse(JSON.stringify(conf));
  if (version) {
    exigir(version);
    c.version = version;
  }
  c.bundle ??= {};
  if (codigo != null) {
    const n = Number(codigo);
    if (!Number.isInteger(n) || n < 1 || n > CODIGO_MAXIMO) throw new Error(`versionCode no válido: «${codigo}»`);
    c.bundle.android = { ...(c.bundle.android ?? {}), versionCode: n };
  }
  if (wix) {
    c.bundle.windows ??= {};
    c.bundle.windows.wix = { ...(c.bundle.windows.wix ?? {}), version: wix };
  }
  // Una app de pruebas mira primero su canal y después el oficial (Rust lo decide igual en tiempo de
  // ejecución, por la versión: canal_actualizacion_logica.rs).
  if (version && esDePrueba(version) && c.plugins?.updater) {
    c.plugins.updater.endpoints = [ENDPOINT_PRUEBAS, ENDPOINT_OFICIAL];
  }
  return c;
}

/** PURA. Cargo.toml con la versión del [package] cambiada (solo esa línea). */
export function sellarCargo(texto, version) {
  exigir(version);
  const inicio = texto.indexOf("[package]");
  if (inicio < 0) throw new Error("Cargo.toml sin [package]");
  const siguiente = texto.indexOf("\n[", inicio + 1);
  const fin = siguiente < 0 ? texto.length : siguiente;
  const seccion = texto.slice(inicio, fin);
  const re = /^version\s*=\s*"[^"]*"/m;
  if (!re.test(seccion)) throw new Error("Cargo.toml sin version en [package]");
  return texto.slice(0, inicio) + seccion.replace(re, `version = "${version}"`) + texto.slice(fin);
}

/** PURA. latest-prueba-android.json */
export function manifiestoAndroid({ version, versionCode, apk, sha256, bytes, notas, fecha }) {
  exigir(version);
  if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error("versionCode no válido");
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//.test(apk)) throw new Error(`URL de APK no válida: ${apk}`);
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("sha256 no válido");
  return { version, versionCode, apk, sha256, bytes, notas: String(notas ?? ""), pub_date: fecha, canal: "pruebas" };
}

/** PURA. Nombre del archivo de una URL de descarga. */
export function nombreDeUrl(url) {
  return decodeURIComponent(String(url ?? "").split("?")[0].split("/").pop() || "");
}

/**
 * PURA. latest-prueba.json a partir del latest.json de tauri-action: misma versión que el plan y TODAS
 * sus plataformas con firma. `faltan` dice qué no vale (sin firma no se publica: el updater lo rechazaría).
 */
export function manifiestoEscritorio(latest, { version, notas }) {
  const faltan = [];
  if (!latest || typeof latest !== "object") return { faltan: ["no hay latest.json"], manifiesto: null };
  if (latest.version !== version && latest.version !== `v${version}`) faltan.push(`versión ${latest.version} ≠ ${version}`);
  const platforms = {};
  for (const [clave, p] of Object.entries(latest.platforms ?? {})) {
    if (!p || typeof p.signature !== "string" || !p.signature.trim() || typeof p.url !== "string") {
      faltan.push(`${clave}: sin firma o sin url`);
      continue;
    }
    platforms[clave] = { signature: p.signature, url: p.url };
  }
  if (!Object.keys(platforms).length) faltan.push("ninguna plataforma");
  return { faltan, manifiesto: { version, notes: String(notas ?? latest.notes ?? ""), pub_date: latest.pub_date ?? new Date().toISOString(), platforms } };
}

/**
 * PURA. Qué archivos de la prerelease sobran: todo lo que no sea uno de los dos manifiestos vigentes,
 * lo que estos apuntan (y sus .sig) o lo de la versión de esta ejecución. Así la prerelease solo guarda
 * la última prueba que funciona, aunque una plataforma falle en una ejecución.
 */
export function sobrantes(nombres, { escritorio, android, version }) {
  const conservar = new Set([MANIFIESTO_ESCRITORIO, MANIFIESTO_ANDROID]);
  for (const p of Object.values(escritorio?.platforms ?? {})) {
    const n = nombreDeUrl(p?.url);
    if (n) {
      conservar.add(n);
      conservar.add(`${n}.sig`);
    }
  }
  if (android?.apk) conservar.add(nombreDeUrl(android.apk));
  return nombres.filter((n) => !conservar.has(n) && !(version && n.includes(version)));
}

// ─────────────────────────────── CLI ───────────────────────────────

function args(lista) {
  const r = {};
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    if (!a.startsWith("--")) continue;
    const clave = a.slice(2);
    const sig = lista[i + 1];
    if (sig === undefined || sig.startsWith("--")) r[clave] = true;
    else {
      r[clave] = sig;
      i++;
    }
  }
  return r;
}

function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

function escribirJson(ruta, datos) {
  writeFileSync(ruta, JSON.stringify(datos, null, 2) + "\n");
}

const API = "https://api.github.com";

async function gh(ruta, opciones = {}) {
  const r = await fetch(ruta.startsWith("http") ? ruta : `${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
      ...(opciones.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${opciones.method || "GET"} ${ruta} → HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

async function contenido(repo, asset) {
  const r = await gh(`/repos/${repo}/releases/assets/${asset.id}`, { headers: { Accept: "application/octet-stream" } });
  return r.text();
}

/** Publica latest-prueba.json y limpia la prerelease (red: API de GitHub). Exportada para probarla. */
export async function publicar(o) {
  const { GITHUB_TOKEN, REPO, VERSION } = process.env;
  if (!GITHUB_TOKEN || !REPO || !VERSION) throw new Error("Faltan GITHUB_TOKEN, REPO o VERSION");
  const notas = o["notas-archivo"] ? readFileSync(o["notas-archivo"], "utf8").trim() : `Canal de pruebas · ${VERSION}`;
  const release = await (await gh(`/repos/${REPO}/releases/tags/${ETIQUETA}`)).json();
  if (!release.prerelease || release.draft) throw new Error(`La release ${ETIQUETA} debe ser una prerelease publicada (prerelease=${release.prerelease}, draft=${release.draft})`);
  let assets = Object.fromEntries(release.assets.map((a) => [a.name, a]));
  const lineas = [`### Canal de pruebas · ${VERSION}`, ""];
  let fallo = false;

  // 1) Escritorio: el latest.json de tauri-action pasa a latest-prueba.json (con las notas de la prueba).
  if (assets["latest.json"]) {
    const { faltan, manifiesto } = manifiestoEscritorio(JSON.parse(await contenido(REPO, assets["latest.json"])), { version: VERSION, notas });
    if (faltan.length && !Object.keys(manifiesto?.platforms ?? {}).length) {
      lineas.push(`- ✗ latest-prueba.json NO se publica: ${faltan.join(" · ")}`);
      fallo = true;
    } else {
      if (faltan.length) lineas.push(`- ⚠ fuera de latest-prueba.json: ${faltan.join(" · ")}`);
      if (assets[MANIFIESTO_ESCRITORIO]) await gh(`/repos/${REPO}/releases/assets/${assets[MANIFIESTO_ESCRITORIO].id}`, { method: "DELETE" });
      const subida = release.upload_url.replace(/\{.*\}$/, `?name=${MANIFIESTO_ESCRITORIO}`);
      await gh(subida, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(manifiesto, null, 2) });
      lineas.push(`- ✓ ${MANIFIESTO_ESCRITORIO}: ${VERSION} · ${Object.keys(manifiesto.platforms).join(", ")}`);
    }
    // Intermedio de tauri-action: fuera (la próxima prueba empieza limpia).
    await gh(`/repos/${REPO}/releases/assets/${assets["latest.json"].id}`, { method: "DELETE" });
  } else if (process.env.ESCRITORIO === "success") {
    lineas.push("- ✗ Los instaladores de escritorio salieron pero no hay latest.json firmado: ¿falta el secreto TAURI_SIGNING_PRIVATE_KEY?");
    fallo = true;
  } else {
    lineas.push(`- escritorio: ${process.env.ESCRITORIO || "sin compilar"} → latest-prueba.json se queda como estaba`);
  }

  // 2) Lo vigente tras publicar y 3) limpieza de lo que ya nadie apunta.
  const vivo = await (await gh(`/repos/${REPO}/releases/tags/${ETIQUETA}`)).json();
  assets = Object.fromEntries(vivo.assets.map((a) => [a.name, a]));
  const escritorio = assets[MANIFIESTO_ESCRITORIO] ? JSON.parse(await contenido(REPO, assets[MANIFIESTO_ESCRITORIO])) : null;
  const android = assets[MANIFIESTO_ANDROID] ? JSON.parse(await contenido(REPO, assets[MANIFIESTO_ANDROID])) : null;
  if (android) lineas.push(`- ${android.version === VERSION ? "✓" : "·"} ${MANIFIESTO_ANDROID}: ${android.version} (versionCode ${android.versionCode})`);
  else lineas.push(`- · ${MANIFIESTO_ANDROID}: todavía no hay`);
  if (process.env.ANDROID === "success" && android?.version !== VERSION) {
    lineas.push(`- ✗ El APK salió pero ${MANIFIESTO_ANDROID} no es de ${VERSION}`);
    fallo = true;
  }
  const quitar = sobrantes(Object.keys(assets), { escritorio, android, version: VERSION });
  for (const n of quitar) await gh(`/repos/${REPO}/releases/assets/${assets[n].id}`, { method: "DELETE" });
  lineas.push(`- limpieza: ${quitar.length ? quitar.join(", ") : "nada que quitar"}`);
  console.log(lineas.join("\n"));
  return { fallo, quitar, lineas };
}

async function main() {
  const [orden, ...resto] = process.argv.slice(2);
  const o = args(resto);
  if (orden === "plan") {
    const conf = leerJson(o.conf);
    const p = plan(conf.version, o.ejecucion, o.anterior === true ? undefined : o.anterior);
    for (const [k, v] of Object.entries(p)) console.log(`${k}=${v}`);
    return;
  }
  if (orden === "sellar") {
    const conf = leerJson(o.conf);
    const sellado = o.oficial
      ? sellarConf(conf, { codigo: codigoAndroidOficial(conf.version) })
      : sellarConf(conf, { version: o.version, codigo: o.codigo, wix: o.wix === true ? undefined : o.wix });
    escribirJson(o.conf, sellado);
    if (o.cargo && !o.oficial) writeFileSync(o.cargo, sellarCargo(readFileSync(o.cargo, "utf8"), o.version));
    console.log(`sellado: versión ${sellado.version} · versionCode ${sellado.bundle?.android?.versionCode}${sellado.bundle?.windows?.wix?.version ? ` · MSI ${sellado.bundle.windows.wix.version}` : ""}`);
    return;
  }
  if (orden === "android") {
    const datos = readFileSync(o.apk);
    const sha256 = createHash("sha256").update(datos).digest("hex");
    const repo = o.repo || REPO_POR_DEFECTO;
    const nombre = path.basename(o.apk);
    const m = manifiestoAndroid({
      version: o.version,
      versionCode: Number(o.codigo),
      apk: `https://github.com/${repo}/releases/download/${ETIQUETA}/${encodeURIComponent(nombre)}`,
      sha256,
      bytes: statSync(o.apk).size,
      notas: o["notas-archivo"] ? readFileSync(o["notas-archivo"], "utf8").trim() : (o.notas ?? ""),
      fecha: new Date().toISOString(),
    });
    escribirJson(o.salida, m);
    console.log(`${o.salida}: ${m.version} · versionCode ${m.versionCode} · ${m.bytes} bytes · sha256 ${sha256}`);
    return;
  }
  if (orden === "publicar") {
    // En rojo si algo no se pudo publicar (el resumen ya dice qué).
    if ((await publicar(o)).fallo) process.exitCode = 1;
    return;
  }
  throw new Error("Uso: canal-pruebas.mjs plan|sellar|android|publicar …");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  });
}
