/*
 * DIR1125M · el pase de la app no se pierde en un arranque en frío.
 *   node --test native/servidor-local/__tests__/pase-en-frio.test.cjs
 * Maggabox, 25-11: tras encender la máquina, cargar Next bloqueó el hilo del envoltorio más que el tope del pase (3 s); al
 * soltarse, el temporizador ganó a la entrada estándar y la ventana abrió con «sin-pase-configurado». Aquí un proceso hijo
 * hace lo mismo: arma la lectura del pase, bloquea el hilo más que el tope y mira qué gana.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ORIGEN = path.join(__dirname, "..", "starseed-arranque.cjs");
const PASE = "ab".repeat(32);
const HIJO = `"use strict";
const A = require(process.argv[2]);
const tope = Number(process.argv[3]);
const bloqueo = Number(process.argv[4]);
const p = A.leerPaseDeEntrada(process.stdin, tope);
// Como cargar Next desde un disco frío: el hilo se queda ocupado antes de la primera vuelta del bucle.
Promise.resolve().then(() => { const fin = Date.now() + bloqueo; while (Date.now() < fin) {} });
p.then((v) => { process.stdout.write(v ? "pase:" + v : "nada"); process.exit(0); });
`;

function correr({ tope, bloqueo, conPase }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-pase-"));
  const guion = path.join(dir, "hijo.cjs");
  fs.writeFileSync(guion, HIJO);
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [guion, ORIGEN, String(tope), String(bloqueo)], { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    hijo.stdout.on("data", (c) => (salida += c));
    hijo.stderr.on("data", (c) => (salida += c));
    hijo.on("error", reject);
    hijo.on("exit", () => {
      fs.rmSync(dir, { recursive: true, force: true });
      resolve(salida.trim());
    });
    // Como la app: el pase va a la entrada estándar nada más lanzar el proceso, y la entrada sigue abierta.
    if (conPase) hijo.stdin.write(`pase:${PASE}\n`);
    setTimeout(() => hijo.kill(), 8000).unref();
  });
}

test("un pase que ya está en la tubería gana al tope aunque el hilo se bloquee más que el tope (arranque en frío)", { timeout: 15_000 }, async () => {
  assert.equal(await correr({ tope: 200, bloqueo: 900, conPase: true }), `pase:${PASE}`);
});

test("con el hilo libre, el pase llega enseguida", { timeout: 15_000 }, async () => {
  assert.equal(await correr({ tope: 3000, bloqueo: 0, conPase: true }), `pase:${PASE}`);
});

test("sin pase, el tope sigue rindiéndose (y no se cuelga)", { timeout: 15_000 }, async () => {
  assert.equal(await correr({ tope: 200, bloqueo: 0, conPase: false }), "nada");
});
