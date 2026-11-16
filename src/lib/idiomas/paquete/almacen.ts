import type { PaqueteIdioma } from "./formato";

export interface AlmacenPaquetes {
  listarPaquetes(): PaqueteIdioma[];
  guardarPaquete(paquete: PaqueteIdioma): { ok: true } | { ok: false; motivo: string };
  quitarPaquete(codigo: string): void;
  leerPaquete(codigo: string): PaqueteIdioma | null;
}

export const CLAVE_ALMACEN = "starseed.idiomas.paquetes.v1" as const;
export const EVENTO_CAMBIO = "starseed:idiomas-paquetes" as const;
export const MAX_PAQUETES = 12;
export const MAX_BYTES_TOTAL = 6 * 1024 * 1024;

type AlmacenInterno = {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
};

function obtenerAlmacen(): AlmacenInterno {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

function dispararEventoCambio(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO));
  }
}

export function crearAlmacenPaquetes(almacen?: AlmacenInterno): AlmacenPaquetes {
  const store = almacen ?? obtenerAlmacen();

  function leerTodos(): PaqueteIdioma[] {
    try {
      const bruto = store.getItem(CLAVE_ALMACEN);
      if (!bruto) return [];
      const parsed = JSON.parse(bruto);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((p): p is PaqueteIdioma => p && typeof p.codigo === "string");
    } catch {
      return [];
    }
  }

  function escribirTodos(paquetes: PaqueteIdioma[]): void {
    try {
      store.setItem(CLAVE_ALMACEN, JSON.stringify(paquetes));
    } catch {
      // Si falla la escritura, la app sigue sin paquetes
    }
  }

  function calcularTamanoTotal(paquetes: PaqueteIdioma[]): number {
    return new TextEncoder().encode(JSON.stringify(paquetes)).length;
  }

  return {
    listarPaquetes() {
      return leerTodos();
    },

    guardarPaquete(paquete) {
      const actuales = leerTodos();
      const indice = actuales.findIndex((p) => p.codigo === paquete.codigo);
      const nuevos = indice >= 0 ? [...actuales] : [...actuales, paquete];
      if (indice >= 0) nuevos[indice] = paquete;

      if (nuevos.length > MAX_PAQUETES) {
        return { ok: false, motivo: "Limite de 12 paquetes superado" };
      }

      const tamano = calcularTamanoTotal(nuevos);
      if (tamano > MAX_BYTES_TOTAL) {
        return { ok: false, motivo: "Limite de 6 MB superado" };
      }

      escribirTodos(nuevos);
      dispararEventoCambio();
      return { ok: true };
    },

    quitarPaquete(codigo) {
      const actuales = leerTodos();
      const filtrados = actuales.filter((p) => p.codigo !== codigo);
      if (filtrados.length !== actuales.length) {
        escribirTodos(filtrados);
        dispararEventoCambio();
      }
    },

    leerPaquete(codigo) {
      const actuales = leerTodos();
      return actuales.find((p) => p.codigo === codigo) ?? null;
    },
  };
}

export const almacenPaquetes = crearAlmacenPaquetes();