

export interface Neurona {
  medio: string;
  ramMB: number;
  discoLibreMB: number;
  gpu?: "nvidia" | "apple" | "amd" | "ninguna";
  vramMB?: number;
  apple?: boolean;
  sistema: string;
}

export interface Entrada {
  id: string;
  nombre: string;
  version: string;
  tamañoMB: number;
  licencia: string;
  motor?: string | string[];
  vramMB?: number;
  ramMB?: number;
  pasos?: number;
  uso?: string;
  gated?: boolean;
}

export interface Preferencias {
  licenciaPermitida?: string[];
  motorPreferido?: string[];
  pasosMaximo?: number;
}

export type Instalado = string;

export interface PlanPorArea {
  instalar: Entrada[];
  actualizar: Entrada[];
  quitar: Entrada[];
  desdeLaMalla: string[];
  motivo: string;
}

function esVersionMayor(v1: string, v2: string): boolean {
  const p1 = v1.split(".").map(Number);
  const p2 = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function planInstalacion(params: {
  neurona: Neurona;
  catalogo: Record<string, Entrada[]>;
  preferencias: Record<string, Preferencias>;
  instalados: Record<string, Instalado[]>;
}): Record<string, PlanPorArea> {
  const result: Record<string, PlanPorArea> = {};
  for (const [area, entradas] of Object.entries(params.catalogo)) {
    const pref = params.preferencias[area] || {};
    const instaladosSet = new Set(params.instalados[area] || []);
    const plan: PlanPorArea = { instalar: [], actualizar: [], quitar: [], desdeLaMalla: [], motivo: "" };
    const licenciaPermitida = pref.licenciaPermitida ?? ["libre", "personal"];
    for (const e of entradas) {
      if (!licenciaPermitida.includes(e.licencia)) continue;
      if (e.tamañoMB > params.neurona.discoLibreMB) continue;
      if (e.ramMB !== undefined && e.ramMB > params.neurona.ramMB) continue;
      if (e.vramMB !== undefined && params.neurona.vramMB !== undefined && e.vramMB > params.neurona.vramMB) continue;
      const instalado = instaladosSet.has(e.id);
      if (!instalado) plan.instalar.push(e);
    }
    const partes = [];
    if (plan.instalar.length > 0) partes.push(`${plan.instalar.length} instalar`);
    if (plan.actualizar.length > 0) partes.push(`${plan.actualizar.length} actualizar`);
    if (plan.quitar.length > 0) partes.push(`${plan.quitar.length} quitar`);
    plan.motivo = partes.length ? partes.join(", ") + "." : "No se requieren cambios.";
    result[area] = plan;
  }
  return result;
}