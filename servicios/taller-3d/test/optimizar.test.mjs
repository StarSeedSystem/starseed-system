// Pruebas del optimizador por destino (G3D1011C): sin red; el GLB se genera aquí. Solo la última usa dos temporales y un proceso.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comprobarGlb, crearMotorGltf, optimizar, pesoMB, problemasDelPlan, tomarCerrojo } from "../optimizar.mjs";

/** GLB 2.0 pequeño: rejilla n×n SIN soldar (cada triángulo con sus 3 vértices) y un material. */
function glbRejilla(n) {
  const pos = [], v = (x, y) => pos.push(x / n, y / n, 0);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) (v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y), v(x + 1, y + 1), v(x, y + 1));
  const bin = new Uint8Array(new Float32Array(pos).buffer);
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], materials: [{ name: "piel" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 4 }] }], buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteLength: bin.length, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
  }));
  const jl = Math.ceil(json.length / 4) * 4;
  const glb = new Uint8Array(28 + jl + bin.length), dv = new DataView(glb.buffer);
  [[0, 0x46546c67], [4, 2], [8, glb.length], [12, jl], [16, 0x4e4f534a], [20 + jl, bin.length], [24 + jl, 0x004e4942]]
    .forEach(([at, valor]) => dv.setUint32(at, valor, true));
  glb.fill(0x20, 20, 20 + jl).set(json, 20), glb.set(bin, 28 + jl);
  return glb;
}
const jsonDe = (glb) => JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer, glb.byteOffset).getUint32(12, true))));

/** Motor simulado: lee de verdad el JSON del GLB (cuántos triángulos trae) y anota cada paso en orden. */
function motorSimulado({ bytesPorTriangulo = 10, tamanos = [] } = {}) {
  const pasos = [];
  return {
    pasos,
    leer: async (b) => (pasos.push("leer"), b.doc ? { ...b.doc } : { tri: jsonDe(b).accessors[0].count / 3 }),
    escribir: async (d) => {
      const datos = new Uint8Array(tamanos.shift() ?? Math.round(d.tri * bytesPorTriangulo * (d.comprimido ? 0.5 : 1)));
      return (pasos.push("escribir"), Object.assign(datos, { doc: { ...d } }));
    },
    triangulos: (d) => d.tri,
    soldar: async () => pasos.push("soldar"),
    simplificar: async (d, ratio) => (pasos.push(`simplificar ${ratio}`), (d.tri = Math.round(d.tri * ratio))),
    redimensionar: async (_d, px) => pasos.push(`texturas ${px}`), quitarTexturas: async () => pasos.push("sin texturas"),
    atlas: async () => (pasos.push("atlas"), ["Atlas parcial: 3 materiales → 2."]),
    meshopt: async (d) => (pasos.push("meshopt"), (d.comprimido = true)),
  };
}
const disco = () => { const archivos = new Map(); return { archivos, escribir: async (nombre, datos) => void archivos.set(nombre, datos) }; };
// La misma forma que planOptimizacion("bot") de src/lib/avatares/adn/optimizacion.ts (20k → 8k → 2k).
const planBot = { destino: "bot", prioridad: "rapidez", generador: { resolucion: 512, pocaMemoria: false },
  remallado: { caras: 20_000, modo: "organico" }, lods: [20_000, 8_000, 2_000], texturaPx: 1024,
  compresion: "meshopt", atlas: true, conservarOriginal: false, cerrada: true, pesoMaxMB: 4 };

test("plan, GLB o librerías que faltan: mensaje claro y no se escribe nada", async () => {
  assert.deepEqual(problemasDelPlan(planBot), []);
  const malo = { ...planBot, lods: [2_000, 8_000], compresion: "draco", pesoMaxMB: 0, atlas: "sí" };
  assert.equal(problemasDelPlan(malo).length, 4);
  const { archivos, escribir } = disco();
  await assert.rejects(optimizar({ glb: glbRejilla(2), plan: malo, motor: motorSimulado(), escribir }), /mayor a menor.*«meshopt»/);
  assert.throws(() => comprobarGlb(new TextEncoder().encode("esto es texto y no un modelo 3D")), /no es un GLB/);
  assert.throws(() => comprobarGlb(glbRejilla(2).subarray(0, 40)), /cortado/);
  await assert.rejects(crearMotorGltf(async (m) => { throw new Error(`Cannot find package '${m}'`); }), /Faltan las librerías.*npm install/);
  assert.equal(archivos.size, 0);
});

test("bot: suelda, texturas, atlas y un GLB por nivel con meshopt; el manifiesto dice lo medido", async () => {
  const motor = motorSimulado();
  const { archivos, escribir } = disco();
  const m = await optimizar({ glb: glbRejilla(100), plan: planBot, motor, escribir });
  assert.deepEqual(motor.pasos.filter((p) => p !== "leer" && p !== "escribir"),
    ["soldar", "texturas 1024", "atlas", "meshopt", "simplificar 0.4", "meshopt", "simplificar 0.1", "meshopt"]);
  assert.deepEqual([...archivos.keys()], ["lod0.glb", "lod1.glb", "lod2.glb", "manifiesto.json"]);
  assert.deepEqual(m.lods.map((l) => [l.archivo, l.triangulos, l.objetivo]), [["lod0.glb", 20000, 20000], ["lod1.glb", 8000, 8000], ["lod2.glb", 2000, 2000]]);
  assert.equal(m.lods[1].pesoMB, pesoMB(8000 * 10 * 0.5));
  assert.equal(m.original, undefined);
  assert.match(m.avisos.join(" "), /Atlas parcial.*cerrada/);
  assert.deepEqual(JSON.parse(archivos.get("manifiesto.json")), m);
});

test("impresión: sin texturas ni meshopt ni atlas; el original va intacto y con su peso", async () => {
  const plan = { ...planBot, destino: "impresion", lods: [500_000], texturaPx: 0, compresion: "ninguna", atlas: false, conservarOriginal: true, pesoMaxMB: 100 };
  const [glb, motor, { archivos, escribir }] = [glbRejilla(10), motorSimulado(), disco()];
  const m = await optimizar({ glb, plan, motor, escribir });
  assert.ok(motor.pasos.includes("sin texturas"));
  assert.ok(!motor.pasos.some((p) => /texturas \d|atlas|meshopt|simplificar/.test(p)));
  assert.equal(archivos.get("original.glb"), glb);
  assert.deepEqual(m.original, { archivo: "original.glb", triangulos: 200, pesoMB: pesoMB(glb.length) });
  assert.match(m.avisos[0], /200 triángulos.*tal cual/);
});

test("un nivel que pasa de pesoMaxMB: error que dice cuál y cuánto, y ningún archivo a medias", async () => {
  const { archivos, escribir } = disco();
  const motor = motorSimulado({ tamanos: [1000, 1000, 5_000_000] }); // base, nivel 0 y nivel 1
  await assert.rejects(optimizar({ glb: glbRejilla(100), plan: planBot, motor, escribir }),
    /nivel 1 \(8000 triángulos\) pesa 4\.768 MB y el destino «bot» permite 4 MB: no se ha escrito nada/);
  assert.equal(archivos.size, 0);
});

test("un trabajo cada vez (choca con su dueño vivo, recoge el de uno muerto) y el «bin» arranca por su enlace", async () => {
  const [cerrojo, enlace] = ["cerrojo.lock", "bin.mjs"].map((n) => join(tmpdir(), `G3D1011C-${process.pid}-${n}`));
  const conDuenoVivo = [await tomarCerrojo(cerrojo), await tomarCerrojo(cerrojo)]; // el segundo choca con este proceso
  await writeFile(cerrojo, "999999999").then(() => symlink(new URL("../optimizar.mjs", import.meta.url), enlace)); // pid que no existe
  try { assert.deepEqual([...conDuenoVivo, await tomarCerrojo(cerrojo), spawnSync(process.execPath, [enlace]).status], [true, false, true, 2]); }
  finally { await Promise.all([cerrojo, enlace].map((r) => rm(r, { force: true }))); } // sin argumentos: uso y código 2 (antes callaba con 0)
});
const real = await crearMotorGltf().catch((e) => e);
test("motor real (glTF Transform + meshoptimizer): suelda, simplifica y comprime de verdad",
  { skip: real instanceof Error ? `sin librerías en esta neurona: ${real.message}` : false }, async () => {
    const { archivos, escribir } = disco();
    const m = await optimizar({ glb: glbRejilla(20), plan: { ...planBot, lods: [800, 200, 50] }, motor: real, escribir });
    assert.ok(m.lods[2].triangulos < m.lods[1].triangulos && m.lods[1].triangulos < m.lods[0].triangulos);
    for (const l of m.lods) {
      const bytes = archivos.get(l.archivo);
      assert.ok(l.triangulos <= l.objetivo, `${l.archivo}: ${l.triangulos} triángulos`);
      assert.ok(jsonDe(bytes).extensionsUsed.includes("EXT_meshopt_compression"));
      assert.equal(real.triangulos(await real.leer(bytes)), l.triangulos); // se vuelve a leer y decodificar
    }
    const posiciones = (await real.leer(archivos.get("lod0.glb"))).getRoot().listAccessors().find((a) => a.getType() === "VEC3");
    assert.equal(posiciones.getCount(), 21 * 21); // soldado de verdad: 2400 vértices sueltos → 441
  });
