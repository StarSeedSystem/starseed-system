import { capacidadPrestable, type OfertaNeurona } from './oferta';
export type ContextoPeticion = {
  tipo: 'cuenta' | 'grupo' | 'comunidad' | 'publicacion' | 'estacion';
  id: string; privado: boolean; grupos?: string[];
};
export type Necesita = { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: string; kbps?: number };
export type Parte = { clase: 'computo' | 'bytes' | 'ventana' | 'relevo'; necesita: Necesita; latenciaMaxMs?: number };
export type Peticion = { id: string; contexto: ContextoPeticion; partes: Parte[] };
export type ResultadoParte = { destino: string; fuentes?: string[]; enlace?: 'local' | 'cuenta' | 'par'; respaldo?: string; motivo: string };
export type PlanResultado = { parteIdx: number; resultado: ResultadoParte };
const REGLAS = ['privacidad', 'latencia', 'energia', 'capacidad', 'coste', 'reparto', 'suelo'] as const;
type Candidata = { oferta: OfertaNeurona; prestable: OfertaNeurona; latencia: number };
const misma = (o: OfertaNeurona, c: ContextoPeticion) => o.cuentaId !== '' && o.cuentaId === c.id;
const cerebro = (o: OfertaNeurona) => o.medio === 'cerebro';
const gruposDe = (c: ContextoPeticion) => [...(c.tipo === 'grupo' ? [c.id] : []), ...(c.grupos ?? [])];
function visible(o: OfertaNeurona, c: ContextoPeticion): boolean {
  if (c.privado) return misma(o, c) || cerebro(o);
  if (misma(o, c) || cerebro(o)) return true;
  const gs = gruposDe(c);
  return o.presta.grupos.some((g) => gs.includes(g)) || o.presta.publico;
}
function latencia(o: OfertaNeurona): number {
  const v = Object.values(o.enlaces.latenciaMs ?? {}).filter((x) => Number.isFinite(x));
  return v.length ? Math.min(...v) : Infinity;
}
function rango(o: OfertaNeurona, c: ContextoPeticion): number {
  if (misma(o, c) || cerebro(o)) return 0;
  const gs = gruposDe(c);
  return o.presta.grupos.some((g) => gs.includes(g)) ? 1 : 2;
}
function ordenar(a: Candidata, b: Candidata, c: ContextoPeticion): number {
  const r = rango(a.oferta, c) - rango(b.oferta, c);
  if (r !== 0) return r;
  if (a.latencia !== b.latencia) return a.latencia < b.latencia ? -1 : 1;
  return a.oferta.nodoId < b.oferta.nodoId ? -1 : a.oferta.nodoId > b.oferta.nodoId ? 1 : 0;
}
function cabe(p: Parte, o: OfertaNeurona, pr: OfertaNeurona): boolean {
  const n = p.necesita;
  if (p.clase === 'bytes') return pr.almacen.prestaMb > 0 && (!n.volumen || pr.almacen.volumenes.includes(n.volumen));
  if (p.clase === 'ventana') {
    if (n.appId && !o.apps.some((a) => a.id === n.appId)) return false;
    return pr.computo.nucleos > 0 || pr.computo.ramLibreMb > 0;
  }
  return pr.computo.ramLibreMb >= (n.ramMb ?? 0) && (!n.gpu || pr.computo.gpu) &&
    (!n.motor || pr.computo.motores.includes(n.motor)) && (pr.computo.nucleos > 0 || (n.ramMb ?? 0) === 0);
}
function faltaDe(p: Parte): string {
  const n = p.necesita;
  const f = [n.ramMb !== undefined ? `${n.ramMb} MB de RAM` : '', n.gpu ? 'GPU' : '', n.motor ? `motor ${n.motor}` : '',
    n.appId ? `app ${n.appId}` : '', n.volumen ? `volumen ${n.volumen}` : '', n.kbps !== undefined ? `${n.kbps} kbps` : ''];
  return f.filter(Boolean).join(', ') || 'recursos';
}
function suelo(p: Parte, c: ContextoPeticion): ResultadoParte {
  const destino = c.privado ? 'local' : p.necesita.appId || p.clase === 'bytes' ? 'nube' : 'local';
  return { destino, motivo: `Suelo: sin recursos suficientes. Falta ${faltaDe(p)}. Abrir en ${destino === 'nube' ? 'la web' : 'local'}.` };
}
function enlace(o: OfertaNeurona, c: ContextoPeticion): 'local' | 'cuenta' | 'par' {
  return misma(o, c) || cerebro(o) ? 'cuenta' : 'par';
}

function fuentesPorAncho(aptas: Candidata[], kbps: number): string[] {
  let suma = 0; const fuentes: string[] = [];
  for (const c of aptas) {
    const ancho = c.oferta.enlaces.subidaKbps ?? 0;
    if (ancho <= 0) continue;
    fuentes.push(c.oferta.nodoId); suma += ancho;
    if (suma >= kbps) break;
  }
  return suma >= kbps ? fuentes : [];
}

function repartir(p: Parte, base: Candidata[], c: ContextoPeticion): ResultadoParte | null {
  const ram = p.necesita.ramMb ?? 0;
  if (ram <= 0) return null;
  let suma = 0; const fuentes: string[] = [];
  for (const x of base) {
    if (x.prestable.computo.nucleos <= 0 && x.prestable.computo.ramLibreMb <= 0) continue;
    if (p.necesita.gpu && !x.prestable.computo.gpu) continue;
    if (p.necesita.motor && !x.prestable.computo.motores.includes(p.necesita.motor)) continue;
    fuentes.push(x.oferta.nodoId); suma += x.prestable.computo.ramLibreMb;
    if (suma >= ram) break;
  }
  const primera = base.find((x) => x.oferta.nodoId === fuentes[0]);
  if (!primera || fuentes.length < 2 || suma < ram) return null;
  return { destino: primera.oferta.nodoId, fuentes, enlace: enlace(primera.oferta, c),
    motivo: `Reparto: ninguna sola alcanza; ${fuentes.length} fuentes suman ${Math.round(suma)} de ${ram} MB.` };
}

export function planificar(peticion: Peticion, ofertas: OfertaNeurona[], reglas?: string[]): PlanResultado[] {
  const activas = new Set<string>(reglas ?? REGLAS);
  const ctx = peticion.contexto;
  return peticion.partes.map((parte, parteIdx) => {
    const base = ofertas.filter((o) => visible(o, ctx))
      .map<Candidata>((oferta) => ({ oferta, prestable: capacidadPrestable(oferta), latencia: latencia(oferta) }))
      .filter((c) => !activas.has('latencia') || parte.latenciaMaxMs === undefined || c.latencia <= parte.latenciaMaxMs)
      .filter((c) => !activas.has('energia') || c.prestable.computo.nucleos > 0 || c.prestable.almacen.prestaMb > 0)
      .sort((a, b) => ordenar(a, b, ctx));
    const aptas = base.filter((c) => cabe(parte, c.oferta, c.prestable));
    const respaldo = aptas[1]?.oferta.nodoId;
    if (aptas.length > 0) {
      const primera = aptas[0];
      const kbps = parte.necesita.kbps ?? 0;
      const fuentes = parte.clase === 'bytes' && kbps > 0 ? fuentesPorAncho(aptas, kbps) : [primera.oferta.nodoId];
      if (fuentes.length === 0) return { parteIdx, resultado: suelo(parte, ctx) };
      const elegida = aptas.find((x) => x.oferta.nodoId === fuentes[0]) ?? primera;
      const motivo = fuentes.length > 1
        ? `Reparto: ${fuentes.length} fuentes suman la subida pedida (${kbps} kbps).`
        : `Corre en ${elegida.oferta.nodoId}: cumple ${parte.clase} con ${Math.round(elegida.prestable.computo.ramLibreMb)} MB y ${elegida.prestable.almacen.prestaMb} MB prestables.`;
      return { parteIdx, resultado: { destino: elegida.oferta.nodoId, fuentes: fuentes.length > 1 ? fuentes : undefined,
        enlace: enlace(elegida.oferta, ctx), respaldo, motivo } };
    }
    if (activas.has('reparto') && parte.clase !== 'ventana') {
      const r = repartir(parte, base, ctx);
      if (r) return { parteIdx, resultado: r };
    }
    return { parteIdx, resultado: suelo(parte, ctx) };
  });
}

export default planificar;
