/**
 * Capas de conciencia por personalidad y agente (Ola 1003 · CC1003A) — módulo PURO.
 *
 * Sobre las capas de cuenta de `capas-conciencia.ts` (todas encendidas por defecto) se pueden
 * fijar ajustes POR ENTIDAD: cada personalidad y cada agente puede apagar o encender campos
 * concretos. Precedencia campo a campo: agente › personalidad › cuenta, y solo mandan los
 * booleanos explícitos; lo no fijado hereda de la cuenta («auto»).
 */
import type { PreferenciaCapas } from "@/lib/astraura/capas-conciencia";

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

/** Todo encendido e interconectado por defecto. */
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
    nombre: "Modo 1.58",
    descripcion: "Interruptor general de las capas de conciencia"
  },
  local: {
    nombre: "Local",
    descripcion: "BitNet 1.58 en esta neurona, sin conexión y sin coste"
  },
  mesh: {
    nombre: "Mesh",
    descripcion: "Otras neuronas de la red mesh y la LAN"
  },
  nube: {
    nombre: "Nube",
    descripcion: "El backend 1.58 publicado para la web y la app"
  },
  colectiva: {
    nombre: "Conciencia colectiva",
    descripcion: "Comparte lo aprendido con las demás personalidades y agentes"
  },
  contextoPersonal: {
    nombre: "Contexto personal",
    descripcion: "Sabe quién eres: cómo llamarte, intereses, tono e idioma"
  },
};

export type AmbitoCapas = "personalidad" | "agente";

export interface AjustesCapasEntidad {
  personalidades: Record<string, Partial<CapasAjustables>>;
  agentes: Record<string, Partial<CapasAjustables>>;
}

export const AJUSTES_VACIOS: AjustesCapasEntidad = { personalidades: {}, agentes: {} };

/** Clave de almacenamiento (versión 1) y evento del bus al cambiar los ajustes. */
export const CLAVE_CAPAS_ENTIDAD = "starseed.astraura.capas-entidad.v1";
export const EVENTO_CAPAS_ENTIDAD = "starseed:astraura-capas-entidad";

function limpiarEntradas(raw: unknown): Record<string, Partial<CapasAjustables>> {
  const resultado: Record<string, Partial<CapasAjustables>> = {};
  if (raw == null || typeof raw !== "object") return resultado;
  for (const [id, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || valor == null || typeof valor !== "object") continue;
    const limpio: Partial<CapasAjustables> = {};
    for (const campo of CAMPOS_CAPA) {
      const v = (valor as Record<string, unknown>)[campo];
      if (typeof v === "boolean") limpio[campo] = v;
    }
    if (Object.keys(limpio).length > 0) resultado[id] = limpio;
  }
  return resultado;
}

/** Lectura defensiva de lo guardado: ignora ids vacíos, campos raros y no booleanos; nunca lanza. */
export function leerAjustesCapasEntidad(raw: unknown): AjustesCapasEntidad {
  try {
    if (raw == null || typeof raw !== "object") return AJUSTES_VACIOS;
    const o = raw as Record<string, unknown>;
    return {
      personalidades: limpiarEntradas(o.personalidades),
      agentes: limpiarEntradas(o.agentes),
    };
  } catch {
    return AJUSTES_VACIOS;
  }
}

/** Capas efectivas a nivel de CUENTA desde la preferencia del interruptor 1.58. */
export function capasDeCuenta(pref: PreferenciaCapas, contextoPersonal: boolean): CapasAjustables {
  return {
    activo: pref.activo,
    local: pref.capas.local,
    mesh: pref.capas.mesh,
    nube: pref.capas.nube,
    colectiva: pref.capas.colectiva,
    contextoPersonal,
  };
}

export type Procedencia = "agente" | "personalidad" | "cuenta";

/** Resuelve campo a campo con precedencia agente › personalidad › cuenta (solo booleanos explícitos). */
export function resolverCapasEntidad(
  cuenta: CapasAjustables,
  ajustes: AjustesCapasEntidad,
  quien: { personalidadId?: string; agenteId?: string },
): { efectivas: CapasAjustables; procedencia: Record<CampoCapa, Procedencia> } {
  const efectivas = { ...cuenta };
  const procedencia = {} as Record<CampoCapa, Procedencia>;
  const porPersonalidad = quien.personalidadId ? ajustes.personalidades[quien.personalidadId] : undefined;
  const porAgente = quien.agenteId ? ajustes.agentes[quien.agenteId] : undefined;
  for (const campo of CAMPOS_CAPA) {
    const deAgente = porAgente?.[campo];
    const dePersonalidad = porPersonalidad?.[campo];
    if (typeof deAgente === "boolean") {
      efectivas[campo] = deAgente;
      procedencia[campo] = "agente";
    } else if (typeof dePersonalidad === "boolean") {
      efectivas[campo] = dePersonalidad;
      procedencia[campo] = "personalidad";
    } else {
      procedencia[campo] = "cuenta";
    }
  }
  return { efectivas, procedencia };
}

/** Fija (o borra con `null`, «volver a auto») un campo de una entidad. PURA: devuelve copia. */
export function fijarCapa(
  ajustes: AjustesCapasEntidad,
  ambito: AmbitoCapas,
  id: string,
  campo: CampoCapa,
  valor: boolean | null,
): AjustesCapasEntidad {
  const clave = ambito === "agente" ? "agentes" : "personalidades";
  const grupo = { ...ajustes[clave] };
  const entrada = { ...(grupo[id] ?? {}) };
  if (valor === null) {
    delete entrada[campo];
    if (Object.keys(entrada).length === 0) delete grupo[id];
    else grupo[id] = entrada;
  } else {
    entrada[campo] = valor;
    grupo[id] = entrada;
  }
  return ambito === "agente"
    ? { personalidades: ajustes.personalidades, agentes: grupo }
    : { personalidades: grupo, agentes: ajustes.agentes };
}

/** Aplica las capas efectivas a la preferencia de cuenta, conservando nivelador y específico. */
export function aPreferenciaCapas(base: PreferenciaCapas, efectivas: CapasAjustables): PreferenciaCapas {
  return {
    activo: efectivas.activo,
    capas: {
      local: efectivas.local,
      mesh: efectivas.mesh,
      nube: efectivas.nube,
      colectiva: efectivas.colectiva,
    },
    nivelador: base.nivelador,
    especifico: base.especifico,
  };
}
