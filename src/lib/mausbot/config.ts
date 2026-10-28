/** Mausbot de Astraura · configuración por cuenta, perfil y neurona.
 * Contrato: architecture/mausbot-astraura.md §3. Puro (sin `node:*`), apagado por defecto.
 */
import type { NivelBot } from "@/lib/astraura-bots/permisos";
export const CLAVE_MAUSBOT = "starseed.mausbot.v1";
export const EVENTO_MAUSBOT = "starseed:mausbot";
export const DISENO_POR_DEFECTO = "fabrica-cursor";
export type ModoMausbot = "cursor" | "acompanante" | "ambos";
export interface AjusteMausbot {
  encendido?: boolean; modo?: ModoMausbot; disenoPorDefecto?: string;
  porPersonalidad?: Record<string, string>; actuar?: NivelBot;
}
export interface ConfigMausbot {
  v: 1; encendido: boolean; modo: ModoMausbot; disenoPorDefecto: string;
  porPersonalidad: Record<string, string>; actuar: NivelBot;
  perfiles: Record<string, AjusteMausbot>; neuronas: Record<string, AjusteMausbot>;
}
export type MausbotResuelto = Omit<ConfigMausbot, "v" | "perfiles" | "neuronas">;
const MODOS: readonly string[] = ["cursor", "acompanante", "ambos"];
const NIVELES: readonly string[] = ["nada", "proponer", "aplicar-bajo", "aplicar"];
export function configMausbotPorDefecto(): ConfigMausbot {
  return {
    v: 1, encendido: false, modo: "acompanante", disenoPorDefecto: DISENO_POR_DEFECTO,
    porPersonalidad: {}, actuar: "proponer", perfiles: {}, neuronas: {},
  };
}
export function sanearConfigMausbot(valor: unknown): ConfigMausbot {
  const base = configMausbotPorDefecto();
  if (!esObjeto(valor) || valor.v !== 1) return base;
  return {
    v: 1, encendido: valor.encendido === true,
    modo: MODOS.includes(valor.modo as string) ? (valor.modo as ModoMausbot) : base.modo,
    disenoPorDefecto: texto(valor.disenoPorDefecto) ?? base.disenoPorDefecto,
    porPersonalidad: sanearPorPersonalidad(valor.porPersonalidad),
    actuar: NIVELES.includes(valor.actuar as string) ? (valor.actuar as NivelBot) : base.actuar,
    perfiles: sanearRegistro(valor.perfiles), neuronas: sanearRegistro(valor.neuronas),
  };
}
export function leerConfigMausbot(): ConfigMausbot {
  try {
    if (typeof window === "undefined") return configMausbotPorDefecto();
    const crudo = window.localStorage.getItem(CLAVE_MAUSBOT);
    return crudo ? sanearConfigMausbot(JSON.parse(crudo)) : configMausbotPorDefecto();
  } catch {
    return configMausbotPorDefecto();
  }
}
export function guardarConfigMausbot(patch: Partial<ConfigMausbot>): ConfigMausbot {
  const actual = leerConfigMausbot();
  const ajuste = sanearAjusteMausbot(patch);
  const siguiente = sanearConfigMausbot({
    ...actual, ...ajuste,
    porPersonalidad: { ...actual.porPersonalidad, ...(ajuste.porPersonalidad ?? {}) },
    perfiles: combinarRegistros(actual.perfiles, patch.perfiles),
    neuronas: combinarRegistros(actual.neuronas, patch.neuronas),
  });
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLAVE_MAUSBOT, JSON.stringify(siguiente));
      window.dispatchEvent(new Event(EVENTO_MAUSBOT));
    }
  } catch {
    // Almacenamiento bloqueado: la configuración sigue en memoria.
  }
  return siguiente;
}
export function resolverMausbot({ perfilId, neuronaId }: {
  perfilId?: string | null; neuronaId?: string | null;
} = {}): MausbotResuelto {
  const cfg = leerConfigMausbot();
  const perfil = perfilId ? cfg.perfiles[perfilId] : undefined;
  const neurona = neuronaId ? cfg.neuronas[neuronaId] : undefined;
  return {
    encendido: neurona?.encendido ?? perfil?.encendido ?? cfg.encendido,
    modo: neurona?.modo ?? perfil?.modo ?? cfg.modo,
    disenoPorDefecto: neurona?.disenoPorDefecto ?? perfil?.disenoPorDefecto ?? cfg.disenoPorDefecto,
    porPersonalidad: {
      ...cfg.porPersonalidad, ...(perfil?.porPersonalidad ?? {}), ...(neurona?.porPersonalidad ?? {}),
    },
    actuar: neurona?.actuar ?? perfil?.actuar ?? cfg.actuar,
  };
}
export function disenoParaPersonalidad(
  cfg: Pick<ConfigMausbot, "porPersonalidad" | "disenoPorDefecto">, personaId: string,
): string {
  return cfg.porPersonalidad[personaId] ?? cfg.disenoPorDefecto;
}
export function sanearAjusteMausbot(valor: unknown): AjusteMausbot {
  if (!esObjeto(valor)) return {};
  const ajuste: AjusteMausbot = {};
  if (typeof valor.encendido === "boolean") ajuste.encendido = valor.encendido;
  if (MODOS.includes(valor.modo as string)) ajuste.modo = valor.modo as ModoMausbot;
  if (texto(valor.disenoPorDefecto)) ajuste.disenoPorDefecto = valor.disenoPorDefecto as string;
  if (NIVELES.includes(valor.actuar as string)) ajuste.actuar = valor.actuar as NivelBot;
  if (esObjeto(valor.porPersonalidad)) ajuste.porPersonalidad = sanearPorPersonalidad(valor.porPersonalidad);
  return ajuste;
}
function combinarRegistros(
  actual: Record<string, AjusteMausbot>, patch: unknown,
): Record<string, AjusteMausbot> {
  const salida = { ...actual };
  for (const [id, ajuste] of Object.entries(sanearRegistro(patch))) salida[id] = { ...salida[id], ...ajuste };
  return salida;
}
function sanearRegistro(valor: unknown): Record<string, AjusteMausbot> {
  if (!esObjeto(valor)) return {};
  return Object.fromEntries(Object.entries(valor).flatMap(([id, ajuste]) =>
    id.trim() ? [[id, sanearAjusteMausbot(ajuste)]] : []));
}
function sanearPorPersonalidad(valor: unknown): Record<string, string> {
  if (!esObjeto(valor)) return {};
  return Object.fromEntries(Object.entries(valor).flatMap(([id, diseno]) => {
    const limpio = texto(diseno);
    return id.trim() && limpio ? [[id, limpio]] : [];
  }));
}
const esObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === "object" && valor !== null && !Array.isArray(valor);
const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
