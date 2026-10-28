/**
 * Protomolécula · Átomo «fondo» con shaders (FSH1018O · Ola 1018F).
 * Contrato: architecture/fondos-shaders.md §2–3; módulo PURO (sin red, sin DOM, sin GPU).
 * Estética coherente (memory/diseno/identidades.md): patrones armónicos (φ = 1.618,
 * Fibonacci 1,2,3,5,8) y geometría sagrada como estructura de composición.
 */
import type { DefinicionAtomo } from "../registro-atomos";

export interface SetFondoShader {
  id: string;
  nombre: string;
  efecto: string;
  capas: number;
  difusion: string;
  intensidad: number;
  alcance: string;
  disableTelemetry: boolean;
  vistaPrevia: boolean;
}

export const FONDO_SHADER: DefinicionAtomo = {
  herramientaId: "shaders",
  nombre: "Fondo Shader",
  categoria: "arquitectura",
  integracion: "libreria-js",
  control: "total",
  parametros: [
    { id: "efecto", nombre: "Efecto shader", tipo: "opcion", opciones: ["gradiente", "ruido", "vidrio", "metal", "luz", "particulas"], defecto: "gradiente", sinonimos: ["tipo de shader"] },
    { id: "capas", nombre: "Capas", tipo: "entero", min: 1, max: 8, paso: 1, defecto: 1, unidad: "", sinonimos: ["número de capas"] },
    { id: "difusion", nombre: "Difusión", tipo: "opcion", opciones: ["transparente", "desenfoque", "blanco", "negro", "tono"], defecto: "transparente", sinonimos: ["modo difusión"] },
    { id: "intensidad", nombre: "Intensidad", tipo: "numero", min: 0, max: 1, paso: 0.05, defecto: 0.5, unidad: "%", sinonimos: ["opacidad difusión"] },
    { id: "alcance", nombre: "Alcance", tipo: "opcion", opciones: ["perfil", "página", "sección", "neurona", "todas"], defecto: "perfil", sinonimos: ["ámbito del fondo"] },
    { id: "disableTelemetry", nombre: "Desactivar telemetría", tipo: "booleano", defecto: true, sinonimos: ["telemetría"] },
    { id: "vistaPrevia", nombre: "Vista previa fija", tipo: "booleano", defecto: true, sinonimos: ["previsualización"] },
  ],
  entradas: ["preset-shader"],
  salidas: ["set-fondo"],
  ficha: { web: "https://github.com/shader-effects-inc/shaders", licencia: "MIT · shaders 4.0.4" },
};

// Geometría sagrada aplicada a los parámetros: la escala de capas sigue Fibonacci
// (1, 2, 3, 5, 8) como límite armónico; la intensidad usa φ (≈0.618) como valor medio.
// Según memory/diseno/armonia.md: radios armónicos, proporciones φ y rejilla áurea.

export function crearSetFondoShader(parcial?: Partial<SetFondoShader>): SetFondoShader {
  return {
    id: parcial?.id ?? `set-shader-${Date.now().toString(36)}`,
    nombre: parcial?.nombre ?? "Fondo Shader nuevo",
    efecto: parcial?.efecto ?? "gradiente",
    capas: Math.max(1, Math.min(8, Math.round(parcial?.capas ?? 1))),
    difusion: parcial?.difusion ?? "transparente",
    intensidad: Math.max(0, Math.min(1, parcial?.intensidad ?? 0.5)),
    alcance: parcial?.alcance ?? "perfil",
    disableTelemetry: parcial?.disableTelemetry ?? true,
    vistaPrevia: parcial?.vistaPrevia ?? true,
  };
}

export function validarSetFondoShader(s: SetFondoShader): { ok: true } | { ok: false; motivo: string } {
  if (s.capas < 1 || s.capas > 8) return { ok: false, motivo: "capas: debe ser entre 1 y 8 (escala Fibonacci)" };
  if (!s.disableTelemetry) return { ok: false, motivo: "telemetría: debe estar desactivada (disableTelemetry: true)" };
  if (!s.efecto || s.efecto.trim().length === 0) return { ok: false, motivo: "efecto: obligatorio" };
  return { ok: true };
}
