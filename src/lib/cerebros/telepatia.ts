// Tipos del §5
export type DestinoTelepatia =
  | { tipo: "cerebro"; id: string }
  | { tipo: "grupo" | "comunidad" | "pagina"; id: string }
  | { tipo: "cuenta"; id: string };

export interface VinculoTelepatico {
  id: string;
  destino: DestinoTelepatia;
  alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
  direccion: "enviar" | "recibir" | "ambas";
  acceso: "leer" | "escribir";
  auto: boolean;
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
  estado: "activo" | "pausado" | "pendiente";
}

export const CONFIGURACIONES_TELEPATIA = [
  'servers','runtimes','skills','storage','apps','moa','channels','conectores','includes.personalities'
] as const;

export function validarVinculo(v: unknown): { ok: true; vinculo: VinculoTelepatico } | { ok: false; motivo: string } {
  if (!v || typeof v !== "object") return { ok: false, motivo: "invalid" };
  const vinculo = v as Record<string, unknown>;
  if (!("id" in vinculo) || !("destino" in vinculo) || !("alcance" in vinculo) || 
      !("direccion" in vinculo) || !("acceso" in vinculo) || !("auto" in vinculo) ||
      !("estado" in vinculo) || !("creadoEn" in vinculo)) return { ok: false, motivo: "missing required fields" };
  if (typeof vinculo.id !== "string" || !(vinculo.id as string).trim()) return { ok: false, motivo: "invalid id" };
  if (!(vinculo.destino instanceof Object) || vinculo.destino === null) return { ok: false, motivo: "invalid destino" };
  const destino = vinculo.destino as Record<string, unknown>;
  if (typeof destino.tipo !== "string" || typeof destino.id !== "string") return { ok: false, motivo: "invalid destino" };
  if (!(vinculo.alcance instanceof Object) || vinculo.alcance === null) return { ok: false, motivo: "invalid alcance" };
  const alcance = vinculo.alcance as Record<string, unknown>;
  if (!Array.isArray(alcance.memorias) || !Array.isArray(alcance.carpetas) || !Array.isArray(alcance.configuraciones)) return { ok: false, motivo: "invalid alcance" };
  if (alcance.memorias.some((e: unknown) => typeof e !== "string") || 
      alcance.carpetas.some((e: unknown) => typeof e !== "string") ||
      alcance.configuraciones.some((e: unknown) => typeof e !== "string")) return { ok: false, motivo: "invalid array elements" };
  if (alcance.configuraciones.some((c: unknown) => typeof c !== "string" || !(CONFIGURACIONES_TELEPATIA as readonly string[]).includes(c as string))) return { ok: false, motivo: "invalid configuracion" };
  if (typeof vinculo.direccion !== "string" || 
      !(vinculo.direccion === "enviar" || vinculo.direccion === "recibir" || vinculo.direccion === "ambas")) return { ok: false, motivo: "invalid direccion" };
  if (typeof vinculo.acceso !== "string" || 
      !(vinculo.acceso === "leer" || vinculo.acceso === "escribir")) return { ok: false, motivo: "invalid acceso" };
  if (typeof vinculo.auto !== "boolean") return { ok: false, motivo: "invalid auto" };
  if (typeof vinculo.estado !== "string" || 
      !(vinculo.estado === "activo" || vinculo.estado === "pausado" || vinculo.estado === "pendiente")) return { ok: false, motivo: "invalid estado" };
  if (typeof vinculo.creadoEn !== "string" || isNaN(Date.parse(vinculo.creadoEn as string))) return { ok: false, motivo: "invalid creadoEn" };
  if ("expiraEn" in vinculo && vinculo.expiraEn !== null && 
      (typeof vinculo.expiraEn !== "string" || isNaN(Date.parse(vinculo.expiraEn as string)))) return { ok: false, motivo: "invalid expiraEn" };
  if ("ultimaSync" in vinculo && vinculo.ultimaSync !== null && 
      (typeof vinculo.ultimaSync !== "string" || isNaN(Date.parse(vinculo.ultimaSync as string)))) return { ok: false, motivo: "invalid ultimaSync" };
  return { ok: true, vinculo: vinculo as unknown as VinculoTelepatico };
}

export function normalizarVinculos(config: Record<string, unknown> | null | undefined): VinculoTelepatico[] {
  if (!config || typeof config !== "object" || !Array.isArray(config.telepatia)) return [];
  return (config.telepatia as unknown[]).filter(i => {
    try { return validarVinculo(i).ok; } catch { return false; }
  }) as VinculoTelepatico[];
}

export function conVinculo(config: Record<string, unknown>, v: VinculoTelepatico): Record<string, unknown> {
  if (!config || typeof config !== "object") return { telepatia: [v] };
  const nuevo = JSON.parse(JSON.stringify(config));
  if (!Array.isArray(nuevo.telepatia)) nuevo.telepatia = [];
  const idx = nuevo.telepatia.findIndex((i: unknown) => 
    typeof i === "object" && i !== null && "id" in i && 
    typeof (i as Record<string, unknown>).id === "string" && 
    (i as Record<string, unknown>).id === v.id
  );
  if (idx >= 0) nuevo.telepatia[idx] = v;
  else nuevo.telepatia.push(v);
  return nuevo;
}

export function sinVinculo(config: Record<string, unknown>, id: string): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const nuevo = JSON.parse(JSON.stringify(config));
  if (!Array.isArray(nuevo.telepatia)) return nuevo;
  nuevo.telepatia = (nuevo.telepatia as unknown[]).filter((i: unknown) => 
    !(typeof i === "object" && i !== null && "id" in i && 
      typeof (i as Record<string, unknown>).id === "string" && 
      (i as Record<string, unknown>).id === id)
  );
  return nuevo;
}

export function estaCaducado(v: VinculoTelepatico, ahora: number): boolean {
  if (!v.expiraEn) return false;
  const t = Date.parse(v.expiraEn);
  return !isNaN(t) && ahora > t;
}

export function planSincronizacion(
  v: VinculoTelepatico,
  origen: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> },
  destino: { archivos: Array<{ name: string; content: string; updated_at?: string | null }>; prefs: Record<string, unknown> }
): Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> {
  if (v.estado === "pausado" || v.estado === "pendiente" || estaCaducado(v, Date.now())) return [];
  
  const plan: Array<{ tipo: 'archivo' | 'config' | 'carpeta'; nombre: string; de: 'origen' | 'destino'; a: 'origen' | 'destino' }> = [];
  
  // Placeholder implementation - to be completed with full logic
  // This satisfies the type requirements for now
  
  return plan;
}