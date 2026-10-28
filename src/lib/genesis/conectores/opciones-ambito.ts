import type { Asignacion, Preferencias } from "./asignaciones";
import type { OpcionCatalogo, Papel, Privacidad } from "./catalogo-opciones";
import type { ContenedorOpcion } from "./contenedores";
import type { OfertaContexto } from "./escalera";
import { elegirCandidatos } from "./escalera";
import { aplicarEscalera, type SalidaEscalera } from "./aplicar-escalera";
import type { PapelRuta } from "@/lib/mando/enrutamiento";
import { esPapel } from "./api-conectores";
import { sugerirParaAmbito, type GrupoSugerencias } from "./sugerir";

/** Papel de la cadena del enjambre que sirve cada clave de asignación
 * (los generales de chat dirigen, como ya declara `enrutamiento.ts`). */
const PAPEL_RUTA_POR_CLAVE: Partial<Record<Papel, PapelRuta>> = {
  escritor: "escritor",
  revisor: "revisor",
  chat: "director",
};

/** Un paso de la cadena, por papel: candidatas aplicadas y sus eslabones. */
export interface EscaleraDeRol {
  /** Clave de asignación tal cual la usa el panel (papel del catálogo). */
  clave: Papel;
  /** Papel de la cadena del enjambre (de `enrutamiento.ts`). */
  papel: PapelRuta;
  /** Candidatas traducidas al enrutador de Astraura, su preferencia primero. */
  rutas: SalidaEscalera["rutas"];
  /** La cadena por papel: quién va en cada sitio y por qué. */
  cadena: SalidaEscalera["cadena"];
}

/** Aplica la escalera a un papel del enjambre: elige candidatas por asignación
 * (con el permiso de pago del propio papel) y las traduce a sus eslabones. */
function escaleraDeRol(
  asignacion: Asignacion<Papel>,
  catalogo: OpcionCatalogo[],
  ofertas: OfertaContexto[],
  vinculadas: ReadonlySet<string>,
): EscaleraDeRol | null {
  const papelRuta = PAPEL_RUTA_POR_CLAVE[asignacion.clave];
  if (!papelRuta) return null;
  const presupuesto = asignacion.preferencias.presupuesto ?? 0;
  const candidatas = elegirCandidatos({
    tarea: { papel: asignacion.clave, privado: false, tamano: 0 },
    ofertas,
    catalogo,
    vinculadas: new Set(vinculadas),
    preferencias: {
      permitirPago: presupuesto > 0,
      topeDiario: presupuesto > 0 ? presupuesto : null,
      prohibidos: [],
    },
  });
  const salida = aplicarEscalera({ candidatas, catalogo, papel: papelRuta });
  return { clave: asignacion.clave, papel: papelRuta, rutas: salida.rutas, cadena: salida.cadena };
}

/** La escalera aplicada a los papeles del enjambre que estén asignados. */
function escalerasDe(
  asignaciones: readonly Asignacion<Papel>[],
  catalogo: OpcionCatalogo[],
  ofertas: OfertaContexto[],
  vinculadas: ReadonlySet<string>,
): EscaleraDeRol[] {
  const escaleras: EscaleraDeRol[] = [];
  for (const asignacion of asignaciones) {
    const escalera = escaleraDeRol(asignacion, catalogo, ofertas, vinculadas);
    if (escalera) escaleras.push(escalera);
  }
  return escaleras;
}

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
  /** Escalera aplicada por papel del enjambre: candidatas y cadena por rol. */
  escaleras: EscaleraDeRol[];
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
  const ofertasContexto: OfertaContexto[] = [...ofertas];
  const escaleras = escalerasDe(asignaciones, catalogo, ofertasContexto, entrada.vinculadas);
  const sugerencias = sugerirParaAmbito({
    asignaciones,
    catalogo,
    ofertas: [...ofertas],
    vinculadas: entrada.vinculadas,
    contenedores: [...entrada.contenedores],
  });
  return { ambito: entrada.ambito, catalogo, sugerencias, asignaciones, escaleras };
}
