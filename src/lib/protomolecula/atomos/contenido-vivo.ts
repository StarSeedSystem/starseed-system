/**
 * Protomolécula · Átomo «Contenido vivo» (CVV1028F). Arma el plan de una publicación
 * viva de tres niveles con la ruta elegida por tarea (CVV1028B) y su cotización.
 * No ejecuta nada externo: deja el plan para que la interfaz pida el «sí».
 * Contrato: architecture/contenido-vivo.md §2 y §3.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import { TAREAS_VIVAS } from "@/lib/contenido-vivo/catalogo-rutas";
import { elegirRuta, type CandidatoRuta, type ContextoVivo } from "@/lib/contenido-vivo/rutas";
import type { NivelVivo, Ruta, TareaViva } from "@/lib/contenido-vivo/tipos";

/** Lo mínimo de la publicación que el plan conserva. */
export interface PublicacionViva { id: string; titulo: string; tipo?: string; }
/** Una tarea pedida, con su nivel y cuántas unidades hacen falta. */
export interface TareaPedidaViva { tarea: TareaViva; nivel?: NivelVivo; cantidad?: number; }
/** Entrada del plan: la publicación, sus niveles y las tareas de cada nivel. */
export interface EntradaContenidoVivo {
  publicacion: PublicacionViva; niveles: NivelVivo[]; tareas: TareaPedidaViva[]; contexto: ContextoVivo;
}
/** Una tarea ya resuelta: ruta elegida, coste y si se puede ejecutar. */
export interface TareaPlanificada {
  tarea: TareaViva; nivel: NivelVivo; cantidad: number; ruta: CandidatoRuta | null; creditos: number; ejecutable: boolean;
}
/** Créditos sumados por servicio externo. */
export interface CotizacionServicio { servicio: string; creditos: number; }
/** El plan completo que la interfaz muestra y confirma. */
export interface PlanContenidoVivo {
  publicacion: PublicacionViva; niveles: NivelVivo[]; tareas: TareaPlanificada[];
  cotizacion: CotizacionServicio[]; creditosTotales: number; necesitaConfirmar: boolean; avisos: string[];
}

/** Nivel natural de cada tarea cuando quien pide no lo dice. */
export function nivelDeTarea(tarea: TareaViva): NivelVivo {
  return tarea === "escena-3d" ? 1 : tarea === "grafico-vivo" || tarea === "revision-texto" || tarea === "comprobacion" ? 3 : 2;
}
/** Servicio que agrupa la cotización; las rutas locales no gastan créditos. */
export function servicioDeRuta(ruta: Ruta): string {
  return ruta.tipo === "local" ? "local" : ruta.id.split("-")[0];
}

/** Deja los niveles válidos, sin repetir y en orden 1, 2, 3. */
function normalizarNiveles(niveles: readonly NivelVivo[]): NivelVivo[] {
  const vistos = new Set<NivelVivo>();
  for (const nivel of niveles) if (nivel === 1 || nivel === 2 || nivel === 3) vistos.add(nivel);
  return ([1, 2, 3] as NivelVivo[]).filter((nivel) => vistos.has(nivel));
}
/** Una cantidad entera y acotada; sin dato, una unidad. */
function cantidadValida(valor: number | undefined): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 1;
  return Math.min(100, Math.max(1, Math.floor(valor)));
}
/** Créditos de la tarea; las rutas locales o sin coste dan cero. */
function creditosDe(ruta: Ruta, cantidad: number): number {
  if (!Number.isFinite(ruta.creditosPorUnidad) || ruta.creditosPorUnidad <= 0) return 0;
  return ruta.creditosPorUnidad * cantidad;
}

export function cotizar(tareas: readonly TareaPlanificada[]): CotizacionServicio[] {
  const totales = new Map<string, number>();
  for (const tarea of tareas) {
    if (!tarea.ruta || tarea.creditos <= 0) continue;
    const servicio = servicioDeRuta(tarea.ruta.ruta);
    totales.set(servicio, (totales.get(servicio) ?? 0) + tarea.creditos);
  }
  return [...totales].map(([servicio, creditos]) => ({ servicio, creditos }));
}

export function planContenidoVivo(entrada: EntradaContenidoVivo): PlanContenidoVivo {
  const niveles = normalizarNiveles(entrada.niveles);
  const tareas: TareaPlanificada[] = [];
  const avisos: string[] = [];
  for (const pedida of entrada.tareas ?? []) {
    if (!TAREAS_VIVAS.includes(pedida.tarea)) {
      avisos.push(`Se ignora la tarea desconocida «${String(pedida.tarea)}».`);
      continue;
    }
    const nivel = pedida.nivel ?? nivelDeTarea(pedida.tarea);
    if (!niveles.includes(nivel)) {
      avisos.push(`Se ignora «${pedida.tarea}»: su nivel ${nivel} no está en el plan.`);
      continue;
    }
    const cantidad = cantidadValida(pedida.cantidad);
    const elegida = elegirRuta(pedida.tarea, entrada.contexto);
    if (!elegida) {
      tareas.push({ tarea: pedida.tarea, nivel, cantidad, ruta: null, creditos: 0, ejecutable: false });
      avisos.push(`No hay ruta disponible para «${pedida.tarea}» en este ámbito.`);
      continue;
    }
    tareas.push({ tarea: pedida.tarea, nivel, cantidad, ruta: elegida, creditos: creditosDe(elegida.ruta, cantidad), ejecutable: true });
  }
  const cotizacion = cotizar(tareas);
  const creditosTotales = cotizacion.reduce((total, servicio) => total + servicio.creditos, 0);
  return {
    publicacion: entrada.publicacion, niveles, tareas, cotizacion, creditosTotales, necesitaConfirmar: creditosTotales > 0, avisos,
  };
}

export const CONTENIDO_VIVO: DefinicionAtomo = {
  herramientaId: "contenido-vivo",
  nombre: "Contenido vivo (tres niveles)",
  categoria: "video",
  integracion: "servicio-local",
  control: "total",
  parametros: [
    { id: "nivel", nombre: "Nivel", tipo: "opcion", opciones: ["1", "2", "3"], defecto: "1", sinonimos: ["nivel vivo"] },
    { id: "tarea", nombre: "Tarea", tipo: "opcion", opciones: [...TAREAS_VIVAS], defecto: "escena-3d", sinonimos: ["pieza"] },
    { id: "cantidad", nombre: "Cantidad", tipo: "entero", min: 1, max: 100, paso: 1, defecto: 1, sinonimos: ["unidades"] },
    { id: "local-primero", nombre: "Local primero", tipo: "booleano", defecto: true, sinonimos: ["local"] },
    { id: "externos-permitidos", nombre: "Servicios externos", tipo: "booleano", defecto: true, sinonimos: ["externo"] },
    { id: "tope-creditos", nombre: "Tope de créditos al mes", tipo: "numero", min: 0, max: 1000000, paso: 1, defecto: 0, sinonimos: ["tope"] },
  ],
  entradas: ["texto", "imagen", "vídeo", "datos"],
  salidas: ["plan"],
};
