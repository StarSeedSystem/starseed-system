// GEN1114A · escritura de tokens.json atómica y conservadora (architecture/astraura-chats-identidad-firma.md
// §8.1, hecho de operaciones 1). Esta noche `ficha nueva`, lanzado como root en el A1, dejó tokens.json
// de root y sin lectura para el usuario de la puerta: todas las fichas de máquina fallaron 4 min.
// Sin ser root no se puede cambiar el dueño de verdad, así que el cambio de dueño se prueba
// inyectando `statSync`/`chownSync`; el grupo y el modo se prueban de verdad con los grupos del usuario.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, chownSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { crearFichero, escribirArchivoFichas, leerArchivoFichas, nuevaFicha, MODO_FICHAS } from "../src/fichas.mjs";

const dir = () => mkdtempSync(join(tmpdir(), "puerta-fichas-"));
const modo = (ruta) => statSync(ruta).mode & 0o7777;

test("reproduce el incidente: quien escribe es otro usuario (root) → el archivo conserva el dueño y el grupo de la puerta", () => {
  const d = dir();
  const ruta = join(d, "tokens.json");
  nuevaFicha(ruta, "genesis-chats-mac", ["genesis-mac"]);
  const real = statSync(ruta);
  // El archivo «es» del usuario de la puerta (uid/gid distintos de quien escribe, que hace de root).
  const PUERTA = { uid: real.uid + 4242, gid: real.gid + 4243 };
  const llamadas = [];
  const op = {
    statSync: (p) => (p === ruta ? { uid: PUERTA.uid, gid: PUERTA.gid, mode: 0o100640 } : statSync(p)),
    chownSync: (p, uid, gid) => {
      // Se cambia el dueño del TEMPORAL, en el mismo directorio y antes de sustituir el archivo.
      llamadas.push({ dir: dirname(p), uid, gid, existe: existsSync(p), destinoTodaviaViejo: leerArchivoFichas(ruta).fichas.length === 1 });
    },
  };
  escribirArchivoFichas(ruta, { fichas: [...leerArchivoFichas(ruta).fichas, { nombre: "genesis-chats-a1", huella: "a".repeat(64), ambitos: ["genesis-a1"] }] }, op);
  assert.deepEqual(llamadas, [{ dir: d, uid: PUERTA.uid, gid: PUERTA.gid, existe: true, destinoTodaviaViejo: true }]);
  assert.equal(modo(ruta), 0o640);
  assert.deepEqual(leerArchivoFichas(ruta).fichas.map((f) => f.nombre), ["genesis-chats-mac", "genesis-chats-a1"]);
});

test("conserva de verdad el grupo y el modo del archivo que sustituye (nada de volver a 640 de quien escribe)", (t) => {
  const d = dir();
  const ruta = join(d, "tokens.json");
  nuevaFicha(ruta, "uno", ["bus"]);
  const antes = statSync(ruta);
  const otroGrupo = (process.getgroups?.() ?? []).find((g) => g !== antes.gid);
  if (otroGrupo !== undefined) chownSync(ruta, antes.uid, otroGrupo);
  else t.diagnostic("el usuario no tiene otro grupo: solo se prueba el modo");
  chmodSync(ruta, 0o604);
  const esperado = statSync(ruta);
  const ficha = nuevaFicha(ruta, "dos", ["latidos"]);
  revisar();
  escribirArchivoFichas(ruta, leerArchivoFichas(ruta));
  revisar();
  function revisar() {
    const s = statSync(ruta);
    assert.deepEqual([s.uid, s.gid, s.mode & 0o7777], [esperado.uid, esperado.gid, 0o604]);
  }
  // Y la puerta sigue leyendo las fichas.
  assert.deepEqual(crearFichero(ruta).comprobar(ficha), { nombre: "dos", ambitos: ["latidos"] });
});

test("un archivo nuevo nace con 0640", () => {
  const ruta = join(dir(), "sub", "tokens.json");
  nuevaFicha(ruta, "uno", ["bus"]);
  assert.equal(modo(ruta), MODO_FICHAS);
  assert.equal(MODO_FICHAS, 0o640);
});

test("si no se puede poner el dueño o el grupo, no toca el archivo y no deja temporales", () => {
  const d = dir();
  const ruta = join(d, "tokens.json");
  nuevaFicha(ruta, "uno", ["bus"]);
  chmodSync(ruta, 0o640);
  const contenido = readFileSync(ruta, "utf8");
  const s = statSync(ruta);
  const op = {
    statSync: (p) => (p === ruta ? { uid: s.uid + 1, gid: s.gid, mode: 0o100640 } : statSync(p)),
    chownSync: () => {
      const e = new Error("operation not permitted");
      e.code = "EPERM";
      throw e;
    },
  };
  assert.throws(() => escribirArchivoFichas(ruta, { fichas: [] }, op), /not permitted/);
  assert.equal(readFileSync(ruta, "utf8"), contenido);
  assert.equal(modo(ruta), 0o640);
  assert.deepEqual(readdirSync(d), ["tokens.json"]);
});

test("nunca a medias: un fallo antes del rename deja el archivo viejo entero y sin temporales", () => {
  const d = dir();
  const ruta = join(d, "tokens.json");
  nuevaFicha(ruta, "uno", ["bus"]);
  nuevaFicha(ruta, "dos", ["bus"]);
  const contenido = readFileSync(ruta, "utf8");
  let vistos = [];
  const op = {
    fsyncSync: () => {
      vistos = readdirSync(d);
      throw Object.assign(new Error("disco lleno"), { code: "ENOSPC" });
    },
  };
  assert.throws(() => escribirArchivoFichas(ruta, { fichas: [] }, op), /disco lleno/);
  // El temporal estaba en el MISMO directorio (rename atómico, sin cruzar discos)…
  assert.equal(vistos.length, 2);
  assert.ok(vistos.some((n) => n.startsWith(".tokens.json.tmp-")));
  // …y tras el fallo no queda: el archivo sigue siendo el de antes, entero.
  assert.deepEqual(readdirSync(d), ["tokens.json"]);
  assert.equal(readFileSync(ruta, "utf8"), contenido);
  assert.deepEqual(leerArchivoFichas(ruta).fichas.map((f) => f.nombre), ["uno", "dos"]);
  // Un temporal viejo con el mismo prefijo no estorba ni se sigue.
  writeFileSync(join(d, ".tokens.json.tmp-1-000000000000"), "basura");
  nuevaFicha(ruta, "tres", ["bus"]);
  assert.deepEqual(leerArchivoFichas(ruta).fichas.map((f) => f.nombre), ["uno", "dos", "tres"]);
});
