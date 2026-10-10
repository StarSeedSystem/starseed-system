// Almacén de la puerta: SQLite en WAL con synchronous=FULL (un evento aceptado es un evento
// guardado aunque el proceso caiga justo después). Un solo proceso escribe; las órdenes de la
// línea de comandos (`vaciar`, `nodo registrar`) entran por el mismo archivo con busy_timeout.
// Tiempos en milisegundos desde 1970 (enteros). Contrato: architecture/puerta-datos-a1.md §4.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,
  quien TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tarea TEXT,
  texto TEXT NOT NULL,
  datos TEXT,
  origen TEXT,
  replicar INTEGER NOT NULL DEFAULT 0,
  replicado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS eventos_tipo_id ON eventos (tipo, id);
CREATE INDEX IF NOT EXISTS eventos_replica ON eventos (replicar, replicado, id);
CREATE TABLE IF NOT EXISTS latidos (
  clase TEXT NOT NULL, id TEXT NOT NULL, t INTEGER NOT NULL, datos TEXT, por TEXT,
  PRIMARY KEY (clase, id)
);
CREATE TABLE IF NOT EXISTS neuronas (
  cuenta TEXT NOT NULL, neurona TEXT NOT NULL, medio TEXT, visto INTEGER NOT NULL, senales TEXT,
  replicado_visto INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cuenta, neurona)
);
CREATE TABLE IF NOT EXISTS presencia (
  cuenta TEXT PRIMARY KEY, visto INTEGER NOT NULL, visible INTEGER NOT NULL DEFAULT 1,
  replicado_visto INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS nodos_mg (
  nodo TEXT PRIMARY KEY, medio TEXT NOT NULL, huella TEXT NOT NULL, revocado INTEGER NOT NULL DEFAULT 0,
  modo TEXT, puntos INTEGER, datos TEXT, ultimo_latido INTEGER, desde INTEGER, creado INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS arriendo_mg (
  id INTEGER PRIMARY KEY CHECK (id = 1), lider TEXT, termino INTEGER NOT NULL DEFAULT 0,
  puntos INTEGER NOT NULL DEFAULT 0, expira INTEGER NOT NULL DEFAULT 0, foto TEXT, foto_en INTEGER,
  actualizado INTEGER NOT NULL DEFAULT 0, replicado INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO arriendo_mg (id) VALUES (1);
CREATE TABLE IF NOT EXISTS ordenes_mg (
  id INTEGER PRIMARY KEY AUTOINCREMENT, creada INTEGER NOT NULL, por TEXT NOT NULL, accion TEXT NOT NULL,
  args TEXT NOT NULL, para TEXT NOT NULL, estado TEXT NOT NULL, tomada_por TEXT, resultado TEXT,
  actualizada INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ordenes_mg_pend ON ordenes_mg (estado, id);
CREATE TABLE IF NOT EXISTS malla (
  node_id TEXT PRIMARY KEY, datos TEXT NOT NULL, actualizado INTEGER NOT NULL, por TEXT
);
CREATE TABLE IF NOT EXISTS astraura_estado (
  clave TEXT PRIMARY KEY, datos TEXT NOT NULL, actualizado INTEGER NOT NULL, por TEXT
);
CREATE TABLE IF NOT EXISTS kv (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS metricas (
  dia TEXT NOT NULL, grupo TEXT NOT NULL, servidas INTEGER NOT NULL DEFAULT 0,
  a_supabase INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, grupo)
);
`;

export function abrirAlmacen(ruta) {
  if (ruta !== ":memory:") mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = FULL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(ESQUEMA);
  return db;
}

/** Ejecuta `fn` dentro de una transacción inmediata (todo o nada). */
export function enTransaccion(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ya estaba cerrada */
    }
    throw e;
  }
}

export function leerKv(db, clave) {
  const fila = db.prepare("SELECT valor, actualizado FROM kv WHERE clave = ?").get(clave);
  if (!fila) return null;
  try {
    return { valor: JSON.parse(fila.valor), actualizado: Number(fila.actualizado) };
  } catch {
    return null;
  }
}

export function escribirKv(db, clave, valor, ahora = Date.now()) {
  db.prepare("INSERT INTO kv (clave, valor, actualizado) VALUES (?, ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado")
    .run(clave, JSON.stringify(valor), ahora);
}

/** Bytes de un valor como JSON (para los topes de tamaño). */
export function tamanoJson(v) {
  try {
    return Buffer.byteLength(JSON.stringify(v ?? null), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function parsear(texto, defecto = null) {
  if (texto == null) return defecto;
  try {
    return JSON.parse(texto);
  } catch {
    return defecto;
  }
}

/** Poda lo viejo: bus 30 días o 200.000 filas, latidos 7 días, métricas 60 días, órdenes 30 días. */
export function podar(db, ahora = Date.now()) {
  const dia = 86_400_000;
  db.prepare("DELETE FROM eventos WHERE t < ? AND (replicar = 0 OR replicado = 1)").run(ahora - 30 * dia);
  // Lo que no se pudo replicar en 60 días (réplica apagada o migración sin aplicar) también sale.
  db.prepare("DELETE FROM eventos WHERE t < ?").run(ahora - 60 * dia);
  const max = db.prepare("SELECT max(id) AS m FROM eventos").get()?.m ?? 0;
  if (max > 200_000) db.prepare("DELETE FROM eventos WHERE id <= ? AND (replicar = 0 OR replicado = 1)").run(max - 200_000);
  db.prepare("DELETE FROM latidos WHERE t < ?").run(ahora - 7 * dia);
  db.prepare("DELETE FROM malla WHERE actualizado < ?").run(ahora - 7 * dia);
  db.prepare("DELETE FROM neuronas WHERE visto < ? AND replicado_visto >= visto").run(ahora - 30 * dia);
  db.prepare("DELETE FROM ordenes_mg WHERE creada < ?").run(ahora - 30 * dia);
  const limite = new Date(ahora - 60 * dia).toISOString().slice(0, 10);
  db.prepare("DELETE FROM metricas WHERE dia < ?").run(limite);
}
