export interface Experiencia {
  id?: string;
  ref?: string;
  t?: string;
  medio?: string;
  capa?: string;
  tipo?: string;
  dominio?: string;
  entrada?: string;
  salida?: unknown;
  confianza?: number | null;
  ms?: number | null;
  resultado?: boolean | null;
  nota?: string;
}

export interface ResumenExperiencias {
  total: number;
  porCapa: Record<string, number>;
  porTipo: Record<string, number>;
  conResultado: number;
  aciertos: number;
}

export interface TramoCalibracion {
  n: number;
  aciertos: number;
}

export interface EstadoAdaptadorInfo {
  version: string;
  sha: string;
  fecha: string;
  experiencias: number;
  exactitud: number;
  esMasNuevoQueBase: boolean;
}

export interface CapaActiva {
  nombre: string;
  activa: boolean;
  tono: "verde" | "ambar" | "gris" | "rojo";
  detalle: string;
}

export interface EstadoCapasEntrada {
  needle?: unknown;
  jev?: unknown;
  bitnet?: unknown;
}

export function resumirExperiencias(
  lineas: (string | Record<string, unknown>)[]
): ResumenExperiencias {
  const porId: Record<string, Experiencia> = {};

  for (const item of lineas) {
    let obj: Record<string, unknown> | null = null;
    if (typeof item === "string") {
      try {
        obj = JSON.parse(item) as Record<string, unknown>;
      } catch {
        continue;
      }
    } else if (item && typeof item === "object") {
      obj = item;
    }

    if (!obj) continue;

    if (typeof obj.ref === "string" && obj.ref) {
      if (porId[obj.ref]) {
        porId[obj.ref].resultado =
          obj.resultado === null || obj.resultado === undefined
            ? null
            : Boolean(obj.resultado);
        if (typeof obj.nota === "string") {
          porId[obj.ref].nota = obj.nota;
        }
      }
    } else if (typeof obj.id === "string" && obj.id) {
      const exp: Experiencia = {
        id: obj.id,
        t: typeof obj.t === "string" ? obj.t : undefined,
        medio: typeof obj.medio === "string" ? obj.medio : undefined,
        capa: typeof obj.capa === "string" ? obj.capa : undefined,
        tipo: typeof obj.tipo === "string" ? obj.tipo : undefined,
        dominio: typeof obj.dominio === "string" ? obj.dominio : undefined,
        entrada: typeof obj.entrada === "string" ? obj.entrada : undefined,
        salida: obj.salida,
        confianza: typeof obj.confianza === "number" ? obj.confianza : null,
        ms: typeof obj.ms === "number" ? obj.ms : null,
        resultado:
          obj.resultado === null || obj.resultado === undefined
            ? null
            : Boolean(obj.resultado),
        nota: typeof obj.nota === "string" ? obj.nota : undefined,
      };
      porId[obj.id] = exp;
    }
  }

  const exps = Object.values(porId);
  const total = exps.length;
  const porCapa: Record<string, number> = {};
  const porTipo: Record<string, number> = {};
  let conResultado = 0;
  let aciertos = 0;

  for (const e of exps) {
    const c = e.capa || "desconocida";
    porCapa[c] = (porCapa[c] || 0) + 1;

    const t = e.tipo || "desconocido";
    porTipo[t] = (porTipo[t] || 0) + 1;

    if (e.resultado !== null && e.resultado !== undefined) {
      conResultado += 1;
      if (e.resultado === true) {
        aciertos += 1;
      }
    }
  }

  return { total, porCapa, porTipo, conResultado, aciertos };
}

export function calibracion(
  exps: Experiencia[],
  capa = "jev"
): Record<string, TramoCalibracion> {
  const tramos: Record<string, TramoCalibracion> = {};

  for (const e of exps) {
    if (
      e.capa !== capa ||
      e.resultado === null ||
      e.resultado === undefined ||
      e.confianza === null ||
      e.confianza === undefined ||
      typeof e.confianza !== "number"
    ) {
      continue;
    }

    const conf = Math.min(1, Math.max(0, e.confianza));
    const k = (Math.floor(conf * 10) / 10).toFixed(1);

    if (!tramos[k]) {
      tramos[k] = { n: 0, aciertos: 0 };
    }
    tramos[k].n += 1;
    if (e.resultado === true) {
      tramos[k].aciertos += 1;
    }
  }

  return tramos;
}

export function estadoAdaptador(
  manifiesto: unknown,
  estadoNeedle: unknown
): EstadoAdaptadorInfo {
  const m =
    manifiesto && typeof manifiesto === "object"
      ? (manifiesto as Record<string, unknown>)
      : {};
  const n =
    estadoNeedle && typeof estadoNeedle === "object"
      ? (estadoNeedle as Record<string, unknown>)
      : {};

  const version = String(m.version || m.actual || n.instalado || "1.58.0");
  const rawSha = String(m.sha || m.modelo_sha || n.sha || "0000000");
  const sha = rawSha.slice(0, 7);
  const fecha = String(m.fecha || m.t || n.fecha || n.ultima_comprobacion || "—");

  const expsManifiesto = typeof m.experiencias === "number" ? m.experiencias : 0;
  const expsNeedle = typeof n.experiencias === "number" ? n.experiencias : 0;
  const experiencias = Math.max(expsManifiesto, expsNeedle);

  let exactitud = 0;
  if (typeof m.exactitud === "number") exactitud = m.exactitud;
  else if (typeof m.accuracy === "number") exactitud = m.accuracy;
  else if (typeof n.exactitud === "number") exactitud = n.exactitud;

  const esMasNuevoQueBase = Boolean(
    m.es_mas_nuevo ||
      m.esMasNuevoQueBase ||
      n.mas_nuevo ||
      n.esMasNuevoQueBase ||
      experiencias > 0
  );

  return { version, sha, fecha, experiencias, exactitud, esMasNuevoQueBase };
}

export function capasActivas(estado: EstadoCapasEntrada): CapaActiva[] {
  const res: CapaActiva[] = [];

  const n =
    estado.needle && typeof estado.needle === "object"
      ? (estado.needle as Record<string, unknown>)
      : null;
  const needleActiva =
    estado.needle !== false &&
    estado.needle !== null &&
    estado.needle !== undefined;
  const needleDesactivada = n?.desactivada === true || estado.needle === false;
  const needleN4 = Boolean(n?.n4 || n?.needle4);
  const toneNeedle: CapaActiva["tono"] = needleDesactivada
    ? "gris"
    : needleN4
    ? "ambar"
    : "verde";
  res.push({
    nombre: "Needle",
    activa: !needleDesactivada && needleActiva,
    tono: toneNeedle,
    detalle: needleDesactivada
      ? "Desactivada"
      : needleN4
      ? "Actualización mayor disponible"
      : "Enrutamiento rápido activo",
  });

  const j =
    estado.jev && typeof estado.jev === "object"
      ? (estado.jev as Record<string, unknown>)
      : null;
  const jevActiva =
    estado.jev !== false && estado.jev !== null && estado.jev !== undefined;
  const jevDesactivada = j?.desactivada === true || estado.jev === false;
  res.push({
    nombre: "Jev",
    activa: !jevDesactivada && jevActiva,
    tono: jevDesactivada ? "gris" : "verde",
    detalle: jevDesactivada
      ? "Sin calibrar / inactivo"
      : "Decisión y calibración activa",
  });

  const b =
    estado.bitnet && typeof estado.bitnet === "object"
      ? (estado.bitnet as Record<string, unknown>)
      : null;
  const bitnetActiva =
    estado.bitnet !== false &&
    estado.bitnet !== null &&
    estado.bitnet !== undefined;
  const bitnetDormida = b?.estado === "dormida" || b?.dormida === true;
  const toneBitnet: CapaActiva["tono"] = !bitnetActiva
    ? "gris"
    : bitnetDormida
    ? "ambar"
    : "verde";
  res.push({
    nombre: "BitNet",
    activa: bitnetActiva && !bitnetDormida,
    tono: toneBitnet,
    detalle: !bitnetActiva
      ? "Sin servicio local"
      : bitnetDormida
      ? "En reposo para ahorrar RAM"
      : "Modelo 1.58-bit en ejecución",
  });

  return res;
}
