/**
 * Bots/dots de Astraura · REPARTO DE MODELO (BOT1011). Contrato: architecture/astraura-bots.md §9.
 *
 * Decide QUÉ FAMILIA y DE QUÉ LADO responde cada turno de un bot: Astraura local (Needle 3,
 * Laya, Jev, Bonsai, BitNet, VibeASR), un par o servidor propio, un servidor StarSeed, una API
 * externa del enrutador gratis-primero, o el modelo propio de un bot invitado. Los detalles de
 * capa/profundidad/nodo los resuelve después `planificar()` de `astraura/capas/planificador.ts`
 * (el adaptador se lo pasa): aquí no se duplica, se elige el lado y la cadena de respaldo.
 * Reglas que no se saltan (capas-autoadaptables §5 + economía de créditos):
 *   · lo privado NUNCA sale a una API externa ni a un servidor público;
 *   · sin conexión, solo lo local;
 *   · una capa apagada no se usa;
 *   · nunca se gasta crédito de pago por debajo de la reserva;
 *   · el reflejo (Needle) decide primero las herramientas.
 * PURO: sin red, sin reloj.
 */
import type { Medio, OrigenBot } from "./tipos";

export const TAREAS_BOT = [
  "herramienta", "juicio", "conversacion", "resumen", "codigo", "plan", "vision", "contexto-largo",
  "voz", "memoria", "creacion",
] as const;
export type TareaBot = (typeof TAREAS_BOT)[number];
export type CapaLocal = "reflejo" | "memoria" | "palabra" | "razon" | "profunda" | "voz";
export type Motor = "needle" | "laya" | "jev" | "bonsai" | "bitnet" | "vibeasr" | "api-externa" | "invitado" | "ninguno";
export type Donde = "local" | "par" | "servidor-propio" | "servidor-starseed" | "api-externa" | "invitado" | "ninguno";
type DondeRemoto = "par" | "servidor-propio" | "servidor-starseed";

export interface ApiExterna { id: string; gratis: boolean; costeTurno: number; vision?: boolean }

export interface EntradaReparto {
  tarea: TareaBot;
  dificultad: "baja" | "media" | "alta";
  medio: Medio;
  privacidad: "privada" | "ambito" | "publica";
  conexion: "sin" | "lenta" | "rapida";
  origen: OrigenBot;
  /** Capas que caben y están en este aparato (las mide perfil-medio). */
  capasLocales: readonly CapaLocal[];
  /** Capas que ofrecen pares de la cuenta y servidores (propios o StarSeed). */
  remotas: readonly { capa: CapaLocal; donde: DondeRemoto }[];
  externas: readonly ApiExterna[];
  /** Crédito de pago que queda y la reserva que nunca se toca. */
  presupuesto: { disponible: number; reserva: number };
  /** 0 = todo en Astraura local … 1 = APIs primero. `externaFija`: la que eligió la persona. */
  preferencias: { nivelador: number; externaFija?: string; apagadas?: readonly CapaLocal[] };
}

export interface PasoReparto { motor: Motor; donde: Donde; capa?: CapaLocal; modelo?: string }
export interface PlanReparto extends PasoReparto { respaldo: PasoReparto[]; motivo: string }

export const MAX_RESPALDO = 4;

/** Qué capa cumple la tarea (papeles de capas-autoadaptables §3). */
export function capaDeTarea(t: TareaBot, d: EntradaReparto["dificultad"]): CapaLocal {
  switch (t) {
    case "herramienta": case "juicio": return "reflejo";
    case "memoria": return "memoria";
    case "voz": return "voz";
    case "vision": case "contexto-largo": return "profunda";
    case "codigo": case "plan": return d === "alta" ? "profunda" : "razon";
    case "conversacion": case "resumen": return d === "alta" ? "razon" : "palabra";
    case "creacion": return d === "baja" ? "palabra" : "razon";
  }
}

const MODELO: Record<CapaLocal, { motor: Motor; modelo: string }> = {
  reflejo: { motor: "needle", modelo: "needle3-reflejo" },
  memoria: { motor: "bitnet", modelo: "bitnet-embedding-0.6b" },
  palabra: { motor: "bonsai", modelo: "ternary-bonsai-4b" },
  razon: { motor: "bonsai", modelo: "ternary-bonsai-8b" },
  profunda: { motor: "bonsai", modelo: "ternary-bonsai2-27b" },
  voz: { motor: "vibeasr", modelo: "vibeasr-cpp" },
};

const paso = (capa: CapaLocal, donde: Donde): PasoReparto => ({ ...MODELO[capa], capa, donde });

function externasPermitidas(e: EntradaReparto): PasoReparto[] {
  if (e.privacidad !== "publica" || e.conexion === "sin") return [];
  const vision = e.tarea === "vision";
  const lista = e.externas
    .filter((x) => !vision || x.vision)
    .filter((x) => x.gratis || e.presupuesto.disponible - x.costeTurno >= e.presupuesto.reserva)
    .slice()
    .sort((a, b) =>
      Number(b.id === e.preferencias.externaFija) - Number(a.id === e.preferencias.externaFija) ||
      Number(b.gratis) - Number(a.gratis) || a.costeTurno - b.costeTurno || a.id.localeCompare(b.id));
  return lista.map((x) => ({ motor: "api-externa", donde: "api-externa", modelo: x.id }));
}

/** El plan del turno: el primero manda; el resto es la cadena de respaldo (máx. 4). */
export function repartir(e: EntradaReparto): PlanReparto {
  if (e.origen !== "astraura") {
    return { motor: "invitado", donde: "invitado", respaldo: [], motivo: "Bot invitado: responde su propio modelo, solo con lo que tú le pases." };
  }
  const capa = capaDeTarea(e.tarea, e.dificultad);
  const apagadas = new Set(e.preferencias.apagadas ?? []);
  const enLinea = e.conexion !== "sin";
  const local = (c: CapaLocal) => !apagadas.has(c) && e.capasLocales.includes(c);
  const remotos = (c: CapaLocal): PasoReparto[] => !enLinea || apagadas.has(c) ? [] : e.remotas
    .filter((r) => r.capa === c && (r.donde !== "servidor-starseed" || e.privacidad !== "privada"))
    .sort((a, b) => ORDEN_REMOTO[a.donde] - ORDEN_REMOTO[b.donde])
    .map((r) => paso(c, r.donde));

  const propios: PasoReparto[] = [];
  if (capa === "reflejo") {
    const jev: PasoReparto[] = local("razon") ? [{ motor: "jev", donde: "local", capa: "razon", modelo: "jev-local-bitnet" }]
      : remotos("razon").map((p) => ({ ...p, motor: "jev" as Motor, modelo: "jev-local-bitnet" }));
    const reflejo: PasoReparto[] = local("reflejo")
      ? [paso("reflejo", "local"), { motor: "laya", donde: "local", capa: "reflejo", modelo: "laya-local" }] : [];
    propios.push(...(e.tarea === "juicio" ? [...jev, ...reflejo] : [...reflejo, ...jev]));
  } else {
    if (local(capa)) propios.push(paso(capa, "local"));
    propios.push(...remotos(capa));
    // Si la capa ideal no está a mano, una más ligera local antes que nada (nunca más pesada).
    const ligera = LIGERA[capa];
    if (ligera && !propios.length && local(ligera)) propios.push(paso(ligera, "local"));
  }
  const externas = externasPermitidas(e);
  const nivelador = Math.min(1, Math.max(0, e.preferencias.nivelador));
  const orden = nivelador > 0.5 ? [...externas, ...propios] : [...propios, ...externas];
  if (!orden.length) {
    const motivo = !enLinea ? "Sin conexión y sin esa capa en este aparato: se guarda para cuando haya."
      : e.privacidad === "privada" ? "Es privado y no hay capa propia disponible: no sale a ninguna API externa."
      : "No hay ninguna fuente con cupo ni capa disponible ahora.";
    return { motor: "ninguno", donde: "ninguno", respaldo: [], motivo };
  }
  const [primero, ...resto] = orden;
  return { ...primero, respaldo: resto.slice(0, MAX_RESPALDO), motivo: explicar(primero, e) };
}

const ORDEN_REMOTO: Record<DondeRemoto, number> = { par: 0, "servidor-propio": 1, "servidor-starseed": 2 };
const LIGERA: Partial<Record<CapaLocal, CapaLocal>> = { profunda: "razon", razon: "palabra" };

function explicar(p: PasoReparto, e: EntradaReparto): string {
  if (p.donde === "api-externa") return `API externa ${p.modelo} (es público y el nivelador o la falta de capa local lo piden).`;
  const donde = p.donde === "local" ? "en este aparato" : p.donde === "par" ? "en otra neurona de tu cuenta"
    : p.donde === "servidor-propio" ? "en tu servidor" : "en un servidor StarSeed";
  return `Astraura ${p.motor} (${p.capa}) ${donde}; privacidad ${e.privacidad}.`;
}
