// Adaptador de Almacen sobre IndexedDB (append-only, nunca localStorage).
import type { Almacen, Experiencia, CierreExperiencia } from "./experiencias";

const DB_NOMBRE = "starseed-experiencias";
const DB_TABLA = "lineas";

function abrir(nombre: string): Promise<IDBDatabase> {
  return new Promise((ok, falla) => {
    const pedido = indexedDB.open(nombre, 1);
    pedido.onupgradeneeded = () => {
      pedido.result.createObjectStore(DB_TABLA, { autoIncrement: true });
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => falla(pedido.error);
  });
}

export function almacenIDB(nombre: string = DB_NOMBRE): Almacen {
  return {
    async poner(linea) {
      const db = await abrir(nombre);
      try {
        await new Promise<void>((ok, falla) => {
          const tx = db.transaction(DB_TABLA, "readwrite");
          tx.objectStore(DB_TABLA).add(linea);
          tx.oncomplete = () => ok();
          tx.onerror = () => falla(tx.error);
        });
      } finally {
        db.close();
      }
    },
    async lineas() {
      const db = await abrir(nombre);
      try {
        return await new Promise((ok, falla) => {
          const pedido = db.transaction(DB_TABLA, "readonly").objectStore(DB_TABLA).getAll();
          pedido.onsuccess = () => ok(pedido.result as (Experiencia | CierreExperiencia)[]);
          pedido.onerror = () => falla(pedido.error);
        });
      } finally {
        db.close();
      }
    },
  };
}
