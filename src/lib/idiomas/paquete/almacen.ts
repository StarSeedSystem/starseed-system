const CLAVE = "starseed.idiomas.paquetes.v1";
const MAX_PAQUETES = 12;
const MAX_TAMANO_BYTES = 6 * 1024 * 1024;

export interface PaqueteIdioma {
  codigo: string;
  nombre: string;
  version: string;
  tamano: number;
  fechaInstalacion: string;
}

export interface ResultadoOperacion {
  ok: boolean;
  motivo?: string;
  paquetes?: PaqueteIdioma[];
}

export interface AlmacenPaquetes {
  listarPaquetes(): Promise<ResultadoOperacion>;
  guardarPaquete(p: PaqueteIdioma): Promise<ResultadoOperacion>;
  quitarPaquete(codigo: string): Promise<ResultadoOperacion>;
  leerPaquete(codigo: string): Promise<ResultadoOperacion>;
}

function leer(): PaqueteIdioma[] {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return [];
    const datos = JSON.parse(raw);
    if (!Array.isArray(datos)) return [];
    return datos.filter((p): p is PaqueteIdioma => typeof p === "object" && p !== null && typeof p.codigo === "string");
  } catch {
    return [];
  }
}

function guardar(paquetes: PaqueteIdioma[]): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(paquetes));
  } catch {
    // Silencioso: no se permite escribir
  }
}

function emitirEvento(): void {
  const evento = new CustomEvent("starseed:idiomas-paquetes", { detail: {} });
  window.dispatchEvent(evento);
}

export const almacenIdiomas: AlmacenPaquetes = {
  async listarPaquetes(): Promise<ResultadoOperacion> {
    try {
      const paquetes = leer();
      return { ok: true, paquetes };
    } catch {
      return { ok: false, motivo: "Error al leer paquetes" };
    }
  },

  async guardarPaquete(p: PaqueteIdioma): Promise<ResultadoOperacion> {
    if (!p.codigo || !p.codigo.trim()) {
      return { ok: false, motivo: "Código inválido" };
    }
    if (!p.nombre || !p.nombre.trim()) {
      return { ok: false, motivo: "Nombre inválido" };
    }

    const actuales = leer();

    const indice = actuales.findIndex((pkg) => pkg.codigo === p.codigo);
    if (indice >= 0) {
      actuales[indice] = p;
    } else {
      actuales.push(p);
    }

    const tamanoTotal = actuales.reduce((sum, pkg) => sum + (pkg.tamano || 0), 0);
    if (actuales.length > MAX_PAQUETES) {
      if (indice >= 0) {
        actuales.splice(indice, 1);
        actuales.push(p);
      } else {
        actuales.shift();
        actuales.push(p);
      }
    }

    const tamanoFinal = actuales.reduce((sum, pkg) => sum + (pkg.tamano || 0), 0);
    if (tamanoFinal > MAX_TAMANO_BYTES) {
      return { ok: false, motivo: `Límite de ${MAX_TAMANO_BYTES / 1024 / 1024} MB excedido` };
    }

    guardar(actuales);
    emitirEvento();
    return { ok: true };
  },

  async quitarPaquete(codigo: string): Promise<ResultadoOperacion> {
    if (!codigo || !codigo.trim()) {
      return { ok: false, motivo: "Código inválido" };
    }

    const actuales = leer();
    const filtrados = actuales.filter((pkg) => pkg.codigo !== codigo);

    if (filtrados.length === actuales.length) {
      return { ok: false, motivo: "Paquete no encontrado" };
    }

    guardar(filtrados);
    emitirEvento();
    return { ok: true };
  },

  async leerPaquete(codigo: string): Promise<ResultadoOperacion> {
    if (!codigo || !codigo.trim()) {
      return { ok: false, motivo: "Código inválido" };
    }

    const paquetes = leer();
    const encontrado = paquetes.find((pkg) => pkg.codigo === codigo);

    if (!encontrado) {
      return { ok: false, motivo: "Paquete no encontrado" };
    }

    return { ok: true, paquetes: [encontrado] };
  },
};