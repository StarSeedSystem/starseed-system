// Eventos del contexto (apps-en-la-malla.md §11): reloj lógico híbrido, sin duplicados, orden causal, acuses, reintentos y reparto por el árbol de relevo.
import { armarArbol, type ReceptorRelevo } from "./arbol-relevo";
export type RelojHibrido = { fisico: number; contador: number }; export type MarcaEvento = RelojHibrido & { nodoId: string };
export type SobreEvento = { id: string; de: string; tipo: string; cuerpo?: unknown; marca: MarcaEvento; causal: string[]; acuseDe?: string; intento?: number };

export function compararMarcas(a: MarcaEvento, b: MarcaEvento): number {
  if (a.fisico !== b.fisico) return a.fisico - b.fisico;
  if (a.contador !== b.contador) return a.contador - b.contador;
  return a.nodoId < b.nodoId ? -1 : a.nodoId > b.nodoId ? 1 : 0;
}

export function avanzarReloj(actual: RelojHibrido, ahora: number, nodoId: string): MarcaEvento {
  const fisico = Math.max(actual.fisico, ahora);
  return { fisico, contador: fisico === actual.fisico ? actual.contador + 1 : 0, nodoId };
}

/** Al recibir: el reloj local nunca se atrasa y su contador queda por delante del remoto. */
export function fundirReloj(actual: RelojHibrido, remoto: RelojHibrido, ahora: number, nodoId: string): MarcaEvento {
  const fisico = Math.max(actual.fisico, remoto.fisico, ahora), igualLocal = fisico === actual.fisico, igualRemoto = fisico === remoto.fisico;
  const contador = igualLocal && igualRemoto ? Math.max(actual.contador, remoto.contador) + 1
    : igualLocal ? actual.contador + 1 : igualRemoto ? remoto.contador + 1 : 0;
  return { fisico, contador, nodoId };
}

/** Todos los demás; con más de 8, solo los hijos del árbol (cada relevo reparte a los suyos). */
export function destinosRelevo(origen: string, receptores: ReceptorRelevo[], kbpsFlujo = 1): string[] {
  const otros = receptores.map((r) => r.nodoId).filter((id) => id !== origen);
  return otros.length <= 8 ? otros : armarArbol(origen, receptores, kbpsFlujo).nodos.get(origen)?.hijos ?? [];
}

export type OpcionesCanalEventos = {
  nodoId: string; ahora: () => number; enviar: (destino: string, sobre: SobreEvento) => void;
  receptores?: () => ReceptorRelevo[]; kbpsFlujo?: number; esperaMs?: number;
  reintentosMax?: number; esperaReintentoMs?: number;
  programar?: (fn: () => void, ms: number) => unknown; cancelar?: (h: unknown) => void;
};

export type CanalEventos = {
  nodoId: string;
  emitir(tipo: string, cuerpo?: unknown, causal?: string[]): SobreEvento;
  recibir(sobre: SobreEvento): boolean;
  suscribir(cb: (sobre: SobreEvento) => void): () => void;
  pendientes(): number; reloj(): MarcaEvento; cerrar(): void;
};

export function crearCanal(op: OpcionesCanalEventos): CanalEventos {
  const { nodoId } = op;
  const esperaMs = op.esperaMs ?? 40, reintentosMax = Math.max(0, op.reintentosMax ?? 4), baseReintento = op.esperaReintentoMs ?? 200;
  const programar = op.programar ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const cancelar = op.cancelar ?? ((h: unknown) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
  let marca: MarcaEvento = { fisico: op.ahora(), contador: 0, nodoId }, flush: unknown = null, cerrado = false;
  const vistos = new Set<string>(), entregados = new Set<string>();
  const pendientes = new Map<string, SobreEvento>(), oyentes = new Set<(s: SobreEvento) => void>();
  const esperas = new Map<string, { destinos: string[]; sobre: SobreEvento; intentos: number; handle: unknown }>();
  const destinos = () => destinosRelevo(nodoId, op.receptores?.() ?? [], op.kbpsFlujo ?? 1);
  const mandar = (ds: string[], s: SobreEvento) => {
    for (const d of ds) { try { op.enviar(d, s); } catch { /* el reintento lo cubre */ } }
  };
  const enviarAcuse = (s: SobreEvento) => {
    marca = avanzarReloj(marca, op.ahora(), nodoId);
    op.enviar(s.de, { id: `${nodoId}:acuse:${s.id}`, de: nodoId, tipo: "acuse", marca, causal: [s.id], acuseDe: s.id });
  };
  const entregarListos = () => {
    flush = null;
    if (cerrado) return;
    for (;;) {
      const s = Array.from(pendientes.values()).sort((x, y) => compararMarcas(x.marca, y.marca))[0];
      if (!s || !s.causal.every((id) => entregados.has(id))) break;
      pendientes.delete(s.id); entregados.add(s.id);
      for (const cb of Array.from(oyentes)) { try { cb(s); } catch { /* oyente roto */ } }
    }
  };
  const enviarConReintento = (s: SobreEvento, ds: string[]) => {
    mandar(ds, s);
    if (reintentosMax <= 0) return;
    const esperar = () => {
      const e = esperas.get(s.id);
      if (!e || cerrado) return;
      if (++e.intentos > reintentosMax) { esperas.delete(s.id); return; }
      mandar(e.destinos, { ...e.sobre, intento: e.intentos });
      e.handle = programar(esperar, baseReintento * 2 ** (e.intentos - 1));
    };
    esperas.set(s.id, { destinos: ds, sobre: s, intentos: 0, handle: programar(esperar, baseReintento) });
  };
  return {
    nodoId,
    reloj: () => ({ ...marca }),
    pendientes: () => pendientes.size,
    suscribir: (cb) => { oyentes.add(cb); return () => { oyentes.delete(cb); }; },
    emitir: (tipo, cuerpo, causal = []) => {
      marca = avanzarReloj(marca, op.ahora(), nodoId);
      const s: SobreEvento = { id: `${nodoId}:${marca.fisico}:${marca.contador}`, de: nodoId, tipo, cuerpo, marca, causal, intento: 0 };
      vistos.add(s.id); entregados.add(s.id);
      const ds = destinos();
      enviarConReintento(s, ds.length > 0 ? ds : ["*"]);
      return s;
    },
    recibir: (s) => {
      if (!s || typeof s.id !== "string") return false;
      if (vistos.has(s.id)) { if (s.acuseDe === undefined) enviarAcuse(s); return false; } // acuse perdido
      vistos.add(s.id);
      marca = fundirReloj(marca, s.marca, op.ahora(), nodoId);
      if (s.acuseDe !== undefined) {
        const e = esperas.get(s.acuseDe);
        if (e) { cancelar(e.handle); esperas.delete(s.acuseDe); }
        return true;
      }
      enviarAcuse(s); pendientes.set(s.id, s);
      if (!flush && !cerrado) flush = programar(entregarListos, esperaMs);
      return true;
    },
    cerrar: () => {
      cerrado = true;
      if (flush) cancelar(flush);
      for (const e of esperas.values()) cancelar(e.handle);
      esperas.clear(); pendientes.clear();
    },
  };
}
