import { preferenciasEfectivas, type CapasPrefs, type Contexto } from "./preferencias-capas";

export type MedioNeurona = "pwa" | "nativa" | "web";
export type SistemaSO = "macos" | "windows" | "linux" | "android" | "ios";
export type GPU = "nvidia" | "amd" | "apple" | "ninguna";

export interface NeuronaVigia {
  medio: MedioNeurona;
  ramMB: number;
  discoLibreMB: number;
  gpu?: GPU;
  vramMB?: number;
  apple?: boolean;
  sistema?: SistemaSO;
}

export type Licencias = "libre" | "personal" | "condicionada" | "desconocida";

export interface Entrada {
  id: string;
  nombre: string;
  licencia: Licencias;
  tamañoMB: number;
  ramRequeridaMB?: number;
  vramRequeridaMB?: number;
  cuantizaciones?: { tipo: Cuantizacion; tamañoMB: number }[];
}

export type Cuantizacion = "nativa" | "q8" | "q4";

export interface PlanArea {
  instalar: (Entrada & { cuantizacion?: Cuantizacion })[];
  actualizar: Entrada[];
  quitar: Entrada[];
  desdeLaMalla: boolean;
  motivo: string;
}

function presupuestoDiscoMB(neurona: NeuronaVigia): number {
  if (neurona.medio === "pwa") return 1024;
  if (neurona.medio === "nativa") return Math.floor(neurona.discoLibreMB * 0.15);
  return 0;
}

function licenciaPermitida(entrada: Entrada, caps: CapasPrefs, contexto: Contexto): boolean {
  const { licenciaPermitida } = preferenciasEfectivas(caps, contexto);
  return licenciaPermitida.includes(entrada.licencia);
}

function elegirCuantizacion(entrada: Entrada, maxDiscoMB: number): { ok: boolean; cuantizacion?: Cuantizacion; tamañoMB: number } {
  const opciones = [
    { tipo: "nativa" as Cuantizacion, tamañoMB: entrada.tamañoMB },
    ...(entrada.cuantizaciones ?? []),
  ];
  const orden: Cuantizacion[] = ["nativa", "q8", "q4"];
  for (const pref of orden) {
    const opt = opciones.find(o => o.tipo === pref);
    if (!opt) continue;
    if (opt.tamañoMB <= maxDiscoMB) return { ok: true, cuantizacion: pref, tamañoMB: opt.tamañoMB };
  }
  return { ok: false, tamañoMB: opciones[0]?.tamañoMB ?? entrada.tamañoMB };
}

function cabeEnNeurona(entrada: Entrada, neurona: NeuronaVigia, maxDiscoMB: number): { ok: boolean; cuantizacion?: Cuantizacion; motivo: string } {
  if (entrada.ramRequeridaMB && entrada.ramRequeridaMB > neurona.ramMB) {
    return { ok: false, motivo: "RAM insuficiente" };
  }
  if (entrada.vramRequeridaMB && neurona.vramMB && entrada.vramRequeridaMB > neurona.vramMB) {
    return { ok: false, motivo: "VRAM insuficiente" };
  }
  const cuan = elegirCuantizacion(entrada, maxDiscoMB);
  if (!cuan.ok) return { ok: false, motivo: "No cabe en disco con la cuantización disponible" };
  return { ok: true, cuantizacion: cuan.cuantizacion, motivo: "Cabe" };
}

export function planInstalacion(
  neurona: NeuronaVigia,
  catalogo: Record<string, Entrada[]>,
  preferencias: CapasPrefs,
  instalados: string[]
): Record<string, PlanArea> {
  const contexto: Contexto = "publico";
  const maxDiscoMB = presupuestoDiscoMB(neurona);
  const resultado: Record<string, PlanArea> = {};

  for (const [area, entradas] of Object.entries(catalogo)) {
    const plan: PlanArea = { instalar: [], actualizar: [], quitar: [], desdeLaMalla: false, motivo: "" };
    const validas: { entrada: Entrada; cuantizacion?: Cuantizacion }[] = [];

    for (const e of entradas) {
      if (!licenciaPermitida(e, preferencias, contexto)) continue;
      const cabe = cabeEnNeurona(e, neurona, maxDiscoMB);
      if (!cabe.ok) continue;
      validas.push({ entrada: e, cuantizacion: cabe.cuantizacion });
    }

    for (const v of validas) {
      if (!instalados.includes(v.entrada.id)) {
        plan.instalar.push({ ...v.entrada, cuantizacion: v.cuantizacion });
      }
    }

    for (const id of instalados) {
      const e = entradas.find(x => x.id === id);
      if (!e) { plan.quitar.push({ id, nombre: id, licencia: "libre", tamañoMB: 0 } as Entrada); continue; }
      if (!licenciaPermitida(e, preferencias, contexto) || !cabeEnNeurona(e, neurona, maxDiscoMB).ok) {
        plan.quitar.push(e);
      }
    }

    if (validas.length === 0 && entradas.length > 0) {
      plan.desdeLaMalla = true;
      plan.motivo = "No cabe localmente, usar malla";
    } else if (plan.instalar.length) {
      plan.motivo = `Instalar ${plan.instalar.length} modelo(s)`;
    } else {
      plan.motivo = "Sin cambios";
    }

    resultado[area] = plan;
  }
  return resultado;
}