#!/usr/bin/env node
/*
 * compactar-manifiestos.mjs — los `*_client-reference-manifest.js` del paquete nativo, sin repeticiones
 * (T13 · TAM1107A · 2026-11-07).
 * ════════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/apps-autonomas-sin-internet.md §6.1 · Lo usa preparar.mjs, SOLO sobre la copia que va
 * dentro de la app (`recursos/servidor`). La web publicada (Vercel) y el `.next` del repo no cambian.
 *
 *   node native/servidor-local/compactar-manifiestos.mjs <carpeta> [--simular]
 *
 * Por qué pesan tanto (Next 15.5, `build/webpack/plugins/flight-manifest-plugin.js`): hay uno por página y por
 * ruta de API. En memoria, todos los módulos de cliente de un mismo grupo de chunks comparten LA MISMA lista
 * `chunks` (la del layout raíz: ≈ 120 chunks, 244 cadenas) y cada alias ESM comparte el objeto de su módulo;
 * pero el plugin lo escribe con `JSON.stringify`, que repite esa lista entera en cada módulo: ≈ 295 módulos ×
 * 6 KB ≈ 0,85 MB por archivo × 291 archivos ≈ 252 MB. Next no tiene ninguna opción para cambiarlo.
 *
 * Qué hace: vuelve a escribir cada archivo como un JS que construye EXACTAMENTE el mismo objeto, con cada valor
 * repetido (lista u objeto) declarado una sola vez en una variable local; es decir, devuelve las referencias
 * compartidas que Next tenía en memoria al compilar. Next lo sigue leyendo igual (`evalManifest` de
 * `server/load-manifest.external.js`: `fs.readFileSync` + `vm.runInNewContext(texto, {})` + `deepFreeze`), sin
 * `require`, sin cargador y sin tocar nada al arrancar. De paso, Next gasta menos memoria y tiempo al cargar
 * cada página por primera vez.
 *
 * Seguro por archivo: se evalúan el original y el compacto como lo hace Next y se exige el MISMO JSON (con el
 * orden de las claves) y ninguna otra global; si algo no cuadra, no se gana o el archivo no es de los de Next,
 * se queda como estaba. Cada archivo se escribe aparte y se cambia de golpe (`rename`): nunca queda uno a medias.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const SUFIJO = "_client-reference-manifest.js";
export const GLOBAL = "__RSC_MANIFEST";
/** Por debajo de este JSON (bytes) no compensa una variable (`$1f` + coma ≈ 4–6 bytes por uso). */
export const MINIMO = 16;
/** Tope de tiempo para evaluar un manifiesto (Next no pone ninguno; aquí es solo para el empaquetado). */
const TOPE_MS = 20_000;

/** Evalúa el texto como lo hace Next (`evalManifest`): un contexto vacío, sin require ni process. */
export function evaluar(texto) {
  const contexto = {};
  vm.runInNewContext(texto, contexto, { timeout: TOPE_MS });
  return contexto;
}

/** El objeto `__RSC_MANIFEST` si el contexto solo tiene esa global y es un objeto; si no, null. */
function manifiestoDelContexto(contexto) {
  const claves = Object.keys(contexto);
  if (claves.length !== 1 || claves[0] !== GLOBAL) return null;
  const m = contexto[GLOBAL];
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  return m;
}

/**
 * Compacta el texto de un manifiesto. Puro (sin disco).
 * → `{ ok: true, texto, antes, despues, variables }` o `{ ok: false, motivo, antes, despues? }`.
 */
export function compactarTexto(texto, { minimo = MINIMO } = {}) {
  const antes = Buffer.byteLength(texto);
  // Una clave «__proto__» en un literal cambia el prototipo en vez de crear la propiedad: no se arriesga.
  if (texto.includes('"__proto__"')) return { ok: false, motivo: "lleva una clave __proto__", antes };
  let original;
  try {
    original = manifiestoDelContexto(evaluar(texto));
  } catch (e) {
    return { ok: false, motivo: `no se evalúa: ${e && e.message ? e.message : e}`, antes };
  }
  if (!original) return { ok: false, motivo: "no es un manifiesto de Next (otras globales o forma rara)", antes };
  const json = JSON.stringify(original);
  // Árbol JSON puro, con el orden de claves que verá Next.
  const datos = JSON.parse(json);

  // 1 · El JSON de cada valor compuesto y cuántas veces aparece.
  const jsonDe = new WeakMap();
  const veces = new Map();
  const serializar = (v) => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    const ya = jsonDe.get(v);
    if (ya !== undefined) return ya;
    const s = Array.isArray(v)
      ? "[" + v.map(serializar).join(",") + "]"
      : "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + serializar(v[k])).join(",") + "}";
    jsonDe.set(v, s);
    veces.set(s, (veces.get(s) || 0) + 1);
    return s;
  };
  for (const k of Object.keys(datos)) serializar(datos[k]);

  // 2 · Escribir: lo repetido (≥ 2 veces y ≥ minimo bytes) una sola vez, en una variable; los hijos antes que
  //     los padres (orden posterior), para que cada variable exista cuando se usa.
  const nombres = new Map();
  const declaraciones = [];
  const escribir = (v) => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    const s = jsonDe.get(v);
    const nombre = nombres.get(s);
    if (nombre) return nombre;
    const cuerpo = Array.isArray(v)
      ? "[" + v.map(escribir).join(",") + "]"
      : "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + escribir(v[k])).join(",") + "}";
    if (veces.get(s) >= 2 && s.length >= minimo) {
      const n = "$" + nombres.size.toString(36);
      nombres.set(s, n);
      declaraciones.push(n + "=" + cuerpo);
      return n;
    }
    return cuerpo;
  };
  const asignaciones = Object.keys(datos).map((k) => "m[" + JSON.stringify(k) + "]=" + escribir(datos[k]) + ";");
  const nuevo =
    `globalThis.${GLOBAL}=(globalThis.${GLOBAL}||{});(function(m){` +
    (declaraciones.length ? "var " + declaraciones.join(",") + ";" : "") +
    asignaciones.join("") +
    `})(globalThis.${GLOBAL});\n`;
  const despues = Buffer.byteLength(nuevo);
  if (despues >= antes) return { ok: false, motivo: "no gana nada", antes, despues };

  // 3 · Comprobar como lo leerá Next: mismo JSON (mismo orden) y ninguna otra global.
  let comprobado;
  try {
    comprobado = manifiestoDelContexto(evaluar(nuevo));
  } catch (e) {
    return { ok: false, motivo: `el compacto no se evalúa: ${e && e.message ? e.message : e}`, antes, despues };
  }
  if (!comprobado || JSON.stringify(comprobado) !== json) return { ok: false, motivo: "el compacto no da el mismo manifiesto", antes, despues };
  return { ok: true, texto: nuevo, antes, despues, variables: declaraciones.length };
}

function recorrer(dir, f, rel = "") {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) recorrer(dir, f, r);
    else if (e.isFile()) f(r, path.join(dir, r));
  }
}

/**
 * Compacta todos los manifiestos de cliente bajo `dir` (en el paquete: `<servidor>/.next/server`).
 * `simular`: no escribe nada (para medir). Nunca lanza por un archivo: lo deja como estaba y lo cuenta.
 */
export function compactarDirectorio(dir, { simular = false, minimo = MINIMO } = {}) {
  const r = { archivos: 0, compactados: 0, sinCambio: 0, bytesAntes: 0, bytesDespues: 0, fallos: [] };
  if (!fs.existsSync(dir)) return r;
  recorrer(dir, (rel, abs) => {
    if (!rel.endsWith(SUFIJO)) return;
    r.archivos++;
    const texto = fs.readFileSync(abs, "utf8");
    const c = compactarTexto(texto, { minimo });
    r.bytesAntes += c.antes;
    if (!c.ok) {
      r.sinCambio++;
      r.bytesDespues += c.antes;
      if (c.motivo !== "no gana nada") r.fallos.push({ archivo: rel, motivo: c.motivo });
      return;
    }
    if (!simular) {
      const tmp = `${abs}.compactando`;
      try {
        fs.writeFileSync(tmp, c.texto);
        fs.renameSync(tmp, abs);
      } catch (e) {
        fs.rmSync(tmp, { force: true });
        r.sinCambio++;
        r.bytesDespues += c.antes;
        r.fallos.push({ archivo: rel, motivo: `no se pudo escribir: ${e && e.message ? e.message : e}` });
        return;
      }
    }
    r.compactados++;
    r.bytesDespues += c.despues;
  });
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const simular = args.includes("--simular");
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    console.error("uso: node compactar-manifiestos.mjs <carpeta> [--simular]");
    process.exit(2);
  }
  const t0 = Date.now();
  const r = compactarDirectorio(path.resolve(dir), { simular });
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  console.log(
    `${simular ? "(simulado) " : ""}${r.compactados}/${r.archivos} manifiestos compactados: ${mb(r.bytesAntes)} → ${mb(r.bytesDespues)} en ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  for (const f of r.fallos) console.log(`  · se queda como estaba: ${f.archivo} (${f.motivo})`);
}
