// Telepatía: vínculos entre cerebros sin mezclar datos.
// Módulo puro, sin disco ni red. Contrato: architecture/cerebros-fusion-telepatia.md §5.

export interface VinculoTelepatico {
  id: string;
  destino: { tipo: string; id: string };
  alcance: { completo: boolean; memorias: string[]; carpetas: string[]; configuraciones: string[] };
  direccion: "enviar" | "recibir" | "ambas" | "ninguna";
  acceso: "leer" | "escribir";
  auto: boolean;
  estado: "activo" | "pausado" | "pendiente";
  creadoEn: string;
  expiraEn?: string | null;
  ultimaSync?: string | null;
}

export function normalizarVinculos(config: unknown): VinculoTelepatico[] {
  const raw = Array.isArray(config) ? config : (config && typeof config === "object" && (config as Record<string, unknown>).telepatia ? (config as Record<string, unknown>).telepatia : null);
  if (!Array.isArray(raw)) return [];
  const out: VinculoTelepatico[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const v = r as Partial<VinculoTelepatico>;
    if (!v.id || typeof v.id !== "string") continue;
    out.push({
      id: v.id,
      destino: v.destino && typeof v.destino === "object" ? { tipo: String((v.destino as Record<string, unknown>).tipo ?? ""), id: String((v.destino as Record<string, unknown>).id ?? v.id) } : { tipo: "", id: v.id },
      alcance: v.alcance && typeof v.alcance === "object" ? {
        completo: !!(v.alcance as Record<string, unknown>).completo,
        memorias: Array.isArray((v.alcance as Record<string, unknown>).memorias) ? (v.alcance as Record<string, unknown>).memorias as string[] : [],
        carpetas: Array.isArray((v.alcance as Record<string, unknown>).carpetas) ? (v.alcance as Record<string, unknown>).carpetas as string[] : [],
        configuraciones: Array.isArray((v.alcance as Record<string, unknown>).configuraciones) ? (v.alcance as Record<string, unknown>).configuraciones as string[] : [],
      } : { completo: false, memorias: [], carpetas: [], configuraciones: [] },
      direccion: (v.direccion === "enviar" || v.direccion === "recibir" || v.direccion === "ambas" || v.direccion === "ninguna") ? v.direccion : "ambas",
      acceso: v.acceso === "leer" || v.acceso === "escribir" ? v.acceso : "leer",
      auto: !!v.auto,
      estado: (v.estado === "activo" || v.estado === "pausado" || v.estado === "pendiente") ? v.estado : "activo",
      creadoEn: typeof v.creadoEn === "string" ? v.creadoEn : "",
      expiraEn: v.expiraEn === null || typeof v.expiraEn === "string" ? v.expiraEn : null,
      ultimaSync: v.ultimaSync === null || typeof v.ultimaSync === "string" ? v.ultimaSync : null,
    });
  }
  return out;
}

export function validarVinculo(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as Partial<VinculoTelepatico>;
  return !!r.id && typeof r.id === "string" && !!r.destino && typeof r.destino === "object";
}
