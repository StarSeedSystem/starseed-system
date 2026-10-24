// La bolsa de recursos (§4 de architecture/apps-en-la-malla.md): empareja peticiones y ofertas con
// reglas deterministas y su motivo: privacidad → latencia → energía → capacidad → coste → reparto → suelo.
import { capacidadPrestable, type OfertaNeurona } from "./oferta";

export type ClaseParte = "computo" | "bytes" | "ventana" | "relevo";
/** `volumen` es el identificador del volumen o, si es número, los MB que se necesitan de él. */
export type Necesita = { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: string | number; kbps?: number };
export type Parte = { clase: ClaseParte; necesita: Necesita; latenciaMaxMs?: number };
export type ContextoPeticion = { tipo: "cuenta" | "grupo" | "comunidad" | "publicacion" | "estacion"; id: string; privado: boolean };
export type Peticion = { id: string; contexto: ContextoPeticion; partes: Parte[] };
export type ResultadoParte = { destino: string | "local" | "nube"; fuentes?: string[]; enlace?: string; respaldo?: string; motivo: string };
export type Suelo = { destino: "local" | "nube"; falta: string[]; motivo: string };
export type Plan = { peticionId: string; partes: ResultadoParte[]; suelo?: Suelo };
export type PlanResultado = Plan;
export type ReglasBolsa = { umbralBateriaPct?: number; maxFuentes?: number };

const UMBRAL_BATERIA_PCT = 20, MAX_FUENTES = 3;
const esNube = (o: OfertaNeurona) => /^(nube|cloud)/i.test(o.medio);
const esLocal = (o: OfertaNeurona) => /(local|lan|wifi|ethernet|bluetooth|meshtastic|usb)/i.test(o.medio);
const esServidorCerebro = (o: OfertaNeurona) => /(cerebro|brain)/i.test(o.medio);
const mismaCuenta = (o: OfertaNeurona, ctx: ContextoPeticion) => o.presta.cuenta && o.cuentaId === ctx.id;
const latenciaDe = (o: OfertaNeurona): number | undefined => {
  const v = Object.values(o.enlaces.latenciaMs ?? {}).filter((n) => Number.isFinite(n));
  return v.length > 0 ? Math.min(...v) : undefined;
};
const energiaApta = (o: OfertaNeurona, umbral: number) =>
  !o.energia.enUso && !(o.energia.bateriaPct !== undefined && o.energia.bateriaPct < umbral && !o.energia.cargando);
const rangoCoste = (o: OfertaNeurona, ctx: ContextoPeticion) => mismaCuenta(o, ctx) ? 0 : esNube(o) ? 2 : 1;
const volumenPedido = (n: Necesita) => typeof n.volumen === "number" ? n.volumen : 0;
const nombreVolumen = (n: Necesita) => n.appId ?? (typeof n.volumen === "string" ? n.volumen : undefined);
/** Regla 1: lo privado no sale de la cuenta ni va a la nube compartida ni a vecinos públicos. */
function visible(o: OfertaNeurona, ctx: ContextoPeticion): boolean {
  if (mismaCuenta(o, ctx)) return true;
  if (!ctx.privado) return o.presta.publico || o.presta.grupos.includes(ctx.id);
  if (esNube(o) || o.presta.publico) return false;
  return esServidorCerebro(o) || (ctx.tipo === "grupo" && o.presta.grupos.includes(ctx.id));
}
/** Regla 2: la red local no necesita medida; fuera de ella, latencia medida y dentro del tope. */
function cumpleLatencia(o: OfertaNeurona, parte: Parte): boolean {
  if (parte.latenciaMaxMs === undefined || esLocal(o)) return true;
  const l = latenciaDe(o);
  return l !== undefined && l <= parte.latenciaMaxMs;
}
/** Regla 4: cabe en lo que PRESTA (capacidadPrestable), no en lo que tiene la neurona. */
function capacidadSuficiente(o: OfertaNeurona, parte: Parte): boolean {
  const p = capacidadPrestable(o), n = parte.necesita;
  if (n.ramMb !== undefined && p.computo.ramLibreMb < n.ramMb) return false;
  if (n.gpu && !p.computo.gpu) return false;
  if (n.motor !== undefined && !p.computo.motores.includes(n.motor)) return false;
  if (parte.clase === "bytes") {
    const nombrado = nombreVolumen(n);
    return p.almacen.prestaMb >= volumenPedido(n) && (nombrado === undefined || p.almacen.volumenes.includes(nombrado));
  }
  if (n.appId !== undefined && !o.apps.some((a) => a.id === n.appId)) return false;
  if (parte.clase === "relevo") return p.computo.nucleos > 0 && (n.kbps === undefined || (o.enlaces.subidaKbps ?? 0) >= n.kbps);
  return p.computo.nucleos > 0;
}
function capacidadParcial(o: OfertaNeurona, parte: Parte): number {
  const p = capacidadPrestable(o), nombrado = nombreVolumen(parte.necesita);
  if (parte.clase === "bytes") return nombrado !== undefined && !p.almacen.volumenes.includes(nombrado) ? 0 : p.almacen.prestaMb;
  if (p.computo.nucleos === 0) return 0;
  return parte.clase === "relevo" ? o.enlaces.subidaKbps ?? 0 : p.computo.ramLibreMb;
}
/** Regla 6: bandas desde varias fuentes o piezas de cálculo repartidas; nunca una ventana. */
function puedeRepartir(cs: readonly OfertaNeurona[], parte: Parte): boolean {
  if (cs.length < 2 || parte.clase === "ventana") return false;
  const total = cs.reduce((suma, o) => suma + capacidadParcial(o, parte), 0);
  const pedido = parte.clase === "bytes" ? volumenPedido(parte.necesita) : parte.clase === "relevo" ? parte.necesita.kbps ?? 0 : parte.necesita.ramMb ?? 0;
  return total > 0 && total >= pedido;
}
/** Regla 5 y empates: propio y gratuito primero, luego latencia medida y por último nodoId. */
const ordenar = (cs: readonly OfertaNeurona[], ctx: ContextoPeticion) => [...cs].sort((a, b) =>
  (rangoCoste(a, ctx) - rangoCoste(b, ctx)) ||
  ((latenciaDe(a) ?? Number.MAX_SAFE_INTEGER) - (latenciaDe(b) ?? Number.MAX_SAFE_INTEGER)) ||
  (a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0));
function faltaDe(parte: Parte): string[] {
  const n = parte.necesita, falta = [
    ...(n.ramMb !== undefined ? [`${n.ramMb} MB de RAM`] : []), ...(n.gpu ? ["GPU"] : []),
    ...(n.motor !== undefined ? [`motor ${n.motor}`] : []), ...(n.appId !== undefined ? [`app ${n.appId}`] : []),
    ...(n.volumen !== undefined ? [typeof n.volumen === "number" ? `${n.volumen} MB de volumen` : `volumen ${n.volumen}`] : []),
    ...(n.kbps !== undefined ? [`${n.kbps} kbps`] : []),
    ...(parte.latenciaMaxMs !== undefined ? [`latencia ≤ ${parte.latenciaMaxMs} ms`] : []),
  ];
  return falta.length > 0 ? falta : [`recursos de ${parte.clase}`];
}
/** Regla 7: nunca «nada»; se abre en local o en la web y se dice qué falta. */
function sueloDe(peticion: Peticion, parte: Parte): ResultadoParte {
  const falta = faltaDe(parte), destino = peticion.contexto.privado || parte.clase === "bytes" ? "local" : "nube";
  return { destino, motivo: `Suelo: se abre en local o en la web. Falta ${falta.join(", ")}.` };
}
function planificarParte(peticion: Peticion, parte: Parte, ofertas: readonly OfertaNeurona[], reglas: ReglasBolsa): ResultadoParte {
  const ctx = peticion.contexto, umbral = reglas.umbralBateriaPct ?? UMBRAL_BATERIA_PCT;
  const utiles = ofertas.filter((o) => visible(o, ctx) && energiaApta(o, umbral) && cumpleLatencia(o, parte));
  const completas = ordenar(utiles.filter((o) => capacidadSuficiente(o, parte)), ctx);
  if (completas.length > 0) {
    const [o, respaldo] = completas, latencia = latenciaDe(o);
    return {
      destino: o.nodoId,
      motivo: `Recurso en ${o.nodoId}: ${parte.clase} por ${o.medio}${latencia !== undefined ? `, latencia ${latencia} ms` : ""}${mismaCuenta(o, ctx) ? ", cuenta propia" : ", red gratuita"}.`,
      ...(respaldo !== undefined ? { respaldo: respaldo.nodoId } : {}),
      ...(parte.clase === "computo" ? {} : { enlace: o.medio }),
    };
  }
  const parciales = ordenar(utiles.filter((o) => capacidadParcial(o, parte) > 0), ctx).slice(0, reglas.maxFuentes ?? MAX_FUENTES);
  if (puedeRepartir(parciales, parte)) {
    return { destino: parciales[0].nodoId, fuentes: parciales.map((o) => o.nodoId), enlace: parciales[0].medio,
      motivo: `Reparto en ${parciales.length} fuentes (${parciales.map((o) => o.nodoId).join(" + ")}) para la parte de ${parte.clase}.` };
  }
  return sueloDe(peticion, parte);
}
/** Contrato §4. Pura y determinista: sin red, sin disco ni reloj propio; empates por nodoId. */
export function planificar(peticion: Peticion, ofertas: readonly OfertaNeurona[], reglas: ReglasBolsa = {}): Plan {
  const partes = peticion.partes.map((parte) => planificarParte(peticion, parte, ofertas, reglas));
  if (partes.some((p) => p.destino !== "local" && p.destino !== "nube")) return { peticionId: peticion.id, partes };
  const falta = [...new Set(peticion.partes.flatMap(faltaDe))];
  const vacia = falta.length > 0 ? falta : ["recursos de la petición"];
  return { peticionId: peticion.id, partes,
    suelo: { destino: peticion.contexto.privado ? "local" : "nube", falta: vacia,
      motivo: `Suelo: se abre en local o en la web. Falta ${vacia.join(", ")}.` } };
}
