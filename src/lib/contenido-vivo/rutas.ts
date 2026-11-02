/** Elección de ruta para «Contenido vivo» (CVV1028, tarea B): puntúa cada candidato,
 *  decide su disponibilidad y elige con la razón escrita (contrato §3). */
import type { Ruta, TareaViva } from "./tipos";
import { CATALOGO_RUTAS } from "./catalogo-rutas";
import { gastadoEnMes, puedeGastar, validarAjustes, type AjustesContenidoVivo, type AsientoCreditos } from "./ajustes-ambito";
export type AlcanceVivo = "personal" | "perfil" | "grupo" | "publica";
/** Libro de créditos del ámbito: si viene, la elección consulta el mes real. */
export interface LibroCreditos { asientos: readonly AsientoCreditos[]; ahora: number | Date; quien: string; ajustes?: Partial<AjustesContenidoVivo>; }
/** Contexto del ámbito (cuenta, página o grupo); una clave ausente en `cupoHoy` es que no hay dato. */
export interface ContextoVivo {
  alcance: AlcanceVivo; conectados: string[]; cupoHoy: Record<string, number>;
  creditosDisponibles: number; topeMes: number; gastadoMes: number;
  neurona: { gpu: boolean; capaz3d: boolean };
  ajustes: { localPrimero: boolean; externosPermitidos: boolean };
  libro?: LibroCreditos;
}
export interface CandidatoRuta { ruta: Ruta; puntuacion: number; disponible: boolean; motivoNoDisponible?: string; razon: string; }
/** Tareas que el contrato fija en local: un externo nunca puede servirlas. */
export const TAREAS_SIEMPRE_LOCALES: readonly TareaViva[] = ["grafico-vivo", "revision-texto", "comprobacion"];
const NOMBRE_TAREA: Record<TareaViva, string> = {
  "escena-3d": "una escena 3D", "fotograma-clave": "un fotograma clave", foto: "una foto",
  "clip-pelicula": "un clip de película", "foto-viva": "una foto viva", "grafico-vivo": "un gráfico vivo",
  "revision-texto": "la revisión de un texto", comprobacion: "una comprobación",
};
/** Servicio al que pertenece la ruta: la primera parte de su id (`higgsfield-…`). */
export function servicioDeRuta(ruta: Ruta): string { return ruta.id.split("-")[0]; }
/** Si la ruta está conectada: por su id, por su servicio o por el prefijo del id. */
export function servicioConectado(ruta: Ruta, contexto: ContextoVivo): boolean {
  return contexto.conectados.includes(ruta.id) || contexto.conectados.includes(servicioDeRuta(ruta))
    || contexto.conectados.some((servicio) => ruta.id.startsWith(`${servicio}-`));
}
/** Puntuación: calidad de la tarea menos el coste relativo al tope del mes. */
export function puntuar(ruta: Ruta, tarea: TareaViva, contexto: ContextoVivo): number {
  return Math.max(0, (ruta.calidad[tarea] ?? 0) - ruta.creditosPorUnidad / Math.max(contexto.topeMes, 1));
}
/** Razón en una frase; si no vale, dice por qué. */
export function razonCandidato(ruta: Ruta, tarea: TareaViva, motivo: string | null): string {
  if (motivo) return `No disponible: ${motivo}.`;
  const que = NOMBRE_TAREA[tarea];
  if (ruta.tipo === "local") return `Local: ${ruta.nombre} resuelve ${que} en la neurona y no gasta créditos.`;
  const coste = ruta.creditosPorUnidad > 0 ? ` por ${ruta.creditosPorUnidad} créditos (${ruta.unidad})` : " sin coste medido";
  return `Externo: ${ruta.nombre} resuelve ${que}${coste}.`;
}
/** Compara los candidatos, del mejor al peor y con las disponibles delante. */
export function compararRutas(tarea: TareaViva, contexto: ContextoVivo): CandidatoRuta[] {
  const candidatas = CATALOGO_RUTAS.filter((ruta) => ruta.tareas.includes(tarea));
  const rutas = TAREAS_SIEMPRE_LOCALES.includes(tarea)
    ? candidatas.filter((ruta) => ruta.tipo === "local")
    : candidatas;
  return rutas
    .map((ruta) => valorarRuta(ruta, tarea, contexto))
    .sort((a, b) => b.puntuacion - a.puntuacion || (a.disponible === b.disponible ? 0 : a.disponible ? -1 : 1));
}
/** Puntúa un candidato y decide si está disponible, con motivo y razón. */
export function valorarRuta(ruta: Ruta, tarea: TareaViva, contexto: ContextoVivo): CandidatoRuta {
  const motivo = motivoDeCierre(ruta, tarea, contexto);
  return { ruta, disponible: motivo === null, puntuacion: motivo === null ? puntuar(ruta, tarea, contexto) : 0,
    motivoNoDisponible: motivo ?? undefined, razon: razonCandidato(ruta, tarea, motivo) };
}
// Primer motivo de cierre: tarea local, alcance, requisitos, cupo y presupuesto.
function motivoDeCierre(ruta: Ruta, tarea: TareaViva, contexto: ContextoVivo): string | null {
  return siempreLocal(ruta, tarea) ?? bloqueoDelAlcance(ruta, contexto) ?? requisitosFaltantes(ruta, contexto)
    ?? cupoAgotado(ruta, contexto) ?? presupuestoInsuficiente(ruta, contexto);
}
function siempreLocal(ruta: Ruta, tarea: TareaViva): string | null {
  if (ruta.tipo !== "externo" || !TAREAS_SIEMPRE_LOCALES.includes(tarea)) return null;
  return `Siempre local: ${NOMBRE_TAREA[tarea]} se hace en la neurona y no se envía a ${ruta.nombre}`;
}
function requisitosFaltantes(ruta: Ruta, contexto: ContextoVivo): string | null {
  const faltan: string[] = [];
  if (ruta.requiere.includes("gpu") && !contexto.neurona.gpu) faltan.push("La neurona no tiene GPU");
  if (ruta.requiere.includes("neurona-capaz") && !contexto.neurona.capaz3d) faltan.push("La neurona no es capaz de renderizar esta tarea");
  if (ruta.requiere.some((r) => r === "conector" || r === "cuenta") && !servicioConectado(ruta, contexto)) {
    faltan.push(`Sin conectar: conéctalo en ${ruta.enlaceConectar ?? ruta.fuente}`);
  }
  return faltan.length > 0 ? faltan.join(" y ") : null;
}
// Privacidad: con externos prohibidos nada sale; en alcance personal tampoco sin permiso.
function bloqueoDelAlcance(ruta: Ruta, contexto: ContextoVivo): string | null {
  if (ruta.privacidad !== "sale-de-la-neurona") return null;
  if (!contexto.ajustes.externosPermitidos) return "Servicios externos no permitidos por los ajustes del ámbito";
  if (contexto.alcance === "personal") return "En alcance personal el contenido no sale de la neurona sin permiso";
  return null;
}
function cupoAgotado(ruta: Ruta, contexto: ContextoVivo): string | null {
  if (ruta.tipo !== "externo") return null;
  const cupo = contexto.cupoHoy[servicioDeRuta(ruta)];
  if (cupo === undefined) return null;
  if (cupo < ruta.creditosPorUnidad || cupo <= 0) {
    return `Sin cupo hoy: quedan ${cupo} y una ${ruta.unidad} de ${ruta.nombre} necesita ${ruta.creditosPorUnidad}`;
  }
  return null;
}
function presupuestoInsuficiente(ruta: Ruta, contexto: ContextoVivo): string | null {
  if (ruta.creditosPorUnidad === 0) return null;
  if (ruta.creditosPorUnidad > contexto.creditosDisponibles) {
    return `No quedan créditos suficientes: quedan ${contexto.creditosDisponibles} y se necesitan ${ruta.creditosPorUnidad}`;
  }
  if (contexto.libro) {
    const libro = contexto.libro;
    const ajustes = validarAjustes({ topeCreditosMes: contexto.topeMes, ...libro.ajustes });
    const decision = puedeGastar(ajustes, gastadoEnMes(libro.asientos, libro.ahora), ruta.creditosPorUnidad, libro.quien);
    return decision.si ? null : decision.motivo;
  }
  if (contexto.gastadoMes + ruta.creditosPorUnidad > contexto.topeMes) return "El gasto del mes superaría el tope de créditos del ámbito";
  return null;
}
/** La primera ruta disponible, aplicando `localPrimero`; null si no hay ninguna. */
export function elegirRuta(tarea: TareaViva, contexto: ContextoVivo): CandidatoRuta | null {
  const disponibles = compararRutas(tarea, contexto).filter((c) => c.disponible);
  if (disponibles.length === 0) return null;
  if (!contexto.ajustes.localPrimero) return disponibles[0];
  const externas = disponibles.filter((c) => c.ruta.tipo === "externo");
  const mejorExterna = externas.length > 0 ? Math.max(...externas.map((c) => c.puntuacion)) : -1;
  return disponibles.find((c) => c.ruta.tipo === "local" && c.puntuacion >= mejorExterna - 0.1) ?? disponibles[0];
}
