#!/usr/bin/env node
/*
 * preparar-android.mjs — mete el servidor local DENTRO de la APK de StarSeed OS (AND1107A, 2026-11-07).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/apps-autonomas-sin-internet.md §9.1. Lo usa .github/workflows/native-build.yml
 * SOLO con el interruptor encendido (input `servidor_local_android` o variable del repo
 * STARSEED_SERVIDOR_LOCAL_ANDROID=1); sin él no corre y la APK sale como siempre.
 *
 *   node native/servidor-local/preparar-android.mjs \
 *     --tar servidor-next.tar | --next <carpeta>   # el MISMO artefacto `servidor-local-next` que escritorio
 *     --proyecto native/src-tauri/gen/android        # después de `cargo tauri android init`
 *     --conf native/src-tauri/tauri.android.conf.json  # la ventana empieza en la página de arranque
 *     [--abis arm64-v8a,armeabi-v7a,x86_64]          # por defecto las tres de nodejs-mobile
 *     [--ndk <dir>]                                  # por defecto NDK_HOME / ANDROID_NDK_HOME / ANDROID_NDK_ROOT
 *     [--nodejs-mobile-zip <zip>] [--licencia <archivo>]  # sin red (los SHA-256 se comprueban igual)
 *     [--cache <dir>] [--lib <nombre>]               # --lib: por defecto el [lib] de Cargo.toml
 *     [--nodejs-mobile-json <json>]                  # solo pruebas: otro manifiesto (otro SHA-256)
 *
 * Deja en el proyecto Android (y nada más):
 *   app/src/main/jniLibs/<abi>/libnode.so          nodejs-mobile verificado por SHA-256 (sin símbolos de depuración)
 *   app/src/main/jniLibs/<abi>/libc++_shared.so    del NDK (libnode la necesita)
 *   app/src/main/assets/servidor-local/servidor.zip        standalone + .next/static + public + envoltorio
 *   app/src/main/assets/servidor-local/paquete.properties  buildId, tamaños, versión de nodejs-mobile
 *   app/src/main/assets/servidor-local/LICENSE-nodejs-mobile.txt
 *   app/src/main/java/app/starseed/nativa/ServidorLocal.kt + ServidorLocalLogica.kt
 *   app/src/main/res/xml/starseed_red_local.xml    HTTP en claro SOLO hacia 127.0.0.1 / localhost
 *   AndroidManifest.xml  (+ proveedor ArranqueServidorLocal + networkSecurityConfig, entre marcadores)
 *   app/build.gradle.kts (+ .so comprimidas en el APK y una sola libc++_shared.so, entre marcadores)
 * y en --conf la ventana pasa a `index.html` (native/arranque) como en escritorio.
 * Si algo falla, deshace TODO lo que tocó y sale con 1: la APK se construye igual, sin servidor local.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { seCopia, mb } from "./preparar.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(AQUI, "..", "..");
const SRC_TAURI = path.join(RAIZ_REPO, "native", "src-tauri");

/** Lo que el envoltorio necesita a su lado (lo mismo que copia preparar.mjs; una prueba lo vigila). */
export const ARCHIVOS_ENVOLTORIO = ["starseed-arranque.cjs", "migracion-origen.js", "guarda.cjs", "puerta.cjs"];
export const KOTLIN = ["ServidorLocal.kt", "ServidorLocalLogica.kt"];
export const PAQUETE_KOTLIN = "app/starseed/nativa";
export const DIR_ASSETS = "servidor-local";
export const RED_LOCAL = "starseed_red_local";
const MARCA_INICIO = "STARSEED-SERVIDOR-LOCAL:INICIO (no editar: lo escribe native/servidor-local/preparar-android.mjs · AND1107A)";
const MARCA_FIN = "STARSEED-SERVIDOR-LOCAL:FIN";

// ───────────────────────────── Puro ─────────────────────────────

export function leerArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--tar") a.tar = v();
    else if (k === "--next") a.next = v();
    else if (k === "--proyecto") a.proyecto = v();
    else if (k === "--conf") a.conf = v();
    else if (k === "--abis") a.abis = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--ndk") a.ndk = v();
    else if (k === "--nodejs-mobile-zip") a.zipNodejs = v();
    else if (k === "--licencia") a.licencia = v();
    else if (k === "--cache") a.cache = v();
    else if (k === "--lib") a.lib = v();
    else if (k === "--nodejs-mobile-json") a.manifiestoNodejs = v(); // pruebas: otro manifiesto (otro SHA)
    else throw new Error(`opción desconocida: ${k}`);
  }
  if (!a.tar === !a.next) throw new Error("hace falta --tar o --next (uno de los dos)");
  if (!a.proyecto) throw new Error("hace falta --proyecto (el de `cargo tauri android init`)");
  return a;
}

/** El nombre de la librería Rust (`[lib] name` de Cargo.toml): Kotlin la carga por ese nombre. */
export function nombreLib(cargoToml) {
  const m = String(cargoToml).match(/^\[lib\][^[]*?^\s*name\s*=\s*"([A-Za-z0-9_]+)"/m);
  if (!m) throw new Error("Cargo.toml no tiene [lib] name");
  return m[1];
}

function quitarBloque(texto, inicio, fin) {
  const a = texto.indexOf(inicio);
  const b = texto.indexOf(fin);
  if (a === -1 || b === -1 || b < a) return texto;
  const desde = texto.lastIndexOf("\n", a) + 1;
  let hasta = texto.indexOf("\n", b);
  hasta = hasta === -1 ? texto.length : hasta + 1;
  return texto.slice(0, desde) + texto.slice(hasta);
}

export function bloqueProveedor() {
  return [
    `        <!-- ${MARCA_INICIO} -->`,
    "        <provider",
    '            android:name="app.starseed.nativa.ArranqueServidorLocal"',
    '            android:authorities="${applicationId}.starseed-servidor-local"',
    '            android:exported="false"',
    '            android:initOrder="90" />',
    `        <!-- ${MARCA_FIN} -->`,
    "",
  ].join("\n");
}

/** Proveedor + `android:networkSecurityConfig` en <application>. Idempotente; nunca pisa otra red. */
export function parchearManifiesto(texto) {
  let t = quitarBloque(String(texto), `<!-- ${MARCA_INICIO}`, `<!-- ${MARCA_FIN} -->`);
  const app = t.indexOf("<application");
  if (app === -1) throw new Error("el AndroidManifest.xml no tiene <application>: ¿cambió la plantilla de Tauri?");
  const finEtiqueta = t.indexOf(">", app);
  const etiqueta = t.slice(app, finEtiqueta);
  const red = etiqueta.match(/android:networkSecurityConfig="([^"]*)"/);
  if (red && red[1] !== `@xml/${RED_LOCAL}`) throw new Error(`el manifiesto ya tiene otra networkSecurityConfig (${red[1]}): no se pisa`);
  if (!red) {
    const tras = app + "<application".length;
    t = `${t.slice(0, tras)}\n        android:networkSecurityConfig="@xml/${RED_LOCAL}"${t.slice(tras)}`;
  }
  const cierre = t.lastIndexOf("</application>");
  if (cierre === -1 || cierre < app) throw new Error("el AndroidManifest.xml no tiene </application>");
  const linea = t.lastIndexOf("\n", cierre) + 1;
  return t.slice(0, linea) + bloqueProveedor() + t.slice(linea);
}

export const RED_LOCAL_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Lo escribe native/servidor-local/preparar-android.mjs (AND1107A). HTTP en claro SOLO hacia el
     servidor local de la app (127.0.0.1 y localhost); todo lo demás, solo HTTPS, como sin él. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
    </domain-config>
</network-security-config>
`;

export function bloqueGradle() {
  return [
    `// ${MARCA_INICIO}`,
    "// libnode.so (nodejs-mobile) pesa ≈ 60 MB por ABI sin comprimir: las .so van COMPRIMIDAS en el APK",
    "// (Android las extrae al instalar) y una sola libc++_shared.so por ABI.",
    "android {",
    "    packaging {",
    "        jniLibs {",
    "            useLegacyPackaging = true",
    '            pickFirsts += "**/libc++_shared.so"',
    "        }",
    "    }",
    "}",
    `// ${MARCA_FIN}`,
    "",
  ].join("\n");
}

export function parchearGradle(texto) {
  const t = quitarBloque(String(texto), `// ${MARCA_INICIO}`, `// ${MARCA_FIN}`);
  return `${t.replace(/\n*$/, "\n")}\n${bloqueGradle()}`;
}

/** La ventana de Android empieza en la página de arranque (native/arranque), como en escritorio. */
export function parchearConfAndroid(conf) {
  const c = structuredClone(conf || {});
  c.build = { ...(c.build || {}), frontendDist: "../arranque" };
  c.app = c.app || {};
  const ventanas = Array.isArray(c.app.windows) && c.app.windows.length ? c.app.windows : [{ label: "main", title: "StarSeed OS" }];
  const i = Math.max(0, ventanas.findIndex((v) => v.label === "main"));
  ventanas[i] = { ...ventanas[i], label: "main", url: "index.html" };
  c.app.windows = ventanas;
  return c;
}

/** `paquete.properties` (java.util.Properties): claves simples; `\`, saltos y `=`/`:` escapados. */
export function propiedades(obj) {
  const esc = (v) => String(v).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/([=:])/g, "\\$1");
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${esc(v)}`)
    .join("\n") + "\n";
}

export function hostNdk(plataforma = process.platform) {
  if (plataforma === "darwin") return "darwin-x86_64";
  if (plataforma === "win32") return "windows-x86_64";
  return "linux-x86_64";
}

export function rutasNdk(ndk, abi, triples, plataforma = process.platform) {
  const pre = path.join(ndk, "toolchains", "llvm", "prebuilt", hostNdk(plataforma));
  const t = triples[abi];
  if (!t) throw new Error(`ABI sin soporte en nodejs-mobile: ${abi}`);
  return {
    libcxx: path.join(pre, "sysroot", "usr", "lib", t, "libc++_shared.so"),
    strip: path.join(pre, "bin", plataforma === "win32" ? "llvm-strip.exe" : "llvm-strip"),
  };
}

// ───────────────────────────── Disco y procesos ─────────────────────────────

function ejecutar(cmd, args, opciones = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opciones });
  if (r.error || r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} → ${r.error ? r.error.message : `código ${r.status}`}: ${(r.stderr || "").trim().slice(0, 400)}`);
  }
  return (r.stdout || "").trim();
}

function sha256(ruta) {
  return createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");
}

function medir(dir) {
  let archivos = 0;
  let bytes = 0;
  const ir = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) ir(r);
      else {
        archivos++;
        bytes += fs.statSync(path.join(dir, r)).size;
      }
    }
  };
  ir("");
  return { archivos, bytes };
}

async function descargar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`descarga ${url} → HTTP ${r.status}`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

/** Un archivo con su SHA-256 fijado: de la caché, de `local` o descargado. Siempre se comprueba. */
async function verificado({ url, sha256: esperado, nombre }, cache, local) {
  let ruta = local ? path.resolve(local) : path.join(cache, nombre);
  if (!local && (!fs.existsSync(ruta) || sha256(ruta) !== esperado)) {
    fs.mkdirSync(cache, { recursive: true });
    console.log(`· descargando ${url}`);
    await descargar(url, ruta);
  }
  const suma = sha256(ruta);
  if (suma !== esperado) throw new Error(`SHA-256 de ${nombre} no coincide con nodejs-mobile.json (${suma})`);
  console.log(`· ${nombre}: SHA-256 verificado`);
  return ruta;
}

/** Copia del build de Next lo que va en la app (como preparar.mjs) a `destino`. */
function armarServidor(base, destino) {
  const standalone = path.join(base, ".next", "standalone");
  const estaticos = path.join(base, ".next", "static");
  const publico = path.join(base, "public");
  for (const [p, que] of [[path.join(standalone, "server.js"), "server.js del standalone"], [path.join(standalone, ".next", "BUILD_ID"), ".next/BUILD_ID del standalone"], [estaticos, ".next/static"]]) {
    if (!fs.existsSync(p)) throw new Error(`falta ${que} (${p}): ¿se compiló con output: 'standalone'?`);
  }
  let sinSharp = false;
  try {
    const rsf = JSON.parse(fs.readFileSync(path.join(standalone, ".next", "required-server-files.json"), "utf8"));
    sinSharp = rsf?.config?.images?.unoptimized === true;
  } catch {}
  fs.mkdirSync(destino, { recursive: true });
  fs.cpSync(standalone, destino, {
    recursive: true,
    dereference: true,
    filter: (src) => {
      const rel = path.relative(standalone, src).split(path.sep).join("/");
      return rel === "" || seCopia(rel, { sinSharp });
    },
  });
  fs.cpSync(estaticos, path.join(destino, ".next", "static"), { recursive: true, dereference: true });
  if (fs.existsSync(publico)) fs.cpSync(publico, path.join(destino, "public"), { recursive: true, dereference: true });
  for (const f of ARCHIVOS_ENVOLTORIO) fs.copyFileSync(path.join(AQUI, f), path.join(destino, f));
  const envSueltos = fs.readdirSync(destino).filter((n) => /^\.env(\..*)?$/.test(n));
  if (envSueltos.length) throw new Error(`quedó un .env en el servidor: ${envSueltos.join(", ")}`);
  return { sinSharp, buildId: fs.readFileSync(path.join(destino, ".next", "BUILD_ID"), "utf8").trim() };
}

/** Registro de lo tocado, para deshacerlo todo si algo falla. */
function deshacedor() {
  const originales = new Map();
  const nuevos = new Set();
  return {
    escribir(ruta, contenido) {
      if (!originales.has(ruta) && !nuevos.has(ruta)) {
        if (fs.existsSync(ruta)) originales.set(ruta, fs.readFileSync(ruta));
        else nuevos.add(ruta);
      }
      fs.mkdirSync(path.dirname(ruta), { recursive: true });
      fs.writeFileSync(ruta, contenido);
    },
    copiar(origen, ruta) {
      this.escribir(ruta, fs.readFileSync(origen));
    },
    deshacer() {
      for (const r of nuevos) fs.rmSync(r, { force: true });
      for (const [r, c] of originales) fs.writeFileSync(r, c);
    },
  };
}

// ───────────────────────────── Armar ─────────────────────────────

export async function prepararAndroid(a) {
  const nm = JSON.parse(fs.readFileSync(a.manifiestoNodejs ? path.resolve(a.manifiestoNodejs) : path.join(AQUI, "nodejs-mobile.json"), "utf8"));
  const abis = a.abis && a.abis.length ? a.abis : Object.keys(nm.abis);
  for (const abi of abis) if (!nm.abis[abi]) throw new Error(`ABI sin soporte en nodejs-mobile: ${abi} (hay: ${Object.keys(nm.abis).join(", ")})`);
  const proyecto = path.resolve(a.proyecto);
  const principal = path.join(proyecto, "app", "src", "main");
  const rutaManifiesto = path.join(principal, "AndroidManifest.xml");
  const rutaGradle = path.join(proyecto, "app", "build.gradle.kts");
  for (const p of [rutaManifiesto, rutaGradle]) if (!fs.existsSync(p)) throw new Error(`falta ${p}: ¿se corrió \`cargo tauri android init\`?`);
  const ndk = a.ndk || process.env.NDK_HOME || process.env.ANDROID_NDK_HOME || process.env.ANDROID_NDK_ROOT;
  if (!ndk || !fs.existsSync(ndk)) throw new Error("no encuentro el NDK (--ndk o NDK_HOME): hace falta su libc++_shared.so");
  const lib = a.lib || nombreLib(fs.readFileSync(path.join(SRC_TAURI, "Cargo.toml"), "utf8"));
  const cache = a.cache || path.join(os.tmpdir(), "starseed-nodejs-mobile-cache");
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), "ss-preparar-android-"));
  const d = deshacedor();
  try {
    // 1 · El servidor (el mismo build de Next que escritorio) en un zip para los assets.
    let base = a.next ? path.resolve(a.next) : null;
    if (a.tar) {
      base = path.join(trabajo, "next");
      fs.mkdirSync(base, { recursive: true });
      ejecutar("tar", ["-xf", path.resolve(a.tar), "-C", base]);
    }
    const dirServidor = path.join(trabajo, "servidor");
    const { sinSharp, buildId } = armarServidor(base, dirServidor);
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(buildId) || buildId === "." || buildId === "..") throw new Error(`BUILD_ID raro: ${JSON.stringify(buildId)}`);
    let version = null;
    try {
      version = JSON.parse(fs.readFileSync(path.join(RAIZ_REPO, "package.json"), "utf8")).version || null;
    } catch {}
    let commit = process.env.GITHUB_SHA || null;
    if (!commit) {
      try {
        commit = ejecutar("git", ["rev-parse", "HEAD"], { cwd: RAIZ_REPO });
      } catch {}
    }
    fs.writeFileSync(
      path.join(dirServidor, "starseed-servidor.json"),
      JSON.stringify({ version, commit, buildId, node: `nodejs-mobile ${nm.version} (Node ${nm.node})`, plataforma: "android", imagenes: sinSharp ? "sin-optimizar" : "sharp", creado: new Date().toISOString() }, null, 2) + "\n",
    );
    const tam = medir(dirServidor);
    const zipServidor = path.join(trabajo, "servidor.zip");
    ejecutar("zip", ["-r", "-9", "-q", "-X", zipServidor, "."], { cwd: dirServidor });
    const bytesZip = fs.statSync(zipServidor).size;
    console.log(`· servidor: ${tam.archivos} archivos, ${mb(tam.bytes)} → servidor.zip ${mb(bytesZip)}`);

    // 2 · nodejs-mobile (SHA-256 fijado) y su licencia.
    const zipNm = await verificado({ url: nm.url, sha256: nm.sha256, nombre: path.basename(new URL(nm.url).pathname) }, cache, a.zipNodejs);
    const licencia = await verificado({ url: nm.licencia.url, sha256: nm.licencia.sha256, nombre: `LICENSE-nodejs-mobile-${nm.version}.txt` }, cache, a.licencia);

    // 3 · Las .so por ABI: libnode (sin símbolos de depuración: −22 MB por ABI) y libc++_shared del NDK.
    const libs = [];
    for (const abi of abis) {
      const r = rutasNdk(ndk, abi, nm.abis);
      if (!fs.existsSync(r.libcxx)) throw new Error(`el NDK no tiene ${r.libcxx}`);
      const tmp = path.join(trabajo, "libnode", abi);
      fs.mkdirSync(tmp, { recursive: true });
      ejecutar("unzip", ["-o", "-j", "-q", zipNm, `bin/${abi}/libnode.so`, "-d", tmp]);
      let so = path.join(tmp, "libnode.so");
      if (!fs.existsSync(so)) throw new Error(`no salió bin/${abi}/libnode.so del zip de nodejs-mobile`);
      const crudo = fs.statSync(so).size;
      if (fs.existsSync(r.strip)) {
        const limpio = path.join(tmp, "libnode.limpia.so");
        ejecutar(r.strip, ["--strip-unneeded", "-o", limpio, so]);
        so = limpio;
      }
      const destino = path.join(principal, "jniLibs", abi);
      d.copiar(so, path.join(destino, "libnode.so"));
      d.copiar(r.libcxx, path.join(destino, "libc++_shared.so"));
      const bytes = fs.statSync(so).size;
      const comprimido = zlib.deflateRawSync(fs.readFileSync(so), { level: 6 }).length;
      libs.push({ abi, crudo, bytes, comprimido, libcxx: fs.statSync(r.libcxx).size });
      console.log(`· ${abi}: libnode.so ${mb(crudo)} → ${mb(bytes)} (≈ ${mb(comprimido)} comprimida en el APK)`);
    }

    // 4 · Assets, Kotlin, red local, manifiesto, Gradle.
    const assets = path.join(principal, "assets", DIR_ASSETS);
    d.copiar(zipServidor, path.join(assets, "servidor.zip"));
    d.copiar(licencia, path.join(assets, "LICENSE-nodejs-mobile.txt"));
    d.escribir(
      path.join(assets, "paquete.properties"),
      propiedades({ build_id: buildId, version, commit, bytes: tam.bytes, archivos: tam.archivos, bytes_zip: bytesZip, nodejs_mobile: nm.version, node: nm.node, abis: abis.join(","), creado: new Date().toISOString() }),
    );
    for (const k of KOTLIN) {
      const t = fs.readFileSync(path.join(SRC_TAURI, "android", k), "utf8").replaceAll("{{LIB}}", lib);
      d.escribir(path.join(principal, "java", PAQUETE_KOTLIN, k), t);
    }
    d.escribir(path.join(principal, "res", "xml", `${RED_LOCAL}.xml`), RED_LOCAL_XML);
    d.escribir(rutaManifiesto, parchearManifiesto(fs.readFileSync(rutaManifiesto, "utf8")));
    d.escribir(rutaGradle, parchearGradle(fs.readFileSync(rutaGradle, "utf8")));

    // 5 · Lo último: la ventana a la página de arranque (solo si todo lo anterior salió bien).
    if (a.conf) {
      const ruta = path.resolve(a.conf);
      d.escribir(ruta, JSON.stringify(parchearConfAndroid(JSON.parse(fs.readFileSync(ruta, "utf8"))), null, 2) + "\n");
      console.log(`· ${path.basename(ruta)}: la ventana empieza en index.html (página de arranque)`);
    }

    const sumaLibs = libs.reduce((s, l) => s + l.comprimido + l.libcxx / 2, 0);
    const resumen = [
      "### Servidor local DENTRO de la APK (AND1107A · nodejs-mobile " + nm.version + ")",
      "",
      "| Pieza | Sin comprimir | En el APK (≈) |",
      "|---|---:|---:|",
      `| Servidor (${tam.archivos} archivos: standalone + static + public) | ${mb(tam.bytes)} | ${mb(bytesZip)} (servidor.zip) |`,
      ...libs.map((l) => `| libnode.so ${l.abi} (de ${mb(l.crudo)} con depuración) + libc++_shared.so | ${mb(l.bytes + l.libcxx)} | ${mb(l.comprimido + l.libcxx / 2)} |`),
      `| **Aumento estimado del APK** | | **≈ ${mb(bytesZip + sumaLibs)}** |`,
      "",
      `Build ${buildId} · commit ${commit || "?"} · imágenes ${sinSharp ? "sin optimizar" : "con sharp"} · el tamaño REAL del APK firmado sale en el paso «tamaño del APK».`,
      `En el aparato, la primera vez de cada versión se extraen ${mb(tam.bytes)} en noBackupFilesDir/servidor-local/${buildId}.`,
    ].join("\n");
    console.log(resumen);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen + "\n");
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `servidor_local=si\nbytes_zip=${bytesZip}\n`);
    return { buildId, tam, bytesZip, libs, lib };
  } catch (e) {
    d.deshacer();
    throw e;
  } finally {
    fs.rmSync(trabajo, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await prepararAndroid(leerArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(`[preparar-android] el servidor local NO va en la APK: ${e && e.message ? e.message : e}`);
    console.error("[preparar-android] se deshizo todo lo tocado: la APK se construye igual, sin servidor local (abre la web publicada).");
    process.exit(1);
  }
}
