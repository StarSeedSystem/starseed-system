import type { Bot, Dueno } from "./tipos";

// Interfaces for dependency injection
interface Almacen {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface SupabaseClient {
  channel: (name: string) => {
    on: (options: { event: string; schema: string; table: string; }, callback: (payload: unknown) => void) => {
      subscribe: () => Subscription;
    };
  };
  removeChannel: (subscription: Subscription) => void;
}

interface Subscription {
  [key: string]: unknown;
}

// Funciones sin cambios
interface BotSync extends Bot { actualizado: number; }
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

// Funciones con inyección de dependencias
export function suscribirBotsEntidad(
  e: string[],
  c: (c: { t: "INSERT" | "U" | "D"; r: BotSync | null; a: BotSync | null }) => void,
  supabaseClient: SupabaseClient
): () => void {
  const s = supabaseClient;
  let w = false;
   const ch = s.channel("astraura-bots-realtime").on({ event: "*", schema: "public", table: "astraura_bots" }, (p: unknown) => {
    // Check if p is a non-null object
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const pp = p as { error?: unknown; nuevo?: BotSync | null; viejo?: BotSync | null; eventType?: string };
      if (pp.error) {
        if (!w) {
          console.warn("Tabla astraura_bots no encontrada en Supabase. La suscripción a bots de entidad está inactiva.");
          w = true;
        }
        return;
      }
      const reg = pp.nuevo as BotSync | null;
      const ant = pp.viejo as BotSync | null;
      const b = reg ?? ant;
      if (!b) return;
      const { dueno } = b;
      if (!dueno || !e.includes(dueno.id) || !["grupo", "comunidad", "pagina"].includes(dueno.tipo)) return;
      c({ t: pp.eventType as "INSERT" | "U" | "D", r: reg, a: ant });
    }
  }).subscribe();
  return () => s.removeChannel(ch);
}
export function abiertosEnEstaNeurona(almacen: Almacen): string[] {
  if (typeof window === "undefined") return [];
  const r = almacen.getItem("starseed.astraura.bots.orbes.v1");
  if (!r) return [];
  try {
    const v = JSON.parse(r);
    if (Array.isArray(v)) return v.filter((i): i is string => typeof i === "string");
    return [];
  } catch { return []; }
}
export function marcarAbierto(b: string, a: boolean, almacen: Almacen): void {
  if (typeof window === "undefined") return;
  const r = almacen.getItem("starseed.astraura.bots.orbes.v1");
  let c: string[] = [];
  if (r) {
    try {
      const p = JSON.parse(r);
      if (Array.isArray(p)) c = p.filter((i): i is string => typeof i === "string");
    } catch { c = []; }
  }
  if (a) {
    if (!c.includes(b)) c.push(b);
  } else {
    c = c.filter(i => i !== b);
  }
  almacen.setItem("starseed.astraura.bots.orbes.v1", JSON.stringify(c));
}
