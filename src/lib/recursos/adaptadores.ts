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

export type ArquitecturaServidor = "amd64" | "arm64";
export type FuenteCapacidad = "medida" | "declarada";

/** Capacidad que un servidor del cerebro declara de sí mismo. Nada se rellena por defecto. */
export interface CapacidadServidor {
  nucleos?: number;
  ramLibreMb?: number;
  gpu?: boolean;
  vramMb?: number;
  prestaMb?: number;
  arquitectura?: ArquitecturaServidor;
  fuente?: FuenteCapacidad;
  medidaEn?: string;
}

function numeroNoNegativo(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0 ? valor : undefined;
}

/**
 * Lee `config.capacidad` de un servidor y descarta cada dato inválido.
 * Devuelve `null` si no hay capacidad utilizable: el servidor queda no elegible.
 */
export function capacidadDeServidor(config: Record<string, unknown>): CapacidadServidor | null {
  const bruto = config?.capacidad;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const datos = bruto as Record<string, unknown>;
  const capacidad: CapacidadServidor = {};
  const nucleos = numeroNoNegativo(datos.nucleos);
  if (nucleos !== undefined) capacidad.nucleos = Math.floor(nucleos);
  const ramLibreMb = numeroNoNegativo(datos.ramLibreMb);
  if (ramLibreMb !== undefined) capacidad.ramLibreMb = ramLibreMb;
  if (typeof datos.gpu === "boolean") capacidad.gpu = datos.gpu;
  const vramMb = numeroNoNegativo(datos.vramMb);
  if (vramMb !== undefined) capacidad.vramMb = vramMb;
  const prestaMb = numeroNoNegativo(datos.prestaMb);
  if (prestaMb !== undefined) capacidad.prestaMb = prestaMb;
  if (datos.arquitectura === "amd64" || datos.arquitectura === "arm64") {
    capacidad.arquitectura = datos.arquitectura;
  }
  if (datos.fuente === "medida" || datos.fuente === "declarada") capacidad.fuente = datos.fuente;
  if (typeof datos.medidaEn === "string" && datos.medidaEn.trim() !== "") {
    capacidad.medidaEn = datos.medidaEn;
  }
  return Object.keys(capacidad).length > 0 ? capacidad : null;
}

export function linkedServerToOfertaNeurona(servidor: LinkedServer): OfertaNeurona {
  const { role } = servidor.link;
  const isCompute = role === "compute";
  const isStorage = role === "storage";
  const capacidad = capacidadDeServidor(servidor.config);
  const gpu = isCompute && capacidad?.gpu === true;
  return {
    nodoId: servidor.id,
    cuentaId: servidor.owner ?? "",
    medio: "nube",
    computo: {
      nucleos: isCompute ? capacidad?.nucleos ?? 0 : 0,
      ramLibreMb: isCompute ? capacidad?.ramLibreMb ?? 0 : 0,
      gpu,
      vramMb: gpu ? capacidad?.vramMb : undefined,
      motores: [],
    },
    almacen: {
      prestaMb: isStorage ? capacidad?.prestaMb ?? 0 : 0,
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