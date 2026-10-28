import type { Asignacion, Preferencias } from "./asignaciones";
import type { OpcionCatalogo, Papel, Privacidad } from "./catalogo-opciones";
import type { ContenedorOpcion } from "./contenedores";
import type { OfertaContexto } from "./escalera";
import { elegirCandidatos } from "./escalera";
import { aplicarEscalera, cadenaPorPapel, opcionesRankingDe } from "./aplicar-escalera";
import type { RankCandidatesOptions, RouteCandidate } from "@/ai/astraura/router";
import type { PlanRuta, PapelRuta } from "@/lib/mando/enrutamiento";
import { esPapel } from "./api-conectores";
import { sugerirParaAmbito, type GrupoSugerencias } from "./sugerir";

const PRIVACIDADES: readonly Privacidad[] = ["local", "nube-sin-retencion", "nube-con-retencion", "desconocida"];
const RANGO: Record<Privacidad, number> = {
  local: 0,
  "nube-sin-retencion": 1,
  "nube-con-retencion": 2,
  desconocida: 3,
};

export interface FilaAsignacion {
  clave: unknown;
  cadena: unknown;
}

export interface EntradaVista {
  ambito: string;
  catalogo: OpcionCatalogo[];
  filas: readonly FilaAsignacion[];
  vinculadas: ReadonlySet<string>;
  contenedores: readonly ContenedorOpcion[];
  ofertas?: readonly OfertaContexto[];
}

export interface VistaOpciones {
  ambito: string;
  catalogo: OpcionCatalogo[];
  sugerencias: GrupoSugerencias[];
  asignaciones: Asignacion<Papel>[];
  /** Orden de preferencia por papel (adaptador GCA1019G): lo que entienden el enrutador de Astraura y la cadena del enjambre. */
  preferenciasOrdenadas: VistaPreferencia[];
}

/** Un papel con su orden de preferencia ya traducido a los formatos existentes. */
export interface VistaPreferencia {
  papel: Papel;
  /** Rutas candidatas en el orden del peldaño (`aplicarEscalera`); las prohibidas no aparecen. */
  rutas: RouteCandidate[];
  /** Restricción para `rankCandidates` del enrutador (solo puede negar el pago). */
  opciones: RankCandidatesOptions;
  /** Cadena por papel del enjambre (`cadenaPorPapel`); `null` en papeles que la cadena no distingue. */
  cadena: PlanRuta | null;
}

/** Papel del enjambre que cada papel del catálogo puede enlazar (solo hay cadena para estos tres). */
function papelRutaDe(clave: Papel): PapelRuta | null {
  if (clave === "escritor") return "escritor";
  if (clave === "revisor") return "revisor";
  return null; // la cadena del enjambre solo distingue escritor, revisor y director; al director del ámbito no lo mapea el catálogo
}


function textos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, 200));
}

function partesDe(cadena: unknown): { cadena: string[]; respaldo: string[] } {
  if (typeof cadena === "string") {
    const unica = cadena.trim().slice(0, 200);
    return { cadena: unica ? [unica] : [], respaldo: [] };
  }
  if (Array.isArray(cadena)) return { cadena: textos(cadena), respaldo: [] };
  if (cadena && typeof cadena === "object") {
    const objeto = cadena as Record<string, unknown>;
    return { cadena: textos(objeto.cadena), respaldo: textos(objeto.respaldo) };
  }
  return { cadena: [], respaldo: [] };
}

function preferenciasDe(cadena: unknown): Preferencias {
  const objeto = cadena && typeof cadena === "object" ? (cadena as Record<string, unknown>) : {};
  const bruta = objeto.privacidad;
  const privacidad = typeof bruta === "string" && (PRIVACIDADES as readonly string[]).includes(bruta)
    ? (bruta as Privacidad)
    : "desconocida";
  const bruto = objeto.presupuesto;
  const presupuesto = typeof bruto === "number" && Number.isFinite(bruto) && bruto >= 0 ? bruto : null;
  return { localPrimero: objeto.localPrimero !== false, privacidad, presupuesto };
}

export function asignacionesDesdeFilas(filas: readonly FilaAsignacion[]): Asignacion<Papel>[] {
  const porPapel = new Map<Papel, Asignacion<Papel>>();
  for (const fila of filas) {
    if (!esPapel(fila.clave)) continue;
    const partes = partesDe(fila.cadena);
    const previa = porPapel.get(fila.clave);
    porPapel.set(fila.clave, {
      clave: fila.clave,
      cadena: [...new Set([...(previa?.cadena ?? []), ...partes.cadena])],
      respaldo: [...new Set([...(previa?.respaldo ?? []), ...partes.respaldo])],
      preferencias: previa?.preferencias ?? preferenciasDe(fila.cadena),
    });
  }
  return [...porPapel.values()];
}

export function filtrarCatalogo(
  catalogo: OpcionCatalogo[],
  asignaciones: readonly Asignacion<Papel>[],
): OpcionCatalogo[] {
  if (asignaciones.length === 0) return [...catalogo];
  const admitidos = [...new Set(asignaciones.map((a) => RANGO[a.preferencias.privacidad]))];
  return catalogo.filter((opcion) => admitidos.some((limite) => RANGO[opcion.privacidad] <= limite));
}

export function ofertasDeCatalogo(catalogo: readonly OpcionCatalogo[]): OfertaContexto[] {
  return catalogo
    .filter((opcion) => opcion.privacidad === "local")
    .map((opcion) => ({ id: opcion.id, nombre: opcion.nombre, tipo: opcion.tipo, papel: [...opcion.papeles] }));
}

export function vistaOpciones(entrada: EntradaVista): VistaOpciones {
  const asignaciones = asignacionesDesdeFilas(entrada.filas);
  const catalogo = filtrarCatalogo(entrada.catalogo, asignaciones);
  const ofertas = entrada.ofertas ?? ofertasDeCatalogo(entrada.catalogo);
  const sugerencias = sugerirParaAmbito({
    asignaciones,
    catalogo,
    ofertas: [...ofertas],
    vinculadas: entrada.vinculadas,
    contenedores: [...entrada.contenedores],
  });
  return { ambito: entrada.ambito, catalogo, sugerencias, asignaciones, preferenciasOrdenadas: ordenDePreferencia(asignaciones, catalogo, ofertas, entrada.vinculadas) };
}

/**
 * Orden de preferencia por papel Ola 1019G · GCA1019G, con los formatos que ya
 * existen: la escalera (`elegirCandidatos`) pasa por el adaptador
 * (`aplicarEscalera` / `opcionesRankingDe`) hacia el enrutador de Astraura y
 * por `cadenaPorPapel` hacia la cadena del enjambre. PURO de aquí para abajo:
 * sin reloj ni salud, que quien llame con ellos las aporte.
 */
function ordenDePreferencia(
  asignaciones: readonly Asignacion<Papel>[],
  catalogo: readonly OpcionCatalogo[],
  ofertas: readonly OfertaContexto[],
  vinculadas: ReadonlySet<string>,
): VistaPreferencia[] {
  const preferenciasOrdenadas: VistaPreferencia[] = [];
  for (const asignacion of asignaciones) {
    // Tarea del papel; sin medida de tamaño todavía (la escalera no la usa).
    const tarea = { papel: asignacion.clave, privado: false, tamano: 0 };
    const preferenciasEscalera = {
      permitirPago: (asignacion.preferencias.presupuesto ?? 0) > 0,
      topeDiario: asignacion.preferencias.presupuesto,
      // Las prohibidas del ámbito se defienden en la puerta del adaptador.
      prohibidos: [] as string[],
    };
    const candidatas = elegirCandidatos({
      tarea,
      ofertas: [...ofertas],
      catalogo: [...catalogo],
      vinculadas: new Set(vinculadas),
      preferencias: preferenciasEscalera,
    });
    preferenciasOrdenadas.push({
      papel: asignacion.clave,
      rutas: aplicarEscalera({ candidatas, catalogo: [...catalogo], prohibidos: preferenciasEscalera.prohibidos }),
      opciones: opcionesRankingDe(preferenciasEscalera),
      cadena: (() => {
        const papelRuta = papelRutaDe(asignacion.clave);
        return papelRuta ? cadenaPorPapel({ candidatas, catalogo: [...catalogo], papel: papelRuta }) : null;
      })(),
    });
  }
  return preferenciasOrdenadas;
}
