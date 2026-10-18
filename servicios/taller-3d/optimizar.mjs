#!/usr/bin/env node
/* Taller 3D · OPTIMIZADOR POR DESTINO (G3D1011C) · contrato: architecture/astraura-avatares-3d.md §11.
 * Aplica a un GLB un `PlanOptimizacion` (planOptimizacion, src/lib/avatares/adn/optimizacion.ts): suelda, un GLB
 * por nivel de `lods`, texturas a `texturaPx` (0 = sin texturas), atlas, meshopt, original y manifiesto.json.
 * Solo CPU, sin red y un trabajo cada vez (A1 y Mac). Librerías SOLO aquí: `cd servicios/taller-3d && npm install`
 * (glTF Transform y meshoptimizer, MIT; sharp, Apache-2.0, con libvips LGPL-3.0 enlazada aparte: uso comercial libre).
 * Uso: node optimizar.mjs <entrada.glb> <plan.json> <carpeta-salida>  (0 bien · 1 fallo · 2 uso · 3 ocupado) */
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const pesoMB = (bytes) => Math.round((bytes / (1024 * 1024)) * 1000) / 1000;
/** Problemas del plan, en español claro (lista vacía si vale). */
export function problemasDelPlan(p) {
  if (!p || typeof p !== "object") return ["el plan no es un objeto JSON"];
  const lods = Array.isArray(p.lods) ? p.lods : [];
  const lodsMal = !lods.length || lods.some((t, i) => !Number.isInteger(t) || t < 1 || (i > 0 && t >= lods[i - 1]));
  return [
    [lodsMal, "«lods» debe ser una lista de triángulos enteros positivos, de mayor a menor"],
    [!Number.isInteger(p.texturaPx) || p.texturaPx < 0, "«texturaPx» debe ser un entero ≥ 0 (0 = sin texturas)"],
    [p.compresion !== "ninguna" && p.compresion !== "meshopt", "«compresion» debe ser «ninguna» o «meshopt»"],
    [typeof p.atlas !== "boolean" || typeof p.conservarOriginal !== "boolean", "«atlas» y «conservarOriginal» deben ser true o false"],
    [typeof p.pesoMaxMB !== "number" || !(p.pesoMaxMB > 0), "«pesoMaxMB» debe ser un número mayor que 0"],
  ].filter(([malo]) => malo).map(([, texto]) => texto);
}

/** Cabecera GLB: firma «glTF», versión 2 y longitud que cuadra con los bytes recibidos. */
export function comprobarGlb(b) {
  const v = b instanceof Uint8Array && b.byteLength >= 20 ? new DataView(b.buffer, b.byteOffset, b.byteLength) : null;
  if (!v || v.getUint32(0, true) !== 0x46546c67) throw new Error("La entrada no es un GLB (falta la firma «glTF»).");
  if (v.getUint32(4, true) !== 2) throw new Error(`GLB de versión ${v.getUint32(4, true)}: solo se admite glTF 2.0.`);
  if (v.getUint32(8, true) !== b.byteLength) throw new Error("El GLB está cortado o le sobran bytes (su cabecera no cuadra).");
}
/** Aplica el plan con `motor` (crearMotorGltf o uno simulado) y `escribir(nombre, datos)`. Todo va en memoria y
 *  solo se escribe si TODOS los niveles caben en `pesoMaxMB`. */
export async function optimizar({ glb, plan, motor, escribir }) {
  const mal = problemasDelPlan(plan);
  if (mal.length) throw new Error(`Plan de optimización no válido: ${mal.join("; ")}.`);
  comprobarGlb(glb);
  const [avisos, lods, base] = [[], [], await motor.leer(glb)];
  const triangulosOriginal = motor.triangulos(base);
  await motor.soldar(base);
  await (plan.texturaPx === 0 ? motor.quitarTexturas(base) : motor.redimensionar(base, plan.texturaPx));
  if (plan.atlas) avisos.push(...(await motor.atlas(base)));
  const total = motor.triangulos(base);
  const baseGlb = await motor.escribir(base);
  for (const [i, objetivo] of plan.lods.entries()) {
    const doc = await motor.leer(baseGlb); // cada nivel sale del soldado, no del anterior: menos error acumulado
    if (objetivo < total) await motor.simplificar(doc, objetivo / total);
    else avisos.push(`Nivel ${i}: la malla ya tiene ${total} triángulos (objetivo ${objetivo}); va tal cual.`);
    const triangulos = motor.triangulos(doc);
    if (triangulos > objetivo * 1.05) avisos.push(`Nivel ${i}: se quedó en ${triangulos} triángulos (objetivo ${objetivo}).`);
    if (plan.compresion === "meshopt") await motor.meshopt(doc);
    const datos = await motor.escribir(doc);
    const peso = pesoMB(datos.byteLength);
    if (peso > plan.pesoMaxMB)
      throw new Error(`El nivel ${i} (${triangulos} triángulos) pesa ${peso} MB y el destino «${plan.destino}» permite ${plan.pesoMaxMB} MB: no se ha escrito nada. Baja «texturaPx» o los triángulos del plan.`);
    lods.push({ triangulos, objetivo, archivo: `lod${i}.glb`, pesoMB: peso, datos });
  }
  if (plan.cerrada) avisos.push("No se mide si la malla sigue cerrada (watertight) tras simplificar: la cerró el remallador (§11.1) y meshoptimizer conserva la topología, pero no se ha comprobado.");
  const original = { archivo: "original.glb", triangulos: triangulosOriginal, pesoMB: pesoMB(glb.byteLength) };
  const manifiesto = { destino: plan.destino ?? null, compresion: plan.compresion, atlas: plan.atlas, texturaPx: plan.texturaPx,
    lods: lods.map(({ datos, ...nivel }) => nivel), ...(plan.conservarOriginal ? { original } : {}), avisos };
  for (const l of lods) await escribir(l.archivo, l.datos);
  if (plan.conservarOriginal) await escribir(original.archivo, glb);
  await escribir("manifiesto.json", `${JSON.stringify(manifiesto, null, 2)}\n`);
  return manifiesto;
}

/** Motor real: glTF Transform + meshoptimizer + sharp. Si faltan, lo dice y cómo instalarlas (nada simulado). */
export async function crearMotorGltf(cargar = (m) => import(m)) {
  const nombres = ["@gltf-transform/core", "@gltf-transform/extensions", "@gltf-transform/functions", "meshoptimizer", "sharp"];
  const [core, ext, fn, mo, { default: sharp }] = await Promise.all(nombres.map(cargar)).catch((e) => {
    throw new Error(`Faltan las librerías del taller 3D en esta neurona (${e.message}). Instálalas solo aquí: cd servicios/taller-3d && npm install`); });
  const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = mo;
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const io = new core.NodeIO().setLogger(new core.Logger(core.Logger.Verbosity.WARN)).registerExtensions(ext.ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
  const triangulos = (d) => d.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMode() === core.Primitive.Mode.TRIANGLES)
    .reduce((n, p) => n + Math.floor(((p.getIndices() ?? p.getAttribute("POSITION"))?.getCount() ?? 0) / 3), 0);
  return {
    leer: (b) => io.readBinary(b), escribir: (d) => io.writeBinary(d), triangulos,
    soldar: (d) => d.transform(fn.weld()),
    // error 1 = sin tope de error: manda el presupuesto de triángulos de cada nivel de avatar de XR.
    simplificar: (d, ratio) => d.transform(fn.simplify({ simplifier: MeshoptSimplifier, ratio, error: 1 }), fn.prune()),
    redimensionar: (d, px) => d.transform(fn.textureCompress({ encoder: sharp, resize: [px, px] })),
    quitarTexturas: (d) => (d.getRoot().listTextures().forEach((t) => t.dispose()), d.transform(fn.prune())),
    atlas: async (d) => {
      const antes = d.getRoot().listMaterials().length;
      await d.transform(fn.dedup(), fn.palette({ min: 2 }), fn.flatten(), fn.join(), fn.prune());
      const despues = d.getRoot().listMaterials().length;
      return despues > 1 ? [`Atlas parcial: ${antes} materiales → ${despues}. Los que llevan textura propia no se unen: glTF Transform no hornea atlas de texturas (hay que rehornear las UV, p. ej. en Blender).`] : [];
    },
    meshopt: (d) => d.transform(fn.meshopt({ encoder: MeshoptEncoder })),
  };
}

/** Un trabajo cada vez por neurona: cerrojo con el pid; si su dueño murió, se recoge. */
export async function tomarCerrojo(ruta, intento = 0) {
  try { await writeFile(ruta, String(process.pid), { flag: "wx" }); return true; } catch (e) { if (e.code !== "EEXIST") throw e; if (intento) return false; }
  const pid = Number(await readFile(ruta, "utf8").catch(() => "0"));
  try { if (pid > 0 && process.kill(pid, 0)) return false; } catch (e) { if (e.code === "EPERM") return false; }
  return rm(ruta, { force: true }).then(() => tomarCerrojo(ruta, 1));
}
async function principal([entrada, rutaPlan, salida]) {
  if (!salida) return console.error("Uso: node optimizar.mjs <entrada.glb> <plan.json> <carpeta-salida>"), 2;
  if (resolve(dirname(entrada)) === resolve(salida) && /^(lod\d+\.glb|original\.glb|manifiesto\.json)$/.test(basename(entrada))) return console.error("La entrada está en la carpeta de salida con un nombre que se reescribiría: elige otra carpeta de salida."), 2;
  const cerrojo = join(tmpdir(), "starseed-taller3d-optimizar.lock");
  if (!(await tomarCerrojo(cerrojo))) return console.error("Ya hay una optimización en marcha en esta neurona: un trabajo cada vez."), 3;
  try {
    const [glb, plan] = await Promise.all([readFile(entrada), readFile(rutaPlan, "utf8").then((t) => { try { return JSON.parse(t); } catch { throw new Error("el plan no es un JSON válido"); } })]);
    const escribir = async (n, datos) => (await mkdir(salida, { recursive: true }), writeFile(join(salida, n), datos));
    const m = await optimizar({ glb, plan, motor: await crearMotorGltf(), escribir }); // la carpeta solo nace si todo cupo
    console.log([...m.lods.map((l) => `${l.archivo}: ${l.triangulos} triángulos · ${l.pesoMB} MB`), ...m.avisos.map((a) => `Aviso: ${a}`)].join("\n"));
    return 0;
  } catch (e) { return console.error(`No se pudo optimizar: ${e.code === "ENOENT" ? `no existe «${e.path}»` : e.message}`), 1; } finally { await rm(cerrojo, { force: true }); }
}
// Por la ruta real: lanzado desde el enlace del «bin» (node_modules/.bin) también arranca, en vez de callar.
if (process.argv[1] && import.meta.url === pathToFileURL(await realpath(process.argv[1]).catch(() => process.argv[1])).href) process.exitCode = await principal(process.argv.slice(2));
