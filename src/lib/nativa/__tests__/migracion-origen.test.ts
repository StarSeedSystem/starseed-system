/*
 * Migración del origen web al origen local (APP1107B · T4): qué claves viajan, el códec de
 * IndexedDB, la fusión sin pisar, la exportación/importación de punta a punta (con una IndexedDB de
 * mentira), la página importadora, el aviso y el contrato con Rust.
 *   npx vitest run src/lib/nativa/__tests__/migracion-origen.test.ts
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { crearIdbDeMentira } from "./idb-de-mentira";
import {
  CLAVE_MARCADOR_MIGRACION,
  CLAVE_NEURONA_ANTERIOR,
  leerNeuronaAnterior,
  FRASE_SESION,
  TITULO_HECHA,
  TITULO_NO_SE_PUDO,
  decidirAvisoMigracion,
  leerMarcadorMigracion,
  marcarVisto,
} from "../migracion-origen";

const require = createRequire(import.meta.url);
const RAIZ = process.cwd();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M: any = require(join(RAIZ, "native/servidor-local/migracion-origen.js"));
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

class LsDeMentira {
  m = new Map<string, string>();
  constructor(o: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(o)) this.m.set(k, v);
  }
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

function pedido<T>(r: { onsuccess: unknown; onerror: unknown; result: unknown; error: unknown }): Promise<T> {
  return new Promise((ok, falla) => {
    r.onsuccess = () => ok(r.result as T);
    r.onerror = () => falla(r.error);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function crearBase(idb: any, nombre: string, version: number, montar: (db: any) => void, llenar: (tx: any) => void) {
  const r = idb.open(nombre, version);
  r.onupgradeneeded = () => montar(r.result);
  const db = await pedido<{ objectStoreNames: { length: number; item: (i: number) => string }; transaction: (n: string[], m: string) => unknown }>(r);
  const nombres = Array.from({ length: db.objectStoreNames.length }, (_, i) => db.objectStoreNames.item(i));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx: any = db.transaction(nombres, "readwrite");
  llenar(tx);
  await new Promise((ok) => (tx.oncomplete = ok));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todo(idb: any, nombre: string, almacen: string): Promise<Array<{ k: unknown; v: unknown }>> {
  const db = await pedido<{ transaction: (n: string[]) => { objectStore: (n: string) => { openCursor: () => never } } }>(idb.open(nombre));
  const req = db.transaction([almacen]).objectStore(almacen).openCursor() as unknown as {
    onsuccess: () => void;
    onerror: unknown;
    result: { primaryKey: unknown; value: unknown; continue: () => void } | null;
  };
  const out: Array<{ k: unknown; v: unknown }> = [];
  await new Promise<void>((ok) => {
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return ok();
      out.push({ k: c.primaryKey, v: c.value });
      c.continue();
    };
  });
  return out;
}

const LIMITES_ORIGINALES = { ...M.LIMITES };
afterEach(() => Object.assign(M.LIMITES, LIMITES_ORIGINALES));

describe("qué claves viajan", () => {
  it("la sesión de Supabase nunca (por nombre o por valor), ni el marcador del origen local", () => {
    for (const c of ["sb-abcd-auth-token", "sb-abcd-auth-token.0", "sb-abcd-auth-token-code-verifier", "supabase.auth.token", "SB-X-AUTH-TOKEN"]) {
      expect(M.clasificarClave(c, "x"), c).toBe("sesion");
    }
    expect(M.clasificarClave("cualquiera", '{"access_token":"a","refresh_token":"b"}')).toBe("sesion");
    expect(M.clasificarClave(CLAVE_MARCADOR_MIGRACION, "{}")).toBe("sesion");
    expect(M.clasificarClave("starseed.sb-notas", "x")).not.toBe("sesion");
  });

  it("todo lo que settings-sync nunca sube es «secreto» (viaja a la app, no a la copia del disco)", () => {
    const fuente = leer("src/lib/settings-sync.ts");
    const bloque = (nombre: string) => {
      const m = fuente.match(new RegExp(`export const ${nombre} = \\[([\\s\\S]*?)\\] as const;`));
      if (!m) throw new Error(`no encuentro ${nombre}`);
      // Sin los comentarios de cada línea (alguno cita valores entre comillas).
      const sinComentarios = m[1].split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
      return [...sinComentarios.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    };
    const exactas = bloque("NEVER_SYNCED_KEYS");
    const prefijos = bloque("NEVER_SYNCED_PREFIXES");
    expect(exactas.length).toBeGreaterThan(30);
    for (const c of exactas) expect(["secreto", "sesion"], c).toContain(M.clasificarClave(c, "x"));
    for (const p of prefijos) expect(["secreto", "sesion"], p).toContain(M.clasificarClave(`${p}openai`, "x"));
    expect(M.clasificarClave("starseed.integration.github", "x")).toBe("secreto");
    expect(M.clasificarClave("starseed.brain.b1.integration.slack", "x")).toBe("secreto");
    expect(M.clasificarClave("starseed.faro.clave", "x")).toBe("secreto");
  });

  it("lo demás es normal (escritorios, dock, cerebros, apariencia…)", () => {
    for (const c of ["appearance-config-v2", "starseed.dock.items.v2", "starseed.brain.b1.moa", "starseed.escritorios.v1", "os.trinity.fab.pos", "starseed.brain.b1.memory-mirror.v1"]) {
      expect(M.clasificarClave(c, "{}"), c).toBe("normal");
    }
  });

  it("bases: la de sesión de terceros y las cachés no se traen", () => {
    expect(M.clasificarBase("firebaseLocalStorageDb")).toBe("sesion");
    expect(M.clasificarBase("workbox-expiration")).toBe("cache");
    expect(M.clasificarBase("starseed-memory")).toBe("normal");
    expect(M.clasificarBase("starseed-mesh-par")).toBe("normal");
  });
});

describe("códec de IndexedDB", () => {
  it("ida y vuelta por JSON de todo lo que guarda la app", async () => {
    const buf = new Uint8Array([9, 8, 7, 6, 5, 4]);
    const compartido = { z: 1 };
    const valor = {
      fecha: new Date(1234),
      malFecha: new Date(NaN),
      nan: NaN,
      menosCero: -0,
      inf: -Infinity,
      indef: undefined,
      grande: BigInt("1180591620717411303424"),
      re: /ho+la/gi,
      ab: buf.buffer.slice(0, 3),
      vista: buf.subarray(2, 5),
      f64: new Float64Array([1.5, -2]),
      dv: new DataView(new Uint8Array([1, 2]).buffer),
      blob: new Blob(["hola"], { type: "text/plain" }),
      archivo: new File(["abc"], "nota.txt", { type: "text/plain", lastModified: 77 }),
      mapa: new Map<unknown, unknown>([[1, { a: [1, 2] }], ["k", new Set([1, 2])]]),
      lista: [1, "dos", null, [3]],
      $ss: "colisión",
      a: compartido,
      b: compartido,
    };
    const json = JSON.parse(JSON.stringify(await M.codificar(valor)));
    const v = M.decodificar(json);
    expect(v.fecha).toEqual(new Date(1234));
    expect(Number.isNaN(v.malFecha.getTime())).toBe(true);
    expect(Number.isNaN(v.nan)).toBe(true);
    expect(Object.is(v.menosCero, -0)).toBe(true);
    expect(v.inf).toBe(-Infinity);
    expect("indef" in v && v.indef === undefined).toBe(true);
    expect(v.grande).toBe(BigInt("1180591620717411303424"));
    expect(v.re).toEqual(/ho+la/gi);
    expect([...new Uint8Array(v.ab)]).toEqual([9, 8, 7]);
    expect(v.vista).toBeInstanceOf(Uint8Array);
    expect([...v.vista]).toEqual([7, 6, 5]);
    expect([...v.f64]).toEqual([1.5, -2]);
    expect(v.dv.getUint8(1)).toBe(2);
    expect(await v.blob.text()).toBe("hola");
    expect(v.blob.type).toBe("text/plain");
    expect(v.archivo.name).toBe("nota.txt");
    expect(v.archivo.lastModified).toBe(77);
    expect(v.mapa.get(1)).toEqual({ a: [1, 2] });
    expect([...v.mapa.get("k")]).toEqual([1, 2]);
    expect(v.lista).toEqual([1, "dos", null, [3]]);
    expect(v.$ss).toBe("colisión");
    expect(v.a).toEqual({ z: 1 });
    expect(v.b).toEqual({ z: 1 });
  });

  it("lo que no se puede copiar se dice (ciclos, CryptoKey y otras clases)", async () => {
    const ciclo: Record<string, unknown> = {};
    ciclo.yo = ciclo;
    await expect(M.codificar(ciclo)).rejects.toMatchObject({ noSerializable: true, tipo: "referencia circular" });
    class ClaveCripto {}
    await expect(M.codificar({ k: new ClaveCripto() })).rejects.toMatchObject({ noSerializable: true });
    await expect(M.codificar(() => 1)).rejects.toMatchObject({ noSerializable: true });
  });

  it("partir y volver a unir sin romper caracteres", () => {
    const t = "a😀b".repeat(40);
    const trozos = M.partir(t, 17);
    expect(trozos.join("")).toBe(t);
    for (const p of trozos) expect(p.length).toBeLessThanOrEqual(17);
    expect(M.partir("", 10)).toEqual([""]);
  });
});

describe("fusión de localStorage", () => {
  it("trae lo que falta, no toca lo igual, deja lo distinto como está y nunca la sesión", () => {
    const datos = { localStorage: { a: "1", b: "2", c: "viejo", "sb-x-auth-token": "s", n: 5 } };
    const plan = M.planLocalStorage(datos, { b: "2", c: "nuevo" });
    expect(plan.poner).toEqual([["a", "1"]]);
    expect(plan.iguales).toBe(1);
    expect(plan.conflictos).toEqual(["c"]);
    expect(plan.descartadas).toBe(2);
  });

  it("(NEU1107B) si el origen local ya tenía otro id de neurona, no lo pisa y apunta el anterior como pista", async () => {
    const VIEJO = "62d50afc-6354-414c-9835-028f525b9d4a";
    const datos = { formato: M.FORMATO, version: M.VERSION, localStorage: { "starseed.neuron.device-id": VIEJO, a: "1" }, indexedDB: [] };
    const ls = new LsDeMentira({ "starseed.neuron.device-id": "nuevo-id-local-123" });
    await M.importar(datos, { localStorage: ls, indexedDB: null });
    expect(ls.getItem("starseed.neuron.device-id")).toBe("nuevo-id-local-123");
    expect(ls.getItem(CLAVE_NEURONA_ANTERIOR)).toBe(VIEJO);
    expect(leerNeuronaAnterior(ls.getItem(CLAVE_NEURONA_ANTERIOR))).toBe(VIEJO);
    expect(M.CLAVE_NEURONA_ANTERIOR).toBe(CLAVE_NEURONA_ANTERIOR);
    // Sin conflicto (el id viaja tal cual) no hay nada que apuntar.
    const limpio = new LsDeMentira();
    await M.importar(datos, { localStorage: limpio, indexedDB: null });
    expect(limpio.getItem("starseed.neuron.device-id")).toBe(VIEJO);
    expect(limpio.getItem(CLAVE_NEURONA_ANTERIOR)).toBeNull();
    // Un valor raro nunca se toma por id.
    expect(leerNeuronaAnterior("<script>")).toBeNull();
    expect(leerNeuronaAnterior(null)).toBeNull();
  });
});

function origenViejo() {
  const idb = crearIdbDeMentira();
  const ls = new LsDeMentira({
    "appearance-config-v2": '{"tema":"oscuro"}',
    "starseed.escritorios.v1": "[1,2]",
    "starseed.ai.providers": "cifrado",
    "sb-abcd-auth-token": '{"access_token":"a","refresh_token":"r"}',
    comun: "de-la-web",
  });
  return { idb, ls };
}

async function llenarViejo(idb: ReturnType<typeof crearIdbDeMentira>) {
  await crearBase(
    idb,
    "starseed-memory",
    3,
    (db) => {
      const s = db.createObjectStore("items", { keyPath: "id" });
      s.createIndex("porTipo", "tipo", { unique: false });
      db.createObjectStore("lineas", { autoIncrement: true });
      db.createObjectStore("sueltos");
    },
    (tx) => {
      tx.objectStore("items").add({ id: "a", tipo: "x", cuando: new Date(5), audio: new Blob(["voz"], { type: "audio/webm" }) });
      tx.objectStore("items").add({ id: "b", tipo: "y" });
      tx.objectStore("lineas").add({ l: 1 });
      tx.objectStore("lineas").add({ l: 2 });
      tx.objectStore("sueltos").add("valor", ["k", 1]);
    },
  );
  class CryptoKeyDeMentira {}
  await crearBase(
    idb,
    "starseed-mesh-par",
    1,
    (db) => db.createObjectStore("device-key"),
    (tx) => tx.objectStore("device-key").add({ privada: new CryptoKeyDeMentira() }, "par"),
  );
  await crearBase(idb, "firebaseLocalStorageDb", 1, (db) => db.createObjectStore("s"), (tx) => tx.objectStore("s").add("token", "t"));
}

describe("exportar e importar de punta a punta", () => {
  it("trae ajustes y registros, sin sesión, sin pisar y una sola vez", async () => {
    const viejo = origenViejo();
    await llenarViejo(viejo.idb);
    const datos = await M.exportar({ localStorage: viejo.ls, indexedDB: viejo.idb, origen: M.ORIGEN_WEB, ahora: () => 0 });
    expect(datos.formato).toBe("starseed-migracion-origen");
    expect(Object.keys(datos.localStorage).sort()).toEqual(["appearance-config-v2", "comun", "starseed.ai.providers", "starseed.escritorios.v1"]);
    expect(datos.secretas).toEqual(["starseed.ai.providers"]);
    expect(datos.omitidas).toEqual([{ clave: "sb-abcd-auth-token", motivo: "sesion" }]);
    const porNombre = Object.fromEntries(datos.indexedDB.map((b: { nombre: string }) => [b.nombre, b]));
    expect(porNombre.firebaseLocalStorageDb.omitida).toBe("sesion");
    expect(porNombre["starseed-mesh-par"].almacenes[0].omitidos).toBe(1);
    expect(Object.keys(porNombre["starseed-mesh-par"].almacenes[0].motivos)[0]).toMatch(/no se puede copiar/);
    // El original no se toca.
    expect(viejo.ls.getItem("sb-abcd-auth-token")).not.toBeNull();
    expect((await todo(viejo.idb, "starseed-memory", "items")).length).toBe(2);

    const viaje = JSON.parse(M.partir(JSON.stringify(datos), 1000).join(""));
    const nuevo = { idb: crearIdbDeMentira(), ls: new LsDeMentira({ comun: "de-la-app-nueva" }) };
    const r = await M.importar(viaje, { localStorage: nuevo.ls, indexedDB: nuevo.idb });
    expect(r.ajustes).toEqual({ traidos: 3, iguales: 0, conflictos: 1, errores: 0, descartados: 0 });
    expect(r.registros).toMatchObject({ traidos: 5, yaEstaban: 0, errores: 0, almacenesSinSitio: 0 });
    expect(r.exportacion.registrosNoCopiados).toBe(1);
    expect(r.exportacion.sesionesNoCopiadas).toBe(1);
    expect(nuevo.ls.getItem("comun")).toBe("de-la-app-nueva");
    expect(nuevo.ls.getItem("sb-abcd-auth-token")).toBeNull();
    expect(nuevo.ls.getItem("starseed.ai.providers")).toBe("cifrado");
    const base = nuevo.idb.bases.get("starseed-memory")!;
    expect(base.version).toBe(3);
    expect([...base.almacenes.get("items")!.indices.keys()]).toEqual(["porTipo"]);
    const items = await todo(nuevo.idb, "starseed-memory", "items");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = items.find((x) => x.k === "a")!.v as any;
    expect(a.cuando).toEqual(new Date(5));
    expect(await a.audio.text()).toBe("voz");
    expect((await todo(nuevo.idb, "starseed-memory", "lineas")).map((x) => x.k)).toEqual([1, 2]);
    expect((await todo(nuevo.idb, "starseed-memory", "sueltos")).map((x) => x.k)).toEqual([["k", 1]]);
    expect(nuevo.idb.bases.has("firebaseLocalStorageDb")).toBe(false);

    // Otra vez: nada nuevo, nada pisado.
    const r2 = await M.importar(viaje, { localStorage: nuevo.ls, indexedDB: nuevo.idb });
    expect(r2.ajustes.traidos).toBe(0);
    expect(r2.registros).toMatchObject({ traidos: 0, yaEstaban: 5 });
  });

  it("nunca baja la versión de una base local ni crea almacenes en una más nueva", async () => {
    const viejo = origenViejo();
    await llenarViejo(viejo.idb);
    const datos = await M.exportar({ localStorage: viejo.ls, indexedDB: viejo.idb, origen: M.ORIGEN_WEB });
    const nuevo = crearIdbDeMentira();
    await crearBase(nuevo, "starseed-memory", 5, (db) => db.createObjectStore("items", { keyPath: "id" }), (tx) => tx.objectStore("items").add({ id: "a", tipo: "local" }));
    const r = await M.importar(datos, { localStorage: new LsDeMentira(), indexedDB: nuevo });
    expect(nuevo.bases.get("starseed-memory")!.version).toBe(5);
    expect(r.registros.almacenesSinSitio).toBe(2);
    expect(r.registros.yaEstaban).toBe(1);
    expect(r.registros.traidos).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(((await todo(nuevo, "starseed-memory", "items")).find((x) => x.k === "a")!.v as any).tipo).toBe("local");
  });

  it("respeta los topes y no crea bases en el origen viejo al mirar", async () => {
    const viejo = origenViejo();
    await llenarViejo(viejo.idb);
    M.LIMITES.registro = 100; // «a» (con su audio) pasa de 100 bytes aprox.; «b» no
    const datos = await M.exportar({ localStorage: viejo.ls, indexedDB: viejo.idb, origen: M.ORIGEN_WEB });
    const items = datos.indexedDB.find((b: { nombre: string }) => b.nombre === "starseed-memory").almacenes.find((a: { nombre: string }) => a.nombre === "items");
    expect(items.registros.length).toBe(1);
    expect(items.motivos["demasiado grande"]).toBe(1);

    // Sin `databases()` (WebKit viejo): mira las de la app sin crearlas.
    const vacio = crearIdbDeMentira();
    const sinLista = { open: vacio.open.bind(vacio) };
    const d = await M.exportar({ localStorage: new LsDeMentira(), indexedDB: sinLista, origen: M.ORIGEN_WEB });
    expect(d.indexedDB).toEqual([]);
    expect(vacio.bases.size).toBe(0);
  });

  it("rechaza lo que no es una exportación nuestra", async () => {
    await expect(Promise.resolve().then(() => M.importar({ formato: "otro" }, { localStorage: new LsDeMentira() }))).rejects.toThrow(/formato/);
    await expect(Promise.resolve().then(() => M.importar({ formato: M.FORMATO, version: 9, localStorage: {} }, { localStorage: new LsDeMentira() }))).rejects.toThrow(/versión/);
  });
});

describe("ventana oculta: exportar y mandar a Rust", () => {
  it("solo en el origen de la web publicada, por trozos que se vuelven a unir", async () => {
    const llamadas: Array<[string, Record<string, unknown>]> = [];
    const invoke = async (c: string, a: Record<string, unknown>) => {
      llamadas.push([c, a]);
      return null;
    };
    const viejo = origenViejo();
    expect(await M.exportarYEnviar({ invoke, localStorage: viejo.ls, indexedDB: null, origen: "http://127.0.0.1:47610" })).toBe(false);
    expect(llamadas).toEqual([]);
    M.LIMITES.trozo = 64;
    expect(await M.exportarYEnviar({ invoke, localStorage: viejo.ls, indexedDB: null, origen: M.ORIGEN_WEB })).toBe(true);
    expect(llamadas.length).toBeGreaterThan(2);
    expect(new Set(llamadas.map((l) => l[0]))).toEqual(new Set(["migracion_origen_exportar"]));
    expect(new Set(llamadas.map((l) => l[1].id)).size).toBe(1);
    expect(llamadas.every((l) => l[1].total === llamadas.length && l[1].error === null)).toBe(true);
    const json = JSON.parse(llamadas.map((l) => l[1].trozo).join(""));
    expect(json.localStorage["appearance-config-v2"]).toBe('{"tema":"oscuro"}');
    expect(JSON.stringify(json)).not.toContain("refresh_token");
  });

  it("si no puede leer, se lo dice a Rust con el error", async () => {
    const llamadas: Array<Record<string, unknown>> = [];
    const roto = { get length(): number { throw new Error("bloqueado"); } };
    const idbRoto = { databases: async () => [{ name: "x" }], open: () => { throw new Error("no"); } };
    await M.exportarYEnviar({ invoke: async (_c: string, a: Record<string, unknown>) => void llamadas.push(a), localStorage: roto, indexedDB: idbRoto, origen: M.ORIGEN_WEB });
    // localStorage ilegible no tumba la exportación: se cuenta y se manda lo demás.
    expect(llamadas.length).toBe(1);
    expect(JSON.parse(String(llamadas[0].trozo)).omitidas[0].motivo).toMatch(/ilegible/);
  });

  it("el puente de Tauri: lo espera y, si no llega, falla", async () => {
    const ventana: Record<string, unknown> = {};
    setTimeout(() => (ventana.__TAURI_INTERNALS__ = { invoke: async (c: string) => `ok:${c}` }), 30);
    const inv = await M.invocador(ventana, 2000);
    expect(await inv("x")).toBe("ok:x");
    await expect(M.invocador({}, 60)).rejects.toThrow(/puente/);
  });
});

describe("página importadora", () => {
  async function datosDeMentira() {
    const viejo = origenViejo();
    return JSON.stringify(await M.exportar({ localStorage: viejo.ls, indexedDB: null, origen: M.ORIGEN_WEB }));
  }

  function entorno(estados: Array<Record<string, unknown>>, texto: string, final: unknown = "hecha", lsInicial: Record<string, string> = {}) {
    const llamadas: Array<[string, unknown]> = [];
    const trozos = M.partir(texto, 50);
    let t = 0;
    const e = {
      ls: new LsDeMentira(lsInicial),
      fue: [] as string[],
      llamadas,
      entorno: {} as Record<string, unknown>,
    };
    e.entorno = {
      localStorage: e.ls,
      indexedDB: crearIdbDeMentira(),
      ahora: () => t,
      esperar: async (ms: number) => void (t += ms),
      ir: (u: string) => e.fue.push(u),
      invoke: async (c: string, a: Record<string, unknown>) => {
        llamadas.push([c, a]);
        if (c === "migracion_origen_estado") return estados.length > 1 ? estados.shift() : estados[0];
        if (c === "migracion_origen_datos") return trozos[a.indice as number];
        if (c === "migracion_origen_confirmar") return final;
        throw new Error(c);
      },
    };
    return { e };
  }

  it("espera la exportación, importa, confirma, deja el marcador y va a /", async () => {
    const texto = await datosDeMentira();
    const partes = M.partir(texto, 50).length;
    const { e } = entorno([{ fase: "exportando" }, { fase: "exportando" }, { fase: "lista", partes, copia: "copia-1.json" }], texto);
    expect(await M.paginaImportar(e.entorno)).toBe("hecha");
    expect(e.fue).toEqual(["/"]);
    expect(e.ls.getItem("appearance-config-v2")).toBe('{"tema":"oscuro"}');
    const conf = e.llamadas.find((l) => l[0] === "migracion_origen_confirmar")![1] as Record<string, unknown>;
    expect(conf.resultado).toBe("hecha");
    const marcador = leerMarcadorMigracion(e.ls.getItem(CLAVE_MARCADOR_MIGRACION));
    expect(marcador).toMatchObject({ resultado: "hecha", copia: "copia-1.json", visto: false });
    expect(marcador!.resumen!.ajustes.traidos).toBe(4);
  });

  it("si la exportación falló, lo apunta con el motivo y el resultado que diga Rust", async () => {
    const { e } = entorno([{ fase: "fallida", motivo: "Sin internet" }], "", "abandonada");
    expect(await M.paginaImportar(e.entorno)).toBe("abandonada");
    expect(e.fue).toEqual(["/"]);
    expect(leerMarcadorMigracion(e.ls.getItem(CLAVE_MARCADOR_MIGRACION))).toMatchObject({ resultado: "abandonada", motivo: "Sin internet" });
  });

  it("sin nada pendiente va directa a / sin tocar nada", async () => {
    const { e } = entorno([{ fase: "hecha" }], "");
    expect(await M.paginaImportar(e.entorno)).toBe(null);
    expect(e.fue).toEqual(["/"]);
    expect(e.llamadas.map((l) => l[0])).toEqual(["migracion_origen_estado"]);
    expect(e.ls.length).toBe(0);
  });

  it("si este origen ya se importó, no vuelve a importar (no resucita lo borrado): solo confirma", async () => {
    const previo = JSON.stringify(M.marcador("hecha", { ajustes: { traidos: 2 } }, null, null, 0));
    const { e } = entorno([{ fase: "lista", partes: 1 }], await datosDeMentira(), "hecha", { [CLAVE_MARCADOR_MIGRACION]: previo });
    await M.paginaImportar(e.entorno);
    expect(e.llamadas.map((l) => l[0])).toEqual(["migracion_origen_estado", "migracion_origen_confirmar"]);
    expect(e.ls.getItem("appearance-config-v2")).toBeNull();
    expect(e.fue).toEqual(["/"]);
  });

  it("si Rust no contesta a tiempo, se va igualmente a /", async () => {
    const { e } = entorno([{ fase: "exportando" }], "", "pospuesta");
    (e.entorno as { tope: number }).tope = 2000;
    expect(await M.paginaImportar(e.entorno)).toBe("pospuesta");
    expect(e.fue).toEqual(["/"]);
    expect(leerMarcadorMigracion(e.ls.getItem(CLAVE_MARCADOR_MIGRACION))!.motivo).toMatch(/a tiempo/);
  });
});

describe("aviso", () => {
  const hecha = (resumen: unknown, extra: Record<string, unknown> = {}) =>
    leerMarcadorMigracion(JSON.stringify({ resultado: "hecha", resumen, visto: false, ...extra }));

  it("misma clave que el JS", () => {
    expect(M.CLAVE_MARCADOR).toBe(CLAVE_MARCADOR_MIGRACION);
  });

  it("cuenta lo traído, los conflictos, lo que se quedó y la sesión", () => {
    const a = decidirAvisoMigracion(
      hecha({ ajustes: { traidos: 12, conflictos: 2 }, registros: { traidos: 1 }, exportacion: { registrosNoCopiados: 1, sesionesNoCopiadas: 1 } }),
      true,
    );
    expect(a).toMatchObject({ mostrar: true, tono: "ok", titulo: TITULO_HECHA });
    expect(a.detalle).toContain("12 ajustes y 1 registro");
    expect(a.detalle).toContain("2 ajustes ya existían");
    expect(a.detalle).toContain("1 registro se quedó");
    expect(a.detalle).toContain(FRASE_SESION);
  });

  it("instalación nueva, visto, o fuera del servidor local: nada", () => {
    expect(decidirAvisoMigracion(hecha({ ajustes: { traidos: 0 }, registros: { traidos: 0 } }), true).mostrar).toBe(false);
    expect(decidirAvisoMigracion(hecha({ ajustes: { traidos: 3 } }, { visto: true }), true).mostrar).toBe(false);
    expect(decidirAvisoMigracion(hecha({ ajustes: { traidos: 3 } }), false).mostrar).toBe(false);
    expect(decidirAvisoMigracion(null, true).mostrar).toBe(false);
  });

  it("si no se pudo, dice por qué y qué pasa ahora", () => {
    const p = decidirAvisoMigracion(leerMarcadorMigracion('{"resultado":"pospuesta","motivo":"Sin internet."}'), true);
    expect(p).toMatchObject({ mostrar: true, tono: "aviso", titulo: TITULO_NO_SE_PUDO });
    expect(p.detalle).toBe("Sin internet. Siguen intactos: se volverá a intentar al abrir la app con internet.");
    const ab = decidirAvisoMigracion(leerMarcadorMigracion('{"resultado":"abandonada","motivo":"x","copia":"copia-1.json"}'), true);
    expect(ab.tono).toBe("error");
    expect(ab.detalle).toContain("migracion-origen/copia-1.json");
  });

  it("marcador roto o desconocido: nada; cerrar lo deja visto sin perder el resto", () => {
    expect(leerMarcadorMigracion("{")).toBeNull();
    expect(leerMarcadorMigracion('{"resultado":"otro"}')).toBeNull();
    const visto = marcarVisto('{"resultado":"hecha","copia":"c"}');
    expect(JSON.parse(visto!)).toEqual({ resultado: "hecha", copia: "c", visto: true });
    expect(marcarVisto("{")).toBeNull();
  });
});

describe("sin internet (T4b · TAM1107A): el HTML del binario con la dirección de la web", () => {
  const logica = leer("native/src-tauri/src/migracion_origen_logica.rs");
  /** Un `pub const X: &str = "…";` de Rust, ya sin escapes (los de Rust y JSON coinciden aquí). */
  const literal = (nombre: string): string => {
    const m = logica.match(new RegExp(`pub const ${nombre}: &str = "((?:[^"\\\\]|\\\\.)*)";`));
    if (!m) throw new Error(`falta ${nombre} en migracion_origen_logica.rs`);
    return JSON.parse(`"${m[1]}"`) as string;
  };
  /** El script de inicio TAL CUAL lo arma Rust (`script_exportacion`): el módulo entero + la llamada. */
  const scriptDeInicio = (): string => {
    const m = logica.match(/pub fn script_exportacion[\s\S]*?format!\(\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) throw new Error("falta script_exportacion");
    const plantilla = (JSON.parse(`"${m[1]}"`) as string).replace(/\{\{/g, "{").replace(/\}\}/g, "}");
    return plantilla
      .replace("{modulo_js}", () => leer("native/servidor-local/migracion-origen.js"))
      .replace("{o}", () => JSON.stringify(M.ORIGEN_WEB));
  };
  /** Una ventana como la oculta: su dirección, su almacén y el puente de Tauri que apunta lo que recibe. */
  async function ventanaOculta(direccion: string, ls: LsDeMentira, idb: unknown, tope = 3000) {
    const llamadas: Array<[string, Record<string, unknown>]> = [];
    const ventana: Record<string, unknown> = {
      location: new URL(direccion),
      localStorage: ls,
      indexedDB: idb,
      setTimeout,
      clearTimeout,
      btoa,
      atob,
      Blob,
      __TAURI_INTERNALS__: { invoke: async (c: string, a: Record<string, unknown>) => void llamadas.push([c, a]) },
    };
    ventana.window = ventana;
    vm.runInNewContext(scriptDeInicio(), ventana);
    const fin = Date.now() + tope;
    while (Date.now() < fin && !(llamadas.length && llamadas.length === llamadas[0][1].total)) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 50));
    return { llamadas, ventana };
  }

  it("la dirección sin red es del MISMO origen que la web publicada y su HTML no pide nada", () => {
    const url = new URL(M.ORIGEN_WEB + literal("PAGINA_EXPORTACION_SIN_RED"));
    expect(url.origin).toBe(M.ORIGEN_WEB);
    expect(url.pathname).toBe("/offline.html");
    expect(url.searchParams.get("starseed-migracion")).toBe("1");
    expect(literal("URL_VACIA")).toBe("about:blank");
    expect(literal("VAR_FORZAR_SIN_RED")).toBe("STARSEED_MIGRACION_SIN_RED");
    const html = literal("HTML_SIN_RED").toLowerCase();
    expect(html).toMatch(/^<!doctype html>/);
    for (const prohibido of ["<script", "src=", "href=", "<link", "<iframe", "url(", "@import", "http:", "https:"]) expect(html).not.toContain(prohibido);
  });

  it("el script de inicio de Rust exporta en esa página igual que con red, sin la sesión", async () => {
    const { idb, ls } = origenViejo();
    await llenarViejo(idb);
    const { llamadas } = await ventanaOculta(M.ORIGEN_WEB + literal("PAGINA_EXPORTACION_SIN_RED"), ls, idb);
    expect(llamadas.length).toBeGreaterThan(0);
    expect(new Set(llamadas.map((l) => l[0]))).toEqual(new Set(["migracion_origen_exportar"]));
    expect(llamadas.every((l) => l[1].error === null && l[1].total === llamadas.length)).toBe(true);
    const datos = JSON.parse(llamadas.map((l) => l[1].trozo).join(""));
    expect(datos.origen).toBe(M.ORIGEN_WEB);
    expect(Object.keys(datos.localStorage).sort()).toEqual(["appearance-config-v2", "comun", "starseed.ai.providers", "starseed.escritorios.v1"]);
    expect(JSON.stringify(datos)).not.toContain("refresh_token");
    expect(datos.indexedDB.map((b: { nombre: string }) => b.nombre)).toContain("starseed-memory");
  }, 15_000);

  it("en la página en blanco del principio (y en cualquier otro origen) no hace nada ni se bloquea para después", async () => {
    for (const direccion of ["about:blank", "http://127.0.0.1:47610/", "https://starseed-os.vercel.app.evil.example/offline.html"]) {
      const { idb, ls } = origenViejo();
      const { llamadas, ventana } = await ventanaOculta(direccion, ls, idb, 300);
      expect(llamadas).toEqual([]);
      expect(ventana.__ssMigracionOrigen).toBeUndefined();
    }
  }, 15_000);
});

describe("contrato con Rust", () => {
  const logica = leer("native/src-tauri/src/migracion_origen_logica.rs");
  const pegamento = leer("native/src-tauri/src/migracion_origen.rs");
  const arranque = leer("native/servidor-local/starseed-arranque.cjs");
  const constante = (nombre: string) => logica.match(new RegExp(`pub const ${nombre}: &str = "([^"]+)";`))?.[1];

  it("mismo formato, versión, ventana y página a los dos lados", () => {
    expect(constante("FORMATO")).toBe(M.FORMATO);
    expect(logica).toContain(`pub const VERSION_MIGRACION: u32 = ${M.VERSION};`);
    expect(constante("RUTA_IMPORTADOR")).toBe("/__starseed/migracion");
    expect(arranque).toContain('const RUTA_MIGRACION = "/__starseed/migracion";');
    expect(pegamento).toContain('include_str!("../../servidor-local/migracion-origen.js")');
    const capExport = JSON.parse(leer("native/src-tauri/capabilities/migracion-exportar.json"));
    expect(capExport.windows).toEqual([constante("ETIQUETA_VENTANA")]);
    expect(capExport.remote.urls).toEqual([M.ORIGEN_WEB]);
    expect(capExport.local).toBe(false);
    expect(capExport.permissions).toEqual(["allow-migracion-origen-exportar"]);
    const capImport = JSON.parse(leer("native/src-tauri/capabilities/migracion-importar.json"));
    expect(capImport.windows).toEqual(["main"]);
    expect(capImport.local).toBe(false);
    expect(capImport.remote.urls).toEqual(Array.from({ length: 10 }, (_, i) => `http://127.0.0.1:${47610 + i}`));
    const conf = JSON.parse(leer("native/src-tauri/tauri.conf.json"));
    expect(conf.app.security.capabilities).toEqual(expect.arrayContaining(["migracion-exportar", "migracion-importar"]));
  });

  it("los comandos que llama el JS existen en Rust", () => {
    const js = leer("native/servidor-local/migracion-origen.js");
    const usados = new Set([...js.matchAll(/"(migracion_origen_[a-z]+)"/g)].map((m) => m[1]));
    expect([...usados].sort()).toEqual(["migracion_origen_confirmar", "migracion_origen_datos", "migracion_origen_estado", "migracion_origen_exportar"]);
    for (const c of usados) expect(pegamento).toMatch(new RegExp(`pub (async )?fn ${c}\\(`));
  });
});
