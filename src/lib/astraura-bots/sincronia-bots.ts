/**
 * Bots/dots de Astraura · SINCRONÍA de bots entre neuronas (BOT1011Y).
 * Puro: sin React, red, DOM, reloj ni `node:*` (guardia en __tests__/pureza.test.ts).
 * Aquí solo se DECIDE: qué bot gana al fusionar (`fusionarBots`) y qué se hace con la
 * fila remota que llega de Realtime (`integrarRemoto`, incluido el DELETE). La marca de
 * tiempo la pasa quien llama: este módulo no ve el reloj. La suscripción a Realtime y el
 * estado de orbes abiertas por neurona viven en `adaptadores/sincronia-bots.ts`.
 */
import type { Bot } from "./tipos";

/** Bot con la marca de su última actualización (la pone quien escribe, nunca este módulo). */
export interface BotSync extends Bot { actualizado: number; }
function esBotValido(b: unknown): b is BotSync {
  if (!b || typeof b !== "object" || Array.isArray(b)) return false;
  const bt = b as BotSync;
  if (!bt.id || typeof bt.id !== "string" || !bt.nombre || typeof bt.nombre !== "string" || !bt.origen || !["astraura", "ag-ui", "externo"].includes(bt.origen) || !bt.gobierno || !["jerarquico", "democratico"].includes(bt.gobierno) || !bt.dueno || typeof bt.dueno !== "object" || Array.isArray(bt.dueno) || !bt.dueno.tipo || !["perfil", "grupo", "comunidad", "pagina"].includes(bt.dueno.tipo) || !bt.dueno.id || typeof bt.dueno.id !== "string" || !bt.dueno.cuentaId || typeof bt.dueno.cuentaId !== "string" || !bt.personalidad || typeof bt.personalidad !== "object" || Array.isArray(bt.personalidad) || !bt.cuerpo || typeof bt.cuerpo !== "object" || Array.isArray(bt.cuerpo) || !bt.sentidosHabilitados || !Array.isArray(bt.sentidosHabilitados) || typeof bt.activo !== "boolean") return false;
  const rasgos: (keyof typeof bt.personalidad)[] = ["calidez", "energia", "formalidad", "curiosidad", "humor", "concision"];
  for (const r of rasgos) {
    const v = bt.personalidad[r];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return false;
  }
  const { forma, tono, escala } = bt.cuerpo;
  if (!forma || !["orbe", "avatar-2d", "avatar-3d", "vrm", "ser-genesis"].includes(forma) || typeof tono !== "number" || !Number.isFinite(tono) || tono < 0 || tono > 360 || typeof escala !== "number" || !Number.isFinite(escala) || escala < 0.5 || escala > 2) return false;
  const sentidos = ["pantalla", "captura-pantalla", "archivos", "red", "correo", "terminal", "camara", "microfono", "sensores", "ubicacion", "portapapeles", "aparatos"];
  for (const s of bt.sentidosHabilitados) {
    if (typeof s !== "string" || !sentidos.includes(s)) return false;
  }
  return typeof bt.actualizado === "number" && Number.isFinite(bt.actualizado) && bt.actualizado >= 0;
}
/** Une lo local y lo remoto por id: gana el más reciente; lo remoto inválido se descarta y nada local se pierde. */
export function fusionarBots(l: BotSync[], r: BotSync[]): BotSync[] {
  const rv = r.filter(esBotValido);
  const lm = new Map(l.map(b => [b.id, b]));
  const rm = new Map(rv.map(b => [b.id, b]));
  const ids = new Set([...lm.keys(), ...rm.keys()]);
  const res: BotSync[] = [];
  for (const id of ids) {
    const lb = lm.get(id);
    const rb = rm.get(id);
    let e: BotSync | undefined;
    if (lb && rb) e = lb.actualizado >= rb.actualizado ? lb : rb;
    else if (lb) e = lb;
    else if (rb) e = rb;
    if (e) res.push(e);
  }
  return res;
}

/** Fila que llega de Realtime, en la forma mínima que la sincronía entiende. */
export interface CambioRemoto {
  readonly eventType?: "INSERT" | "UPDATE" | "DELETE" | undefined;
  readonly new?: Bot | null;
  /** En DELETE Supabase solo trae las claves de la fila (normalmente el id). */
  readonly old?: { id?: string } | null;
}

/** Aplica un cambio remoto a la serie del caché: DELETE lo quita (el id puede venir
 * en `old` o en `new`), una fila inválida se descarta y una válida gana si es más
 * reciente (su marca es `ahora`, que decide quien llama; el núcleo no ve el reloj). */
export function integrarRemoto(serie: readonly BotSync[], c: CambioRemoto, ahora: number): BotSync[] {
  if (c.eventType === "DELETE") {
    const id = typeof c.old?.id === "string" && c.old.id ? c.old.id
      : typeof c.new?.id === "string" && c.new.id ? c.new.id : null;
    return id ? serie.filter(b => b.id !== id) : [...serie];
  }
  if (!c.new || !(c.eventType === "INSERT" || c.eventType === "UPDATE")) return [...serie];
  const marca = Number.isFinite(ahora) ? ahora : 0;
  return fusionarBots([...serie], [{ ...c.new, actualizado: marca }]);
}
