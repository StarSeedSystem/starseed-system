/**
 * capacidades-nodo.ts — Capacidades de cada nodo en la red mesh.
 * Anuncio, deliberación con BitNet, reflejo con Needle y resumen de red.
 */

export type MedioNodo = "navegador" | "mac" | "linux" | "android" | "ios" | "nube";

/** Ámbitos que un nodo puede servir (§7 del contrato de capas). */
export type AmbitoFicha = "propio" | "cuenta" | "publico";

/** Privacidad de la tarea que pregunta por candidatos (§5). */
export type PrivacidadConsulta = "privada" | "ambito" | "publica";

export interface InfoNeedle {
  version: string;
  adaptador?: string | null;
}

export interface InfoBitnet {
  tokPorS: number;
  ctx: number;
  ocupado: boolean;
}

export interface CapacidadesNodo {
  nodoId: string;
  medio: MedioNodo;
  needle: InfoNeedle | null;
  bitnet: InfoBitnet | null;
  jev: boolean;
  ramLibreMb: number;
  cpu: number;
  t: number;
  /** Capas instaladas en el almacén, "id@versión" (§7). Vacío = ninguna medida. */
  capas?: string[];
  /** tok/s MEDIDOS al usar cada capa; null = «sin medir», nunca se inventa. */
  tokS?: Record<string, number> | null;
  /** Batería en % [0-100]; null si el medio no la informa. */
  bateriaPct?: number | null;
  /** Pestaña oculta o proceso en 2.º plano (solo corre el reflejo, §4). */
  enSegundoPlano?: boolean;
  /** Qué ámbitos sirve este nodo (§7). */
  ambitos?: AmbitoFicha[];
}

export interface MensajeCapacidades {
  tema: "astraura/capacidades";
  origen: string;
  payload: CapacidadesNodo;
  t: number;
}

export interface ResumenRed {
  nodos: number;
  conNeedle: number;
  conBitnet: number;
  conJev: number;
  adaptadorMasNuevo: string | null;
}

/** Entrada MEDIDA para construir la ficha; todo lo externo se inyecta (nada de red/disco aquí). */
export interface DatosFichaNodo {
  nodoId: string;
  medio: MedioNodo;
  capas?: string[];
  tokS?: Record<string, number> | null;
  ramLibreMb?: number;
  cpu?: number;
  bateriaPct?: number | null;
  enSegundoPlano?: boolean;
  jev?: boolean;
  /** Si el llamador ya sabe el estado exacto de Needle/BitNet, manda sobre lo derivado de `capas`. */
  needle?: InfoNeedle | null;
  bitnet?: InfoBitnet | null;
  ambitos?: AmbitoFicha[];
}

/**
 * Construye la ficha del nodo con datos medidos. Sin dato → null/omitido,
 * nunca un número inventado (§7: «sin medir» si no hay dato).
 */
export function crearFichaNodo(d: DatosFichaNodo): CapacidadesNodo {
  const capas = d.capas ?? [];
  const capaNeedle = capas.find((c) => c.toLowerCase().startsWith("needle"));
  const versionNeedle = capaNeedle?.split("@")[1]?.split("#")[0];
  const tokBitnet = d.tokS?.["bitnet"];
  return {
    nodoId: d.nodoId,
    medio: d.medio,
    needle: d.needle !== undefined ? d.needle : versionNeedle ? { version: versionNeedle } : null,
    bitnet:
      d.bitnet !== undefined
        ? d.bitnet
        : typeof tokBitnet === "number"
          ? { tokPorS: tokBitnet, ctx: 0, ocupado: false }
          : null,
    jev: d.jev ?? false,
    ramLibreMb: d.ramLibreMb ?? 0,
    cpu: d.cpu ?? 0,
    t: Date.now(),
    capas,
    tokS: d.tokS ?? null,
    bateriaPct: d.bateriaPct ?? null,
    enSegundoPlano: d.enSegundoPlano ?? false,
    ambitos: d.ambitos ?? ["propio"],
  };
}

/** Tope del anuncio comprimido por Meshtastic (§6/§7: ≤ 200 B, nunca pesos). */
export const FICHA_COMPACTA_MAX_BYTES = 200;

function bytesDe(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Serializa la ficha a una línea compacta ASCII ≤ 200 bytes para LoRa/Meshtastic.
 * Formato: `v1|id8|med|n<verNeedle>|t<tokBitnet>|r<ramMb>|b<bat>|g<0/1>|a<ambitos>|capas…`
 * Si no cabe, recorta la lista de capas por la cola (la base siempre cabe).
 */
export function fichaCompacta(f: CapacidadesNodo): string {
  const ambitos = (f.ambitos ?? [])
    .map((a) => (a === "propio" ? "p" : a === "cuenta" ? "c" : "u"))
    .join("");
  const base = [
    "v1",
    f.nodoId.slice(0, 8),
    f.medio.slice(0, 3),
    f.needle ? `n${f.needle.version}` : "n-",
    f.tokS?.["bitnet"] != null ? `t${Math.round(f.tokS["bitnet"])}` : f.bitnet ? `t${Math.round(f.bitnet.tokPorS)}` : "t-",
    `r${Math.round(f.ramLibreMb)}`,
    f.bateriaPct == null ? "b-" : `b${Math.round(f.bateriaPct)}`,
    f.enSegundoPlano ? "g1" : "g0",
    `a${ambitos}`,
  ].join("|");
  const capas = [...(f.capas ?? [])];
  let salida = base;
  while (capas.length > 0) {
    const intento = `${base}|${capas.join(",")}`;
    if (bytesDe(intento) <= FICHA_COMPACTA_MAX_BYTES) {
      salida = intento;
      break;
    }
    capas.pop();
  }
  return salida;
}

/**
 * Regla de privacidad (§5): lo privado solo va a dispositivos de la cuenta o a
 * servidores propios de la persona; lo demás no restringe el destino.
 */
export function permitePrivacidad(ambitos: AmbitoFicha[] | undefined, privacidad: PrivacidadConsulta): boolean {
  if (privacidad !== "privada") return true;
  const a = ambitos ?? [];
  return a.includes("propio") || a.includes("cuenta");
}

/** Candidatos para una tarea, ya filtrados por privacidad (§7). */
export function filtrarPorPrivacidad(
  nodos: CapacidadesNodo[],
  privacidad: PrivacidadConsulta,
): CapacidadesNodo[] {
  return nodos.filter((n) => permitePrivacidad(n.ambitos, privacidad));
}

export interface OpcionesPublicacionCapacidades {
  /** Mide la ficha actual; null = nada que anunciar ahora. */
  obtenerFicha: () => CapacidadesNodo | null | Promise<CapacidadesNodo | null>;
  /** Envío por la malla (peers WebRTC / `setupConcienciaSync.publicarCapacidades`). */
  publicarMalla: (ficha: CapacidadesNodo) => void;
  /** Envío al servidor de malla propio (recibe la línea compacta). */
  publicarServidorMalla?: (compacta: string) => void;
  /** Por defecto 20 min (§7). */
  intervaloMs?: number;
  /** Inyectable para pruebas; por defecto setInterval/clearInterval. */
  programar?: (cb: () => void, ms: number) => () => void;
}

export interface PublicacionCapacidades {
  /** Publica ya mismo (úsese al arrancar y cuando cambian las capas). */
  ahora: () => Promise<void>;
  /** Detiene el latido periódico. */
  detener: () => void;
}

/**
 * Publica la ficha al arrancar, cada `intervaloMs` (20 min por defecto) y cuando
 * el llamador invoque `ahora()` (p. ej. al cambiar las capas instaladas).
 * Viaja por la malla y el servidor de malla; NUNCA por Supabase en cada latido
 * (presupuesto de Supabase, §7): este módulo no recibe ni conoce Supabase.
 */
export function iniciarPublicacionCapacidades(
  opciones: OpcionesPublicacionCapacidades,
): PublicacionCapacidades {
  const intervalo = opciones.intervaloMs ?? 20 * 60 * 1000;
  const programar =
    opciones.programar ??
    ((cb: () => void, ms: number) => {
      const id = setInterval(cb, ms);
      return () => clearInterval(id);
    });
  let enVuelo = false;
  let cancelada = false;
  const publicar = async () => {
    if (enVuelo || cancelada) return;
    enVuelo = true;
    try {
      const ficha = await opciones.obtenerFicha();
      if (!ficha) return;
      opciones.publicarMalla(ficha);
      opciones.publicarServidorMalla?.(fichaCompacta(ficha));
    } finally {
      enVuelo = false;
    }
  };
  void publicar();
  const cancelar = programar(() => {
    void publicar();
  }, intervalo);
  return {
    ahora: publicar,
    detener: () => {
      cancelada = true;
      cancelar();
    },
  };
}

export function anunciar(cap: CapacidadesNodo): MensajeCapacidades {
  return {
    tema: "astraura/capacidades",
    origen: cap.nodoId,
    payload: cap,
    t: cap.t,
  };
}

export function elegirDeliberador(nodos: CapacidadesNodo[], ahora: number): CapacidadesNodo | null {
  const candidatos = nodos.filter((n) => {
    if (!n.bitnet || n.bitnet.ocupado) return false;
    const diffMs = ahora - n.t;
    return diffMs >= 0 && diffMs < 60000;
  });

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => {
    const diffTok = b.bitnet!.tokPorS - a.bitnet!.tokPorS;
    if (diffTok !== 0) return diffTok;
    const diffCpu = a.cpu - b.cpu;
    if (diffCpu !== 0) return diffCpu;
    return b.ramLibreMb - a.ramLibreMb;
  });

  return candidatos[0];
}

export function elegirReflejo(nodos: CapacidadesNodo[], miNodoId?: string): CapacidadesNodo | null {
  if (miNodoId) {
    const propio = nodos.find((n) => n.nodoId === miNodoId && n.needle !== null);
    if (propio) return propio;
  }

  const conNeedle = nodos.filter((n) => n.needle !== null);
  if (conNeedle.length === 0) return null;

  conNeedle.sort((a, b) => {
    const aNube = a.medio === "nube" ? 1 : 0;
    const bNube = b.medio === "nube" ? 1 : 0;
    if (aNube !== bNube) return aNube - bNube;
    const diffT = b.t - a.t;
    if (diffT !== 0) return diffT;
    return b.ramLibreMb - a.ramLibreMb;
  });

  return conNeedle[0];
}

export {
  NODOS_INFERENCIA_LOCAL_STORAGE,
  nodoConBase,
  resumenDisponibles,
  elegirNodo,
  type NodoInferenciaLocal,
  type OpcionesElegirNodo,
  type OpcionesResumenInferencia,
  type ResumenNodosInferencia,
  type TransporteInferencia,
} from "./inferencia-local";

export function resumenRed(nodos: CapacidadesNodo[]): ResumenRed {
  const conNeedle = nodos.filter((n) => n.needle !== null);
  const conBitnet = nodos.filter((n) => n.bitnet !== null);
  const conJev = nodos.filter((n) => n.jev);

  const conAdaptador = conNeedle.filter(
    (n) => typeof n.needle?.adaptador === "string" && n.needle.adaptador.trim() !== ""
  );

  conAdaptador.sort((a, b) => {
    const vComp = (b.needle?.version || "").localeCompare(a.needle?.version || "", undefined, { numeric: true });
    return vComp !== 0 ? vComp : b.t - a.t;
  });

  return {
    nodos: nodos.length,
    conNeedle: conNeedle.length,
    conBitnet: conBitnet.length,
    conJev: conJev.length,
    adaptadorMasNuevo: conAdaptador.length > 0 ? conAdaptador[0].needle!.adaptador! : null,
  };
}
