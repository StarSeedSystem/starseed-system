import type { Bot, Dueno } from "./tipos";
import { onTableChange, type RealtimePayload } from "@/lib/realtime/realtime";

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

export function fusionarBots(l: BotSync[], r: BotSync[]): BotSync[] {
  const rv = r.filter(esBotValido);
  const lm = new Map(l.map(b => [b.id, b]));
  const rm = new Map(rv.map(b => [b.id, b]));
  const uniqueIds = Array.from(new Set(Array.from(lm.keys()).concat(Array.from(rm.keys()))));
  const res: BotSync[] = [];
  for (let i = 0; i < uniqueIds.length; i++) {
    const id = uniqueIds[i];
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

export function suscribirBotsEntidad(e: string[], c: (c: { t: "INSERT" | "U" | "D"; r: BotSync | null; a: BotSync | null }) => void) {
  const ch = onTableChange("astraura_bots", { filter: e.map(entityId => `dueno.id=eq.${entityId}`).join(' or '), event: "*" }, (payload: RealtimePayload) => {
    const pp = payload as any;
    if (pp.error) {
      console.warn("Tabla astraura_bots no encontrada en Supabase. La suscripción a bots de entidad está inactiva.");
      return;
    }
    const reg = pp.nuevo as BotSync | null;
    const ant = pp.viejo as BotSync | null;
    const b = reg ?? ant;
    if (!b) return;
    const { dueno } = b;
    if (!dueno || !e.includes(dueno.id) || !["grupo", "comunidad", "pagina"].includes(dueno.tipo)) return;
    c({ t: payload.eventType as "INSERT" | "U" | "D", r: reg, a: ant });
  });
  return () => ch();
}