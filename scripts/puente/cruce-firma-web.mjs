// GEN1114INT · «la web» de la prueba que cruza lenguajes (scripts/puente/test_genesis_firma_web_cruce.py).
//
// Corre el código REAL de la biblioteca web de GEN1114E (src/lib/chats-genesis/: firma-aparato.ts, emparejar.ts,
// canon.ts y puerta-chats.ts) bajo Node, cuyo WebCrypto (globalThis.crypto.subtle) es la misma API que la de los
// navegadores: ECDSA P-256 con `extractable: false`, firma r‖s de 64 bytes y SPKI exportada sin comprimir.
// Lo único sustituido es IndexedDB: Node no lo tiene, y se usa el almacén en memoria de las pruebas de E
// (`__tests__/idb-falso.ts`, que copia los valores con structuredClone; la CryptoKey se guarda como objeto).
//
// El TypeScript se empaqueta en el momento con esbuild (ya está en node_modules: lo usa vite), resolviendo
// `@/…` a `src/…`, en una carpeta temporal del sistema. Nada de red salvo 127.0.0.1 (la puerta de la prueba),
// nada de la carpeta personal.
//
// Protocolo: una línea JSON por orden en stdin, una línea JSON de respuesta en stdout ({ok, ...} o {ok:false, error}).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(AQUI, "..", "..", "src");

const ENTRADA = `
export * from "@/lib/chats-genesis/firma-aparato";
export { crearClienteAparatos, pedirEmparejar, consultarEmparejamiento } from "@/lib/chats-genesis/emparejar";
export { crearClienteCanon, nombreDeChat, chatParaFirmar, catalogoValido } from "@/lib/chats-genesis/canon";
export { crearClienteChatsGenesis } from "@/lib/chats-genesis/puerta-chats";
export { crearIdbFalso, crearMarcaFalsa, crearRespaldo } from "@/lib/chats-genesis/__tests__/idb-falso";
`;

const carpeta = mkdtempSync(join(tmpdir(), "cruce-web-"));
const salida = join(carpeta, "web.mjs");
await build({
  stdin: { contents: ENTRADA, resolveDir: SRC, loader: "ts", sourcefile: "entrada-cruce.ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: salida,
  logLevel: "silent",
  plugins: [{
    name: "alias-src",
    setup(b) {
      // El cliente de Supabase solo se importa si no se inyecta la sesión (aquí siempre se inyecta).
      b.onResolve({ filter: /^@\/utils\/supabase\/client$/ }, (a) => ({ path: a.path, external: true }));
      b.onResolve({ filter: /^@\// }, (a) => b.resolve("./" + a.path.slice(2), { resolveDir: SRC, kind: a.kind }));
    },
  }],
});
const W = await import(pathToFileURL(salida).href);
rmSync(carpeta, { recursive: true, force: true });

const subtle = globalThis.crypto.subtle;
let base = "";
let sesiones = {};
const aparatos = new Map(); // nombre → {respaldo, marca}
const puerta = { modo: () => "auto", configurada: async () => true };

/** Pone el «navegador» de ese aparato (su IndexedDB y su localStorage) como el entorno de la biblioteca. */
function usar(nombre) {
  if (!aparatos.has(nombre)) aparatos.set(nombre, { respaldo: W.crearRespaldo(), marca: W.crearMarcaFalsa() });
  const a = aparatos.get(nombre);
  W._reiniciarFirmaAparato();
  W.configurarFirmaAparato({ indexedDB: W.crearIdbFalso(a.respaldo), subtle, marca: a.marca, ahora: () => Date.now(), seguro: true });
}

const opciones = (quien, extra = {}) => ({ puerta, url: async () => base, sesion: async () => sesiones[quien] ?? null, ...extra });

const ORDENES = {
  async iniciar(o) {
    base = o.base;
    sesiones = o.sesiones;
    return {};
  },
  async crear(o) {
    usar(o.aparato);
    const { aparato, spki } = await W.crearClaveAparato(o.nombre, o.cuenta);
    // La clave privada guardada (la CryptoKey del almacén) NO se puede exportar (§3.2).
    const reg = aparatos.get(o.aparato).respaldo.bases.get(W.BD_FIRMA)?.almacenes.get(W.ALMACEN_FIRMA)?.get("clave");
    let exportable = null;
    if (reg?.privada) {
      exportable = false;
      for (const formato of ["pkcs8", "jwk"]) {
        try {
          await subtle.exportKey(formato, reg.privada);
          exportable = true;
        } catch {
          /* no exportable: lo esperado */
        }
      }
    }
    return { aparato, spki, exportable, extractable: reg?.privada?.extractable ?? null };
  },
  async pedir(o) {
    usar(o.aparato);
    const cliente = W.crearClienteAparatos(opciones(o.quien));
    return { resultado: await W.pedirEmparejar(cliente, { nombre: o.nombre, cuenta: o.cuenta, plataforma: "navegador" }) };
  },
  async consultar(o) {
    usar(o.aparato);
    return { aparato: await W.consultarEmparejamiento(W.crearClienteAparatos(opciones(o.quien))) };
  },
  async local(o) {
    usar(o.aparato);
    return { aparato: await W.aparatoLocal() };
  },
  async codigo(o) {
    return { codigo: await W.codigoDe(o.huella, o.cuenta) };
  },
  async canon(o) {
    const r = await W.crearClienteCanon(opciones(o.quien, { almacen: null })).leer();
    const cat = r.ok ? r.catalogo : null;
    const nombres = Object.fromEntries((o.claves ?? []).map((k) => [k, W.nombreDeChat(cat, k)]));
    const paraFirmar = Object.fromEntries((o.fuentes ?? []).map((f) => [f, W.chatParaFirmar(cat, f)]));
    return { respuesta: r, catalogo: cat, nombres, paraFirmar, valido: W.catalogoValido(cat) !== null };
  },
  /** `enviar` de verdad (puerta-chats.ts): firma y manda por fetch a la puerta. Devuelve también lo que mandó. */
  async enviar(o) {
    usar(o.aparato);
    const mandado = [];
    const fetchCon = async (url, init) => {
      if (init?.method === "POST") mandado.push(JSON.parse(init.body));
      return fetch(url, init);
    };
    const c = W.crearClienteChatsGenesis(opciones(o.quien, { fetch: fetchCon, gesto: () => true }));
    let chat = o.chat ?? null;
    if (!chat && o.catalogoDe) {
      const r = await W.crearClienteCanon(opciones(o.catalogoDe, { almacen: null })).leer();
      const p = W.chatParaFirmar(r.ok ? r.catalogo : null, o.entrada.fuente, o.canal ?? null);
      chat = p ? { id: p.id, nombre: p.nombre } : null;
    }
    const resultado = await c.enviar(o.entrada, chat ?? undefined);
    return { resultado, mandado, chat };
  },
  /** `firmarEntrada` directa: lo que haría un script en la página que salte las reglas de `enviar` (§3.11.1). */
  async firmar(o) {
    usar(o.aparato);
    return { firmada: await W.firmarEntrada(o.entrada, o.ctx) };
  },
  async riesgo(o) {
    return { riesgos: o.entradas.map((e) => W.riesgoDeEntrada(e)) };
  },
};

const rl = createInterface({ input: process.stdin });
let cola = Promise.resolve();
rl.on("line", (linea) => {
  cola = cola.then(async () => {
    let r;
    try {
      const o = JSON.parse(linea);
      const f = ORDENES[o.orden];
      if (!f) throw new Error("orden desconocida");
      r = { ok: true, ...(await f(o)) };
    } catch (e) {
      r = { ok: false, error: String(e?.codigo ?? e?.message ?? e) };
    }
    process.stdout.write(JSON.stringify(r) + "\n");
  });
});
rl.on("close", () => cola.then(() => process.exit(0)));
process.stdout.write(JSON.stringify({ listo: true }) + "\n");
