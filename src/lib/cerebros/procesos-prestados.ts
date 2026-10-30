// Préstamos de procesos: lo que esta neurona presta y lo que toma prestado.
// Módulo puro: sin red, sin disco, sin procesos y sin reloj propio; `ahora` llega inyectado.
// Contrato: architecture/apps-en-la-malla.md §5, §6, §9 y §12 (Cerebro › Procesos activos).

export type DireccionPrestamo = "da" | "toma";

export type TipoRecursoPrestamo = "capacidad" | "app" | "volumen";

export interface SesionPrestamo {
  id: string;
  /** La otra parte: quien toma cuando esta neurona presta, quien presta cuando toma. */
  otro: string;
  tipo: TipoRecursoPrestamo;
  /** «voz», «render», «Biblioteca»…; lo que no se mide se dice con su nombre de sesión. */
  recurso: string;
  /** Inicio de la sesión (ms); null = sin medida. */
  desde: number | null;
  /** Expiración de la sesión (ms); null = sin vencimiento medido. */
  vence: number | null;
  revocada: boolean;
  /** Consumo medido de la sesión, en MB; null = sin medida. */
  consumoMb: number | null;
}

export interface FilaPrestamo {
  id: string;
  direccion: DireccionPrestamo;
  quien: string;
  que: string;
  desde: number | null;
  consumoTexto: string;
  activa: boolean;
}

export interface TotalesPrestamos {
  dadosActivos: number;
  tomadosActivos: number;
  consumoDadosMb: number | null;
  consumoTomadosMb: number | null;
}

export interface ResumenPrestamos {
  filas: FilaPrestamo[];
  totales: TotalesPrestamos;
}

export const ETIQUETA_TIPO_PRESTAMO: Record<TipoRecursoPrestamo, string> = {
  capacidad: "Capacidad",
  app: "App",
  volumen: "Volumen",
};

/** Un consumo solo cuenta si es un número finito y no negativo; si no, es «sin medida». */
function consumoMedido(v: number | null): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** «12 MB», «1,5 GB» o «sin medida»: nunca se inventa lo que no se midió. */
export function consumoLegible(consumoMb: number | null): string {
  const c = consumoMedido(consumoMb);
  if (c == null) return "sin medida";
  if (c >= 1024) return `${(Math.round((c / 1024) * 10) / 10).toLocaleString("es-ES")} GB`;
  return `${(Math.round(c * 10) / 10).toLocaleString("es-ES")} MB`;
}

/** Una sesión está activa si no está revocada y no ha expirado a la hora medida. */
function activaDe(s: SesionPrestamo, ahora: number): boolean {
  return !s.revocada && (s.vence == null || ahora < s.vence);
}

function conecta(v: string, porDefecto: string): string {
  return v.trim() !== "" ? v : porDefecto;
}

function filaDe(s: SesionPrestamo, direccion: DireccionPrestamo, ahora: number): FilaPrestamo {
  const activa = activaDe(s, ahora);
  return {
    id: s.id,
    direccion,
    quien: conecta(s.otro, "desconocido"),
    que: `${ETIQUETA_TIPO_PRESTAMO[s.tipo]} · ${conecta(s.recurso, "sin nombre")}`,
    desde: s.desde,
    consumoTexto: activa ? consumoLegible(s.consumoMb) : consumoLegible(null),
    activa,
  };
}

/** Suma del consumo medido de las sesiones activas; null si ninguna lo midió. */
export function sumaConsumoMb(
  sesiones: SesionPrestamo[],
  ahora: number,
): number | null {
  let suma: number | null = null;
  for (const s of sesiones) {
    if (!activaDe(s, ahora)) continue;
    const c = consumoMedido(s.consumoMb);
    if (c == null) continue;
    suma = (suma ?? 0) + c;
  }
  return suma;
}

/** Orden determinista: lo más nuevo primero y, a igual inicio, por id. */
function porRecientes(a: SesionPrestamo, b: SesionPrestamo): number {
  const dato = a.desde ?? 0, datoB = b.desde ?? 0;
  return dato !== datoB ? datoB - dato : a.id.localeCompare(b.id);
}

/**
 * `resumenPrestamos(dados, tomados, ahora)` — filas legibles de todo préstamo
 * vivo o cortado: quién, qué capacidad o app, desde cuándo y el consumo medido;
 * con los totales de préstamos activos y consumo de cada lado. Los prestados
 * van antes que los tomados, cada grupo por su inicio más reciente.
 */
export function resumenPrestamos(
  dados: SesionPrestamo[],
  tomados: SesionPrestamo[],
  ahora: number,
): ResumenPrestamos {
  const filas = [
    ...[...dados].sort(porRecientes).map((s) => filaDe(s, "da", ahora)),
    ...[...tomados].sort(porRecientes).map((s) => filaDe(s, "toma", ahora)),
  ];
  return {
    filas,
    totales: {
      dadosActivos: dados.filter((s) => activaDe(s, ahora)).length,
      tomadosActivos: tomados.filter((s) => activaDe(s, ahora)).length,
      consumoDadosMb: sumaConsumoMb(dados, ahora),
      consumoTomadosMb: sumaConsumoMb(tomados, ahora),
    },
  };
}
