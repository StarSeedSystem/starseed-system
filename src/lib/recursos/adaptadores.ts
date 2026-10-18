import type { CapacidadesNodo } from "../network/capacidades-nodo";
import type { Candidato } from "../protomolecula/planificador-computo";
import type { LinkedServer } from "../brains/servers";
import type { OfertaNeurona, Peticion, PlanResultado } from "./oferta";
export type { OfertaNeurona, Peticion, PlanResultado } from "./oferta";

export function capacidadesNodoToOfertaNeurona(nodo: CapacidadesNodo): OfertaNeurona {
  return {
    nodoId: nodo.nodoId,
    cuentaId: "",
    medio: nodo.medio,
    computo: {
      nucleos: 1,
      ramLibreMb: nodo.ramLibreMb,
      gpu: false,
      vramMb: undefined,
      motores: [],
    },
    almacen: { prestaMb: 0, volumenes: [] },
    apps: [],
    enlaces: { subidaKbps: undefined, bajadaKbps: undefined, latenciaMs: undefined },
    energia: {
      bateriaPct: nodo.bateriaPct !== null ? nodo.bateriaPct : undefined,
      cargando: false,
      enUso: false,
    },
    presta: {
      cuenta: false,
      grupos: [],
      publico: false,
      topes: { cpuPct: 0, ramMb: 0, discoMb: 0, horas: undefined, soloCargando: false },
    },
    t: nodo.t,
  };
}

export function linkedServerToOfertaNeurona(servidor: LinkedServer): OfertaNeurona {
  const { role } = servidor.link;
  const isCompute = role === "compute";
  const isStorage = role === "storage";
  return {
    nodoId: servidor.id,
    cuentaId: servidor.owner ?? "",
    medio: "nube",
    computo: {
      nucleos: isCompute ? 1 : 0,
      ramLibreMb: isCompute ? 1024 : 0,
      gpu: false,
      vramMb: undefined,
      motores: [],
    },
    almacen: {
      prestaMb: isStorage ? 1024 : 0,
      volumenes: [],
    },
    apps: [],
    enlaces: { subidaKbps: undefined, bajadaKbps: undefined, latenciaMs: undefined },
    energia: { bateriaPct: undefined, cargando: false, enUso: false },
    presta: {
      cuenta: !!servidor.owner,
      grupos: [],
      publico: !!(servidor.owner && servidor.shared),
      topes: { cpuPct: 0, ramMb: 0, discoMb: 0, horas: undefined, soloCargando: false },
    },
    t: Date.now(),
  };
}

export function candidatoToOfertaNeurona(candidato: Candidato): OfertaNeurona {
  return {
    nodoId: candidato.neuronaId ?? "",
    cuentaId: "",
    medio: "desconocido",
    computo: {
      nucleos: 1,
      ramLibreMb: candidato.libreMB,
      gpu: candidato.gpu,
      vramMb: undefined,
      motores: [],
    },
    almacen: { prestaMb: 0, volumenes: [] },
    apps: [],
    enlaces: { subidaKbps: undefined, bajadaKbps: undefined, latenciaMs: undefined },
    energia: { bateriaPct: undefined, cargando: false, enUso: false },
    presta: {
      cuenta: candidato.cuentaPropia,
      grupos: [],
      publico: !candidato.cuentaPropia,
      topes: { cpuPct: 0, ramMb: 0, discoMb: 0, horas: undefined, soloCargando: false },
    },
    t: Date.now(),
  };
}

export function ofertaNeuronaToCandidato(oferta: OfertaNeurona): Candidato {
  let tipo: "navegador" | "app-nativa" | "neurona-nas" | "neurona-procesador" | "nube" | "oracle-a1" = "navegador";
  if (oferta.computo.gpu) tipo = "neurona-procesador";
  else if (oferta.computo.ramLibreMb > 0) tipo = "neurona-nas";
  return {
    tipo,
    neuronaId: oferta.nodoId || undefined,
    libreMB: oferta.computo.ramLibreMb,
    gpu: oferta.computo.gpu,
    consentimiento: oferta.presta.publico,
    cuentaPropia: oferta.presta.cuenta,
    ocupacion: 0,
  };
}

export function candidatosDesdePlan(
  plan: PlanResultado[],
  ofertasDisponibles: OfertaNeurona[]
): Candidato[] {
  const candidatos: Candidato[] = [];
  for (const resultado of plan) {
    const oferta = ofertasDisponibles.find(o => o.nodoId === resultado.ofertaId);
    if (oferta) candidatos.push(ofertaNeuronaToCandidato(oferta));
  }
  return candidatos;
}