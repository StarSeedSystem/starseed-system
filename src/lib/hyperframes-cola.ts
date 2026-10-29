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
  senal?: AbortSignal;
  startTime?: number;
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

const BANDERAS_PERMITIDAS = ["--format", "-o"] as const;

function normalizarBandera(arg: string): string {
  if (arg.startsWith("--")) {
    const idx = arg.indexOf("=");
    return idx >= 0 ? arg.slice(0, idx) : arg;
  }
  if (arg.startsWith("-")) {
    return arg;
  }
  return arg;
}

function crearCola(config: ConfiguracionCola): Cola {
  const trabajos: Record<string, Trabajo> = {};
  const estados: Record<string, Estado<unknown>> = {};
  const controladores: Record<string, AbortController> = {};
  const timeres: Record<string, number> = {};
  let procesando = false;

  const { ejecutar, reloj, maxSegundos } = config;

  function obtenerAhora(): number {
    return reloj.obtener();
  }

  function hayTiempoMaximo(trabajoId: string, ahora: number): boolean {
    if (!maxSegundos) return false;
    const start = timeres[trabajoId];
    if (start === undefined) return false;
    return (ahora - start) >= maxSegundos * 1000;
  }

  function programarSiguiente() {
    queueMicrotask(procesarSiguiente);
  }

  async function procesarSiguiente() {
    if (procesando) return;
    const ids = Object.keys(trabajos);
    const siguienteId = ids.find((id) => estados[id]?.estado === ESTADOS.EN_COLA);
    if (!siguienteId) return;

    procesando = true;
    const trabajo = trabajos[siguienteId];
    const ahora = obtenerAhora();
    timeres[siguienteId] = ahora;

    const controller = new AbortController();
    const senal = controller.signal;
    controladores[siguienteId] = controller;

    estados[siguienteId] = {
      estado: ESTADOS.RENDERIZANDO,
      senal,
      startTime: ahora,
    };

    const opciones: Opciones = {
      senal,
      alProgreso: (linea: string) => {
        const progreso = progresoDeLinea(linea);
        if (progreso) {
          estados[siguienteId] = {
            ...estados[siguienteId],
            progreso,
          };
        }
      },
    };

    try {
      const resultado = await ejecutar(trabajo, opciones);
      if (senal.aborted) {
        estados[siguienteId] = {
          ...estados[siguienteId],
          estado: ESTADOS.CANCELADO,
          motivo: "cancelado",
        };
      } else if (typeof resultado === "object" && resultado !== null && "codigo" in resultado) {
        const { codigo, salida, error } = resultado as { codigo: number; salida?: string; error?: string };
        if (codigo === 0) {
          estados[siguienteId] = {
            ...estados[siguienteId],
            estado: ESTADOS.HECHO,
            resultado,
          };
        } else {
          const errorMsg = error ? error.replace(/\/[^\s]+\//g, "<ruta>") : "Error desconocido";
          estados[siguienteId] = {
            ...estados[siguienteId],
            estado: ESTADOS.FALLO,
            resultado: { codigo },
            error: errorMsg,
          };
        }
      } else {
        estados[siguienteId] = {
          ...estados[siguienteId],
          estado: ESTADOS.HECHO,
          resultado,
        };
      }
    } catch (e) {
      if (senal.aborted) {
        estados[siguienteId] = {
          ...estados[siguienteId],
          estado: ESTADOS.CANCELADO,
          motivo: "cancelado",
        };
      } else {
        estados[siguienteId] = {
          ...estados[siguienteId],
          estado: ESTADOS.FALLO,
          error: String(e),
        };
      }
    } finally {
      delete controladores[siguienteId];
      procesando = false;
      programarSiguiente();
    }
  }

  function verificarTiemposMaximos() {
    const ahora = obtenerAhora();
    for (const id of Object.keys(estados)) {
      if (estados[id].estado === ESTADOS.RENDERIZANDO && hayTiempoMaximo(id, ahora)) {
        const controller = controladores[id];
        if (controller && !controller.signal.aborted) {
          controller.abort();
        }
        estados[id] = {
          ...estados[id],
          estado: ESTADOS.CANCELADO,
          motivo: "tiempo máximo",
        };
      }
    }
  }

  const originalAvanzar = reloj.avanzar;
  reloj.avanzar = (ms: number) => {
    originalAvanzar(ms);
    verificarTiemposMaximos();
  };

  return {
    encolar(trabajo: Trabajo): string {
      const id = trabajo.id;
      if (trabajos[id]) {
        throw new Error("Ya existe un trabajo con este id");
      }
      if (!/^[a-z0-9-]+$/i.test(trabajo.proyecto)) {
        throw new Error("El proyecto no es válido");
      }
      const banderaIlegal = trabajo.args.find((a) => a.startsWith("-") && !BANDERAS_PERMITIDAS.includes(normalizarBandera(a) as "--format" | "-o"));
      if (banderaIlegal) {
        throw new Error("bandera no permitida");
      }

      const trabajoConEnv: Trabajo = {
        ...trabajo,
        env: trabajo.env ?? { ...process.env },
      };
      trabajos[id] = trabajoConEnv;
      estados[id] = { estado: ESTADOS.EN_COLA };
      programarSiguiente();
      return id;
    },

    cancelar(id: string): boolean {
      const estado = estados[id];
      if (!estado || estado.estado === ESTADOS.CANCELADO || estado.estado === ESTADOS.HECHO || estado.estado === ESTADOS.FALLO) {
        return false;
      }

      if (estado.estado === ESTADOS.RENDERIZANDO) {
        const controller = controladores[id];
        if (controller && !controller.signal.aborted) {
          controller.abort();
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
      const { senal, startTime, ...resto } = estado;
      return { ...resto };
    },

    listar(): Trabajo[] {
      return Object.values(trabajos);
    },
  };
}

function progresoDeLinea(linea: string): { frame: number; total: number } | null {
  const coincidencia = linea.match(/@(?:hf-progress|\[[\w-]+\])\s*\{"frame":(\d+),"total":(\d+)\}/);
  if (!coincidencia) return null;
  return { frame: parseInt(coincidencia[1]), total: parseInt(coincidencia[2]) };
}

function validarArgs(arg: string | string[]): string | null {
  if (typeof arg === "string") {
    return "no es una lista";
  }

  const banderaIlegal = arg.find((a) => a.startsWith("-") && !BANDERAS_PERMITIDAS.includes(normalizarBandera(a) as "--format" | "-o"));
  if (banderaIlegal) {
    return "bandera no permitida";
  }

  const sinBandera = arg.find((a, i) => !a.startsWith("-") && i === 0);
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

export { crearCola, ESTADOS, validarArgs, progresoDeLinea, espera };
export type { Trabajo, Opciones, Estado, Cola };