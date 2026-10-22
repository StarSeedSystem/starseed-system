// Adaptador de apariencia: variaciones de tema y de fondo (contrato §5 de
// architecture/variaciones-publicas.md). Es puro: el lector y el escritor del
// estado activo se inyectan; no toca Supabase, disco, reloj ni DOM.
import { BACKGROUND_REGISTRY } from "@/lib/design/backgrounds";
import {
  designFromSavedItem, designToSaveInput, normalizeDesignFile, type DesignFile,
} from "@/lib/design/design-files";
import { curatedPresets } from "@/lib/themes/curated-presets";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
/** Las dos familias de apariencia que este adaptador cubre. */
export type FamiliaApariencia = "tema" | "fondo";
/** Estado que el anfitrión presta al adaptador; el adaptador nunca lo guarda. */
export interface DepsApariencia {
  /** Id activo de la familia (tema de `curatedPresets` o fondo del registro). */
  leer: (familia: FamiliaApariencia) => string | null;
  /** Aplica un id; con `null` restaura el estado anterior de esa familia. */
  escribir: (familia: FamiliaApariencia, id: string | null) => void;
}
/** Ids publicables de una familia, tomados de los registros canónicos. */
export function idsApariencia(familia: FamiliaApariencia): string[] {
  return familia === "tema"
    ? curatedPresets.map((preset) => preset.id)
    : Object.keys(BACKGROUND_REGISTRY);
}
/** Construye el `DesignFile` de un elemento activo; `null` si no está registrado. */
export function disenoDeApariencia(familia: FamiliaApariencia, id: string): DesignFile | null {
  if (familia === "tema") {
    const preset = curatedPresets.find((p) => p.id === id);
    if (!preset) return null;
    return {
      id: preset.id, nombre: preset.name, tipo: "tema-completo", categoria: "temas", carpeta: null,
      payload: { appearance: preset.config as unknown as Record<string, unknown> },
      scope: ["perfil", "pagina", "grupo", "comunidad", "sistema"],
      preview: { colors: [...preset.swatch] }, version: 1, autor: "StarSeed Core",
      descripcion: preset.tagline, estilo: preset.mood,
    };
  }
  const fondo = BACKGROUND_REGISTRY[id];
  if (!fondo) return null;
  return {
    id: fondo.id, nombre: fondo.name, tipo: "fondo", categoria: "fondos", carpeta: null,
    payload: { tokens: { vars: {}, background: fondo.id } },
    scope: ["perfil", "pagina", "grupo", "comunidad", "sistema"],
    preview: { colors: [] }, version: 1, autor: "StarSeed Core",
    descripcion: fondo.description, estilo: "fondo",
  };
}
/** Id que representa el diseño dentro de su familia; `null` si no es de ese registro. */
function idDeDiseno(familia: FamiliaApariencia, diseno: DesignFile): string | null {
  if (familia === "tema") return idsApariencia("tema").includes(diseno.id) ? diseno.id : null;
  const activo = diseno.payload.tokens?.background;
  if (typeof activo === "string" && BACKGROUND_REGISTRY[activo]) return activo;
  return BACKGROUND_REGISTRY[diseno.id] ? diseno.id : null;
}
/** Acepta un DesignFile, su JSON o el contenido de un ítem de Biblioteca. */
function comoDiseno(raw: unknown): DesignFile | null {
  let diseno: DesignFile | null = null;
  if (typeof raw === "string") diseno = designFromSavedItem({ content: raw });
  else if (raw && typeof raw === "object") {
    const registro = raw as Record<string, unknown>;
    diseno = typeof registro.content === "string"
      ? designFromSavedItem({ content: registro.content })
      : normalizeDesignFile(registro);
  }
  // `normalizeDesignFile` deja campos opcionales en `undefined` y el validador
  // los lee como no serializables: se limpia con una vuelta por JSON.
  try { return diseno ? (JSON.parse(JSON.stringify(diseno)) as DesignFile) : null; } catch { return null; }
}
/** Convierte el diseño capturado en el ítem guardable de la Biblioteca. */
export function variacionAGuardado(diseno: DesignFile, carpetaId?: string | null) {
  return designToSaveInput(diseno, carpetaId);
}
/** Reconstruye el diseño desde un ítem guardado o publicado. */
export function variacionDesdeGuardado(item: { content?: string | null }): DesignFile | null {
  return designFromSavedItem(item);
}
/** Crea el adaptador de una familia con el lector y el escritor inyectados. */
export function crearAdaptadorApariencia(
  familia: FamiliaApariencia, deps: DepsApariencia,
): AdaptadorFamilia<DesignFile> {
  const familiaDeClave = (clave: string) => leerClave(clave)?.split(":")[0] ?? null;
  const adaptador: AdaptadorFamilia<DesignFile> = {
    familia,
    nombre: familia === "tema" ? "Temas y paletas" : "Fondos",
    capturar: (clave) => {
      if (familiaDeClave(clave) !== familia) return null;
      const activo = deps.leer(familia);
      return activo ? disenoDeApariencia(familia, activo) : null;
    },
    validar: (raw) => {
      const diseno = comoDiseno(raw);
      if (!diseno) return { ok: false, motivos: ["La variación no es un archivo de diseño válido"] };
      if (!idDeDiseno(familia, diseno)) {
        return { ok: false, motivos: [`La variación no es un ${familia} registrado en el OS`] };
      }
      const revision = validarVariacion(diseno);
      return revision.ok ? { ok: true, payload: diseno } : { ok: false, motivos: revision.motivos };
    },
    aplicar: (clave, payload) => {
      if (familiaDeClave(clave) !== familia) return { deshacer: () => undefined };
      const revision = adaptador.validar(payload);
      if (!revision.ok) return { deshacer: () => undefined };
      const id = idDeDiseno(familia, revision.payload);
      if (!id) return { deshacer: () => undefined };
      const anterior = deps.leer(familia);
      deps.escribir(familia, id);
      return { deshacer: () => deps.escribir(familia, anterior) };
    },
  };
  return adaptador;
}
/** Registra `tema:` y `fondo:` en el registro compartido de familias. */
export function registrarAdaptadoresApariencia(deps: DepsApariencia): void {
  registrarFamilia(crearAdaptadorApariencia("tema", deps));
  registrarFamilia(crearAdaptadorApariencia("fondo", deps));
}
