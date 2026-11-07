/*
 * IndexedDB de mentira para las pruebas de la migración del origen (APP1107B · T4). Solo lo que usa
 * native/servidor-local/migracion-origen.js: abrir (con versión, mejora y aborto), `databases()`,
 * almacenes con keyPath / autoIncrement / clave fuera de línea, índices, cursores y `add` con
 * ConstraintError. Eventos asíncronos como en el navegador; un error no prevenido aborta la transacción.
 * (Ayudante compartido: no es una suite; vitest solo mira los `*.test.ts`.)
 */

type Clave = unknown;
interface Almacen {
  keyPath: string | null;
  autoIncrement: boolean;
  indices: Map<string, { keyPath: string | string[]; unique: boolean; multiEntry: boolean }>;
  datos: Map<string, { k: Clave; v: unknown }>;
  siguiente: number;
}
interface Base {
  version: number;
  almacenes: Map<string, Almacen>;
}

const tarde = (f: () => void) => setTimeout(f, 0);
const id = (k: Clave) => JSON.stringify(k instanceof Date ? { fecha: k.getTime() } : k);

function lista(nombres: string[]) {
  const o: Record<string | number, unknown> = {
    length: nombres.length,
    item: (i: number) => nombres[i] ?? null,
    contains: (n: string) => nombres.includes(n),
  };
  nombres.forEach((n, i) => (o[i] = n));
  return o;
}

function rango(k: Clave): number {
  if (typeof k === "number") return 0;
  if (k instanceof Date) return 1;
  if (typeof k === "string") return 2;
  return 3;
}

function comparar(a: Clave, b: Clave): number {
  const ra = rango(a);
  const rb = rango(b);
  if (ra !== rb) return ra - rb;
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const c = comparar(a[i], b[i]);
      if (c) return c;
    }
    return a.length - b.length;
  }
  const x = a instanceof Date ? a.getTime() : (a as number | string);
  const y = b instanceof Date ? (b as Date).getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
}

function claveValida(k: Clave): boolean {
  if (typeof k === "number") return !Number.isNaN(k);
  if (typeof k === "string" || k instanceof Date) return true;
  return Array.isArray(k) && k.every(claveValida);
}

function extraer(v: unknown, keyPath: string): Clave {
  let x: unknown = v;
  for (const p of keyPath.split(".")) {
    if (x === null || typeof x !== "object") return undefined;
    x = (x as Record<string, unknown>)[p];
  }
  return x;
}

class Peticion {
  result: unknown = undefined;
  error: { name: string; message: string } | null = null;
  transaction: unknown = null;
  onsuccess: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onupgradeneeded: ((ev: unknown) => void) | null = null;
  onblocked: ((ev: unknown) => void) | null = null;
}

function errorDom(name: string) {
  return Object.assign(new Error(name), { name });
}

class Transaccion {
  oncomplete: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private pendientes = 0;
  private abortada = false;
  private cerrada = false;
  constructor(
    private base: Base,
    private nombres: string[],
    readonly mode: string,
  ) {
    tarde(() => this.quizaTerminar());
  }
  objectStore(n: string) {
    if (!this.nombres.includes(n) || !this.base.almacenes.has(n)) throw errorDom("NotFoundError");
    return vistaAlmacen(this.base.almacenes.get(n)!, this);
  }
  abort() {
    if (this.cerrada) return;
    this.abortada = true;
    this.cerrada = true;
    tarde(() => this.onabort?.());
  }
  /** Programa el resultado de una petición dentro de esta transacción. */
  pedir(p: Peticion, hacer: () => { ok: true; valor: unknown } | { ok: false; error: string }, alTerminar?: () => void) {
    this.pendientes++;
    tarde(() => {
      this.pendientes--;
      if (this.abortada) return;
      const r = hacer();
      if (r.ok) {
        p.result = r.valor;
        p.onsuccess?.({ target: p });
      } else {
        p.error = errorDom(r.error);
        let prevenido = false;
        p.onerror?.({ target: p, preventDefault: () => (prevenido = true), stopPropagation: () => {} });
        if (!prevenido) return this.abort();
      }
      alTerminar?.();
      this.quizaTerminar();
    });
  }
  private quizaTerminar() {
    tarde(() => {
      if (this.cerrada || this.abortada || this.pendientes > 0) return;
      this.cerrada = true;
      this.oncomplete?.();
    });
  }
}

function vistaAlmacen(a: Almacen, tx: Transaccion) {
  return {
    keyPath: a.keyPath,
    autoIncrement: a.autoIncrement,
    get indexNames() {
      return lista([...a.indices.keys()].sort());
    },
    index(n: string) {
      const ix = a.indices.get(n);
      if (!ix) throw errorDom("NotFoundError");
      return { ...ix };
    },
    createIndex(n: string, keyPath: string | string[], o: { unique?: boolean; multiEntry?: boolean } = {}) {
      a.indices.set(n, { keyPath, unique: !!o.unique, multiEntry: !!o.multiEntry });
    },
    add(v: unknown, k?: Clave) {
      if (tx.mode !== "readwrite" && tx.mode !== "versionchange") throw errorDom("ReadOnlyError");
      // La clave generada (autoIncrement) se decide al EJECUTAR la petición, como en el navegador.
      let clave: Clave;
      if (a.keyPath !== null) {
        if (k !== undefined) throw errorDom("DataError");
        clave = extraer(v, a.keyPath);
      } else {
        clave = k;
      }
      const generada = clave === undefined && a.autoIncrement;
      if (!generada && !claveValida(clave)) throw errorDom("DataError");
      const p = new Peticion();
      tx.pedir(p, () => {
        if (generada) {
          clave = a.siguiente;
          if (a.keyPath !== null) (v as Record<string, unknown>)[a.keyPath] = clave;
        }
        if (a.datos.has(id(clave))) return { ok: false, error: "ConstraintError" };
        a.datos.set(id(clave), { k: clave, v });
        if (a.autoIncrement && typeof clave === "number" && clave >= a.siguiente) a.siguiente = Math.floor(clave) + 1;
        return { ok: true, valor: clave };
      });
      return p;
    },
    openCursor() {
      const p = new Peticion();
      const filas = [...a.datos.values()].sort((x, y) => comparar(x.k, y.k));
      let i = 0;
      const paso = () =>
        tx.pedir(p, () => {
          const f = filas[i];
          if (!f) return { ok: true, valor: null };
          return {
            ok: true,
            valor: {
              key: f.k,
              primaryKey: f.k,
              value: f.v,
              continue: () => {
                i++;
                paso();
              },
            },
          };
        });
      paso();
      return p;
    },
  };
}

export function crearIdbDeMentira() {
  const bases = new Map<string, Base>();
  const vistaBase = (nombre: string, b: Base, enMejora: Transaccion | null) => ({
    name: nombre,
    get version() {
      return b.version;
    },
    get objectStoreNames() {
      return lista([...b.almacenes.keys()].sort());
    },
    createObjectStore(n: string, o: { keyPath?: string; autoIncrement?: boolean } = {}) {
      if (!enMejora) throw errorDom("InvalidStateError");
      if (b.almacenes.has(n)) throw errorDom("ConstraintError");
      const a: Almacen = { keyPath: o.keyPath ?? null, autoIncrement: !!o.autoIncrement, indices: new Map(), datos: new Map(), siguiente: 1 };
      b.almacenes.set(n, a);
      return vistaAlmacen(a, enMejora);
    },
    transaction(n: string | string[], modo = "readonly") {
      return new Transaccion(b, Array.isArray(n) ? n : [n], modo);
    },
    close() {},
  });
  return {
    bases,
    databases: async () => [...bases.entries()].map(([name, b]) => ({ name, version: b.version })),
    open(nombre: string, version?: number) {
      const p = new Peticion();
      tarde(() => {
        const existe = bases.get(nombre);
        const vieja = existe ? existe.version : 0;
        if (version !== undefined && version < vieja) {
          p.error = errorDom("VersionError");
          p.onerror?.({ target: p, preventDefault: () => {} });
          return;
        }
        const nueva = version ?? (vieja || 1);
        if (nueva > vieja) {
          // Borrador: si la mejora se aborta, nada cambia (ni se crea la base).
          const borrador: Base = { version: nueva, almacenes: new Map(existe ? existe.almacenes : []) };
          const tx = new Transaccion(borrador, [], "versionchange");
          let abortada = false;
          tx.abort = () => {
            abortada = true;
          };
          p.result = vistaBase(nombre, borrador, tx);
          p.transaction = tx;
          p.onupgradeneeded?.({ target: p, oldVersion: vieja, newVersion: nueva });
          tarde(() => {
            if (abortada) {
              p.error = errorDom("AbortError");
              p.result = undefined;
              p.onerror?.({ target: p, preventDefault: () => {} });
              return;
            }
            bases.set(nombre, borrador);
            p.result = vistaBase(nombre, borrador, null);
            p.onsuccess?.({ target: p });
          });
          return;
        }
        p.result = vistaBase(nombre, existe!, null);
        p.onsuccess?.({ target: p });
      });
      return p;
    },
  };
}
