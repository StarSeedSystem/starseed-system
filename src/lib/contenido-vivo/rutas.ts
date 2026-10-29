/** Elección de ruta para «Contenido vivo» (CVV1028, tarea B): funciones puras que
 *  puntúan cada candidato, deciden su disponibilidad y eligen con la razón escrita
 *  (contrato `architecture/contenido-vivo.md` §3). */
import type { Ruta, TareaViva } from "./tipos";
import { CATALOGO_RUTAS } from "./catalogo-rutas";
import {
  gastadoEnMes,
  puedeGastar,
  validarAjustes,
  type AjustesContenidoVivo,
  type AsientoCreditos,
} from "./ajustes-ambito";

/** Alcance del contenido, según el contrato §1. */
export type AlcanceVivo = "personal" | "perfil" | "grupo" | "publica";

/** Libro de créditos del ámbito: si viene, la elección consulta el mes real. */
export interface LibroCreditos {
  asientos: readonly AsientoCreditos[];
  ahora: number | Date;
  quien: string;
  ajustes?: Partial<AjustesContenidoVivo>;
}

/** Contexto del ámbito (cuenta, página o grupo) donde se crea el contenido. */
export interface ContextoVivo {
  alcance: AlcanceVivo;
  /** Servicios conectados: `spline`, `higgsfield`, `google`… */
  conectados: string[];
  /** Cupo que queda hoy por servicio; una clave ausente es que no hay dato. */
  cupoHoy: Record<string, number>;
  creditosDisponibles: number; topeMes: number; gastadoMes: number;
  neurona: { gpu: boolean; capaz3d: boolean };
  ajustes: { localPrimero: boolean; externosPermitidos: boolean };
  /** Libro de créditos del ámbito (tarea C); sin él se usa `gastadoMes` y `topeMes`. */
  libro?: LibroCreditos;
}

/** Un candidato del catálogo ya puntuado, con su disponibilidad y razón. */
export interface CandidatoRuta {
  ruta: Ruta;
  puntuacion: number;
  disponible: boolean;
  motivoNoDisponible?: string;
  razon: string;
}

/** Si la ruta está conectada: por su id o por su servicio (`higgsfield-…`). */
export function servicioConectado(ruta: Ruta, contexto: ContextoVivo): boolean {
  if (contexto.conectados.includes(ruta.id)) return true;
  return contexto.conectados.some((servicio) => ruta.id.startsWith(`${servicio}-`));
}
/** Puntuación disponible: calidad de la tarea menos el coste relativo al tope. */
export function puntuar(ruta: Ruta, tarea: TareaViva, contexto: ContextoVivo): number {
  return Math.max(0, (ruta.calidad[tarea] ?? 0) - ruta.creditosPorUnidad / Math.max(contexto.topeMes, 1));
}
/** Razón de un candidato, en una frase en español. */
export function razonCandidato(ruta: Ruta, tarea: TareaViva, disponible: boolean): string {
  if (!disponible) return `No apta: ${ruta.nombre} no está disponible para ${tarea} en este ámbito.`;
  if (ruta.tipo === "local") return `Local: ${ruta.nombre} hace ${tarea} en la neurona y no gasta créditos.`;
  const coste = ruta.creditosPorUnidad > 0 ? ` a un coste de ${ruta.creditosPorUnidad} créditos por ${ruta.unidad}` : "";
  return `Externo: ${ruta.nombre} sirve para ${tarea}${coste}.`;
}
/** Compara los candidatos del catálogo para la tarea, del mejor al peor. */
export function compararRutas(tarea: TareaViva, contexto: ContextoVivo): CandidatoRuta[] {
  return CATALOGO_RUTAS.filter((ruta) => ruta.tareas.includes(tarea))
    .map((ruta) => valorarCandidato(ruta, tarea, contexto))
    .sort((a, b) => b.puntuacion - a.puntuacion);
}
/** Puntúa un candidato y decide si está disponible, con motivo y razón. */
function valorarCandidato(ruta: Ruta, tarea: TareaViva, contexto: ContextoVivo): CandidatoRuta {
  const motivoNoDisponible = motivoDeCierre(ruta, contexto);
  const disponible = motivoNoDisponible === null;
  return {
    ruta,
    puntuacion: disponible ? puntuar(ruta, tarea, contexto) : 0,
    disponible,
    motivoNoDisponible: motivoNoDisponible ?? undefined,
    razon: razonCandidato(ruta, tarea, disponible),
  };
}
// Primer motivo de cierre, o null si está disponible: alcance, requisitos, cupo y presupuesto.
function motivoDeCierre(ruta: Ruta, contexto: ContextoVivo): string | null {
  return [bloqueoDelAlcance(ruta, contexto), requisitosFaltantes(ruta, contexto), cupoAgotado(ruta, contexto), presupuestoInsuficiente(ruta, contexto)].find(
    (motivo) => motivo !== null,
  ) ?? null;
}
/** Requisitos que esta neurona y este ámbito no cumplen. */
function requisitosFaltantes(ruta: Ruta, contexto: ContextoVivo): string | null {
  const faltan: string[] = [];
  const { gpu, capaz3d } = contexto.neurona;
  if (ruta.requiere.includes("gpu") && !gpu) faltan.push("La neurona no tiene GPU");
  if (ruta.requiere.includes("neurona-capaz") && !capaz3d) faltan.push("La neurona no es capaz de renderizar esta tarea");
  if (ruta.requiere.some((r) => r === "conector" || r === "cuenta") && !servicioConectado(ruta, contexto)) {
    faltan.push(`Sin conectar: conéctalo en ${ruta.enlaceConectar ?? ruta.fuente}`);
  }
  return faltan.length > 0 ? faltan.join(" y ") : null;
}
// Privacidad: nada sale de la neurona con los externos prohibidos, ni en alcance personal sin permiso.
function bloqueoDelAlcance(ruta: Ruta, contexto: ContextoVivo): string | null {
  if (ruta.privacidad !== "sale-de-la-neurona") return null;
  if (!contexto.ajustes.externosPermitidos) return "Servicios externos no permitidos por los ajustes del ámbito";
  if (contexto.alcance === "personal") return "En alcance personal el contenido no sale de la neurona sin permiso";
  return null;
}
/** Cupo diario del servicio (p. ej. el plan Pro de Spline: 200 llamadas al día). */
function cupoAgotado(ruta: Ruta, contexto: ContextoVivo): string | null {
  if (ruta.tipo !== "externo") return null;
  const cupo = contexto.cupoHoy[ruta.id.split("-")[0]];
  if (cupo === undefined) return null;
  if (cupo < ruta.creditosPorUnidad || cupo <= 0) {
    return `Sin cupo hoy: quedan ${cupo} y una ${ruta.unidad} de ${ruta.nombre} necesita ${ruta.creditosPorUnidad}`;
  }
  return null;
}
/** Que queden créditos hoy y que el gasto no supere el tope del mes. */
function presupuestoInsuficiente(ruta: Ruta, contexto: ContextoVivo): string | null {
  if (ruta.creditosPorUnidad === 0) return null;
  if (ruta.creditosPorUnidad > contexto.creditosDisponibles) {
    return `No quedan créditos suficientes: quedan ${contexto.creditosDisponibles} y se necesitan ${ruta.creditosPorUnidad}`;
  }
  const libro = contexto.libro;
  if (libro) {
    const ajustes = validarAjustes({ topeCreditosMes: contexto.topeMes, ...libro.ajustes });
    const gastado = gastadoEnMes(libro.asientos, libro.ahora);
    const decision = puedeGastar(ajustes, gastado, ruta.creditosPorUnidad, libro.quien);
    return decision.si ? null : decision.motivo;
  }
  if (contexto.gastadoMes + ruta.creditosPorUnidad > contexto.topeMes) {
    return "El gasto del mes superaría el tope de créditos del ámbito";
  }
  return null;
}
/** Devuelve la primera disponibilidad para la tarea, o null si no la hay. */
export function elegirRuta(tarea: TareaViva, contexto: ContextoVivo): CandidatoRuta | null {
  const disponibles = compararRutas(tarea, contexto).filter((c) => c.disponible);
  if (disponibles.length === 0) return null;
  if (!contexto.ajustes.localPrimero) return disponibles[0];
  const externas = disponibles.filter((c) => c.ruta.tipo === "externo");
  const mejorExterna = externas.length > 0 ? Math.max(...externas.map((c) => c.puntuacion)) : -1;
  // Con `localPrimero`, una local gana si queda a 0,1 o menos de la mejor externa.
  return disponibles.find((c) => c.ruta.tipo === "local" && c.puntuacion >= mejorExterna - 0.1) ?? disponibles[0];
}
