/**
 * Mausbot de Astraura · configuración por cuenta, perfil y neurona (MBT1027C).
 * Contrato: architecture/mausbot-astraura.md §3.
 *
 * El Mausbot es el cursor con cara de Astraura. Apagado por defecto: un cursor
 * nuevo no se impone a nadie. Lo de la neurona gana a lo del perfil, y este a
 * lo de la cuenta (mismo patrón que `resolverPantallaInicial`). Puro, sin `node:*`.
 */
import type { NivelBot } from "@/lib/astraura-bots/permisos";

export type ModoMausbot = "cursor" | "acompanante" | "ambos";

/** Cambia por perfil o neurona solo lo distinto a la cuenta; el resto se hereda. */
export interface AjustesMausbot {
  encendido: boolean;
  modo: ModoMausbot;
  disenoPorDefecto: string;
  porPersonalidad: Record<string, string>;
  actuar: NivelBot;
}

export interface ConfigMausbot extends AjustesMausbot {
  v: 1;
  perfiles: Record<string, AjustesMausbot>;
  neuronas: Record<string, AjustesMausbot>;
}

export const CLAVE_MAUSBOT = "starseed.mausbot.v1";
export const EVENTO_MAUSBOT = "starseed:mausbot";
export const DISENO_FABRICA_CURSOR = "fabrica-cursor";

const MODOS: readonly ModoMausbot[] = ["cursor", "acompanante", "ambos"];
const NIVELES: readonly NivelBot[] = ["nada", "proponer", "aplicar-bajo", "aplicar"];

export function ajustesPorDefecto(): AjustesMausbot {
  return {
    encendido: false,
    modo: "acompanante",
    disenoPorDefecto: DISENO_FABRICA_CURSOR,
    porPersonalidad: {},
    actuar: "proponer",
  };
}

function configVacia(): ConfigMausbot {
  return { v: 1, ...ajustesPorDefecto(), perfiles: {}, neuronas: {} };
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0;
}

/** Lectura defensiva: un campo roto vuelve a su valor por defecto, no tumba la config. */
function normalizarAjustes(valor: unknown): AjustesMausbot {
  const d = ajustesPorDefecto();
  if (!valor || typeof valor !== "object") return d;
  const b = valor as Record<string, unknown>;
  const r = b.porPersonalidad;
  const personas = r && typeof r === "object"
    ? Object.fromEntries(Object.entries(r).filter((e): e is [string, string] => esTexto(e[1])))
    : d.porPersonalidad;
  return {
    encendido: typeof b.encendido === "boolean" ? b.encendido : d.encendido,
    modo: MODOS.includes(b.modo as ModoMausbot) ? (b.modo as ModoMausbot) : d.modo,
    disenoPorDefecto: esTexto(b.disenoPorDefecto) ? b.disenoPorDefecto : d.disenoPorDefecto,
    porPersonalidad: personas,
    actuar: NIVELES.includes(b.actuar as NivelBot) ? (b.actuar as NivelBot) : d.actuar,
  };
}

function normalizarRegistro(valor: unknown): Record<string, AjustesMausbot> {
  if (!valor || typeof valor !== "object") return {};
  return Object.fromEntries(Object.entries(valor).map(([id, a]) => [id, normalizarAjustes(a)]));
}

function guardarEnAlmacen(config: ConfigMausbot): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(CLAVE_MAUSBOT, JSON.stringify(config));
    window.dispatchEvent(new Event(EVENTO_MAUSBOT));
    return true;
  } catch {
    return false;
  }
}

export function leerConfigMausbot(): ConfigMausbot {
  try {
    if (typeof window === "undefined") return configVacia();
    const bruto = window.localStorage.getItem(CLAVE_MAUSBOT);
    if (!bruto) return configVacia();
    const valor: unknown = JSON.parse(bruto);
    if (!valor || typeof valor !== "object") return configVacia();
    const a = valor as Record<string, unknown>;
    if (a.v !== 1) return configVacia();
    return { ...normalizarAjustes(a), v: 1, perfiles: normalizarRegistro(a.perfiles), neuronas: normalizarRegistro(a.neuronas) };
  } catch {
    return configVacia();
  }
}

/** Guarda el parche en los ajustes de la CUENTA; lo de perfiles y neuronas queda intacto. */
export function guardarConfigMausbot(parche: Partial<AjustesMausbot>): boolean {
  try {
    const actual = leerConfigMausbot();
    return guardarEnAlmacen({
      ...actual,
      ...normalizarAjustes({ ...actual, ...parche }),
      v: 1,
      perfiles: actual.perfiles,
      neuronas: actual.neuronas,
    });
  } catch {
    return false;
  }
}

/** Config efectiva: neurona > perfil > cuenta; `porPersonalidad` se mezcla por entrada. */
export function resolverMausbot({ perfilId, neuronaId }: { perfilId?: string; neuronaId?: string } = {}): ConfigMausbot {
  const cuenta = leerConfigMausbot();
  const perfil = perfilId ? cuenta.perfiles[perfilId] : undefined;
  const neurona = neuronaId ? cuenta.neuronas[neuronaId] : undefined;
  const aplano = (base: AjustesMausbot, extra?: AjustesMausbot): AjustesMausbot => extra
    ? { ...extra, porPersonalidad: { ...base.porPersonalidad, ...extra.porPersonalidad } }
    : base;
  const efectivo = aplano(aplano(cuenta, perfil), neurona);
  return { ...efectivo, v: 1, perfiles: cuenta.perfiles, neuronas: cuenta.neuronas };
}

/** El diseño asignado a esta personalidad, o el por defecto de la cuenta como respaldo. */
export function disenoParaPersonalidad(config: ConfigMausbot, personaId: string): string {
  return config.porPersonalidad[personaId] ?? config.disenoPorDefecto;
}
