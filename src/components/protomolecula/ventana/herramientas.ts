/**
 * Ventana de la Protomolécula · herramientas adaptativas (puro). De 6 a 9 acciones que cambian con lo que la
 * persona tiene delante. Regla de la ola: ninguna sin destino real. Cada una hace una de cuatro cosas:
 *   · rellena la barra de petición para que Astraura la planifique (la persona termina la frase);
 *   · lanza un plan hecho con el vocabulario CERRADO del contrato (no gasta IA);
 *   · abre el lienzo completo; o
 *   · lleva a otra pestaña de esta misma ventana.
 */
import type { ContextoProto, EntidadProto, OperacionPedida, PlanPeticion, TipoCambioProto } from "@/lib/protomolecula/peticion/contrato";
import { entidadGobernante, etiquetaSeleccion, nombreEntidad } from "./contexto";
import type { HerramientaVentana } from "./tipos";

export const MIN_HERRAMIENTAS = 6;
export const MAX_HERRAMIENTAS = 9;
const DEL: Record<"grupo" | "comunidad" | "pagina", string> = { grupo: "del grupo", comunidad: "de la comunidad", pagina: "de la página" };
const MOTOR_HERRAMIENTA = "herramienta de la ventana (sin IA)";

function plan(resumen: string, tipoCambio: TipoCambioProto, pasos: OperacionPedida[]): PlanPeticion {
  return { resumen, tipoCambio, pasos, fuera: [], motor: MOTOR_HERRAMIENTA };
}

/** Un plan que solo abre una vista no cambia nada de nadie: no pasa por el gobierno ni pide confirmar. */
export const esPlanSoloDeApertura = (p: PlanPeticion): boolean => p.pasos.length > 0 && p.pasos.every((s) => s.tipo === "abrir-en");

/** Lo que va en `que` al abrir algo: el nombre de lo que hay delante (o su tipo e id). */
const referencia = (e: EntidadProto | undefined): string | undefined => (e ? nombreEntidad(e) : undefined);

function lasDeSiempre(c: ContextoProto): HerramientaVentana[] {
  const donde = referencia(c.entidad);
  return [
    { id: "objeto3d", nombre: "Objeto 3D animado", ayuda: "Describe un objeto 3D y Astraura lo crea con movimiento.", icono: "objeto3d",
      accion: { tipo: "rellenar", texto: "Crea un objeto 3D animado: " } },
    { id: "imagen", nombre: "Imagen", ayuda: "Genera una imagen con la IA de imágenes local (o la que haya).", icono: "imagen",
      accion: { tipo: "rellenar", texto: "Genera una imagen de " } },
    { id: "fondo", nombre: "Fondo", ayuda: "Cambia el fondo de lo que tienes delante.", icono: "fondo",
      accion: { tipo: "rellenar", texto: "Pon de fondo " } },
    { id: "pizarra", nombre: "Abrir en pizarra", ayuda: "Lo abre en una pizarra para trabajarlo a la vista de todos.", icono: "pizarra",
      accion: { tipo: "plan", plan: plan("Abrir en una pizarra", "creacion", [{ tipo: "abrir-en", donde: "pizarra", ...(donde ? { que: donde } : {}) }]) } },
    { id: "xr", nombre: "Abrir en XR", ayuda: "Lo abre en realidad virtual o aumentada, si tu aparato la tiene.", icono: "xr",
      accion: { tipo: "plan", plan: plan("Abrir en XR", "creacion", [{ tipo: "abrir-en", donde: "xr", ...(donde ? { que: donde } : {}) }]) } },
    { id: "lienzo", nombre: "Abrir el lienzo", ayuda: "El lienzo completo de la Protomolécula (sales de lo que estás haciendo).", icono: "lienzo",
      accion: { tipo: "lienzo" } },
  ];
}

/** Las que dependen de lo que hay delante. Si repiten un `id` de las de siempre, la sustituyen. */
function lasDelContexto(c: ContextoProto): HerramientaVentana[] {
  const e = c.entidad;
  const out: HerramientaVentana[] = [];
  if (!e) {
    out.push({ id: "diseno", nombre: "Rediseñar esta pantalla", ayuda: "Pide un cambio de diseño o de funciones de lo que ves.", icono: "diseno",
      accion: { tipo: "rellenar", texto: "Cambia el diseño de esta pantalla: " } });
    return out;
  }
  const nombre = nombreEntidad(e);
  switch (e.tipo) {
    case "publicacion":
      out.push(
        { id: "rama", nombre: "Editar en una rama", ayuda: "Tu cambio vive aparte hasta que lo aceptes; la publicación original no se toca.", icono: "rama",
          accion: { tipo: "rellenar", texto: "Edita esta publicación: ", modo: "rama" } },
        { id: "objeto3d", nombre: "Añadir objeto 3D", ayuda: "Crea un objeto 3D animado y lo añade a esta publicación.", icono: "objeto3d",
          accion: { tipo: "rellenar", texto: "Añade a esta publicación un objeto 3D animado de " } },
        { id: "imagen", nombre: "Añadir imagen", ayuda: "Genera una imagen y la añade a esta publicación.", icono: "imagen",
          accion: { tipo: "rellenar", texto: "Añade a esta publicación una imagen de " } },
        { id: "molecula", nombre: "Insertar molécula", ayuda: "Inserta una molécula de la Protomolécula en esta publicación.", icono: "molecula",
          accion: { tipo: "plan", plan: plan(`Insertar una molécula en ${nombre}`, "contenido", [{ tipo: "insertar-en", destino: e, que: "una molécula de la Protomolécula" }]) } },
      );
      break;
    case "grupo":
    case "comunidad":
    case "pagina": {
      const del = DEL[e.tipo];
      out.push(
        { id: "propuesta", nombre: "Proponer cambio de diseño", ayuda: `Lo que cambie aquí lo decide el gobierno de ${nombre}: se propone o se vota según sus reglas.`, icono: "propuesta",
          accion: { tipo: "rellenar", texto: `Propongo cambiar el diseño de ${nombre}: ` } },
        { id: "pizarra", nombre: `Pizarra ${del}`, ayuda: `Abre la pizarra compartida de ${nombre}.`, icono: "pizarra",
          accion: { tipo: "plan", plan: plan(`Abrir la pizarra de ${nombre}`, "creacion", [{ tipo: "abrir-en", donde: "pizarra", que: nombre }]) } },
        { id: "gobierno", nombre: "Reglas y privacidad", ayuda: "Quién puede usar y cambiar la Protomolécula de esta entidad.", icono: "gobierno",
          accion: { tipo: "pestana", destino: "gobierno" } },
      );
      break;
    }
    case "archivo":
      out.push(
        { id: "convertir", nombre: "Convertir archivo", ayuda: "Convierte este archivo a otro formato.", icono: "convertir",
          accion: { tipo: "rellenar", texto: "Convierte este archivo a " } },
        { id: "rama", nombre: "Editar en una rama", ayuda: "Tu cambio vive aparte hasta que lo aceptes; el archivo original no se toca.", icono: "rama",
          accion: { tipo: "rellenar", texto: "Edita este archivo: ", modo: "rama" } },
      );
      break;
    case "mensaje":
      out.push({ id: "mensaje", nombre: "Reescribir mensaje", ayuda: "Pide a Astraura que reescriba este mensaje.", icono: "mensaje",
        accion: { tipo: "rellenar", texto: "Reescribe este mensaje: " } });
      break;
    case "pizarra":
    case "escritorio":
    case "widget":
      out.push(
        { id: "molecula", nombre: "Insertar molécula", ayuda: `Inserta una molécula de la Protomolécula en ${nombre}.`, icono: "molecula",
          accion: { tipo: "plan", plan: plan(`Insertar una molécula en ${nombre}`, "contenido", [{ tipo: "insertar-en", destino: e, que: "una molécula de la Protomolécula" }]) } },
        { id: "diseno", nombre: "Rediseñar", ayuda: "Pide un cambio de diseño o de funciones de esto.", icono: "diseno",
          accion: { tipo: "rellenar", texto: `Cambia el diseño de ${nombre}: ` } },
      );
      break;
    case "molecula":
      out.push({ id: "orden", nombre: "Dar una orden", ayuda: "Una orden a los controles de la molécula: «sube la mezcla un 10 %».", icono: "orden",
        accion: { tipo: "rellenar", texto: "Ajusta la molécula: " } });
      break;
    case "perfil":
      out.push({ id: "diseno", nombre: "Rediseñar mi perfil", ayuda: "Cambia el diseño o las funciones de este perfil.", icono: "diseno",
        accion: { tipo: "rellenar", texto: "Cambia el diseño de mi perfil: " } });
      break;
  }
  return out;
}

/**
 * Las herramientas de ESTE contexto, entre 6 y 9. Lo seleccionado (un bloque, una imagen…) añade «Retocar la
 * selección». Una herramienta del contexto con el mismo `id` que una de las de siempre la sustituye.
 */
export function herramientasPara(c: ContextoProto): HerramientaVentana[] {
  const propias = lasDelContexto(c);
  const ids = new Set(propias.map((h) => h.id));
  const generales = lasDeSiempre(c).filter((h) => !ids.has(h.id));
  const lista: HerramientaVentana[] = [];
  if (c.seleccion) {
    lista.push({ id: "seleccion", nombre: "Retocar la selección", ayuda: `Cambia lo seleccionado (${etiquetaSeleccion(c.seleccion)}).`, icono: "seleccion",
      accion: { tipo: "rellenar", texto: `Cambia la selección (${etiquetaSeleccion(c.seleccion)}): ` } });
  }
  lista.push(...propias, ...generales);
  // Si el contexto trae pocas propias, las de siempre rellenan hasta el mínimo; nunca pasa de nueve.
  return lista.slice(0, MAX_HERRAMIENTAS);
}

/** Una frase de ayuda para la barra, según lo que hay delante. */
export function sugerenciaPara(c: ContextoProto): string {
  const e = c.entidad;
  const gobierna = entidadGobernante(c);
  if (!e) return "Pídele a Astraura lo que quieras: un objeto 3D animado, un fondo, un cambio de diseño…";
  if (e.tipo === "publicacion") return "Pide un cambio a esta publicación, una imagen, un objeto 3D animado…";
  if (e.tipo === "archivo") return "Pide convertir o editar este archivo (mejor en una rama)…";
  if (gobierna) return `Pide un cambio para ${nombreEntidad(gobierna)}: se decidirá según sus reglas…`;
  return `Pídele a Astraura algo para ${nombreEntidad(e)}…`;
}
