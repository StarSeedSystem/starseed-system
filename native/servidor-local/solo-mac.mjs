#!/usr/bin/env node
/*
 * solo-mac.mjs — quita del build NATIVO lo que solo vive en la Mac de desarrollo (APP1107B · T8).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/apps-autonomas-sin-internet.md §6 · Lo usa SOLO el job `servidor-local-next`
 * de .github/workflows/native-build.yml, antes de `next build`. La web publicada y el CI normal no
 * cambian.
 *
 * Qué y por qué (comprobado el 2026-11-07):
 *   · `src/app/api/mando/**` (73 rutas): el motor de la consola de MetaGenesis. Lee y escribe el disco
 *     de la Mac (olas, colas del enjambre, registros) y lanza agentes. Fuera de la Mac la web publicada
 *     lo responde 404 y MetaGenesis llega a la Mac por su túnel (`/metagenesis` → MetaGenesisRemoto).
 *     En el servidor local de la app (127.0.0.1) su puerta `guardianMando` creería estar en «esta
 *     Mac» y lo abriría SIN sesión. Fuera: −62,6 MB sin comprimir de `.next/server/app`.
 *   · NO se quitan `/genesis`, `/metagenesis` ni `/poligenesis`: Mi Genesis y PoliGenesis son de cada
 *     persona, y `/metagenesis` se usa desde cualquier neurona (Supabase + túnel). Tampoco
 *     `/api/genesis/**`, `/api/metagenesis/orden` ni `/api/mcp/genesis`: funcionan igual en Vercel.
 *
 * Antes de borrar comprueba que NADA fuera de esas carpetas las importa; si algo lo hace, no borra,
 * avisa y sale con 0 (el build sigue igual que antes; el envoltorio responde 404 a /api/mando igual).
 *
 *   node native/servidor-local/solo-mac.mjs [--raiz <repo>] [--simular]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = path.resolve(AQUI, "..", "..");

/** Carpetas (relativas al repo) que no van en la app. */
export const RUTAS_SOLO_MAC = ["src/app/api/mando"];
const EXTENSIONES = /\.(c|m)?(t|j)sx?$/;
const ESPECIFICADORES = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`]([^"'`]+)["'`]/g;

function recorrer(dir, f) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name.startsWith(".git")) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(abs, f);
    else if (EXTENSIONES.test(e.name)) f(abs);
  }
}

function dentro(abs, carpeta) {
  const r = path.relative(carpeta, abs);
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
}

/** A qué ruta del disco apunta un import (`@/…` es `src/…`); null si es un paquete. */
export function resolverEspecificador(espec, desde, raiz) {
  if (espec.startsWith("@/")) return path.join(raiz, "src", espec.slice(2));
  if (espec.startsWith("./") || espec.startsWith("../")) return path.resolve(path.dirname(desde), espec);
  return null;
}

/** Archivos de fuera de `rutas` que importan algo de dentro. [{ archivo, especificador }] */
export function importadores(raiz, rutas = RUTAS_SOLO_MAC) {
  const carpetas = rutas.map((r) => path.join(raiz, r));
  const out = [];
  const mirar = (abs) => {
    if (carpetas.some((c) => dentro(abs, c))) return;
    const texto = fs.readFileSync(abs, "utf8");
    for (const m of texto.matchAll(ESPECIFICADORES)) {
      const destino = resolverEspecificador(m[1], abs, raiz);
      if (destino && carpetas.some((c) => dentro(destino, c))) out.push({ archivo: path.relative(raiz, abs), especificador: m[1] });
    }
  };
  recorrer(path.join(raiz, "src"), mirar);
  for (const suelto of ["middleware.ts", "next.config.ts", "instrumentation.ts"]) {
    const abs = path.join(raiz, suelto);
    if (fs.existsSync(abs)) mirar(abs);
  }
  return out;
}

function medir(dir) {
  let archivos = 0;
  let bytes = 0;
  const ir = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) ir(abs);
      else {
        archivos++;
        bytes += fs.statSync(abs).size;
      }
    }
  };
  if (fs.existsSync(dir)) ir(dir);
  return { archivos, bytes };
}

/** Quita las carpetas si nadie de fuera las importa. Nunca lanza por eso: lo devuelve. */
export function quitarSoloMac({ raiz = RAIZ_REPO, rutas = RUTAS_SOLO_MAC, simular = false } = {}) {
  const usos = importadores(raiz, rutas);
  if (usos.length) return { quitado: false, importadores: usos, carpetas: [] };
  const carpetas = [];
  for (const r of rutas) {
    const abs = path.join(raiz, r);
    if (!fs.existsSync(abs)) continue;
    carpetas.push({ ruta: r, ...medir(abs) });
    if (!simular) fs.rmSync(abs, { recursive: true, force: true });
  }
  return { quitado: !simular, importadores: [], carpetas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--raiz");
  const raiz = i >= 0 ? path.resolve(args[i + 1]) : RAIZ_REPO;
  const r = quitarSoloMac({ raiz, simular: args.includes("--simular") });
  const lineas = ["### Build nativo: lo que solo vive en la Mac (APP1107B · T8)", ""];
  if (r.importadores.length) {
    console.log(`::warning::No se quita nada: ${r.importadores.length} archivo(s) de fuera importan lo que solo vive en la Mac (el servidor local responde 404 a /api/mando igualmente).`);
    for (const u of r.importadores) lineas.push(`- ${u.archivo} importa \`${u.especificador}\``);
  } else {
    for (const c of r.carpetas) lineas.push(`- \`${c.ruta}\`: ${c.archivos} archivos fuente (${(c.bytes / 1024).toFixed(0)} KB) ${r.quitado ? "quitados" : "se quitarían"}`);
    if (!r.carpetas.length) lineas.push("- Nada que quitar (ya no estaba).");
  }
  const texto = lineas.join("\n");
  console.log(texto);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + "\n");
}
