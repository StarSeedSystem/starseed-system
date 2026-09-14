// Etapas del camino de una tarea y detección de atascos.
// Módulo PURO: sin fs, sin red y sin reloj propio — el instante actual
// entra siempre por parámetro para que el comportamiento sea comprobable.

export const ETAPAS = [
  "escribiendo",
  "verificando",
  "probando",
  "revisando",
  "visto bueno",
  "integrada",
] as const;

export type Etapa = (typeof ETAPAS)[number];

export type Desenlace = "en marcha" | "atascada" | "integrada" | "parada";

export interface PasoTarea {
  id: string;
  etapa: Etapa;
  indice: number;
  porcentaje: number;
  minutosEnEtapa: number;
  desenlace: Desenlace;
  detalle: string;
  modelo?: string;
}

// Minutos a partir de los cuales una etapa se considera atascada.
// El de «visto bueno» es 20 porque el 13-09-2026 tres tareas estuvieron
// 147 minutos esperando aprobación sin que el Mando lo mostrara.
export const TOPES_MIN: Record<Exclude<Etapa, "integrada">, number> = {
  escribiendo: 25,
  verificando: 20,
  probando: 20,
  revisando: 15,
  "visto bueno": 20,
};

// Estados de progreso.json que significan que la tarea ya no avanza.
const ESTADOS_PARADOS = new Set([
  "rechazada",
  "bloqueada",
  "sin_cambios",
  "conflicto",
  "interrumpida",
]);

// Traduce lo que escriben el orquestador (latido) y progreso.json.
// Devuelve null ante un valor desconocido: no se inventa una etapa.
export function etapaDeFase(fase: string, estado?: string | null): Etapa | null {
  const f = (fase || "").trim().toLowerCase();
  const e = (estado || "").trim().toLowerCase();
  if (e === "esperando_aprobacion") return "visto bueno";
  if (e === "commit" || e === "hecho") return "integrada";
  if (f === "escribiendo" || f === "completando") return "escribiendo";
  if (f === "tsc") return "verificando";
  if (f === "revision") return "revisando";
  if (f === "esperando aprobación") return "visto bueno";
  if (f === "commit" || f === "hecho") return "integrada";
  return null;
}

const DETALLE_PARADA: Record<string, string> = {
  rechazada: "rechazada en revisión",
  bloqueada: "bloqueada por una dependencia",
  sin_cambios: "terminó sin producir cambios",
  conflicto: "conflicto al integrar",
  interrumpida: "interrumpida antes de terminar",
};

function textoParada(estado: string): string {
  if (estado.startsWith("fallo")) {
    return `detenida por ${estado.replace(/_/g, " ")}`;
  }
  return DETALLE_PARADA[estado] ?? "detenida";
}

export interface EntradaTarea {
  id?: unknown;
  fase?: unknown;
  estado?: unknown;
  minutosDesde?: unknown;
  modelo?: unknown;
}

// Convierte una entrada cruda (latido o fila de progreso.json) en un PasoTarea.
// `minutosDesde` es la marca de tiempo (ms epoch) en que la tarea entró en su
// etapa actual; los minutos en etapa se calculan contra `ahora`.
export function pasoDeTarea(entrada: EntradaTarea, ahora: number): PasoTarea | null {
  if (!entrada || typeof entrada !== "object") return null;
  const id = typeof entrada.id === "string" ? entrada.id : null;
  if (!id) return null;
  const fase = typeof entrada.fase === "string" ? entrada.fase : "";
  const estado = typeof entrada.estado === "string" ? entrada.estado : null;
  const etapa = etapaDeFase(fase, estado);
  if (!etapa) return null;

  const indice = ETAPAS.indexOf(etapa);
  const porcentaje = Math.round(((indice + 1) / ETAPAS.length) * 100);
  const desde = typeof entrada.minutosDesde === "number" ? entrada.minutosDesde : ahora;
  const minutosEnEtapa = Math.max(0, Math.round((ahora - desde) / 60000));
  const modelo = typeof entrada.modelo === "string" ? entrada.modelo : undefined;

  const estadoClave = (estado || "").trim().toLowerCase();
  let desenlace: Desenlace = "en marcha";
  let detalle = textoEnMarcha(etapa, modelo, minutosEnEtapa);

  if (etapa === "integrada") {
    desenlace = "integrada";
    detalle = "integrada en main";
  } else if (ESTADOS_PARADOS.has(estadoClave) || estadoClave.startsWith("fallo")) {
    desenlace = "parada";
    detalle = textoParada(estadoClave);
  } else if (minutosEnEtapa > TOPES_MIN[etapa as Exclude<Etapa, "integrada">]) {
    desenlace = "atascada";
    detalle =
      etapa === "visto bueno"
        ? `${minutosEnEtapa} min esperando tu visto bueno`
        : `${minutosEnEtapa} min en «${etapa}» (tope ${TOPES_MIN[etapa as Exclude<Etapa, "integrada">]})`;
  }

  return { id, etapa, indice, porcentaje, minutosEnEtapa, desenlace, detalle, modelo };
}

function textoEnMarcha(etapa: Etapa, modelo: string | undefined, min: number): string {
  const quien = modelo ? ` con ${modelo}` : "";
  switch (etapa) {
    case "escribiendo":
      return `escribiendo${quien} (${min} min)`;
    case "verificando":
      return `verificando con tsc (${min} min)`;
    case "probando":
      return `ejecutando pruebas (${min} min)`;
    case "revisando":
      return `revisión bloqueante: hay que rehacerla`;
    case "visto bueno":
      return `${min} min esperando tu visto bueno`;
    case "integrada":
      return "integrada en main";
  }
}

export function resumenEtapas(pasos: PasoTarea[]): {
  porEtapa: Record<Etapa, number>;
  atascadas: number;
  enMarcha: number;
} {
  const porEtapa: Record<Etapa, number> = {
    escribiendo: 0,
    verificando: 0,
    probando: 0,
    revisando: 0,
    "visto bueno": 0,
    integrada: 0,
  };
  let atascadas = 0;
  let enMarcha = 0;
  for (const p of pasos) {
    porEtapa[p.etapa] += 1;
    if (p.desenlace === "atascada") atascadas += 1;
    if (p.desenlace === "en marcha") enMarcha += 1;
  }
  return { porEtapa, atascadas, enMarcha };
}
