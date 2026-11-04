export type TipoCandidatoIce = "host" | "srflx" | "prflx" | "relay" | "desconocido";

export interface ResumenIce {
  parElegido: string;
  tipoLocal: TipoCandidatoIce | null;
  tipoRemoto: TipoCandidatoIce | null;
  clasificacion: string;
  rttMs: number | null;
  bytesEnviados: number | null;
  bytesRecibidos: number | null;
  medidoEn: number;
}

type Estadistica = Record<string, unknown>;

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

function esParUtil(entrada: Estadistica): boolean {
  return entrada.type === "candidate-pair" && entrada.state === "succeeded";
}

function candidato(porId: Map<string, Estadistica>, id: unknown): Estadistica | undefined {
  return typeof id === "string" ? porId.get(id) : undefined;
}

function tipoCandidato(valor: unknown): TipoCandidatoIce | null {
  const t = typeof valor === "string" ? valor : null;
  if (t === "host" || t === "srflx" || t === "prflx" || t === "relay") return t;
  return null;
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function clasificar(tipoLocal: TipoCandidatoIce | null, tipoRemoto: TipoCandidatoIce | null): string {
  if (!tipoLocal || !tipoRemoto) return "desconocida";
  return `${tipoLocal}-${tipoRemoto}`;
}

function resumenDesconocido(medidoEn: number): ResumenIce {
  return {
    parElegido: "",
    tipoLocal: null,
    tipoRemoto: null,
    clasificacion: "desconocida",
    rttMs: null,
    bytesEnviados: null,
    bytesRecibidos: null,
    medidoEn,
  };
}

export function resumenIce(stats: FuenteEstadisticas, ahora: number): ResumenIce {
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
    return resumenDesconocido(ahora);
  }

  const local = candidato(porId, par.localCandidateId);
  const remoto = candidato(porId, par.remoteCandidateId);
  const tipoLocal = tipoCandidato(local?.candidateType);
  const tipoRemoto = tipoCandidato(remoto?.candidateType);
  const rttSegundos = numero(par.currentRoundTripTime);

  return {
    parElegido: typeof par.id === "string" ? par.id : "",
    tipoLocal,
    tipoRemoto,
    clasificacion: clasificar(tipoLocal, tipoRemoto),
    rttMs: rttSegundos === null ? null : Math.round(rttSegundos * 1_000),
    bytesEnviados: numero(par.bytesSent),
    bytesRecibidos: numero(par.bytesReceived),
    medidoEn: ahora,
  };
}