// GEN1113INT · arnés de la prueba que cruza los paquetes (scripts/puente/test_genesis_chats_cruce.py).
//
// Arranca la puerta de datos REAL (servidor.mjs + chats-genesis.mjs de GEN1113A) en 127.0.0.1 con un
// puerto efímero, igual que sus propias pruebas: claves EC de usar y tirar, un Supabase de mentira que
// contesta `es_metagenesis` / `es_metagenesis_dueno` por cuenta, fichas de prueba y SQLite en una
// carpeta temporal del sistema. Nada de red ni de archivos de la carpeta personal.
//
// Escribe UNA línea JSON por stdout con {base, fichas, sesiones, cuentas} (todo inventado para la
// prueba) y luego atiende órdenes por stdin, una por línea:
//   {"avanzar": <ms>}  → adelanta el reloj de la puerta (caducidad de 30 min)
// Al cerrarse stdin, cierra el servidor y sale.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { abrirAlmacen } from "../src/almacen.mjs";
import { crearArriendo } from "../src/arriendo.mjs";
import { crearBus } from "../src/bus.mjs";
import { crearCache } from "../src/cache.mjs";
import { leerConfig } from "../src/config.mjs";
import { crearFichero, nuevaFicha } from "../src/fichas.mjs";
import { crearVerificador } from "../src/jwt.mjs";
import { crearMalla } from "../src/malla.mjs";
import { crearMetricas } from "../src/metricas.mjs";
import { crearPresencia } from "../src/presencia.mjs";
import { crearReplica } from "../src/replica.mjs";
import { crearServidor } from "../src/servidor.mjs";
import { crearCacheMetagenesis, crearSupabase } from "../src/supabase.mjs";
import { clavesEc, fetchFalso, PROYECTO, sesion } from "./ayudas.mjs";

const CUENTAS = {
  dueno: "11111111-2222-4333-8444-555555555555", // dueño en Supabase y en la lista de la Mac / del A1
  dueno2: "22222222-3333-4444-8555-666666666666", // dueño en Supabase, FUERA de la lista de la Mac
  dev: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", // desarrollador
  nadie: "99999999-8888-4777-8666-555555555555", // sin acceso
};
const duenos = new Set([CUENTAS.dueno, CUENTAS.dueno2]);
const miembros = new Set([CUENTAS.dueno, CUENTAS.dueno2, CUENTAS.dev]);

let desfase = 0;
const ahora = () => Date.now() + desfase;

const k = clavesEc("kid-cruce");
const dir = mkdtempSync(join(tmpdir(), "puerta-cruce-"));
const rutaFichas = join(dir, "tokens.json");
const fichas = {
  mac: nuevaFicha(rutaFichas, "genesis-chats-mac", ["genesis-mac"]),
  a1: nuevaFicha(rutaFichas, "genesis-chats-a1", ["genesis-a1"]),
};
const rol = (conjunto) => (u, init) => [200, conjunto.has(JSON.parse(init.body)._uid)];
const f = fetchFalso({
  "GET /auth/v1/.well-known/jwks.json": () => [200, { keys: [k.jwk] }],
  "POST /rest/v1/rpc/es_metagenesis": rol(miembros),
  "POST /rest/v1/rpc/es_metagenesis_dueno": rol(duenos),
});
const config = { ...leerConfig({ SUPABASE_URL: PROYECTO, SUPABASE_ANON_KEY: "anon", PUERTA_FICHAS: rutaFichas }), puerto: 0 };
const db = abrirAlmacen(join(dir, "puerta.db"));
const metricas = crearMetricas(db);
const supabase = crearSupabase({ url: PROYECTO, anon: "anon", fetch: f, metricas });
const servidor = crearServidor({
  db, supabase, config, metricas, ahora,
  malla: crearMalla(db),
  verificador: crearVerificador({ supabaseUrl: PROYECTO, fetch: f }),
  fichero: crearFichero(rutaFichas),
  bus: crearBus(db),
  arriendo: crearArriendo(db),
  presencia: crearPresencia(db),
  cache: crearCache(supabase),
  replica: crearReplica(db, supabase, { llave: "" }),
  esMetagenesis: crearCacheMetagenesis(supabase),
  estadoCaddy: () => ({ ok: true }),
  registrar: () => {},
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));

const sesiones = Object.fromEntries(Object.entries(CUENTAS).map(([n, sub]) => [n, sesion(k, { sub })]));
process.stdout.write(JSON.stringify({ base: `http://127.0.0.1:${servidor.address().port}`, fichas, sesiones, cuentas: CUENTAS }) + "\n");

const rl = createInterface({ input: process.stdin });
rl.on("line", (linea) => {
  try {
    const o = JSON.parse(linea);
    if (typeof o.avanzar === "number") desfase += o.avanzar;
    process.stdout.write(JSON.stringify({ ok: true, desfase }) + "\n");
  } catch {
    process.stdout.write(JSON.stringify({ ok: false }) + "\n");
  }
});
rl.on("close", () => {
  servidor.close();
  process.exit(0);
});
