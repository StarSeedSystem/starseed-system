import type { BotSync } from "../sincronia-bots";
import { createClient } from "@/utils/supabase/client";

export function suscribirBotsEntidad(e: string[], c: (c: { t: "INSERT" | "U" | "D"; r: BotSync | null; a: BotSync | null }) => void) {
  const s = createClient();
  let w = false;
  const ch = s.channel("astraura-bots-realtime").on("postgres_changes", { event: "*", schema: "public", table: "astraura_bots" }, (p) => {
    const pp = p as any;
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
    c({ t: p.eventType as "INSERT" | "U" | "D", r: reg, a: ant });
  }).subscribe();
  return () => s.removeChannel(ch);
}

export function abiertosEnEstaNeurona(): string[] {
  if (typeof window === "undefined") return [];
  const r = window.localStorage.getItem("starseed.astraura.bots.orbes.v1");
  if (!r) return [];
  try {
    const v = JSON.parse(r);
    if (Array.isArray(v)) return v.filter((i): i is string => typeof i === "string");
    return [];
  } catch { return []; }
}

export function marcarAbierto(b: string, a: boolean): void {
  if (typeof window === "undefined") return;
  const r = window.localStorage.getItem("starseed.astraura.bots.orbes.v1");
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
  window.localStorage.setItem("starseed.astraura.bots.orbes.v1", JSON.stringify(c));
}