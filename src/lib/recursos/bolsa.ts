// bolsa.ts — §4 de `architecture/apps-en-la-malla.md`: la bolsa de recursos.
// Empareja peticiones y ofertas con reglas PURAS y deterministas (en el orden
// del contrato: permisos → latencia → energía → capacidad prestable → gratis y
// propio primero → reparto en varias fuentes → suelo). Sin red, sin disco, sin
// procesos y sin reloj: el tiempo vive en cada oferta (`t`) y lo integra
// `capacidadPrestable` de oferta.ts. Explica siempre por qué (motivo legible).
import type { OfertaNeurona } from "./oferta";
import { capacidadPrestable, ofertaVisiblePara } from "./oferta";

export type ClaseParte = "computo" | "bytes" | "ventana" | "relevo";

export type NecesidadesParte = {
  ramMb?: number;
  gpu?: boolean;
  motor?: string;
  appId?: string;
  volumen?: number;
  kbps?: number;
};

export type PartePeticion = {
  clase: ClaseParte;
  necesita: NecesidadesParte;
  latenciaMaxMs?: number;
};

export type ContextoPeticion = {
  tipo: "cuenta" | "grupo" | "comunidad" | "publicacion" | "estacion";
  id: string;
  privado: boolean;
};

export type PeticionBolsa = {
  id: string;
  contexto: ContextoPeticion;
  partes: PartePeticion[];
  /** Cuenta del peticionario; si falta, se asume la del contexto de tipo cuenta. */
  cuentaId?: string;
};

export type ResultadoParte = {
  destino: string;
  fuentes?: string[];
  enlace?: string;
  respaldo?: string;
  motivo: string;
};

export type SueloPlan = {
  destino: "local" | "nube";
  motivo: string;
  falta: string[];
};

export type ResultadoPlanificacion = {
  porParte: Record<string, ResultadoParte[]>;
  suelo?: SueloPlan;
};

export type ReglasBolsa = {
  latenciaMaxMs?: number;
  permitirNubePublico?: boolean;
  umbralBateria?: number;
};

const UMBRAL_BATERIA_DEFECTO = 20;
const TOPES_FUENTES = 3;
const RAM_VENTANA_DEFECTO_MB = 512;

/** Un servidor del cerebro llega como oferta de nube CON dueño (adaptadores.ts); la nube compartida no tiene dueño. */
export function esServidorCerebro(oferta: OfertaNeurona): boolean {
  return oferta.medio === "nube" && oferta.presta.cuenta === true && oferta.cuentaId !== "";
}

/** Regla 1: lo privado solo en la misma cuenta o servidores del cerebro; nunca nube compartida ni vecinos públicos. */
function privacidadOk(oferta: OfertaNeurona, cuentaPeticionario: string, privado: boolean): boolean {
  if (!privado) return true;
  return oferta.cuentaId === cuentaPeticionario || esServidorCerebro(oferta);
}

/** Regla 2: si la parte importa el tiempo, solo enlaces con alguna latencia medida por debajo del tope. */
function latenciaOk(oferta: OfertaNeurona, latenciaMaxMs?: number): boolean {
  if (latenciaMaxMs === undefined) return true;
  const ms = oferta.enlaces.latenciaMs ? Object.values(oferta.enlaces.latenciaMs) : [];
  return ms.some((v) => v <= latenciaMaxMs);
}

/** Regla 3: nunca una neurona con batería baja sin cargador, ni una que su dueño está usando a fondo. */
function energiaOk(oferta: OfertaNeurona, umbralBateria: number): boolean {
  const { bateriaPct, cargando, enUso } = oferta.energia;
  if (enUso) return false;
  return !(bateriaPct !== undefined && bateriaPct < umbralBateria && !cargando);
}

/** Regla 4 sobre la parte: la oferta cabe además en lo técnico que pide (gpu, motor, app) y aporta algo. */
function tecnicoOk(oferta: OfertaNeurona, parte: PartePeticion): boolean {
  const prestable = capacidadPrestable(oferta);
  const n = parte.necesita;
  switch (parte.clase) {
    case "computo":
      return prestable.computo.nucleos > 0 && (!n.gpu || prestable.computo.gpu) &&
        (!n.motor || prestable.computo.motores.includes(n.motor));
    case "bytes":
      return prestable.almacen.prestaMb > 0;
    case "ventana":
      return (!n.appId || oferta.apps.some((a) => a.id === n.appId)) && prestable.computo.ramLibreMb > 0;
    case "relevo":
      return (prestable.enlaces.subidaKbps ?? 0) > 0;
  }
}

/** Cuánto aporta la oferta al recurso concreto de la parte (para el reparto en varias fuentes). */
function aporte(oferta: OfertaNeurona, parte: PartePeticion): number {
  const prestable = capacidadPrestable(oferta);
  switch (parte.clase) {
    case "computo":
      return prestable.computo.ramLibreMb;
    case "bytes":
      return prestable.almacen.prestaMb;
    case "ventana":
      return prestable.computo.ramLibreMb;
    case "relevo":
      return prestable.enlaces.subidaKbps ?? 0;
  }
}

/** Regla 5 y empates: propio primero, luego lo no compartido con la nube, y nunca empates: gana el nodoId menor. */
function ordenDeterminista(cuentaPeticionario: string) {
  return (a: OfertaNeurona, b: OfertaNeurona): number => {
    const propiaA = a.cuentaId === cuentaPeticionario ? 0 : 1;
    const propiaB = b.cuentaId === cuentaPeticionario ? 0 : 1;
    if (propiaA !== propiaB) return propiaA - propiaB;
    const nubeA = a.medio === "nube" && !esServidorCerebro(a) ? 1 : 0;
    const nubeB = b.medio === "nube" && !esServidorCerebro(b) ? 1 : 0;
    if (nubeA !== nubeB) return nubeA - nubeB;
    return a.nodoId.localeCompare(b.nodoId);
  };
}

/** Necesidad total de la parte, en unidades del aporte (ramMb, volumen, kbps…). */
function objetivoParte(parte: PartePeticion): number {
  const n = parte.necesita;
  switch (parte.clase) {
    case "computo":
      return n.ramMb ?? 0;
    case "bytes":
      return n.volumen ?? 0;
    case "ventana":
      return n.ramMb ?? RAM_VENTANA_DEFECTO_MB;
    case "relevo":
      return n.kbps ?? 1;
  }
}

/** Texto legible de naturaleza de la oferta, para el motivo. */
function procedencia(oferta: OfertaNeurona, cuentaPeticionario: string): string {
  if (oferta.cuentaId === cuentaPeticionario) return "propio";
  if (esServidorCerebro(oferta)) return "servidor del cerebro";
  if (oferta.presta.grupos.length > 0) return "prestado por un miembro";
  return "vecino de la malla";
}

/** Lo que falta, legible y nunca vacío, para el suelo. */
export function describeFalta(parte: PartePeticion): string {
  const n = parte.necesita;
  const piezas: string[] = [];
  if (n.ramMb) piezas.push(`RAM ${n.ramMb} MB`);
  if (n.gpu) piezas.push("GPU");
  if (n.motor) piezas.push(`motor ${n.motor}`);
  if (n.appId) piezas.push(`app ${n.appId}`);
  if (n.volumen) piezas.push(`volumen ${n.volumen} MB`);
  if (n.kbps) piezas.push(`subida ${n.kbps} kbps`);
  if (piezas.length === 0) piezas.push("recurso");
  return `${parte.clase}: ${piezas.join(", ")}`;
}

/** Cuenta del peticionario: explícita o, si no, la del contexto de tipo cuenta. */
function cuentaPeticionarioDe(peticion: PeticionBolsa): string {
  return peticion.cuentaId ?? (peticion.contexto.tipo === "cuenta" ? peticion.contexto.id : "");
}

export function planificar(
  peticion: PeticionBolsa,
  ofertas: OfertaNeurona[],
  reglas: ReglasBolsa = {}
): ResultadoPlanificacion {
  const porParte: Record<string, ResultadoParte[]> = {};
  const faltas: string[] = [];
  const cuenta = cuentaPeticionarioDe(peticion);
  const privado = peticion.contexto.privado;
  const prestanAlContexto = peticion.contexto.tipo === "grupo" || peticion.contexto.tipo === "comunidad" ? [peticion.contexto.id] : [];

  for (const parte of peticion.partes) {
    const lista = (porParte[parte.clase] = porParte[parte.clase] ?? []);
    const latenciaMaxMs = parte.latenciaMaxMs ?? reglas.latenciaMaxMs;
    const umbralBateria = reglas.umbralBateria ?? UMBRAL_BATERIA_DEFECTO;
    // Orden de reglas del contrato: visibilidad → privacidad → latencia → energía → capacidad → orden.
    const elegibles = ofertas
      .map((o) => ofertaVisiblePara(o, { cuentaId: cuenta, grupos: prestanAlContexto }))
      .filter((o): o is OfertaNeurona => o !== null)
      .filter((o) => privacidadOk(o, cuenta, privado))
      .filter((o) => latenciaOk(o, latenciaMaxMs))
      .filter((o) => energiaOk(o, umbralBateria))
      .filter((o) => tecnicoOk(o, parte))
      .sort(ordenDeterminista(cuenta));

    // Regla 6: si una sola no basta, se ramifica; si ni juntando cubren, falta.
    const objetivo = objetivoParte(parte);
    const elegidas: OfertaNeurona[] = [];
    let suma = 0;
    for (const o of elegibles) {
      if (elegidas.length >= TOPES_FUENTES) break;
      elegidas.push(o);
      suma += aporte(o, parte);
      if (suma >= objetivo) break;
    }
    if (suma < objetivo || elegidas.length === 0) {
      faltas.push(describeFalta(parte));
      continue;
    }
    const destino = elegidas[0];
    const ramificado = elegidas.length > 1;
    lista.push({
      destino: destino.nodoId,
      fuentes: ramificado ? elegidas.map((f) => f.nodoId) : undefined,
      enlace: parte.clase === "ventana" || parte.clase === "relevo" ? destino.nodoId : undefined,
      respaldo: !ramificado && elegibles.length > 1 ? elegibles[1].nodoId : undefined,
      motivo:
        `${parte.clase} en ${destino.nodoId}` +
        (ramificado ? ` repartido entre ${elegidas.map((f) => f.nodoId).join(" + ")}` : "") +
        `: ${procedencia(destino, cuenta)}` +
        (latenciaMaxMs !== undefined ? ` con latencia medida ≤ ${latenciaMaxMs} ms` : "") +
        (privado ? "; privado, nunca en nube compartida ni vecinos públicos" : "") +
        ".",
    });
  }

  // Regla 7: never «nada». Lo que no se sirvió se abre en local (privado) o en la web, y se dice qué falta.
  if (faltas.length > 0) {
    const destino = privado ? "local" : "nube";
    const resultado: ResultadoPlanificacion = { porParte };
    resultado.suelo = {
      destino,
      motivo:
        `Alguna parte no encontró recursos ${privado ? "dentro de la cuenta (privado: la nube compartida queda fuera)" : "en la red"}` +
        `: se abre por ${destino === "local" ? "el medio local, resignando lo pesado" : "la versión web del OS"}.`,
      falta: faltas,
    };
    return resultado;
  }
  return { porParte };
}
