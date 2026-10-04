import type { PreferenciaCapas } from "./capas-conciencia";

export type CampoCapa = "activo" | "local" | "mesh" | "nube" | "colectiva" | "contextoPersonal";

export const CAMPOS_CAPA: readonly CampoCapa[] = [
  "activo",
  "local",
  "mesh",
  "nube",
  "colectiva",
  "contextoPersonal",
];

export type CapasAjustables = Record<CampoCapa, boolean>;

export const CAPAS_ENTIDAD_DEFECTO: CapasAjustables = {
  activo: true,
  local: true,
  mesh: true,
  nube: true,
  colectiva: true,
  contextoPersonal: true,
};

export const ETIQUETA_CAMPO: Record<CampoCapa, { nombre: string; descripcion: string }> = {
  activo: {
    nombre: "Activo",
    descripcion: "Interruptor general del sistema de capas de conciencia",
  },
  local: {
    nombre: "Local",
    descripcion: "BitNet 1.58 en esta neurona, sin conexión y sin coste",
  },
  mesh: {
    nombre: "Mesh",
    descripcion: "Otras neuronas de la red mesh y la LAN",
  },
  nube: {
    nombre: "Nube",
    descripcion: "El backend 1.58 publicado para la web y la app",
  },
  colectiva: {
    nombre: "Conciencia colectiva",
    descripcion: "Comparte lo aprendido con las demás personalidades y agentes",
  },
  contextoPersonal: {
    nombre: "Contexto personal",
    descripcion: "Sabe quién eres: cómo llamarte, intereses, tono e idioma",
  },
};

export type AmbitoCapas = "personalidad" | "agente";

export interface AjustesCapasEntidad {
  personalidades: Record<string, Partial<CapasAjustables>>;
  agentes: Record<string, Partial<CapasAjustables>>;
}

export const AJUSTES_VACIOS: AjustesCapasEntidad = { personalidades: {}, agentes: {} };

export const CLAVE_CAPAS_ENTIDAD = "starseed.astraura.capas-entidad.v1";
export const EVENTO_CAPAS_ENTIDAD = "starseed:astraura-capas-entidad";

export type Procedencia = "agente" | "personalidad" | "cuenta";

function esBooleano(v: unknown): v is boolean {
  return typeof v === "boolean";
}

function camposValidos(): Set<CampoCapa> {
  return new Set(CAMPOS_CAPA);
}

export function leerAjustesCapasEntidad(raw: unknown): AjustesCapasEntidad {
  if (!raw || typeof raw !== "object") return { ...AJUSTES_VACIOS };
  const src = raw as Record<string, unknown>;
  const resultado: AjustesCapasEntidad = { personalidades: {}, agentes: {} };
  for (const ambito of ["personalidades", "agentes"] as const) {
    const sec = src[ambito];
    if (!sec || typeof sec !== "object") continue;
    for (const [id, val] of Object.entries(sec)) {
      if (!id || typeof id !== "string") continue;
      if (!val || typeof val !== "object") continue;
      const parcial: Partial<CapasAjustables> = {};
      for (const campo of CAMPOS_CAPA) {
        const v = (val as Record<string, unknown>)[campo];
        if (esBooleano(v)) parcial[campo] = v;
      }
      if (Object.keys(parcial).length > 0) resultado[ambito][id] = parcial;
    }
  }
  return resultado;
}

export function capasDeCuenta(
  pref: PreferenciaCapas,
  contextoPersonal: boolean,
): CapasAjustables {
  return {
    activo: pref.activo,
    local: pref.capas.local,
    mesh: pref.capas.mesh,
    nube: pref.capas.nube,
    colectiva: pref.capas.colectiva,
    contextoPersonal: contextoPersonal,
  };
}

export function resolverCapasEntidad(
  cuenta: CapasAjustables,
  ajustes: AjustesCapasEntidad,
  quien: { personalidadId?: string; agenteId?: string },
): { efectivas: CapasAjustables; procedencia: Record<CampoCapa, Procedencia> } {
  const efectivas = { ...CAPAS_ENTIDAD_DEFECTO };
  const procedencia = {} as Record<CampoCapa, Procedencia>;
  for (const campo of CAMPOS_CAPA) {
    procedencia[campo] = "cuenta";
    if (cuenta[campo] !== undefined) efectivas[campo] = cuenta[campo];
  }
  if (quien.personalidadId) {
    const p = ajustes.personalidades[quien.personalidadId];
    if (p) {
      for (const campo of CAMPOS_CAPA) {
        if (p[campo] !== undefined) {
          efectivas[campo] = p[campo];
          procedencia[campo] = "personalidad";
        }
      }
    }
  }
  if (quien.agenteId) {
    const a = ajustes.agentes[quien.agenteId];
    if (a) {
      for (const campo of CAMPOS_CAPA) {
        if (a[campo] !== undefined) {
          efectivas[campo] = a[campo];
          procedencia[campo] = "agente";
        }
      }
    }
  }
  return { efectivas, procedencia };
}

export function fijarCapa(
  ajustes: AjustesCapasEntidad,
  ambito: AmbitoCapas,
  id: string,
  campo: CampoCapa,
  valor: boolean | null,
): AjustesCapasEntidad {
  const clave = ambito === "personalidad" ? "personalidades" : "agentes";
  const copia: AjustesCapasEntidad = {
    personalidades: { ...ajustes.personalidades },
    agentes: { ...ajustes.agentes },
  };
  const sec = copia[clave];
  const existing = sec[id] ? { ...sec[id] } : {};
  if (valor === null) {
    delete existing[campo];
  } else {
    existing[campo] = valor;
  }
  if (Object.keys(existing).length > 0) {
    copia[clave] = { ...sec, [id]: existing };
  } else {
    const nuevo = { ...sec };
    delete nuevo[id];
    copia[clave] = nuevo;
  }
  return copia;
}

export function aPreferenciaCapas(
  base: PreferenciaCapas,
  efectivas: CapasAjustables,
): PreferenciaCapas {
  return {
    ...base,
    activo: efectivas.activo,
    capas: {
      local: efectivas.local,
      mesh: efectivas.mesh,
      nube: efectivas.nube,
      colectiva: efectivas.colectiva,
    },
  };
}