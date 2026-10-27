/** Bolsa pura de recursos (§4 de apps-en-la-malla.md): privacidad → latencia → energía →
 * capacidad prestable → gratis y propio → reparto → suelo. Sin red, disco ni reloj propio. */
import { capacidadPrestable, ofertaVisiblePara, type OfertaNeurona } from "./oferta";

export type ClaseParte = "computo" | "bytes" | "ventana" | "relevo";
export type TipoContexto = "cuenta" | "grupo" | "comunidad" | "publicacion" | "estacion";
export interface ContextoPeticion { tipo: TipoContexto; id: string; privado: boolean }
export interface NecesitaParte { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: number; kbps?: number }
export interface PartePeticion { clase: ClaseParte; necesita: NecesitaParte; latenciaMaxMs?: number }
export interface Peticion { id: string; contexto: ContextoPeticion; partes: PartePeticion[] }
export interface ResultadoParte { clase: ClaseParte; destino: string; fuentes?: string[]; enlace?: string; respaldo?: string; motivo: string }
export interface SueloPlan { destino: "local" | "nube"; motivo: string; falta: string[] }
export interface PlanRecursos { partes: ResultadoParte[]; suelo?: SueloPlan }
export interface Reglas { latenciaMaxMs?: number; umbralBateria?: number; permitirNubePublico?: boolean; servidoresCerebro?: string[] }

interface Candidato { oferta: OfertaNeurona; prestable: OfertaNeurona; enlace?: string; rango: number }
const RED_LOCAL = new Set(["local", "lan", "loopback"]);

function quien(c: ContextoPeticion): { cuentaId: string; grupos: string[] } {
  return c.tipo === "cuenta" ? { cuentaId: c.id, grupos: [] } : { cuentaId: "", grupos: c.tipo === "grupo" ? [c.id] : [] };
}
function visible(o: OfertaNeurona, c: ContextoPeticion, cerebro: Set<string>, nube: boolean): boolean {
  const q = quien(c);
  const propia = q.cuentaId !== "" && o.cuentaId === q.cuentaId;
  const grupo = c.tipo === "grupo" && o.presta.grupos.includes(c.id);
  const esCerebro = cerebro.has(o.nodoId);
  if (ofertaVisiblePara(o, q) === null && !(c.privado && esCerebro)) return false;
  return c.privado ? propia || grupo || esCerebro : !(o.medio === "nube" && o.presta.publico && !nube);
}
function enlace(o: OfertaNeurona, max?: number): { ok: boolean; enlace?: string } {
  if (max === undefined) return { ok: true };
  if (RED_LOCAL.has(o.medio)) return { ok: true, enlace: "local" };
  const medidos = Object.entries(o.enlaces.latenciaMs ?? {}).filter(([, ms]) => ms <= max)
    .sort(([a, x], [b, y]) => x - y || (a < b ? -1 : a > b ? 1 : 0));
  return medidos.length > 0 ? { ok: true, enlace: medidos[0][0] } : { ok: false };
}
function rango(o: OfertaNeurona, c: ContextoPeticion, cerebro: Set<string>): number {
  const q = quien(c);
  const propio = cerebro.has(o.nodoId) || (q.cuentaId !== "" && o.cuentaId === q.cuentaId)
    || (c.tipo === "grupo" && o.presta.grupos.includes(c.id));
  return propio ? 0 : o.medio === "nube" ? 2 : 1;
}
function requisitos(c: Candidato, n: NecesitaParte): boolean {
  const p = c.prestable;
  if (n.appId && !p.apps.some((a) => a.id === n.appId)) return false;
  if (n.motor && !p.computo.motores.includes(n.motor)) return false;
  return !n.gpu || p.computo.gpu;
}
function cubre(c: Candidato, parte: PartePeticion): boolean {
  if (!requisitos(c, parte.necesita)) return false;
  const p = c.prestable, n = parte.necesita;
  if (parte.clase === "bytes") return p.almacen.prestaMb > 0 && p.almacen.prestaMb >= (n.volumen ?? 0);
  if (parte.clase === "relevo") return (p.enlaces.subidaKbps ?? 0) >= Math.max(1, n.kbps ?? 0);
  return p.computo.nucleos > 0 && p.computo.ramLibreMb >= (n.ramMb ?? 0);
}
function repartir(cands: Candidato[], parte: PartePeticion): Candidato[] | null {
  const uno = cands.find((c) => cubre(c, parte));
  if (uno) return [uno];
  if (parte.clase !== "bytes" && parte.clase !== "relevo") return null;
  const objetivo = parte.clase === "bytes" ? (parte.necesita.volumen ?? 0) : (parte.necesita.kbps ?? 0);
  const elegidos: Candidato[] = []; let total = 0;
  for (const c of cands) {
    if (!requisitos(c, parte.necesita)) continue;
    const aporte = parte.clase === "bytes" ? c.prestable.almacen.prestaMb : (c.prestable.enlaces.subidaKbps ?? 0);
    if (aporte <= 0) continue;
    elegidos.push(c); total += aporte;
    if (total >= objetivo) return elegidos;
  }
  return null;
}
function describirFalta(parte: PartePeticion): string {
  const n = parte.necesita, trozos: string[] = [];
  if (n.ramMb) trozos.push(`${n.ramMb} MB de RAM`);
  if (n.gpu) trozos.push("GPU");
  if (n.motor) trozos.push(`motor «${n.motor}»`);
  if (n.appId) trozos.push(`app «${n.appId}»`);
  if (n.volumen) trozos.push(`${n.volumen} MB de almacenamiento`);
  if (n.kbps) trozos.push(`${n.kbps} kbps de subida`);
  return `${parte.clase}: falta ${trozos.length > 0 ? trozos.join(", ") : "capacidad prestable"}`;
}
function motivo(parte: PartePeticion, elegidos: Candidato[], c: ContextoPeticion, cerebro: Set<string>): string {
  const primero = elegidos[0].oferta;
  const donde = elegidos.length > 1 ? `Se reparte entre ${elegidos.map((e) => e.oferta.nodoId).join(", ")}` : `Corre en ${primero.nodoId}`;
  const coste = rango(primero, c, cerebro) === 0 ? "propia y gratuita"
    : primero.medio === "nube" ? "de la nube, solo al no haber nada propio ni gratuito" : "de un vecino público gratuito";
  const cifra = parte.clase === "bytes" ? `${parte.necesita.volumen ?? 0} MB`
    : parte.clase === "relevo" ? `${parte.necesita.kbps ?? 0} kbps` : `${parte.necesita.ramMb ?? 0} MB de RAM`;
  return `${donde} (${coste}) para cubrir ${cifra}.`;
}
export function planificar(peticion: Peticion, ofertas: OfertaNeurona[], reglas: Reglas = {}): PlanRecursos {
  const cerebro = new Set(reglas.servidoresCerebro ?? []);
  const umbral = reglas.umbralBateria ?? 20;
  const nube = reglas.permitirNubePublico ?? true;
  const partes: ResultadoParte[] = [], falta: string[] = [];
  for (const parte of peticion.partes) {
    const maxLat = parte.latenciaMaxMs ?? reglas.latenciaMaxMs;
    const cands = ofertas
      .filter((o) => visible(o, peticion.contexto, cerebro, nube))
      .filter((o) => !(o.energia.bateriaPct !== undefined && o.energia.bateriaPct < umbral && !o.energia.cargando))
      .map((o): Candidato | null => {
        const e = enlace(o, maxLat);
        return e.ok ? { oferta: o, prestable: capacidadPrestable(o), enlace: e.enlace, rango: rango(o, peticion.contexto, cerebro) } : null;
      })
      .filter((c): c is Candidato => c !== null)
      .sort((a, b) => a.rango - b.rango || (a.oferta.nodoId < b.oferta.nodoId ? -1 : a.oferta.nodoId > b.oferta.nodoId ? 1 : 0));
    const elegidos = repartir(cands, parte);
    if (!elegidos) { const f = describirFalta(parte); falta.push(f); partes.push({ clase: parte.clase, destino: peticion.contexto.privado ? "local" : "nube", motivo: `Sin recursos: ${f}.` }); continue; }
    const resultado: ResultadoParte = { clase: parte.clase, destino: elegidos[0].oferta.nodoId, motivo: motivo(parte, elegidos, peticion.contexto, cerebro) };
    if (elegidos.length > 1) resultado.fuentes = elegidos.map((e) => e.oferta.nodoId);
    const conEnlace = elegidos.find((e) => e.enlace !== undefined);
    if (conEnlace?.enlace) resultado.enlace = conEnlace.enlace;
    const sobrante = cands.find((e) => !elegidos.includes(e) && cubre(e, parte));
    if (sobrante) resultado.respaldo = sobrante.oferta.nodoId;
    partes.push(resultado);
  }
  if (falta.length === 0) return { partes };
  return { partes, suelo: peticion.contexto.privado
    ? { destino: "local", motivo: "Nada de la cuenta ni del cerebro cubre lo pedido; se abre en local con lo que la neurona tenga.", falta }
    : { destino: "nube", motivo: "Nadie de la red cubre lo pedido; se abre en local o en la web gratuita.", falta } };
}
