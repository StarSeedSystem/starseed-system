/** Configuración del Mausbot de Astraura (contrato `architecture/mausbot-astraura.md` §3):
 *  cuenta › perfil › neurona con precedencia neurona › perfil › cuenta, apagada por defecto
 *  y lectura defensiva (JSON roto → fábrica). Módulo puro, sin `node:*`. */
import type { NivelBot } from "@/lib/astraura-bots/permisos";

export type ModoMausbot = "cursor" | "acompanante" | "ambos";
const MODOS: readonly string[] = ["cursor", "acompanante", "ambos"];
const NIVELES: readonly string[] = ["nada", "proponer", "aplicar-bajo", "aplicar"];

/** Lo que un perfil o una neurona cambian a su aire: todo opcional. */
export interface AjustesMausbot {
  encendido?: boolean; modo?: ModoMausbot; disenoPorDefecto?: string;
  porPersonalidad?: Record<string, string>; actuar?: NivelBot;
}
export interface ConfigMausbot {
  v: 1; encendido: boolean; modo: ModoMausbot; disenoPorDefecto: string;
  porPersonalidad: Record<string, string>; actuar: NivelBot;
  perfiles: Record<string, AjustesMausbot>; neuronas: Record<string, AjustesMausbot>;
}
/** Lo efectivo tras resolver neurona › perfil › cuenta. */
export interface ConfigEfectivaMausbot {
  encendido: boolean; modo: ModoMausbot; disenoPorDefecto: string;
  porPersonalidad: Record<string, string>; actuar: NivelBot;
}
/** Parche de la configuración de cuenta (lo ausente se conserva). */
export type ParcheMausbot = AjustesMausbot & {
  perfiles?: Record<string, AjustesMausbot>; neuronas?: Record<string, AjustesMausbot>;
};

export const CLAVE_MAUSBOT = "starseed.mausbot.v1";
export const EVENTO_MAUSBOT = "starseed:mausbot";
export const DISENO_MAUSBOT_FABRICA = "fabrica-cursor";
export const CONFIG_MAUSBOT_DEFECTO: ConfigMausbot = {
  v: 1, encendido: false, modo: "acompanante", disenoPorDefecto: DISENO_MAUSBOT_FABRICA,
  porPersonalidad: {}, actuar: "proponer", perfiles: {}, neuronas: {},
};

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Sanea un ajuste: los valores desconocidos se caen, nunca explotan. */
export function normalizarAjustes(valor: unknown): AjustesMausbot {
  if (!esObjeto(valor)) return {};
  const a: AjustesMausbot = {};
  if (typeof valor.encendido === "boolean") a.encendido = valor.encendido;
  if (typeof valor.modo === "string" && MODOS.includes(valor.modo)) a.modo = valor.modo as ModoMausbot;
  if (typeof valor.actuar === "string" && NIVELES.includes(valor.actuar)) a.actuar = valor.actuar as NivelBot;
  if (typeof valor.disenoPorDefecto === "string" && valor.disenoPorDefecto) a.disenoPorDefecto = valor.disenoPorDefecto;
  if (esObjeto(valor.porPersonalidad)) a.porPersonalidad = Object.fromEntries(Object.entries(valor.porPersonalidad)
    .filter((par): par is [string, string] => typeof par[1] === "string" && par[1] !== ""));
  return a;
}
const normalizarRegistro = (valor: unknown): Record<string, AjustesMausbot> => esObjeto(valor)
  ? Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizarAjustes(v)]))
  : {};
/** Toda la configuración saneada; versión desconocida o basura → la de fábrica. */
export function normalizarConfigMausbot(valor: unknown): ConfigMausbot {
  if (!esObjeto(valor) || valor.v !== 1) return normalizarConfigMausbot(CONFIG_MAUSBOT_DEFECTO);
  const a = normalizarAjustes(valor);
  return {
    v: 1, encendido: a.encendido ?? false, modo: a.modo ?? "acompanante",
    disenoPorDefecto: a.disenoPorDefecto ?? DISENO_MAUSBOT_FABRICA,
    porPersonalidad: a.porPersonalidad ?? {}, actuar: a.actuar ?? "proponer",
    perfiles: normalizarRegistro(valor.perfiles), neuronas: normalizarRegistro(valor.neuronas),
  };
}
function escribir(config: ConfigMausbot): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(CLAVE_MAUSBOT, JSON.stringify(config));
    window.dispatchEvent(new Event(EVENTO_MAUSBOT));
    return true;
  } catch { return false; }
}
/** Lectura defensiva: sin dato, JSON roto o versión desconocida → la de fábrica. */
export function leerConfigMausbot(): ConfigMausbot {
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(CLAVE_MAUSBOT);
      if (raw) return normalizarConfigMausbot(JSON.parse(raw) as unknown);
    }
  } catch { /* JSON roto o almacenamiento sin permiso: sigue la de fábrica. */ }
  return normalizarConfigMausbot(CONFIG_MAUSBOT_DEFECTO);
}
/** Aplica un parche a la configuración de cuenta y guarda (emite `EVENTO_MAUSBOT`). */
export function guardarConfigMausbot(parche: ParcheMausbot): boolean {
  const actual = leerConfigMausbot();
  const c = normalizarAjustes(parche);
  return escribir({
    v: 1, encendido: c.encendido ?? actual.encendido, modo: c.modo ?? actual.modo,
    disenoPorDefecto: c.disenoPorDefecto ?? actual.disenoPorDefecto,
    porPersonalidad: c.porPersonalidad ?? actual.porPersonalidad, actuar: c.actuar ?? actual.actuar,
    perfiles: parche.perfiles ? normalizarRegistro(parche.perfiles) : actual.perfiles,
    neuronas: parche.neuronas ? normalizarRegistro(parche.neuronas) : actual.neuronas,
  });
}
/** Resolución PURA: neurona › perfil › cuenta (patrón de `resolverPantallaInicial`). */
export function fusionarResolucion(cfg: ConfigMausbot, perfilId?: string, neuronaId?: string): ConfigEfectivaMausbot {
  const resuelto: ConfigEfectivaMausbot = {
    encendido: cfg.encendido, modo: cfg.modo, disenoPorDefecto: cfg.disenoPorDefecto,
    porPersonalidad: { ...cfg.porPersonalidad }, actuar: cfg.actuar,
  };
  const capas = [perfilId ? cfg.perfiles[perfilId] : undefined, neuronaId ? cfg.neuronas[neuronaId] : undefined];
  for (const capa of capas) {
    resuelto.encendido = capa?.encendido ?? resuelto.encendido;
    resuelto.modo = capa?.modo ?? resuelto.modo;
    resuelto.disenoPorDefecto = capa?.disenoPorDefecto ?? resuelto.disenoPorDefecto;
    if (capa?.porPersonalidad) resuelto.porPersonalidad = { ...resuelto.porPersonalidad, ...capa.porPersonalidad };
    resuelto.actuar = capa?.actuar ?? resuelto.actuar;
  }
  return resuelto;
}
/** Lee la configuración y la resuelve para este perfil y esta neurona. */
export function resolverMausbot({ perfilId, neuronaId }: { perfilId?: string; neuronaId?: string } = {}): ConfigEfectivaMausbot {
  return fusionarResolucion(leerConfigMausbot(), perfilId, neuronaId);
}
/** Diseño de una personalidad: el suyo › el por defecto de la cuenta › el de fábrica. */
export function disenoParaPersonalidad(cfg: Pick<ConfigEfectivaMausbot, "porPersonalidad" | "disenoPorDefecto">, personaId: string): string {
  return cfg.porPersonalidad[personaId] ?? cfg.disenoPorDefecto ?? DISENO_MAUSBOT_FABRICA;
}
