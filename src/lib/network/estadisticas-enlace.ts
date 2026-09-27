export type ClaseRuta =
  | "misma-red-local"
  | "internet-directo"
  | "reenviado-turn"
  | "desconocida";

export interface RutaEnlace {
  clase: ClaseRuta;
  tipoLocal: string | null;
  tipoRemoto: string | null;
  protocolo: string | null;
  rttMs: number | null;
  bytesEnviados: number | null;
  bytesRecibidos: number | null;
  medidoEn: number;
}

type Estadistica = Record<string, unknown>;

/**
 * Lo que devuelve `RTCPeerConnection.getStats()` es un `RTCStatsReport`: se comporta como un
 * Map (tiene `values()` y `forEach`) pero NO es `instanceof Map`, y su iterador da pares
 * `[id, estadística]`. (2026-09-27) La primera versión preguntaba `instanceof Map`, recorría
 * los pares como si fueran estadísticas y en un navegador real toda ruta salía «desconocida».
 */
export type FuenteEstadisticas =
  | Iterable<Estadistica>
  | Map<string, Estadistica>
  | { values(): Iterable<unknown> }
  | { forEach(cb: (valor: unknown) => void): void };

function aLista(stats: FuenteEstadisticas): Estadistica[] {
  const s = stats as { values?: () => Iterable<unknown>; forEach?: (cb: (v: unknown) => void) => void };
  let crudos: unknown[];
  if (typeof s.values === "function") crudos = Array.from(s.values());
  else if (typeof s.forEach === "function") {
    crudos = [];
    s.forEach((v) => crudos.push(v));
  } else crudos = Array.from(stats as Iterable<unknown>);
  return crudos
    .map((e) => (Array.isArray(e) && e.length === 2 && e[1] && typeof e[1] === "object" ? e[1] : e))
    .filter((e): e is Estadistica => !!e && typeof e === "object" && !Array.isArray(e));
}

export function resumirRuta(stats: FuenteEstadisticas, ahora: number): RutaEnlace {
  const entradas = aLista(stats);
  const porId = new Map<string, Estadistica>();
  for (const entrada of entradas) {
    if (typeof entrada.id === "string") porId.set(entrada.id, entrada);
  }

  const idSeleccionado = entradas.find(
    (entrada) => entrada.type === "transport" && typeof entrada.selectedCandidatePairId === "string",
  )?.selectedCandidatePairId;
  const seleccionado = typeof idSeleccionado === "string" ? porId.get(idSeleccionado) : undefined;
  const par =
    (seleccionado && esParUtil(seleccionado) ? seleccionado : undefined) ??
    entradas.find(
      (entrada) => esParUtil(entrada) && entrada.nominated === true,
    );
  if (!par) {
    return rutaDesconocida(ahora);
  }

  const local = candidato(porId, par.localCandidateId);
  const remoto = candidato(porId, par.remoteCandidateId);
  const tipoLocal = texto(local?.candidateType);
  const tipoRemoto = texto(remoto?.candidateType);
  const protocolo = texto(local?.protocol) ?? texto(remoto?.protocol);
  const rttSegundos = numero(par.currentRoundTripTime);

  return {
    clase: clasificar(tipoLocal, tipoRemoto),
    tipoLocal,
    tipoRemoto,
    protocolo,
    rttMs: rttSegundos === null ? null : Math.round(rttSegundos * 1_000),
    bytesEnviados: numero(par.bytesSent),
    bytesRecibidos: numero(par.bytesReceived),
    medidoEn: ahora,
  };
}

export function etiquetaRuta(clase: ClaseRuta): string {
  const etiquetas: Record<ClaseRuta, string> = {
    "misma-red-local": "misma red local",
    "internet-directo": "internet directo (NAT)",
    "reenviado-turn": "reenviado por servidor TURN",
    desconocida: "ruta desconocida",
  };
  return etiquetas[clase];
}

function esParUtil(entrada: Estadistica): boolean {
  return entrada.type === "candidate-pair" && entrada.state === "succeeded";
}

function candidato(porId: Map<string, Estadistica>, id: unknown): Estadistica | undefined {
  return typeof id === "string" ? porId.get(id) : undefined;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function clasificar(tipoLocal: string | null, tipoRemoto: string | null): ClaseRuta {
  if (tipoLocal === "relay" || tipoRemoto === "relay") return "reenviado-turn";
  if (tipoLocal === "host" && tipoRemoto === "host") return "misma-red-local";
  if ([tipoLocal, tipoRemoto].some((tipo) => tipo === "srflx" || tipo === "prflx")) {
    return "internet-directo";
  }
  return "desconocida";
}

function rutaDesconocida(medidoEn: number): RutaEnlace {
  return {
    clase: "desconocida",
    tipoLocal: null,
    tipoRemoto: null,
    protocolo: null,
    rttMs: null,
    bytesEnviados: null,
    bytesRecibidos: null,
    medidoEn,
  };
}
