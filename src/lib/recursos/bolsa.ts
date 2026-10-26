import { capacidadPrestable, type OfertaNeurona } from './oferta';

export type TipoContexto = 'cuenta' | 'grupo' | 'comunidad' | 'publicacion' | 'estacion';
export type ContextoPeticion = { tipo: TipoContexto; id: string; privado: boolean; cuentaId?: string; grupos?: string[] };
export type NecesitaParte = { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: string; kbps?: number };
export type Parte = { clase: 'computo' | 'bytes' | 'ventana' | 'relevo'; necesita: NecesitaParte; latenciaMaxMs?: number };
export type Peticion = { id: string; contexto: ContextoPeticion; partes: Parte[] };
export type Suelo = { modo: 'local' | 'web'; falta: string[] };
export type ResultadoParte = { parteIdx: number; destino: string; fuentes?: string[]; enlace?: string; respaldo?: string; motivo: string; suelo?: Suelo };
export type Regla = 'privacidad' | 'latencia' | 'energia' | 'capacidad' | 'coste' | 'reparto' | 'suelo';

const ORDEN: Regla[] = ['privacidad', 'latencia', 'energia', 'capacidad', 'coste', 'reparto', 'suelo'];
const MEDIOS_LOCALES = new Set(['local', 'lan', 'wifi', 'wifi-lan', 'ble', 'lora', 'propia', 'malla-local']);
const MEDIOS_CEREBRO = new Set(['cerebro', 'servidor', 'brain', 'a1']);
type Eleccion = Omit<ResultadoParte, 'parteIdx'>;

const idCuenta = (ctx: ContextoPeticion): string => ctx.cuentaId ?? (ctx.tipo === 'cuenta' ? ctx.id : '');
const mismaCuenta = (o: OfertaNeurona, ctx: ContextoPeticion): boolean => o.presta.cuenta && idCuenta(ctx) !== '' && o.cuentaId === idCuenta(ctx);

function visible(o: OfertaNeurona, ctx: ContextoPeticion): boolean {
  if (mismaCuenta(o, ctx)) return true;
  if (ctx.privado) return MEDIOS_CEREBRO.has(o.medio.toLowerCase()) && !o.presta.publico;
  const grupos = ctx.grupos ?? (ctx.tipo === 'grupo' ? [ctx.id] : []);
  if (ctx.tipo === 'grupo') return o.presta.grupos.some((g) => grupos.includes(g));
  return o.presta.publico || o.presta.grupos.some((g) => grupos.includes(g));
}

function latenciaDe(o: OfertaNeurona, ctx: ContextoPeticion): number | undefined {
  if (MEDIOS_LOCALES.has(o.medio.toLowerCase())) return 0;
  const mapa = o.enlaces.latenciaMs;
  for (const clave of [idCuenta(ctx), ctx.id, 'local', 'origen']) if (mapa && clave && typeof mapa[clave] === 'number') return mapa[clave];
  return undefined;
}

const anchoDe = (o: OfertaNeurona, clase: Parte['clase']): number => (clase === 'bytes' ? o.enlaces.bajadaKbps : o.enlaces.subidaKbps) ?? 0;

function energiaOk(o: OfertaNeurona): boolean {
  const { bateriaPct, cargando, enUso } = o.energia;
  return !enUso && !(bateriaPct !== undefined && bateriaPct < 20 && !cargando);
}

function capacidadOk(o: OfertaNeurona, parte: Parte, repartible: boolean): boolean {
  const c = capacidadPrestable(o), n = parte.necesita;
  const ram = n.ramMb === undefined || (repartible ? c.computo.ramLibreMb > 0 : c.computo.ramLibreMb >= n.ramMb);
  const ancho = n.kbps === undefined || (repartible ? anchoDe(o, parte.clase) > 0 : anchoDe(o, parte.clase) >= n.kbps);
  return ram && ancho && (!n.gpu || c.computo.gpu)
    && (!n.motor || c.computo.motores.includes(n.motor)) && (!n.appId || o.apps.some((a) => a.id === n.appId))
    && (!n.volumen || c.almacen.volumenes.includes(n.volumen));
}

function comparar(a: OfertaNeurona, b: OfertaNeurona): number {
  const propia = Number(!a.presta.cuenta) - Number(!b.presta.cuenta);
  if (propia !== 0) return propia;
  const nube = Number(a.medio.toLowerCase() === 'nube') - Number(b.medio.toLowerCase() === 'nube');
  return nube !== 0 ? nube : a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}

function faltaDe(parte: Parte): string[] {
  const n = parte.necesita;
  const falta = [
    n.ramMb !== undefined ? `${n.ramMb} MB de RAM` : '', n.gpu ? 'GPU' : '', n.motor ? `motor ${n.motor}` : '',
    n.appId ? `app ${n.appId}` : '', n.volumen ? `volumen ${n.volumen}` : '', n.kbps !== undefined ? `${n.kbps} kbps` : '',
  ].filter((x) => x !== '');
  return falta.length > 0 ? falta : ['capacidad de la red'];
}

function sueloDe(parte: Parte, ctx: ContextoPeticion): Eleccion {
  const falta = faltaDe(parte);
  const web = !ctx.privado && (parte.necesita.appId !== undefined || parte.necesita.gpu === true || parte.clase !== 'computo');
  const modo = web ? 'web' : 'local';
  const aviso = ctx.privado ? ' sin sacar nada de la cuenta' : '';
  return { destino: web ? 'nube' : 'local', motivo: `Suelo: se abre en ${web ? 'la web' : 'local'}${aviso}; falta ${falta.join(', ')}`, suelo: { modo, falta } };
}

function elegir(lista: OfertaNeurona[], o: OfertaNeurona, parte: Parte): Eleccion {
  const respaldo = lista.find((x) => x.nodoId !== o.nodoId)?.nodoId;
  const detalle = parte.clase === 'computo' ? `${capacidadPrestable(o).computo.ramLibreMb} MB de RAM` : `${anchoDe(o, parte.clase)} kbps`;
  return { destino: o.nodoId, enlace: o.medio, respaldo, motivo: `${o.nodoId} cumple ${parte.clase} con ${detalle} (${o.medio})` };
}

function repartir(lista: OfertaNeurona[], parte: Parte): Eleccion | null {
  if (lista.length === 0) return null;
  const n = parte.necesita;
  if (parte.clase === 'computo') {
    const una = lista.find((o) => n.ramMb === undefined || capacidadPrestable(o).computo.ramLibreMb >= n.ramMb);
    if (una) return elegir(lista, una, parte);
    if (n.ramMb === undefined) return elegir(lista, lista[0], parte);
    const usadas: OfertaNeurona[] = [];
    let suma = 0;
    for (const o of lista) {
      usadas.push(o);
      suma += capacidadPrestable(o).computo.ramLibreMb;
      if (suma >= n.ramMb) break;
    }
    if (suma < n.ramMb) return null;
    if (usadas.length === 1) return elegir(lista, usadas[0], parte);
    return { destino: usadas[0].nodoId, fuentes: usadas.map((o) => o.nodoId), enlace: usadas[0].medio, respaldo: lista.find((x) => !usadas.includes(x))?.nodoId, motivo: `Reparto de cálculo: ${suma} MB de RAM entre ${usadas.length} neuronas` };
  }
  const kbps = n.kbps ?? 0;
  if (kbps > 0) {
    const usadas: OfertaNeurona[] = [];
    let suma = 0;
    for (const o of lista) {
      usadas.push(o);
      suma += anchoDe(o, parte.clase);
      if (suma >= kbps) break;
    }
    if (suma < kbps) return null;
    if (usadas.length === 1) return elegir(lista, usadas[0], parte);
    return { destino: usadas[0].nodoId, fuentes: usadas.map((o) => o.nodoId), enlace: usadas[0].medio, respaldo: lista.find((x) => !usadas.includes(x))?.nodoId, motivo: `Reparto: ${suma} kbps entre ${usadas.length} fuentes` };
  }
  return elegir(lista, lista[0], parte);
}

export function planificar(peticion: Peticion, ofertas: OfertaNeurona[], reglas?: string[]): ResultadoParte[] {
  const activas = new Set<string>(reglas ?? ORDEN);
  const ctx = peticion.contexto;
  return peticion.partes.map((parte, parteIdx) => {
    let lista = ofertas.filter((o) => !activas.has('privacidad') || visible(o, ctx));
    if (activas.has('latencia') && parte.latenciaMaxMs !== undefined) {
      const tope = parte.latenciaMaxMs;
      lista = lista.filter((o) => {
        const ms = latenciaDe(o, ctx);
        return ms !== undefined && ms <= tope;
      });
    }
    if (activas.has('energia')) lista = lista.filter(energiaOk);
    if (activas.has('capacidad')) lista = lista.filter((o) => capacidadOk(o, parte, activas.has('reparto')));
    if (activas.has('coste')) lista.sort(comparar);
    const eleccion = activas.has('reparto') ? repartir(lista, parte) : (lista.length > 0 ? elegir(lista, lista[0], parte) : null);
    return { parteIdx, ...(eleccion ?? sueloDe(parte, ctx)) };
  });
}

export default planificar;
