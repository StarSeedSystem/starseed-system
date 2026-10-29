import type { RegistroMovimiento } from "@/lib/design/registros-movimiento";

type Trabajo = {
  id: string;
  proyecto: string;
  args: string[];
  env: Record<string, string | undefined>;
};

type Opciones = {
  senal: AbortSignal;
  alProgreso: (linea: string) => void;
};

type Estado<T> = {
  estado: "en_cola" | "renderizando" | "hecho" | "fallo" | "cancelado";
  motivo?: string;
  progreso?: { frame: number; total: number };
  resultado?: T;
  error?: string;
};

type Cola = {
  encolar: (trabajo: Trabajo) => string;
  cancelar: (id: string) => boolean;
  estado: (id: string) => Estado<unknown>;
  listar: () => Trabajo[];
};

type ConfiguracionCola = {
  ejecutar: (trabajo: Trabajo, opciones: Opciones) => Promise<unknown>;
  reloj: { avanzar: (ms: number) => void; obtener: () => number };
  maxSegundos?: number;
};

const ESTADOS = {
  EN_COLA: "en_cola" as const,
  RENDERIZANDO: "renderizando" as const,
  HECHO: "hecho" as const,
  FALLO: "fallo" as const,
  CANCELADO: "cancelado" as const,
} as const;

function crearCola(config: ConfiguracionCola): Cola {
  const trabajos: Record<string, Trabajo> = {};
  const estados: Record<string, Estado<unknown>> = {};
  const timeres: Record<string, number> = {};
  let reloj: { avanzar: (ms: number) => void; obtener: () => number };
  let maxSegundos: number | undefined;

  reloj = config.reloj;
  maxSegundos = config.maxSegundos;

  function obtenerAhora(): number {
    return reloj.obtener();
  }

  function hayTiempoMaximo(ahora: number): boolean {
    if (!maxSegundos) return false;
    if (!timeres.start) return false;
    return (ahora - timeres.start) >= maxSegundos * 1000;
  }

  function crearSenal(): { senal: AbortSignal; resolver: () => void } {
    let resuelto = false;
    const senal = new AbortSignal();
    return {
      senal,
      resolver: () => {
        if (!resuelto) {
          resuelto = true;
          senal.abort();
        }
      },
    };
  }

  function verificarTiempoMaximo(trabajoId: string, ahora: number) {
    if (!hayTiempoMaximo(ahora)) return;
    const senal = estados[trabajoId].senal as AbortSignal;
    if (senal && !senal.aborted) {
      senal.abort();
      estados[trabajoId] = {
        ...estados[trabajoId],
        estado: ESTADOS.CANCELADO,
        motivo: "tiempo máximo",
      };
    }
  }

  return {
    encolar(trabajo: Trabajo): string {
      const id = trabajo.id;
      if (trabajos[id]) {
        throw new Error("Ya existe un trabajo con este id");
      }
      if (!/^[a-z0-9-]+$/i.test(trabajo.proyecto)) {
        throw new Error("El proyecto no es válido");
      }
      const banderaIlegal = trabajo.args.find((a) => !["--format", "-o", "--rm"].includes(a.startsWith("-") ? a : `-${a}`));
      if (banderaIlegal) {
        throw new Error("Bandera no permitida");
      }

      trabajos[id] = trabajo;
      estados[id] = { estado: ESTADOS.EN_COLA };
      return id;
    },

    cancelar(id: string): boolean {
      const estado = estados[id];
      if (!estado || estado.estado === ESTADOS.CANCELADO || estado.estado === ESTADOS.HECHO || estado.estado === ESTADOS.FALLO) {
        return false;
      }

      if (estado.estado === ESTADOS.RENDERIZANDO) {
        if (estado.senal && !estado.senal.aborted) {
          estado.senal.abort();
        }
      }

      estados[id] = {
        ...estado,
        estado: ESTADOS.CANCELADO,
        motivo: "cancelado",
      };
      return true;
    },

    estado(id: string): Estado<unknown> {
      const estado = estados[id];
      if (!estado) {
        throw new Error(`Trabajo ${id} no existe`);
      }
      return { ...estado };
    },

    listar(): Trabajo[] {
      return Object.values(trabajos);
    },
  };
}

function progresoDeLinea(linea: string): { frame: number; total: number } | null {
  const coincidencia = linea.match(/@[\w]+\s*\{"frame":(\d+),"total":(\d+)\}/);
  if (!coincidencia) return null;
  return { frame: parseInt(coincidencia[1]), total: parseInt(coincidencia[2]) };
}

function validarArgs(arg: string | string[]): string | null {
  if (typeof arg === "string") {
    return "argumento sin bandera";
  }

  const banderaIlegal = arg.find((a) => !["--format", "-o", "--rm"].includes(a.startsWith("-") ? a : `-${a}`));
  if (banderaIlegal) {
    return "bandera no permitida";
  }

  const sinBandera = arg.find((a, i) => !["--format", "-o", "--rm"].includes(a.startsWith("-") ? a : `-${a}`) && i === 0);
  if (sinBandera) {
    return "argumento sin bandera";
  }

  if (arg.some((a, i) => a === "-o" && (i + 1 >= arg.length || arg[i + 1].includes("/")))) {
    return "fuera del proyecto";
  }

  if (arg.some((a, i) => a === "-o" && arg[i + 1].includes("\n"))) {
    return "con control";
  }

  return null;
}

function relojFalso() {
  let avanzado = 0;
  return {
    avanzar: (ms: number) => {
      avanzado += ms;
    },
    obtener: () => avanzado,
    avanzado,
  };
}

function diferido<T>(): { promesa: Promise<T>; resolver: (valor: T) => void } {
  let resolver: (valor: T) => void;
  const promesa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return { promesa, resolver: resolver! };
}

function espera(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const ENTORNO = { NODE_ENV: "production", VAR: "value" };

export { crearCola, ESTADOS, validarArgs, progresoDeLinea, esperar };
export type { Trabajo, Opciones, Estado, Cola };
