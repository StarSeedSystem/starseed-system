/**
 * Adaptador de la capa «espacio» de `planImagen` (ESP1011D). Contratos:
 * architecture/astraura-imagenes.md §3 y architecture/astraura-avatares-3d.md §11.2.
 *
 * FLUX.1 [schnell] y Qwen-Image se llaman DESDE EL NAVEGADOR de cada persona con el
 * cliente de ESP1011A (`src/lib/espacios/cliente-espacios.ts`): cada quien gasta SU
 * cuota de ZeroGPU y su token, si lo puso, nunca pasa por nuestros servidores.
 *
 * «Basta de ilusiones»: si el Space está dormido, lleno, sin cuota o cambió su API,
 * se devuelve el motivo tal cual para que el plan pase a la siguiente opción. La
 * semilla del plan se manda solo si el Space publica un parámetro para ella.
 */
import {
  ErrorEspacio,
  generarConRespaldo,
  leerApiEspacio,
  type ApiEspacio,
  type EndpointApi,
  type OpcionesEjecucion,
} from "@/lib/espacios/cliente-espacios";
import { modeloPorId } from "@/lib/imagenes/modelos";
import type { OpcionImagen } from "@/lib/imagenes/plan";

/** Un Space público verificado en marcha (2026-10-11) y su licencia. */
export interface EspacioImagen {
  espacioId: string;
  /** Nombres de función que el Space publicaba al verificarlo; el real se lee de su API. */
  preferidos: readonly string[];
  licencia: string;
  /** Página pública del Space, para enseñarla junto a la opción. */
  url: string;
}

/** Los dos Spaces de imagen que usa la capa «espacio». Solo estos; nada de Qwen-Image 2.1 (CPU). */
export const ESPACIOS_IMAGEN: Readonly<Record<string, EspacioImagen>> = {
  "flux1-schnell": {
    espacioId: "black-forest-labs/FLUX.1-schnell",
    preferidos: ["infer", "generate"],
    licencia: "Apache-2.0",
    url: "https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell",
  },
  "qwen-image": {
    espacioId: "Qwen/Qwen-Image",
    preferidos: ["infer", "generate"],
    licencia: "Apache-2.0",
    url: "https://huggingface.co/spaces/Qwen/Qwen-Image",
  },
};

export interface FichaEspacioImagen {
  modelo: string;
  licencia: string;
  /** Frase honesta: de dónde salió la imagen. */
  origen: string;
  espacio: string;
  url: string;
}

export type ResultadoOpcionEspacio =
  | { ok: true; url?: string; ref?: string; segundos: number; ficha: FichaEspacioImagen }
  | { ok: false; motivo: string; tipo?: string };

export interface OpcionesEspacioImagen extends OpcionesEjecucion {
  /** Cómo convertir el blob en URL (en pruebas se inyecta; en el navegador, blob:). */
  crearUrl?: (blob: Blob) => string | undefined;
}

/** Configuración del Space para un modelo del catálogo, o null si no tiene uno verificado. */
export function espacioDeModelo(modeloId: string): EspacioImagen | null {
  return ESPACIOS_IMAGEN[modeloId] ?? null;
}

/** Ficha de la opción: modelo, licencia Apache-2.0 y «hecho en un Space público». */
export function fichaDeEspacio(modeloId: string): FichaEspacioImagen | null {
  const cfg = espacioDeModelo(modeloId);
  const modelo = modeloPorId(modeloId);
  if (!cfg || !modelo) return null;
  return {
    modelo: modelo.nombre,
    licencia: cfg.licencia,
    origen: "hecho en un Space público",
    espacio: cfg.espacioId,
    url: cfg.url,
  };
}

const ES_TEXTO = /textbox|text|markdown|code/i;

/**
 * Elige la función de texto a imagen que el Space publica DE VERDAD: primero las
 * preferidas, después una cuyo nombre huela a inferencia/generación; solo vale si
 * tiene un campo de texto. Devuelve null cuando su API cambió (no se adivina).
 */
export function elegirEndpoint(api: Pick<ApiEspacio, "endpoints">, preferidos: readonly string[]): EndpointApi | null {
  const validos = api.endpoints.filter((e) => e.parametros.some((p) => ES_TEXTO.test(p.componente)));
  if (!validos.length) return null;
  const limpio = (n: string) => n.replace(/^\//, "").toLowerCase();
  for (const nombre of preferidos) {
    const exacto = validos.find((e) => limpio(e.nombre) === limpio(nombre));
    if (exacto) return exacto;
  }
  return (
    validos.find((e) => /infer|generate|generar|txt2img|imagen|image|run/i.test(e.nombre)) ??
    validos[0] ??
    null
  );
}

/**
 * Valores fijos para respetar la semilla del plan: se manda a todo parámetro que
 * hable de semilla y se apaga el «aleatoria» si lo hubiera. Sin parámetro de
 * semilla devuelve `{}`: el Space decide y no fingimos que la aceptó.
 */
export function datosConSemilla(ep: Pick<EndpointApi, "parametros">, semilla: number): Record<string, unknown> {
  const s = Math.max(0, Math.floor(Number.isFinite(semilla) ? semilla : 0));
  const datos: Record<string, unknown> = {};
  for (const p of ep.parametros) {
    if (/^(randomize|random|aleatori)[-_]?seed$/i.test(p.nombre)) datos[p.nombre] = false;
    else if (/seed|semilla/i.test(p.nombre)) datos[p.nombre] = s;
  }
  return datos;
}

/** Opciones del plan que de verdad son de la capa «espacio» y tienen Space verificado. */
export function opcionesEspacioDelPlan(opciones: readonly OpcionImagen[]): OpcionImagen[] {
  return opciones.filter((o) => o.capa === "espacio" && o.motor === "espacio-hf" && !!o.modelo && !!espacioDeModelo(o.modelo.id));
}

/** URL del blob en el navegador; sin `createObjectURL` no se inventa una. */
export function urlDeBlob(blob: Blob): string | undefined {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return undefined;
  try {
    return URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
}

/**
 * Ejecuta UNA opción de la capa «espacio»: lee la API real del Space (en caché por
 * versión), elige su función de texto a imagen, manda el prompt y la semilla si la
 * acepta, y devuelve la imagen ya descargada a este aparato con su ficha. Nunca
 * lanza: un fallo se devuelve con su motivo para pasar a la siguiente opción.
 */
export async function ejecutarOpcionEspacio(
  op: OpcionImagen,
  prompt: string,
  opciones: OpcionesEspacioImagen = {},
): Promise<ResultadoOpcionEspacio> {
  const texto = String(prompt ?? "").trim();
  if (!texto) return { ok: false, motivo: "Describe qué imagen quieres generar." };
  if (op.capa !== "espacio" || op.motor !== "espacio-hf") {
    return { ok: false, motivo: "Esta opción no es de la capa «espacio»: no se llama a Hugging Face." };
  }
  if (!op.modelo) return { ok: false, motivo: "La opción del Space no declara modelo." };

  const cfg = espacioDeModelo(op.modelo.id);
  const ficha = fichaDeEspacio(op.modelo.id);
  if (!cfg || !ficha) {
    return { ok: false, motivo: `${op.modelo.nombre}: su Space público no está verificado; no se inventa uno.` };
  }

  try {
    const api = await leerApiEspacio(cfg.espacioId, opciones);
    const ep = elegirEndpoint(api, cfg.preferidos);
    if (!ep) {
      return { ok: false, tipo: "api-cambiada", motivo: `El Space ${cfg.espacioId} ya no publica una función de texto a imagen: su API cambió.` };
    }

    const r = await generarConRespaldo(
      [{ espacioId: cfg.espacioId, endpoint: ep.nombre, datos: datosConSemilla(ep, op.semilla) }],
      { texto },
      opciones,
    );
    if (!r.ok) {
      const ultimo = r.intentos[r.intentos.length - 1];
      return {
        ok: false,
        ...(ultimo?.tipo ? { tipo: ultimo.tipo } : {}),
        motivo: ultimo?.motivo ?? `El Space ${cfg.espacioId} no respondió y no dio un motivo.`,
      };
    }

    const url = opciones.crearUrl ? opciones.crearUrl(r.archivo.blob) : urlDeBlob(r.archivo.blob);
    return { ok: true, ...(url ? { url } : {}), segundos: r.segundosGpu, ficha };
  } catch (e) {
    if (e instanceof ErrorEspacio) return { ok: false, tipo: e.tipo, motivo: e.message };
    return { ok: false, motivo: `Fallo inesperado con el Space ${cfg.espacioId}; se pasa a la siguiente opción.` };
  }
}
