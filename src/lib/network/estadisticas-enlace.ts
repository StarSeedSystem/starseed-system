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

export function resumirRuta(
  stats: Iterable<Estadistica> | Map<string, Estadistica>,
  ahora: number,
): RutaEnlace {
  const entradas = stats instanceof Map ? Array.from(stats.values()) : Array.from(stats);
  const porId = new Map<string, Estadistica>();
  for (const entrada of entradas) {
    if (typeof entrada.id === "string") porId.set(entrada.id, entrada);
  }

  const idSeleccionado = entradas.find(
    (entrada) => entrada.type === "transport" && typeof entrada.selectedCandidatePairId === "string",
  )?.selectedCandidatePairId;
  const par =
    (typeof idSeleccionado === "string" ? porId.get(idSeleccionado) : undefined) ??
    entradas.find(
      (entrada) =>
        entrada.type === "candidate-pair" && entrada.state === "succeeded" && entrada.nominated === true,
    );
  if (!par || par.type !== "candidate-pair" || par.state !== "succeeded") {
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
