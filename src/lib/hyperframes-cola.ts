export interface Trabajo {
  id: string;
  proyecto: string;
  args: string[];
  env: Record<string, string>;
}

export interface Opciones {
  senal: AbortSignal;
  alProgreso: (linea: string) => void;
}

export interface Resultado {
  codigo: number;
  salida?: string;
  error?: string;
}

export type Ejecutar = (
  trabajo: Trabajo,
  opciones: Opciones,
) => Promise<Resultado | number> | Resultado | number;

export interface Reloj {
  obtener: () => number;
}

export interface CrearCola {
  ejecutar: Ejecutar;
  reloj: Reloj;
  maxSegundos?: number;
}

export const ESTADOS = {
  EN_COLA: "en_cola",
  RENDERIZANDO: "renderizando",
  HECHO: "hecho",
  FALLO: "fallo",
  CANCELADO: "cancelado",
} as const;

export const ENTORNO: Readonly<Record<string, string>> = Object.freeze({
  HF_TELEMETRIA: "0",
  ELECTRON_ENABLE_LOGGING: "0",
  ELECTRON_NO_ATTACH_STDOUT: "1",
});

export interface Progreso {
  frame: number;
  total: number;
}

const BANDERAS_PERMITIDAS = new Set([
  "-o",
  "--output",
  "--format",
  "--codec",
  "--fps",
  "--peso",
  "--calidad",
]);

const CONTROL = /[\u0000-\u001F\u007F]/;

function mensajeRutaFuera(valor: string): string {
  return `bandera con ruta fuera del proyecto: ${valor}`;
}

export function validarArgs(args: string | string[]): string | null {
  if (typeof args === "string" || !Array.isArray(args)) {
    return "los args deben ser una lista de banderas";
  }
  let previaBandera = false;
  for (const arg of args) {
    if (typeof arg !== "string" || CONTROL.test(arg)) {
      return "bandera con caracteres de control";
    }
    if (arg.startsWith("-")) {
      const nombre = arg.split("=", 1)[0];
      if (!BANDERAS_PERMITIDAS.has(nombre)) {
        return `bandera no permitida: ${nombre}`;
      }
      previaBandera = true;
      continue;
    }
    if (!previaBandera) {
      return "argumento sin bandera";
    }
    if (arg.startsWith("/") || arg.startsWith("~") || arg.includes("\\")) {
      return mensajeRutaFuera(arg);
    }
    if (arg.split("/").includes("..")) {
      return mensajeRutaFuera(arg);
    }
    previaBandera = false;
  }
  return null;
}

export function progresoDeLinea(linea: string): Progreso | null {
  const indice = linea.indexOf("@hf-progress");
  if (indice === -1) return null;
  const trozo = linea.slice(indice + "@hf-progress".length).trim();
  let dato: unknown;
  try {
    dato = JSON.parse(trozo);
  } catch {
    return null;
  }
  if (typeof dato !== "object" || dato === null || Array.isArray(dato)) return null;
  const { frame, total } = dato as Record<string, unknown>;
  if (typeof frame !== "number" || typeof total !== "number") return null;
  return { frame, total };
}

const RUTA_ABSOLUTA = /\/[^\s"'<>]+/g;

function filtrarRutas(texto: string): string {
  return texto.replace(RUTA_ABSOLUTA, "<ruta>");
}

interface Registro {
  trabajo: Trabajo;
  estado: (typeof ESTADOS)[keyof typeof ESTADOS];
  progreso: Progreso | null;
  resultado: Resultado | null;
  error: string | null;
  motivo: string | null;
  control: AbortController | null;
  viviente: boolean;
}

function validarProyecto(proyecto: string): void {
  if (
    typeof proyecto !== "string" ||
    proyecto.length === 0 ||
    proyecto.startsWith("/") ||
    proyecto.startsWith("~") ||
    proyecto.split("/").includes("..") ||
    CONTROL.test(proyecto)
  ) {
    throw new Error("proyecto fuera del proyecto raíz");
  }
}

export function crearCola(crear: CrearCola) {
  const { ejecutar, reloj, maxSegundos } = crear;
  const registros = new Map<string, Registro>();
  const orden: string[] = [];
  let vivo: string | null = null;

  function comprobarFin(registro: Registro): void {
    if (
      maxSegundos !== undefined &&
      registro.estado === ESTADOS.RENDERIZANDO &&
      reloj.obtener() >= maxSegundos * 1000
    ) {
      liquidar(registro, ESTADOS.CANCELADO, null, "tiempo máximo");
      registro.control?.abort();
      vivo = null;
      lanzar();
    }
  }

  function liquidar(
    registro: Registro,
    estado: Registro["estado"],
    resultado: Resultado | null,
    motivo?: string,
  ): void {
    registro.estado = estado;
    registro.viviente = false;
    registro.resultado = resultado;
    registro.motivo = motivo ?? null;
    registro.error = null;
  }

  async function correr(registro: Registro): Promise<void> {
    registro.control = new AbortController();
    registro.estado = ESTADOS.RENDERIZANDO;
    let valor: unknown;
    try {
      valor = await ejecutar(registro.trabajo, {
        senal: registro.control.signal,
        alProgreso: (linea) => {
          const progreso = progresoDeLinea(linea);
          if (progreso && registro.viviente) registro.progreso = progreso;
        },
      });
    } catch {
      valor = { codigo: 1 };
    }
    if (!registro.viviente) return;
    const bruto: unknown = await valor;
    if (!registro.viviente) return;
    const desecho = filtrarResultado(bruto);
    if (desecho.codigo !== 0) {
      liquidar(registro, ESTADOS.FALLO, desecho);
      registro.error = desecho.error !== undefined ? filtrarRutas(desecho.error) : null;
    } else {
      liquidar(registro, ESTADOS.HECHO, desecho);
    }
    vivo = null;
    lanzar();
  }

  function filtrarResultado(bruto: unknown): Resultado {
    if (typeof bruto === "number") return { codigo: bruto };
    const objeto = (bruto ?? {}) as Record<string, unknown>;
    const desecho: Resultado = { codigo: typeof objeto.codigo === "number" ? objeto.codigo : 0 };
    if (typeof objeto.salida === "string") {
      const salida = filtrarRutas(objeto.salida);
      if (salida) desecho.salida = salida;
    }
    if (typeof objeto.error === "string") desecho.error = filtrarRutas(objeto.error);
    return desecho;
  }

  function lanzar(): void {
    if (vivo !== null) return;
    const siguiente = orden.find((id) => registros.get(id)?.estado === ESTADOS.EN_COLA);
    if (siguiente === undefined) return;
    const registro = registros.get(siguiente)!;
    vivo = siguiente;
    void correr(registro);
  }

  return {
    encolar(entrada: { id: string; proyecto: string; args: string[] }): string {
      if (registros.has(entrada.id)) {
        throw new Error(`id repetido en la cola: ${entrada.id}`);
      }
      validarProyecto(entrada.proyecto);
      const fallo = validarArgs(entrada.args);
      if (fallo) throw new Error(fallo);
      registros.set(entrada.id, {
        trabajo: { id: entrada.id, proyecto: entrada.proyecto, args: [...entrada.args], env: { ...ENTORNO } },
        estado: ESTADOS.EN_COLA,
        progreso: null,
        resultado: null,
        error: null,
        motivo: null,
        control: null,
        viviente: true,
      });
      orden.push(entrada.id);
      lanzar();
      return entrada.id;
    },

    estado(id: string) {
      const registro = registros.get(id);
      if (!registro) return null;
      comprobarFin(registro);
      const estado: {
        estado: string;
        progreso?: Progreso;
        resultado?: Resultado;
        error?: string;
        motivo?: string;
      } = { estado: registro.estado };
      if (registro.progreso !== null) estado.progreso = registro.progreso;
      if (registro.resultado !== null) estado.resultado = registro.resultado;
      if (registro.error !== null) estado.error = registro.error;
      if (registro.motivo !== null) estado.motivo = registro.motivo;
      return estado;
    },

    cancelar(id: string): boolean {
      const registro = registros.get(id);
      if (!registro || !registro.viviente) return false;
      liquidar(registro, ESTADOS.CANCELADO, null);
      if (vivo === id) {
        registro.control?.abort();
        vivo = null;
        lanzar();
      }
      return true;
    },

    listar(): {
      id: string;
      estado: string;
      progreso: Progreso | null;
    }[] {
      return orden.map((id) => {
        const registro = registros.get(id)!;
        comprobarFin(registro);
        return { id, estado: registro.estado, progreso: registro.progreso };
      });
    },
  };
}
