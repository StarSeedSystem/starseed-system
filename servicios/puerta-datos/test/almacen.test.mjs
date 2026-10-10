import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { abrirAlmacen, podar } from "../src/almacen.mjs";
import { crearArriendo } from "../src/arriendo.mjs";
import { crearBus, validarEvento } from "../src/bus.mjs";
import { crearFichero, huella, nuevaFicha, revocarFicha } from "../src/fichas.mjs";
import { crearMalla } from "../src/malla.mjs";
import { crearMetricas } from "../src/metricas.mjs";
import { crearPresencia, EN_LINEA_MS } from "../src/presencia.mjs";
import { CUENTA, OTRA, reloj } from "./ayudas.mjs";

const LLAVE_A = "a".repeat(40);
const LLAVE_B = "b".repeat(40);

test("fichas: en disco solo la huella; revocar corta al momento; ámbitos cerrados", () => {
  const dir = mkdtempSync(join(tmpdir(), "puerta-fichas-"));
  const ruta = join(dir, "tokens.json");
  const ficha = nuevaFicha(ruta, "astraura-mac", ["malla", "astraura"]);
  const crudo = readFileSync(ruta, "utf8");
  assert.ok(!crudo.includes(ficha), "la ficha no puede estar en el archivo");
  assert.ok(crudo.includes(huella(ficha)));
  assert.equal(statSync(ruta).mode & 0o777, 0o640);
  const f = crearFichero(ruta);
  assert.deepEqual(f.comprobar(ficha), { nombre: "astraura-mac", ambitos: ["malla", "astraura"] });
  assert.equal(f.comprobar(`${ficha.slice(0, -1)}x`), null);
  assert.equal(f.comprobar("pd_corta"), null);
  assert.throws(() => nuevaFicha(ruta, "x", ["todo"]), /ámbitos|nombre/);
  revocarFicha(ruta, "astraura-mac");
  f.recargar(true);
  assert.equal(f.comprobar(ficha), null);
});

test("bus: contrato de relevo_eventos, cursor, silenciosos sin réplica y espera larga", async () => {
  const db = abrirAlmacen(":memory:");
  const bus = crearBus(db);
  assert.throws(() => validarEvento({ quien: "x".repeat(41), tipo: "a" }), /quien/);
  assert.throws(() => validarEvento({ quien: "a", tipo: "b", texto: "x".repeat(4001) }), /texto/);
  assert.throws(() => validarEvento({ quien: "a", tipo: "b", datos: { x: "y".repeat(17_000) } }), /16 KB/);
  const a = bus.publicar({ quien: "enjambre", tipo: "integrada", texto: "T1 integrada", tarea: "T1" });
  bus.publicar({ quien: "nodo", tipo: "mg_latido", texto: "" });
  const r = bus.leer({ desde: 0 });
  assert.equal(r.eventos.length, 2);
  assert.equal(r.eventos[0].id, a);
  assert.equal(db.prepare("SELECT count(*) AS n FROM eventos WHERE replicar = 1").get().n, 1);
  assert.equal(bus.leer({ desde: r.ultimo }).eventos.length, 0);
  assert.equal(bus.leer({ tipos: ["integrada"] }).eventos.length, 1);
  assert.equal(bus.leer({ excluir: ["mg_latido"] }).eventos.length, 1);
  // Espera larga: llega un evento mientras se espera.
  const t0 = Date.now();
  const espera = bus.leerEsperando({ desde: r.ultimo }, 5);
  setTimeout(() => bus.publicar({ quien: "vigia", tipo: "aviso", texto: "hola" }), 50);
  const nuevo = await espera;
  assert.equal(nuevo.eventos.length, 1);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(bus.esperandoAhora(), 0);
});

test("arriendo: mismas reglas que metagenesis_nodo_latir", () => {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const ar = crearArriendo(db, { ahora });
  ar.registrar("mac-a1b2c3", "mac", huella(LLAVE_A));
  ar.registrar("oracle-a1-d4e5f6", "oracle-a1", huella(LLAVE_B));
  assert.throws(() => ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_B }), /llave/);
  // Toma con el arriendo libre.
  let r = ar.latir({ nodo: "oracle-a1-d4e5f6", llave: LLAVE_B, puntos: 250, ttl_s: 900 });
  assert.equal(r.arriendo.lider, "oracle-a1-d4e5f6");
  assert.equal(r.arriendo.termino, 1);
  // La Mac llega con más puntos pero aún no es estable: no lo quita.
  r = ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: 500 });
  assert.equal(r.arriendo.lider, "oracle-a1-d4e5f6");
  assert.equal(r.nodos.length, 2);
  // Racha de 10 min: relevo ordenado (+100 puntos).
  ahora.avanzar(601_000);
  ar.latir({ nodo: "oracle-a1-d4e5f6", llave: LLAVE_B, puntos: 250 });
  r = ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: 500 });
  assert.equal(r.arriendo.lider, "mac-a1b2c3");
  assert.equal(r.arriendo.termino, 2);
  // Renovar no sube el término.
  r = ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: 500 });
  assert.equal(r.arriendo.termino, 2);
  // Ceder: con puntos negativos no lo vuelve a tomar; el otro sí.
  assert.equal(ar.ceder({ nodo: "mac-a1b2c3", llave: LLAVE_A }), true);
  ahora.avanzar(1000);
  r = ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: -10 });
  assert.equal(r.arriendo.lider, "mac-a1b2c3"); // sigue escrito, pero caducado
  r = ar.latir({ nodo: "oracle-a1-d4e5f6", llave: LLAVE_B, puntos: 250 });
  assert.equal(r.arriendo.lider, "oracle-a1-d4e5f6");
  assert.equal(r.arriendo.termino, 3);
  // Caduca si el líder calla más que el TTL.
  ahora.avanzar(901_000);
  r = ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: 300 });
  assert.equal(r.arriendo.lider, "mac-a1b2c3");
  // Foto solo del líder vigente.
  assert.equal(ar.foto({ nodo: "oracle-a1-d4e5f6", llave: LLAVE_B, foto: { x: 1 } }), false);
  assert.equal(ar.foto({ nodo: "mac-a1b2c3", llave: LLAVE_A, foto: { x: 1 } }), true);
  // Revocar: la llave deja de valer y el arriendo caduca.
  ar.revocar("mac-a1b2c3");
  assert.throws(() => ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A }), /llave/);
});

test("órdenes: lista blanca, 30/hora por cuenta, las toma el destinatario una sola vez", () => {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const ar = crearArriendo(db, { ahora });
  ar.registrar("mac-a1b2c3", "mac", huella(LLAVE_A));
  ar.registrar("oracle-a1-d4e5f6", "oracle-a1", huella(LLAVE_B));
  ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: 300 });
  assert.throws(() => ar.crearOrden(CUENTA, { accion: "borrar_todo" }), /acción/);
  assert.throws(() => ar.crearOrden(CUENTA, { accion: "lanzar_cola", args: { cola: "../etc" } }), /cola/);
  assert.throws(() => ar.crearOrden(CUENTA, { accion: "continuar", args: { sh: "rm" } }), /argumento/);
  const id = ar.crearOrden(CUENTA, { accion: "revisar_bloqueadas" });
  ar.crearOrden(CUENTA, { accion: "reactivar", para: "oracle-a1" });
  let r = ar.latir({ nodo: "oracle-a1-d4e5f6", llave: LLAVE_B, puntos: 250 });
  assert.deepEqual(r.ordenes.map((o) => o.accion), ["reactivar"]);
  r = ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: 300 });
  assert.deepEqual(r.ordenes.map((o) => o.id), [id]);
  r = ar.latir({ nodo: "mac-a1b2c3", llave: LLAVE_A, puntos: 300 });
  assert.equal(r.ordenes.length, 0);
  assert.equal(ar.resultadoOrden({ nodo: "oracle-a1-d4e5f6", llave: LLAVE_B, id, estado: "hecha" }), false);
  assert.equal(ar.resultadoOrden({ nodo: "mac-a1b2c3", llave: LLAVE_A, id, estado: "hecha", resultado: "ok" }), true);
  for (let i = 0; i < 28; i++) ar.crearOrden(CUENTA, { accion: "continuar" });
  assert.throws(() => ar.crearOrden(CUENTA, { accion: "continuar" }), /demasiadas/);
  assert.ok(ar.crearOrden(OTRA, { accion: "continuar" }) > 0);
  // Sin tomar en 15 min: caducan.
  ahora.avanzar(16 * 60_000);
  ar.latir({ nodo: "oracle-a1-d4e5f6", llave: LLAVE_B, puntos: 250 });
  assert.ok(db.prepare("SELECT count(*) AS n FROM ordenes_mg WHERE estado = 'caducada'").get().n >= 1);
});

test("presencia y neuronas: cada cuenta ve las suyas; os_presencia respeta «visible»", () => {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const p = crearPresencia(db, { ahora });
  p.latirNeurona(CUENTA, { neurona: "mac-abc", medio: "web", senales: { bateria: 80 } });
  p.latirNeurona(OTRA, { neurona: "movil-xyz", medio: "pwa" });
  assert.throws(() => p.latirNeurona(CUENTA, { neurona: "../../x y" }), /neurona/);
  assert.throws(() => p.latirNeurona(CUENTA, { neurona: "a", senales: { x: "y".repeat(5000) } }), /señales/);
  assert.deepEqual(p.neuronasDe(CUENTA).map((n) => n.neurona), ["mac-abc"]);
  assert.equal(p.neuronasDe(CUENTA)[0].en_linea, true);
  ahora.avanzar(EN_LINEA_MS + 1000);
  assert.equal(p.neuronasDe(CUENTA)[0].en_linea, false);
  p.marcarPresencia(CUENTA, {});
  p.marcarPresencia(OTRA, { visible: false });
  assert.deepEqual(p.presenciaDe(CUENTA, [CUENTA, OTRA]).map((x) => x.cuenta), [CUENTA]);
  assert.deepEqual(p.presenciaDe(OTRA, [OTRA]).map((x) => x.cuenta), [OTRA]);
  // Un latido sin «visible» no cambia lo que la persona eligió.
  p.marcarPresencia(OTRA, {});
  assert.equal(p.presenciaDe(CUENTA, [OTRA]).length, 0);
  assert.equal(p.resumen().cuentas, 2);
});

test("malla, estado de Astraura, latidos y freno", () => {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const m = crearMalla(db, { ahora });
  m.registrarNodo({ node_id: "mac-1", url: "https://x", capacidades: ["bitnet"] }, "astraura-mac");
  assert.equal(m.nodosVivos().length, 1);
  ahora.avanzar(16 * 60_000);
  assert.equal(m.nodosVivos().length, 0);
  assert.throws(() => m.registrarNodo({ node_id: "x y" }), /node_id/);
  assert.throws(() => m.ponerEstado("mem0", {}), /no admitida/);
  m.ponerEstado("destino_fijo", { url: "https://destino" });
  assert.equal(m.leerEstado("destino_fijo").data.url, "https://destino");
  assert.equal(m.leerEstado("tunel_publico"), null);
  m.latir("agente", "T1", { fase: "escribiendo" });
  assert.equal(m.latidos("agente").length, 1);
  assert.throws(() => m.ponerFreno({ activo: "si" }), /freno/);
  m.ponerFreno({ activo: true, motivo: "25.022 de 25.000", hasta: "2026-10-11T00:00:00Z" });
  assert.equal(m.leerFreno().activo, true);
});

test("métricas: servidas, peticiones a Supabase y ahorro por día", () => {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const met = crearMetricas(db, { ahora });
  met.servida("neuronas", 10);
  met.servida("bus", 5);
  met.aSupabase("replica", 2);
  met.aSupabase("no-existe", 9);
  const hoy = met.delDia();
  assert.equal(hoy.servidas, 15);
  assert.equal(hoy.a_supabase, 2);
  assert.equal(hoy.ahorradas, 13);
  ahora.avanzar(86_400_000);
  assert.equal(met.delDia().servidas, 0);
  assert.equal(met.historial(5).length, 1);
});

test("poda: lo replicado y viejo sale; lo no replicado aguanta hasta 60 días", () => {
  const ahora = reloj();
  const db = abrirAlmacen(":memory:");
  const bus = crearBus(db, { ahora });
  bus.publicar({ quien: "a", tipo: "aviso", texto: "importante" });
  bus.publicar({ quien: "a", tipo: "latido", texto: "" });
  ahora.avanzar(31 * 86_400_000);
  podar(db, ahora());
  assert.deepEqual(db.prepare("SELECT tipo FROM eventos").all().map((x) => x.tipo), ["aviso"]);
  ahora.avanzar(30 * 86_400_000);
  podar(db, ahora());
  assert.equal(db.prepare("SELECT count(*) AS n FROM eventos").get().n, 0);
});

test("bus: los eventos de prueba (`prueba*`) se guardan pero no viajan a Supabase", () => {
  const db = abrirAlmacen(":memory:");
  const bus = crearBus(db);
  bus.publicar({ quien: "puerta-prueba", tipo: "prueba_puerta", texto: "x" });
  bus.publicar({ quien: "enjambre", tipo: "integrada", texto: "y" });
  assert.deepEqual(db.prepare("SELECT tipo, replicar FROM eventos ORDER BY id").all().map((f) => [f.tipo, f.replicar]), [["prueba_puerta", 0], ["integrada", 1]]);
});
