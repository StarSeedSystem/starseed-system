/**
 * (IDN1108A) Almacén local clave→valor de la identidad de cuenta (IndexedDB, con memoria de respaldo).
 * Guarda lo público/verificable: anclas, certificado propio, tenencia de la maestra, revocaciones.
 * La clave PRIVADA maestra NO vive aquí: sigue en `master-identity.ts` (necesita ser exportable para
 * poder pasarla cifrada a otra neurona); aquí solo se anota qué neurona la tiene.
 */

export interface AlmacenKV {
  leer<T>(clave: string): Promise<T | undefined>;
  escribir(clave: string, valor: unknown): Promise<void>;
  borrar(clave: string): Promise<void>;
  claves(): Promise<string[]>;
}

export function crearAlmacenMemoria(): AlmacenKV {
  const m = new Map<string, unknown>();
  return {
    async leer<T>(c: string) {
      return m.has(c) ? (structuredClone(m.get(c)) as T) : undefined;
    },
    async escribir(c, v) {
      m.set(c, structuredClone(v));
    },
    async borrar(c) {
      m.delete(c);
    },
    async claves() {
      return [...m.keys()];
    },
  };
}

const BD = "starseed-identidad";
const TIENDA = "kv";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TIENDA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

function pedir<T>(modo: IDBTransactionMode, f: (t: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, ko) => {
        const tx = db.transaction(TIENDA, modo);
        const r = f(tx.objectStore(TIENDA));
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
      }),
  );
}

/** IndexedDB si existe; si falla (ventana privada, sin soporte) cae a memoria sin lanzar. */
export function crearAlmacenIdb(): AlmacenKV {
  const respaldo = crearAlmacenMemoria();
  const hay = () => typeof indexedDB !== "undefined";
  return {
    async leer<T>(c: string) {
      if (hay()) {
        try {
          const v = await pedir<T | undefined>("readonly", (s) => s.get(c) as IDBRequest<T | undefined>);
          if (v !== undefined) return v;
        } catch {
          /* cae al respaldo */
        }
      }
      return respaldo.leer<T>(c);
    },
    async escribir(c, v) {
      await respaldo.escribir(c, v);
      if (hay()) {
        try {
          await pedir("readwrite", (s) => s.put(v, c));
        } catch {
          /* queda en memoria esta sesión */
        }
      }
    },
    async borrar(c) {
      await respaldo.borrar(c);
      if (hay()) {
        try {
          await pedir("readwrite", (s) => s.delete(c));
        } catch {
          /* */
        }
      }
    },
    async claves() {
      const k = new Set(await respaldo.claves());
      if (hay()) {
        try {
          for (const x of await pedir<IDBValidKey[]>("readonly", (s) => s.getAllKeys())) k.add(String(x));
        } catch {
          /* */
        }
      }
      return [...k];
    },
  };
}

let porDefecto: AlmacenKV | null = null;
/** Almacén real del proceso (uno por pestaña). */
export function almacenIdentidad(): AlmacenKV {
  return (porDefecto ??= crearAlmacenIdb());
}
/** Solo pruebas. */
export function _ponerAlmacenIdentidad(a: AlmacenKV | null): void {
  porDefecto = a;
}
