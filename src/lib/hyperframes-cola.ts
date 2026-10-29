// Cola de renders de HyperFrames: un trabajo en curso, sin rutas filtradas ni telemetría.

export type Solicitud = { id: string; proyecto: string; args: string[] };
export type Trabajo = Solicitud & { env: Record<string, string> };
export type Opciones = { senal: AbortSignal; alProgreso: (linea: string) => void };
export type Resultado = { codigo: number; error?: string; salida?: string };
export type NombreEstado = "en-cola" | "renderizando" | "hecho" | "fallo" | "cancelado";

export type Estado = {
  estado: NombreEstado;
  motivo?: string;
  progreso?: { frame: number; total: number };
  resultado?: unknown;
  error?: string;
};

export type Cola = {
  encolar: (solicitud: Solicitud) => string;
  cancelar: (id: string) => boolean;
  estado: (id: string) => Estado | undefined;
  listar: () => Solicitud[];
};

export type Reloj = { obtener: () => number };
export type Configuracion = {
  ejecutar: (trabajo: Trabajo, opciones: Opciones) => Promise<unknown>;
  reloj: Reloj;
  maxSegundos?: number;
};

export const ESTADOS = {
  EN_COLA: "en-cola",
  RENDERIZANDO: "renderizando",
  HECHO: "hecho",
  FALLO: "fallo",
  CANCELADO: "cancelado",
} as const;

// Telemetría apagada de serie: el entorno que la cola pasa a cada render.
export const ENTORNO: Record<string, string> = { HF_TELEMETRIA: "0", HF_ERROR_REPORTING: "0" };

export const BANDERAS_PERMITIDAS = ["-o", "--format", "--rm"] as const;

const SIN_VALOR = new Set(["--rm"]);

// Lee «@hf-progress {"frame":N,"total":M}» (con o sin prefijo) y descarta el ruido.
export function progresoDeLinea(linea: string): { frame: number; total: number } | null {
  if (!linea.includes("@hf-progress")) return null;
  const coincidencia = linea.match(/\{"frame":(\d+),"total":(\d+)\}/);
  return coincidencia ? { frame: Number(coincidencia[1]), total: Number(coincidencia[2]) } : null;
}

function revisarValor(valor: string): string | null {
  if (/[\u0000-\u001f]/.test(valor)) return "contiene carácter de control";
  if (valor.startsWith("/") || valor.startsWith("\\") || valor.startsWith("~") || valor === ".." || valor.startsWith("../")) return "ruta fuera del proyecto";
  if (/^[A-Za-z]:/.test(valor)) return "ruta fuera del proyecto";
  return null;
}

// Solo lista de banderas de la lista blanca, con valores dentro del proyecto.
export function validarArgs(arg: string | string[]): string | null {
  if (typeof arg === "string") return "argumento sin bandera";
  let pendiente: string | null = null;
  for (const [indice, token] of arg.entries()) {
    if (pendiente) {
      if (token.startsWith("-")) return `bandera sin valor: ${pendiente}`;
      const fallo = revisarValor(token);
      if (fallo) return fallo;
      pendiente = null;
      continue;
    }
    if (token.startsWith("-")) {
      const [base] = token.split("=");
      if (!BANDERAS_PERMITIDAS.includes(base as (typeof BANDERAS_PERMITIDAS)[number])) return `bandera no permitida: ${base}`;
      if (SIN_VALOR.has(base)) continue;
      const corte = token.indexOf("=");
      if (corte === -1) { pendiente = base; continue; }
      const valor = token.slice(corte + 1);
      const fallo = revisarValor(valor);
      if (fallo) return fallo;
    } else if (indice === 0) {
      return "argumento sin bandera";
    } else {
      return "bandera no permitida";
    }
  }
  if (pendiente) return `bandera sin valor: ${pendiente}`;
  return null;
}

// Quita las rutas absolutas de un mensaje: «no pudo /home/a/x.mp4» → «no pudo <ruta>».
export function sinRutas(texto: string): string {
  return texto
    .replace(/[A-Za-z]:\\(?:[\w.\-]+[\\/]?)+/g, "<ruta>")
    .replace(/(?:\/(?:\.{1,2}|[\w.\-]+))+/g, "<ruta>");
}

// Cola: renderiza de uno en uno, con id único, rutas seguras y cancelación honesta.
export function crearCola(config: Configuracion): Cola {
  const orden: string[] = [];
  const registros = new Map<string, Estado>();
  const solicitudes = new Map<string, Solicitud>();
  const inicios = new Map<string, number>();
  const abortos = new Map<string, AbortController>();
  let enCurso: string | null = null;

  const registro = (id: string): Estado => {
    const r = registros.get(id);
    if (!r) throw new Error(`El trabajo ${id} no existe`);
    return r;
  };

  function fijar(id: string, siguiente: Estado): void {
    registros.set(id, siguiente);
  }

  function lanzarOtra(): void {
    const siguiente = orden.find((id) => registro(id).estado === ESTADOS.EN_COLA);
    if (!siguiente) return;
    const solicitud = solicitudes.get(siguiente) as Solicitud;
    const control = new AbortController();
    const trabajo: Trabajo = { ...solicitud, env: { ...ENTORNO } };
    const alProgreso = (linea: string): void => {
      const r = registro(siguiente);
      const p = progresoDeLinea(linea);
      if (r.estado === ESTADOS.RENDERIZANDO && p) fijar(siguiente, { ...r, progreso: p });
    };
    inicios.set(siguiente, config.reloj.obtener());
    abortos.set(siguiente, control);
    fijar(siguiente, { estado: ESTADOS.RENDERIZANDO });
    enCurso = siguiente;
    config
      .ejecutar(trabajo, { senal: control.signal, alProgreso })
      .then((sinAutopsia) => cerrar(siguiente, sinAutopsia))
      .catch((causa: unknown) => cerrar(siguiente, { codigo: 1, error: String(causa) }));
  }

  function cerrar(id: string, bruto: unknown): void {
    const enMarcha = registro(id).estado === ESTADOS.RENDERIZANDO;
    if (enCurso === id) enCurso = null;
    inicios.delete(id);
    abortos.delete(id);
    if (!enMarcha) { lanzarOtra(); return; }
    const listo = bruto as Resultado;
    if (typeof listo?.codigo === "number" && listo.codigo !== 0) {
      fijar(id, { estado: ESTADOS.FALLO, resultado: listo, error: listo.error ? sinRutas(listo.error) : undefined });
    } else {
      fijar(id, { estado: ESTADOS.HECHO, resultado: listo });
    }
    lanzarOtra();
  }

  function porTiempo(id: string): Estado | undefined {
    const tope = config.maxSegundos;
    const r = registro(id);
    const inicio = inicios.get(id);
    if (r.estado !== ESTADOS.RENDERIZANDO || tope === undefined || inicio === undefined) return undefined;
    if (config.reloj.obtener() - inicio < tope * 1000) return undefined;
    abortos.get(id)?.abort();
    inicios.delete(id);
    abortos.delete(id);
    if (enCurso === id) enCurso = null;
    fijar(id, { estado: ESTADOS.CANCELADO, motivo: "tiempo máximo" });
    lanzarOtra();
    return registro(id);
  }

  return {
    encolar(solicitud: Solicitud): string {
      const { id, proyecto, args } = solicitud;
      if (solicitudes.has(id)) throw new Error(`Ya hay un trabajo con el id ${id}`);
      if (!/^[\w\-][^/\\]*$/.test(proyecto) || proyecto.includes("..")) throw new Error(`El proyecto ${proyecto}, fuera del root`);
      const falloArgs = validarArgs(args);
      if (falloArgs) throw new Error(`args con bandera no permitida: ${falloArgs}`);
      solicitudes.set(id, solicitud);
      registros.set(id, { estado: ESTADOS.EN_COLA });
      orden.push(id);
      lanzarOtra();
      return id;
    },
    cancelar(id: string): boolean {
      const r = registro(id);
      if (r.estado !== ESTADOS.EN_COLA && r.estado !== ESTADOS.RENDERIZANDO) return false;
      if (r.estado === ESTADOS.RENDERIZANDO) abortos.get(id)?.abort();
      fijar(id, { estado: ESTADOS.CANCELADO });
      return true;
    },
    estado(id: string): Estado | undefined {
      if (!registros.has(id)) return undefined;
      return porTiempo(id) ?? { ...registro(id) };
    },
    listar(): Solicitud[] {
      return orden.map((id) => { const s = solicitudes.get(id) as Solicitud; return { ...s }; });
    },
  };
}
