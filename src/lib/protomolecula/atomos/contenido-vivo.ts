/**
 * Protomolécula · Átomo «Contenido vivo» (CVV1028F). Publicación viva de tres niveles
 * (contrato architecture/contenido-vivo.md §1, tarea F).
 *
 * No ejecuta nada externo: arma el PLAN con la ruta que `elegirRuta` (CVV1028B) elige para
 * cada tarea, la cotiza en créditos por servicio y pide el «sí» si el plan gasta créditos.
 *
 * La vista (molécula «publicación viva», contrato §2) va como componente en
 * `vista-contenido-vivo.tsx`, registrado en `VISTAS_COMPONENTE`: es la interfaz que muestra
 * el plan de esta función y pide el «sí».
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { NivelVivo, TareaViva, TipoRuta } from "@/lib/contenido-vivo/tipos";
import type { AlcanceVivo, ContextoVivo } from "@/lib/contenido-vivo/rutas";
import { elegirRuta } from "@/lib/contenido-vivo/rutas";

/** Definición del átomo en el registro de la Protomolécula (§11.1). */
export const CONTENIDO_VIVO: DefinicionAtomo = {
  herramientaId: "contenido-vivo",
  nombre: "Contenido vivo (tres niveles)",
  categoria: "arquitectura",
  integracion: "servicio-local",
  control: "total",
  vista: { tipo: "componente", id: "contenido-vivo" },
  parametros: [
    { id: "niveles", nombre: "Niveles activos", tipo: "numero", min: 0, max: 3, paso: 1, unidad: "x", defecto: 1, sinonimos: ["nivel"] },
    { id: "movimiento", nombre: "Interruptor de movimiento", tipo: "booleano", defecto: true, sinonimos: ["animacion"] },
    { id: "escudo-3d", nombre: "Escudo de escena 3D", tipo: "booleano", defecto: true, sinonimos: ["proteccion"] },
  ],
  entradas: ["texto", "png", "mp4"],
  salidas: ["texto"],
};

/** Las tareas del nivel, tal como vienen de la publicación. */
export interface TareasDeNivel {
  nivel: NivelVivo;
  tareas: TareaViva[];
}

/** Lo que entra al átomo: la publicación y sus tareas por nivel, con el contexto del ámbito. */
export interface EntradaContenidoVivo {
  publicacion: string;
  niveles: NivelVivo[];
  tareasPorNivel: TareasDeNivel[];
  contexto: ContextoVivo;
}

/** Un paso del plan: una tarea con la ruta elegida para ella (o marcada sin ruta). */
export interface PasoPlanVivo {
  nivel: NivelVivo;
  tarea: TareaViva;
  rutaId: string | null;
  rutaNombre: string;
  tipo: TipoRuta | null;
  creditos: number;
  razon: string;
  enlaceConectar?: string;
}

/** Créditos acumulados de un servicio externo. */
export interface CotizacionServicio {
  servicio: string;
  creditos: number;
}

/** El plan completo que la interfaz muestra antes de pedir el «sí». */
export interface PlanContenidoVivo {
  publicacion: string;
  niveles: NivelVivo[];
  pasos: PasoPlanVivo[];
  cotizacion: CotizacionServicio[];
  totalCreditos: number;
  necesitaConfirmar: boolean;
}

/** Arma el plan pidiendo a `elegirRuta` la ruta de cada tarea. Puro, sin efectos. */
export function planContenidoVivo(entrada: EntradaContenidoVivo): PlanContenidoVivo {
  const cotizacion: CotizacionServicio[] = [];
  const pasos: PasoPlanVivo[] = [];
  for (const grupo of entrada.tareasPorNivel) {
    for (const tarea of grupo.tareas) {
      pasos.push(pasoDe(tarea, grupo.nivel, entrada.contexto, cotizacion));
    }
  }
  const totalCreditos = cotizacion.reduce((total, c) => total + c.creditos, 0);
  return {
    publicacion: entrada.publicacion,
    niveles: [...entrada.niveles],
    pasos,
    cotizacion,
    totalCreditos,
    necesitaConfirmar: totalCreditos > 0,
  };
}

/** Resuelve una tarea, acumula su cotización y devuelve el paso del plan. */
function pasoDe(tarea: TareaViva, nivel: NivelVivo, contexto: ContextoVivo, cotizacion: CotizacionServicio[]): PasoPlanVivo {
  const elegida = elegirRuta(tarea, contexto);
  if (!elegida) {
    return {
      nivel, tarea, rutaId: null, rutaNombre: "Sin ruta disponible", tipo: null, creditos: 0,
      razon: `Sin ruta disponible para ${tarea} en este ámbito.`,
    };
  }
  const ruta = elegida.ruta;
  if (ruta.creditosPorUnidad > 0) cotizar(cotizacion, servicioDe(ruta.id), ruta.creditosPorUnidad);
  return {
    nivel, tarea,
    rutaId: ruta.id,
    rutaNombre: ruta.nombre,
    tipo: ruta.tipo,
    creditos: ruta.creditosPorUnidad,
    razon: elegida.razon,
    enlaceConectar: ruta.enlaceConectar,
  };
}

/** Servicio de una ruta: la parte de su id anterior al primer guión (`higgsfield-…`). */
function servicioDe(rutaId: string): string {
  return rutaId.split("-")[0];
}

/** Acumula los créditos de un servicio en la cotización del plan. */
function cotizar(cotizacion: CotizacionServicio[], servicio: string, creditos: number): void {
  const previa = cotizacion.find((c) => c.servicio === servicio);
  if (previa) previa.creditos += creditos;
  else cotizacion.push({ servicio, creditos });
}

/* ── Entrada de la vista (la interfaz "publicación viva") ── */

/**
 * Tope provisional de cotización mientras el ámbito no guarde sus ajustes (tarea C). Con él
 * el plan puede cotizar y pedir el «sí»; el gasto real lo aprueba quien confirme, contra el
 * tope real del ámbito en el libro de créditos.
 */
export const TOPE_INICIAL = 100;

/** Las tareas que trae cada nivel de fábrica (contrato §3). */
export const TAREAS_DEL_NIVEL: Record<NivelVivo, readonly TareaViva[]> = {
  1: ["escena-3d"],
  2: ["fotograma-clave", "foto", "clip-pelicula", "foto-viva"],
  3: ["grafico-vivo"],
};

/** Arma la entrada del plan por niveles con los valores del átomo, el alcance y el equipo. Puro. */
export function entradaDeVista(
  valores: Record<string, unknown> | undefined,
  alcance: AlcanceVivo,
  conectados: string[],
  capaz3d: boolean,
): EntradaContenidoVivo {
  const pedido = typeof valores?.niveles === "number" && Number.isFinite(valores.niveles) ? Math.floor(valores.niveles) : 1;
  const niveles = Array.from({ length: Math.max(0, Math.min(3, pedido)) }, (_, i) => (i + 1) as NivelVivo);
  const tareasPorNivel = niveles
    .map((nivel) => ({ nivel, tareas: [...TAREAS_DEL_NIVEL[nivel]] }))
    .filter((grupo) => grupo.tareas.length > 0);
  const publicacion = typeof valores?.publicacion === "string" && valores.publicacion.trim() !== "" ? valores.publicacion : "Esta publicación";
  return {
    publicacion,
    niveles,
    tareasPorNivel,
    contexto: {
      alcance,
      conectados: [...conectados],
      cupoHoy: {},
      creditosDisponibles: TOPE_INICIAL,
      topeMes: TOPE_INICIAL,
      gastadoMes: 0,
      neurona: { gpu: false, capaz3d },
      ajustes: { localPrimero: true, externosPermitidos: true },
    },
  };
}
