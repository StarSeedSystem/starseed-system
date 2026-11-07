#!/usr/bin/env node
/*
 * preparar.mjs — arma el servidor local que va DENTRO de la app de escritorio (APP1107A, 2026-11-07).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/apps-autonomas-sin-internet.md · Lo usa .github/workflows/native-build.yml.
 *
 *   node native/servidor-local/preparar.mjs \
 *     --tar servidor-next.tar            # o --next <carpeta con .next/standalone, .next/static, public>
 *     --plataforma darwin-universal      # darwin-universal | darwin-arm64 | darwin-x64 | linux-x64 | win32-x64
 *     --conf native/src-tauri/tauri.conf.json   # se le añaden resources + externalBin (lo ÚLTIMO que se hace)
 *     [--node-local <binario>]           # pruebas: usa ese Node en vez de descargarlo (sin SHA del repo)
 *     [--sin-firma]                      # macOS: no firmar ad-hoc el Node
 *     [--src-tauri <dir>] [--cache <dir>]
 *
 * Deja:
 *   <src-tauri>/recursos/servidor/   standalone + .next/static + public + starseed-arranque.cjs + starseed-servidor.json
 *   <src-tauri>/binaries/starseed-node-<triple>[.exe]   (externalBin de Tauri: va junto al ejecutable)
 * El Node se descarga de nodejs.org y se compara con el SHA-256 FIJADO en node.json; en macOS se une
 * arm64 + x64 con `lipo` (la app es universal) y se firma ad-hoc (`codesign --sign -`), igual que el
 * binario de la app, sin certificados de pago. Si algo falla, borra lo que dejó a medias, no toca la
 * configuración y sale con 1: el build de la app sigue SIN servidor local (la app abre la web
 * publicada, como antes).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(AQUI, "..", "..");

export const TRIPLES = {
  "darwin-universal": ["universal-apple-darwin", "aarch64-apple-darwin", "x86_64-apple-darwin"],
  "darwin-arm64": ["aarch64-apple-darwin"],
  "darwin-x64": ["x86_64-apple-darwin"],
  "linux-x64": ["x86_64-unknown-linux-gnu"],
  "win32-x64": ["x86_64-pc-windows-msvc"],
};
export const ARCHIVOS_NODE = {
  "darwin-universal": ["darwin-arm64", "darwin-x64"],
  "darwin-arm64": ["darwin-arm64"],
  "darwin-x64": ["darwin-x64"],
  "linux-x64": ["linux-x64"],
  "win32-x64": ["win-x64"],
};
export const RECURSO = { origen: "recursos/servidor/", destino: "servidor/" };
export const EXTERNAL_BIN = "binaries/starseed-node";

// ───────────────────────────── Puro ─────────────────────────────

export function leerArgs(argv) {
  const a = { sinFirma: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--tar") a.tar = v();
    else if (k === "--next") a.next = v();
    else if (k === "--plataforma") a.plataforma = v();
    else if (k === "--conf") a.conf = v();
    else if (k === "--node-local") a.nodeLocal = v();
    else if (k === "--sin-firma") a.sinFirma = true;
    else if (k === "--src-tauri") a.srcTauri = v();
    else if (k === "--cache") a.cache = v();
    else throw new Error(`opción desconocida: ${k}`);
  }
  if (!a.plataforma || !TRIPLES[a.plataforma]) throw new Error(`--plataforma debe ser una de: ${Object.keys(TRIPLES).join(", ")}`);
  if (!a.tar === !a.next) throw new Error("hace falta --tar o --next (uno de los dos)");
  return a;
}

/** Nombres de los binarios externos que Tauri busca (con la tripleta; .exe en Windows). */
export function nombresBinario(plataforma) {
  const ext = plataforma.startsWith("win32") ? ".exe" : "";
  return TRIPLES[plataforma].map((t) => `starseed-node-${t}${ext}`);
}

/** ¿Se copia este archivo del standalone? `rel` con «/». Nunca un .env (podría llevar claves). */
export function seCopia(rel, { sinSharp }) {
  const partes = rel.split("/");
  const nombre = partes[partes.length - 1];
  if (partes.length === 1 && /^\.env(\..*)?$/.test(nombre)) return false;
  if (rel === ".next/cache" || rel.startsWith(".next/cache/")) return false;
  if (sinSharp && (rel === "node_modules/sharp" || rel.startsWith("node_modules/sharp/") || rel === "node_modules/@img" || rel.startsWith("node_modules/@img/"))) return false;
  return true;
}

/** Añade el servidor a la configuración de Tauri sin quitar nada de lo que ya tenga. */
export function parchearConf(conf) {
  const c = structuredClone(conf);
  c.bundle = c.bundle || {};
  const r = c.bundle.resources;
  if (Array.isArray(r) && r.length) throw new Error("bundle.resources es una lista: pásala a mapa antes de añadir el servidor local");
  c.bundle.resources = { ...(r && !Array.isArray(r) ? r : {}), [RECURSO.origen]: RECURSO.destino };
  const eb = Array.isArray(c.bundle.externalBin) ? c.bundle.externalBin : [];
  c.bundle.externalBin = eb.includes(EXTERNAL_BIN) ? eb : [...eb, EXTERNAL_BIN];
  return c;
}

export function mb(b) {
  return `${(b / 1048576).toFixed(1)} MB`;
}

// ───────────────────────────── Disco y procesos ─────────────────────────────

function ejecutar(cmd, args, opciones = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opciones });
  if (r.error || r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} → ${r.error ? r.error.message : `código ${r.status}`}: ${(r.stderr || "").trim().slice(0, 400)}`);
  }
  return (r.stdout || "").trim();
}

function tarDelSistema() {
  // En el runner de Windows, «tar» del bash es el GNU de Git (no abre .zip); el del sistema sí.
  if (process.platform === "win32") return path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  return "tar";
}

function sha256(ruta) {
  return createHash("sha256").update(fs.readFileSync(ruta)).digest("hex");
}

function recorrer(dir, f, rel = "") {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) recorrer(dir, f, r);
    else f(r, path.join(dir, r));
  }
}

function medir(dir) {
  let archivos = 0;
  let bytes = 0;
  recorrer(dir, (_r, abs) => {
    archivos++;
    bytes += fs.statSync(abs).size;
  });
  return { archivos, bytes };
}

async function descargar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`descarga ${url} → HTTP ${r.status}`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

async function nodeOficial(clave, manifiesto, cache, trabajo) {
  const a = manifiesto.archivos[clave];
  if (!a) throw new Error(`node.json no tiene ${clave}`);
  fs.mkdirSync(cache, { recursive: true });
  const archivo = path.join(cache, a.archivo);
  if (!fs.existsSync(archivo) || sha256(archivo) !== a.sha256) {
    console.log(`· descargando ${a.archivo}`);
    await descargar(`${manifiesto.base}/v${manifiesto.version}/${a.archivo}`, archivo);
  }
  const suma = sha256(archivo);
  if (suma !== a.sha256) throw new Error(`SHA-256 de ${a.archivo} no coincide con node.json (${suma})`);
  console.log(`· ${a.archivo}: SHA-256 verificado`);
  const dir = path.join(trabajo, clave);
  fs.mkdirSync(dir, { recursive: true });
  ejecutar(tarDelSistema(), ["-xf", archivo, "-C", dir, a.binario]);
  const bin = path.join(dir, a.binario);
  if (!fs.existsSync(bin)) throw new Error(`no salió ${a.binario} de ${a.archivo}`);
  return bin;
}

// ───────────────────────────── Armar ─────────────────────────────

export async function preparar(a) {
  const srcTauri = path.resolve(a.srcTauri || path.join(RAIZ_REPO, "native", "src-tauri"));
  const destino = path.join(srcTauri, "recursos", "servidor");
  const dirBin = path.join(srcTauri, "binaries");
  const nombres = nombresBinario(a.plataforma);
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), "ss-preparar-"));
  const limpiarAMedias = () => {
    fs.rmSync(destino, { recursive: true, force: true });
    for (const n of nombres) fs.rmSync(path.join(dirBin, n), { force: true });
  };
  try {
    // 1 · El build de Next.
    let base = a.next ? path.resolve(a.next) : null;
    if (a.tar) {
      base = path.join(trabajo, "next");
      fs.mkdirSync(base, { recursive: true });
      ejecutar(tarDelSistema(), ["-xf", path.resolve(a.tar), "-C", base]);
    }
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

    // 2 · Copiar: standalone (sin .env ni caché; sin sharp si las imágenes no se optimizan) + static + public.
    limpiarAMedias();
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
    fs.copyFileSync(path.join(AQUI, "starseed-arranque.cjs"), path.join(destino, "starseed-arranque.cjs"));
    const envSueltos = fs.readdirSync(destino).filter((n) => /^\.env(\..*)?$/.test(n));
    if (envSueltos.length) throw new Error(`quedó un .env en el servidor: ${envSueltos.join(", ")}`);

    // 3 · Node oficial (o el local de las pruebas).
    const manifiestoNode = JSON.parse(fs.readFileSync(path.join(AQUI, "node.json"), "utf8"));
    let bin;
    let versionNode = manifiestoNode.version;
    if (a.nodeLocal) {
      bin = path.resolve(a.nodeLocal);
      versionNode = ejecutar(bin, ["--version"]).replace(/^v/, "") + " (local, sin SHA del repo)";
      console.log(`· Node local para pruebas: ${bin}`);
    } else {
      const piezas = [];
      for (const clave of ARCHIVOS_NODE[a.plataforma]) piezas.push(await nodeOficial(clave, manifiestoNode, a.cache || path.join(os.tmpdir(), "starseed-node-cache"), trabajo));
      if (piezas.length > 1) {
        bin = path.join(trabajo, "node-universal");
        ejecutar("lipo", ["-create", ...piezas, "-output", bin]);
        const archs = ejecutar("lipo", ["-archs", bin]);
        if (!/arm64/.test(archs) || !/x86_64/.test(archs)) throw new Error(`lipo dejó ${archs}`);
        console.log(`· Node universal (${archs})`);
      } else bin = piezas[0];
    }
    fs.mkdirSync(dirBin, { recursive: true });
    const primero = path.join(dirBin, nombres[0]);
    fs.copyFileSync(bin, primero);
    fs.chmodSync(primero, 0o755);
    if (a.plataforma.startsWith("darwin") && !a.sinFirma) {
      ejecutar("codesign", ["--force", "--sign", "-", "--timestamp=none", primero]);
      ejecutar("codesign", ["--verify", "--strict", primero]);
      console.log("· Node firmado ad-hoc (codesign --sign -), como el binario de la app");
    }
    for (const n of nombres.slice(1)) {
      fs.copyFileSync(primero, path.join(dirBin, n));
      fs.chmodSync(path.join(dirBin, n), 0o755);
    }
    if (!a.plataforma.startsWith("win32") || process.platform === "win32") {
      const v = ejecutar(primero, ["--version"]);
      console.log(`· ${nombres[0]} responde ${v}`);
    }

    // 4 · Manifiesto del paquete.
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
    const tam = medir(destino);
    const tamNode = fs.statSync(primero).size;
    const manifiesto = {
      version,
      commit,
      buildId: fs.readFileSync(path.join(destino, ".next", "BUILD_ID"), "utf8").trim(),
      node: versionNode,
      plataforma: a.plataforma,
      imagenes: sinSharp ? "sin-optimizar" : "sharp",
      archivos: tam.archivos,
      bytes: tam.bytes,
      bytesNode: tamNode,
      creado: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(destino, "starseed-servidor.json"), JSON.stringify(manifiesto, null, 2) + "\n");

    // 5 · Lo último: la configuración de Tauri (solo si todo lo anterior salió bien).
    if (a.conf) {
      const ruta = path.resolve(a.conf);
      const nueva = parchearConf(JSON.parse(fs.readFileSync(ruta, "utf8")));
      fs.writeFileSync(ruta, JSON.stringify(nueva, null, 2) + "\n");
      console.log(`· ${path.basename(ruta)}: bundle.resources + bundle.externalBin`);
    }

    const resumen = [
      `### Servidor local de la app (${a.plataforma})`,
      "",
      "| Pieza | Archivos | Tamaño sin comprimir |",
      "|---|---:|---:|",
      `| Servidor (standalone + static + public) | ${tam.archivos} | ${mb(tam.bytes)} |`,
      `| Node ${versionNode} (${nombres[0]}) | 1 | ${mb(tamNode)} |`,
      `| **Total** | ${tam.archivos + 1} | **${mb(tam.bytes + tamNode)}** |`,
      "",
      `Imágenes: ${sinSharp ? "sin optimizar (sin sharp)" : "con sharp"} · build ${manifiesto.buildId} · commit ${commit || "?"}`,
    ].join("\n");
    console.log(resumen);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen + "\n");
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `servidor_local=si\nbytes_servidor=${tam.bytes + tamNode}\n`);
    return manifiesto;
  } catch (e) {
    limpiarAMedias();
    throw e;
  } finally {
    fs.rmSync(trabajo, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await preparar(leerArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(`[preparar] el servidor local NO se arma: ${e && e.message ? e.message : e}`);
    console.error("[preparar] la app se construye igual, sin servidor local (abrirá la web publicada).");
    process.exit(1);
  }
}
