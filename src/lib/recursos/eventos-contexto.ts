// Canal de eventos por contexto: reloj lógico híbrido, sin duplicados, orden causal, acuses y
// reintentos, reparto por el árbol de relevo. Puro: reloj, red y almacenamiento se inyectan.
import { armarArbol, type ArbolRelevo, type ReceptorRelevo } from "./arbol-relevo";

export interface EventoContexto {
  id: string; tipo: string; cuerpo: unknown;
  /** Hora híbrida común (ms de época, ya con el desfase del reloj común). */
  t: number; secuencia: number; nodoId: string;
}
export interface Sobre { tipo: "evento" | "acuse"; de: string; para?: string; evento: EventoContexto }
export interface OpcionesCanal {
  nodoId: string; enviar: (sobre: Sobre) => void;
  /** Hora común inyectada: `reloj.ahora()` de src/lib/estaciones/reloj-comun.ts. */
  ahora: () => number; receptores?: ReceptorRelevo[];
}
export interface CanalEventos {
  emitir: (tipo: string, cuerpo: unknown) => EventoContexto;
  recibir: (sobre?: Sobre | null) => EventoContexto | null;
  suscribir: (cb: (evento: EventoContexto) => void) => () => void;
  repartir: (receptores: ReceptorRelevo[]) => ArbolRelevo;
  /** Eventos propios esperando acuse. */
  pendientes: () => number;
}
const ESPERA_CAUSAL_MS = 250, ESPERA_REINTENTO_MS = 400, ESPERA_REINTENTO_MAX_MS = 6400;
const UMBRAL_ARBOL = 8, INTENTOS_MAX = 8;

export function crearCanal(op: OpcionesCanal): CanalEventos {
  const vistos = new Set<string>();
  const buffer: { evento: EventoContexto; llegada: number }[] = [];
  const esperado = new Map<string, number>();
  const oyentes = new Set<(evento: EventoContexto) => void>();
  type Pendiente = { evento: EventoContexto; destinos: (string | undefined)[]; intentos: number; proximo: number; espera: number };
  const pendientes = new Map<string, Pendiente>();
  let receptores = op.receptores ?? [], secuencia = 0, ultimoHibrido = Number.NEGATIVE_INFINITY;

  const hibrido = (fisico: number) => {
    const t = Math.max(Number.isFinite(fisico) ? fisico : 0, ultimoHibrido + 1);
    ultimoHibrido = t;
    return t;
  };
  const mandar = (evento: EventoContexto, destinos: (string | undefined)[]) => {
    for (const para of destinos) op.enviar({ tipo: "evento", de: op.nodoId, para, evento });
  };
  const destinosPara = (): (string | undefined)[] => {
    if (receptores.length <= UMBRAL_ARBOL) return receptores.length ? receptores.map((r) => r.nodoId) : [undefined];
    const hijos = armarArbol(op.nodoId, receptores, 1000).nodos.get(op.nodoId)?.hijos ?? [];
    return hijos.length ? hijos : [undefined];
  };
  const reintentar = () => {
    const ahora = op.ahora();
    for (const [id, p] of Array.from(pendientes)) {
      if (ahora < p.proximo) continue;
      p.intentos += 1;
      p.espera = Math.min(ESPERA_REINTENTO_MAX_MS, p.espera * 2);
      p.proximo = ahora + p.espera;
      mandar(p.evento, p.destinos);
      if (p.intentos >= INTENTOS_MAX) pendientes.delete(id);
    }
  };
  const ingerir = (sobre: Sobre) => {
    const evt = sobre.evento;
    if (!evt || !evt.id) return;
    if (sobre.de !== op.nodoId) op.enviar({ tipo: "acuse", de: op.nodoId, para: sobre.de, evento: evt });
    if (vistos.has(evt.id)) return;
    vistos.add(evt.id);
    const t = Number.isFinite(evt.t) ? evt.t : op.ahora();
    if (t > ultimoHibrido) ultimoHibrido = t;
    buffer.push({ evento: { ...evt, t }, llegada: op.ahora() });
  };
  const drenar = (): EventoContexto | null => {
    const ahora = op.ahora();
    buffer.sort((a, b) => a.evento.t - b.evento.t ||
      a.evento.nodoId.localeCompare(b.evento.nodoId) || a.evento.secuencia - b.evento.secuencia);
    for (let i = 0; i < buffer.length; ) {
      const { evento, llegada } = buffer[i];
      const siguiente = esperado.get(evento.nodoId) ?? 1;
      if (evento.secuencia > siguiente && ahora - llegada < ESPERA_CAUSAL_MS) { i += 1; continue; }
      buffer.splice(i, 1);
      if (evento.secuencia < siguiente) continue; // ya entregado: se descarta
      esperado.set(evento.nodoId, evento.secuencia + 1);
      for (const cb of Array.from(oyentes)) { try { cb(evento); } catch { /* oyente roto */ } }
      return evento;
    }
    return null;
  };

  return {
    emitir: (tipo, cuerpo) => {
      reintentar();
      const reloj = op.ahora(), t = hibrido(reloj);
      const evento: EventoContexto = { id: `${op.nodoId}:${secuencia + 1}:${t}`, tipo, cuerpo, t, secuencia: secuencia + 1, nodoId: op.nodoId };
      secuencia += 1;
      vistos.add(evento.id);
      buffer.push({ evento, llegada: reloj });
      const destinos = destinosPara();
      mandar(evento, destinos);
      pendientes.set(evento.id, { evento, destinos, intentos: 0, proximo: reloj + ESPERA_REINTENTO_MS, espera: ESPERA_REINTENTO_MS });
      return evento;
    },
    recibir: (sobre = null) => {
      reintentar();
      if (sobre?.tipo === "acuse") {
        if (sobre.para === op.nodoId) pendientes.delete(sobre.evento?.id);
      } else if (sobre?.tipo === "evento") ingerir(sobre);
      return drenar();
    },
    suscribir: (cb) => { oyentes.add(cb); return () => { oyentes.delete(cb); }; },
    repartir: (nuevos) => { receptores = [...nuevos]; return armarArbol(op.nodoId, receptores, 1000); },
    pendientes: () => pendientes.size,
  };
}
