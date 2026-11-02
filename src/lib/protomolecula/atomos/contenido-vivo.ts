/**
 * Protomolécula · Átomo «Contenido vivo» (CVV1028F, tarea F): publicación viva de
 * tres niveles. Contrato: architecture/contenido-vivo.md §1, §3 y §7.
 *
 * Puro y sin red: recibe la publicación, los niveles y sus tareas, consulta
 * `elegirRuta` (tarea B) por cada una y arma el PLAN sin ejecutar nada externo.
 * Cotiza los créditos por servicio y marca `necesitaConfirmar` si hay gasto,
 * para que la interfaz pida el «sí»: jamás se gasta sin cotizar y sin un sí.
 */
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import type { NivelVivo, TareaViva } from "@/lib/contenido-vivo/tipos";
import { elegirRuta, type ContextoVivo } from "@/lib/contenido-vivo/rutas";

export const CONTENIDO_VIVO: DefinicionAtomo = {
  herramientaId: "contenido-vivo",
  nombre: "Contenido vivo (publicación viva)",
  categoria: "arquitectura",
  integracion: "libreria-js",
  control: "ventana",
  parametros: [
    { id: "niveles", nombre: "Niveles vivos", tipo: "numero", min: 1, max: 3, paso: 1, unidad: "x", defecto: 3, sinonimos: ["nivel", "niveles"] },
    { id: "movimiento", nombre: "Interruptor de movimiento", tipo: "opcion", opciones: ["apagado", "encendido", "rayos-x"], defecto: "encendido", sinonimos: ["movimiento", "modo"] },
  ],
  entradas: ["texto", "imagen", "voz"],
  salidas: ["plan"],
};

/** Las tareas que se planifican de un mismo nivel de una publicación. */
export interface TareasDeNivel {
  nivel: NivelVivo;
  tareas: TareaViva[];
}

/** Entrada del átomo: publicación, niveles y tareas por nivel (contrato §2). */
export interface EntradaContenidoVivo {
  /** Identificador o título de la publicación que se hace viva. */
  publicacion: string;
  niveles: NivelVivo[];
  tareas: TareasDeNivel[];
  /** Ámbito (cuenta, página o grupo) con el que se eligen las rutas. */
  contexto: ContextoVivo;
}

/** Una tarea del plan, con la ruta elegida, sus créditos y la razón escrita. */
export interface TareaPlanificada {
  nivel: NivelVivo;
  tarea: TareaViva;
  rutaId: string;
  rutaNombre: string;
  tipo: "local" | "externo";
  creditos: number;
  unidad: string;
  razon: string;
}

/** Plan de la publicación viva: rutas, cotización por servicio y confirmación pendiente. */
export interface PlanContenidoVivo {
  publicacion: string;
  tareas: TareaPlanificada[];
  /** Tareas que el ámbito no puede servir; la interfaz lo explica, no se inventa nada. */
  sinRuta: { nivel: NivelVivo; tarea: TareaViva; motivo: string }[];
  /** Créditos acumulados por servicio, solo de lo que cuesta algo. */
  creditosPorServicio: Record<string, number>;
  creditosTotales: number;
  /** La interfaz pide el «sí» antes de gastar un solo crédito. */
  necesitaConfirmar: boolean;
}

/** Planifica la publicación viva: ruta por tarea, cotización total y el «sí» pendiente. Puro. */
export function planificarContenidoVivo(entrada: EntradaContenidoVivo): PlanContenidoVivo {
  const tareas: TareaPlanificada[] = [];
  const sinRuta: PlanContenidoVivo["sinRuta"] = [];
  const porServicio: Record<string, number> = {};
  for (const grupo of entrada.tareas) {
    for (const tarea of grupo.tareas) {
      const elegida = elegirRuta(tarea, entrada.contexto);
      if (!elegida) {
        sinRuta.push({ nivel: grupo.nivel, tarea, motivo: "Sin ruta disponible para esta tarea en este ámbito" });
        continue;
      }
      const creditos = elegida.ruta.creditosPorUnidad;
      if (creditos > 0) {
        const servicio = elegida.ruta.id.split("-")[0];
        porServicio[servicio] = (porServicio[servicio] ?? 0) + creditos;
      }
      tareas.push({ nivel: grupo.nivel, tarea, rutaId: elegida.ruta.id, rutaNombre: elegida.ruta.nombre, tipo: elegida.ruta.tipo, creditos, unidad: elegida.ruta.unidad, razon: elegida.razon });
    }
  }
  const creditosTotales = Object.values(porServicio).reduce((total, n) => total + n, 0);
  return {
    publicacion: entrada.publicacion,
    tareas,
    sinRuta,
    creditosPorServicio: porServicio,
    creditosTotales,
    necesitaConfirmar: creditosTotales > 0,
  };
}
