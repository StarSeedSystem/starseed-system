import { capacidadPrestable, type OfertaNeurona } from "./oferta";
export type ClaseParte = "computo" | "bytes" | "ventana" | "relevo";
export type Necesita = { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: string; kbps?: number };
export type Parte = { clase: ClaseParte; necesita: Necesita; latenciaMaxMs?: number };
export type ContextoPeticion = { tipo: "cuenta" | "grupo" | "comunidad" | "publicacion" | "estacion"; id: string; privado: boolean };
export type Peticion = { id: string; contexto: ContextoPeticion; partes: Parte[] };
export type Regla = "privacidad" | "latencia" | "energia" | "capacidad" | "coste" | "reparto" | "suelo";
export const REGLAS_POR_DEFECTO: readonly Regla[] = ["privacidad", "latencia", "energia", "capacidad", "coste", "reparto", "suelo"];
export type Suelo = { destino: "local" | "nube"; falta: string[]; motivo: string };
export type ResultadoParte = { destino: string | "local" | "nube"; fuentes?: string[]; enlace?: string; respaldo?: string; motivo: string };
export type Plan = { peticionId: string; partes: ResultadoParte[]; suelo?: Suelo };
export type PlanResultado = Plan;

const esNube = (o: OfertaNeurona) => /^(nube|cloud)/i.test(o.medio);
const esLocal = (o: OfertaNeurona) => /(local|lan|wifi|ethernet|bluetooth|meshtastic|usb)/i.test(o.medio);
const mismaCuenta = (o: OfertaNeurona, ctx: ContextoPeticion) => o.presta.cuenta && o.cuentaId === ctx.id;
const energiaUtil = (o: OfertaNeurona) => !o.energia.enUso && !(o.energia.bateriaPct !== undefined && o.energia.bateriaPct < 20 && !o.energia.cargando);
function visible(o: OfertaNeurona, ctx: ContextoPeticion): boolean {
  if (!ctx.privado) return mismaCuenta(o, ctx) || o.presta.publico || o.presta.grupos.includes(ctx.id);
  if (esNube(o) || o.presta.publico) return false;
  if (mismaCuenta(o, ctx)) return true;
  if (ctx.tipo === "grupo" && o.presta.grupos.includes(ctx.id)) return true;
  return /(cerebro|brain)/i.test(o.medio) && (o.cuentaId === "" || o.cuentaId === ctx.id);
}
const latenciaDe = (o: OfertaNeurona): number | undefined => {
  const v = Object.values(o.enlaces.latenciaMs ?? {}).filter((n) => Number.isFinite(n)); return v.length > 0 ? Math.min(...v) : undefined;
};
function cumpleLatencia(o: OfertaNeurona, parte: Parte): boolean {
  const latencia = latenciaDe(o);
  return parte.latenciaMaxMs === undefined || esLocal(o) || (latencia !== undefined && latencia <= parte.latenciaMaxMs);
}
const cubreVolumen = (o: OfertaNeurona, n: Necesita) =>
  (n.volumen === undefined || o.almacen.volumenes.includes(n.volumen)) &&
  (n.appId === undefined || o.apps.some((a) => a.id === n.appId) || o.almacen.volumenes.includes(n.appId));
function capacidadSuficiente(o: OfertaNeurona, parte: Parte): boolean {
  const p = capacidadPrestable(o), n = parte.necesita;
  if (parte.clase === "bytes") return cubreVolumen(o, n) && (n.kbps === undefined || (o.enlaces.bajadaKbps ?? 0) >= n.kbps) && (p.almacen.prestaMb > 0 || p.almacen.volumenes.length > 0);
  if (n.appId !== undefined && !o.apps.some((a) => a.id === n.appId)) return false;
  if (n.ramMb !== undefined && p.computo.ramLibreMb < n.ramMb) return false;
  if (n.gpu && !p.computo.gpu) return false;
  if (n.motor !== undefined && !p.computo.motores.includes(n.motor)) return false;
  if (parte.clase === "relevo") return p.computo.nucleos > 0 && (n.kbps === undefined || (o.enlaces.subidaKbps ?? 0) >= n.kbps);
  return p.computo.nucleos > 0;
}
function capacidadParcial(o: OfertaNeurona, parte: Parte): number {
  const p = capacidadPrestable(o), n = parte.necesita;
  if (parte.clase === "bytes") return cubreVolumen(o, n) ? p.almacen.prestaMb : 0;
  if (p.computo.nucleos === 0 || (n.appId !== undefined && !o.apps.some((a) => a.id === n.appId)) || (n.gpu && !p.computo.gpu) || (n.motor !== undefined && !p.computo.motores.includes(n.motor))) return 0;
  return parte.clase === "relevo" ? o.enlaces.subidaKbps ?? 0 : p.computo.ramLibreMb;
}
function puedeRepartir(cs: readonly OfertaNeurona[], parte: Parte): boolean {
  if (cs.length < 2) return false;
  const total = cs.reduce((suma, o) => suma + capacidadParcial(o, parte), 0);
  if (parte.clase === "bytes") return total > 0;
  const pedido = parte.clase === "relevo" ? parte.necesita.kbps : parte.necesita.ramMb;
  return pedido === undefined ? total > 0 : total >= pedido;
}
const rangoCoste = (o: OfertaNeurona, ctx: ContextoPeticion) => mismaCuenta(o, ctx) ? 0 : esNube(o) ? 2 : 1;
function ordenar(cs: readonly OfertaNeurona[], ctx: ContextoPeticion): OfertaNeurona[] {
  return [...cs].sort((a, b) =>
    (rangoCoste(a, ctx) - rangoCoste(b, ctx)) ||
    ((latenciaDe(a) ?? Number.MAX_SAFE_INTEGER) - (latenciaDe(b) ?? Number.MAX_SAFE_INTEGER)) ||
    (a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0));
}
function faltaDe(parte: Parte): string[] {
  const n = parte.necesita, falta = [
    ...(n.ramMb !== undefined ? [`${n.ramMb} MB de RAM`] : []), ...(n.gpu ? ["GPU"] : []),
    ...(n.motor !== undefined ? [`motor ${n.motor}`] : []), ...(n.appId !== undefined ? [`app ${n.appId}`] : []),
    ...(n.volumen !== undefined ? [`volumen ${n.volumen}`] : []), ...(n.kbps !== undefined ? [`${n.kbps} kbps`] : []),
    ...(parte.latenciaMaxMs !== undefined ? [`latencia ≤ ${parte.latenciaMaxMs} ms`] : []),
  ];
  return falta.length > 0 ? falta : [`recursos de ${parte.clase}`];
}
function sueloDe(peticion: Peticion, parte: Parte): ResultadoParte {
  const falta = faltaDe(parte);
  const destino = peticion.contexto.privado || parte.clase === "bytes" ? "local" : "nube";
  return { destino, motivo: `Suelo: se abre en local o en la web. Falta ${falta.join(", ")}.` };
}
function planificarParte(peticion: Peticion, parte: Parte, ofertas: readonly OfertaNeurona[], activa: ReadonlySet<Regla>): ResultadoParte {
  const ctx = peticion.contexto;
  let cs = ofertas.filter((o) => visible(o, ctx));
  if (activa.has("energia")) cs = cs.filter(energiaUtil);
  if (activa.has("latencia")) cs = cs.filter((o) => cumpleLatencia(o, parte));
  const completas = ordenar(cs.filter((o) => capacidadSuficiente(o, parte)), ctx);
  if (completas.length > 0) {
    const o = completas[0], latencia = latenciaDe(o);
    const motivo = `Recurso en ${o.nodoId}: ${parte.clase} por ${o.medio}` +
      `${latencia !== undefined ? `, latencia ${latencia} ms` : ""}${mismaCuenta(o, ctx) ? ", cuenta propia" : ", red gratuita"}.`;
    return {
      destino: o.nodoId, motivo,
      ...(completas[1] !== undefined ? { respaldo: completas[1].nodoId } : {}),
      ...(parte.clase !== "computo" ? { enlace: o.medio } : {}),
    };
  }
  const parciales = activa.has("reparto") ? ordenar(cs.filter((o) => capacidadParcial(o, parte) > 0), ctx) : [];
  if (puedeRepartir(parciales, parte)) {
    return {
      destino: parciales[0].nodoId, fuentes: parciales.map((o) => o.nodoId),
      ...(parte.clase !== "computo" ? { enlace: parciales[0].medio } : {}),
      motivo: `Reparto en ${parciales.length} fuentes ordenadas por coste y nodoId.`,
    };
  }
  return sueloDe(peticion, parte);
}

// Contrato §4: privacidad › latencia › energía › capacidad › coste › reparto › suelo. Pura y determinista; empates por nodoId.
export function planificar(peticion: Peticion, ofertas: readonly OfertaNeurona[], reglas: readonly Regla[] = REGLAS_POR_DEFECTO): Plan {
  const activa = new Set(reglas.length > 0 ? reglas : REGLAS_POR_DEFECTO);
  const partes = peticion.partes.map((parte) => planificarParte(peticion, parte, ofertas, activa));
  if (partes.some((p) => p.destino !== "local" && p.destino !== "nube")) return { peticionId: peticion.id, partes };
  const falta = [...new Set(peticion.partes.flatMap(faltaDe)), ...(peticion.partes.length === 0 ? ["recursos de la petición"] : [])];
  return {
    peticionId: peticion.id, partes,
    suelo: {
      destino: peticion.contexto.privado ? "local" : "nube", falta,
      motivo: `Suelo: se abre en local o en la web. Falta ${falta.join(", ")}.`,
    },
  };
}
