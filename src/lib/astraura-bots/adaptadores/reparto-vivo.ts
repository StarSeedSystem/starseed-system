/**
 * Bots/dots de Astraura · REPARTO VIVO (BOT1011P, architecture/astraura-bots.md §9): llena la `EntradaReparto` con lo que de
 * verdad hay (medio y capas que caben, capas verificadas del almacén, capas-conciencia, pares y servidores del planificador, catálogo
 * gratis-primero y crédito de pago: sin medidor, `disponible: 0`) y completa el primer paso de Astraura con `planificar()`. Todo se
 * inyecta y nada lanza: lo que falla cuenta como «no hay» y queda dicho en `avisos`. Nunca se inventa crédito ni capa.
 */
import { esFuenteDeMalla, FREE_CATALOG, type CatalogSource } from "@/ai/astraura/free-catalog";
import type { EstadoAlmacen } from "@/lib/astraura/capas/almacen";
import { usable, type CatalogoCapas } from "@/lib/astraura/capas/catalogo";
import * as medioReal from "@/lib/astraura/capas/perfil-medio";
import type { AjustesPresupuesto as Ajustes, EntornoMedio, PerfilMedio, PresupuestoMedio } from "@/lib/astraura/capas/perfil-medio";
import { planificar, type CapaInstalada, type EntradaPlanificador, type NodoCapas, type PerfilPlanificador, type PlanCapas } from "@/lib/astraura/capas/planificador";
import { destinoNivelador, PREFERENCIA_CAPAS_DEFECTO, type PreferenciaCapas } from "@/lib/astraura/capas-conciencia";
import { repartir, type ApiExterna, type CapaLocal, type EntradaReparto, type PlanReparto, type TareaBot } from "../reparto-de-modelo";
import type { OrigenBot } from "../tipos";
export interface DepRepartoVivo {
  entorno: () => EntornoMedio; // en el navegador, `await entornoDelNavegador()` de perfil-medio
  instaladas: () => readonly CapaInstalada[]; // `instaladasDesdeAlmacen(await almacen.estado(), catalogo)`
  preferencias: () => PreferenciaCapas; // `preferenciaCapasGuardada()` de capas-conciencia
  nodos?: () => readonly NodoCapas[]; // pares y servidores que ya conoce el planificador; sin dato, ninguno
  fuentes?: () => readonly CatalogSource[]; // en producción, las `source` con `ready` de `detectAvailabilitySafe()`; por defecto, todo `FREE_CATALOG`
  costeTurno?: (fuente: string) => number | null; // coste medido de una fuente de pago; sin dato, no se usa
  presupuestoPago?: () => { disponible: number; reserva: number } | null; // sin medidor, `disponible: 0`
  enLinea?: () => boolean; // si falla, se trata como sin conexión
  origen?: OrigenBot; ambito?: string; ajustes?: Ajustes;
  perfilDelMedio?: (e: EntornoMedio) => PerfilMedio; presupuestoMedio?: (p: PerfilMedio, a?: Ajustes) => PresupuestoMedio;
}
export type TurnoBot = Pick<EntradaReparto, "tarea" | "dificultad" | "privacidad">;
export interface PlanDelTurno {
  reparto: PlanReparto; capas: PlanCapas | null; avisos: string[]; // `capas`: el planificador, si el primer paso es de Astraura
  detalle: { modelo: string; nodo?: string; profundidad?: number } | null; // lo que completa el primer paso
}
type Remota = EntradaReparto["remotas"][number];
const SHA = /^[0-9a-f]{64}$/;
const CAPAS: readonly CapaLocal[] = ["reflejo", "memoria", "palabra", "razon", "profunda", "voz"];
const MEDIO: Record<string, PerfilPlanificador["medio"]> = { servidor: "servidor", pwa: "pwa", tauri: "nativo", android: "nativo", ios: "nativo" };
/** Tarea del enrutador que lleva al planificador a la MISMA capa que eligió el reparto (voz, Jev y Laya no los planifica). */
const PLAN_TAREA: Partial<Record<CapaLocal, [EntradaPlanificador["tarea"], number]>> = { reflejo: ["tools", 0.2],
  memoria: ["embedding", 0.2], palabra: ["chat", 0.3], razon: ["reasoning", 0.6], profunda: ["long", 0.9] };
const PLANIFICADOS = new Set<string>(["needle", "bonsai", "bitnet"]);
const positivo = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
/** Capas completas del almacén que el catálogo declara con su SHA y en uso (capas-autoadaptables §6, §11). */
export function instaladasDesdeAlmacen(estado: EstadoAlmacen, catalogo: CatalogoCapas): CapaInstalada[] {
  const porId = new Map(catalogo.capas.filter(usable).map((e) => [e.id, e]));
  return estado.capas.flatMap((c) => { const e = c.completa ? porId.get(c.id) : undefined;
    return e ? [{ id: e.id, capa: e.capa, sha256: e.sha256, ramMinMb: e.ram_min_mb }] : []; });
}
/** Barra 0–100 de capas-conciencia → 0–1 del reparto: cruza 0,5 justo donde la barra deja de decir «Capas 1.58» (67). */
const aReparto = (n: number): number => (destinoNivelador(n) === "capas" ? (100 - n) / 66 : 1 - n / 134);
function leer<T>(fallos: string[], nombre: string, f: (() => T) | undefined, siFalta: T, siFalla: T = siFalta): T {
  if (!f) return siFalta; try { return f(); } catch { fallos.push(nombre); return siFalla; }
}
function medir(dep: DepRepartoVivo, t: TurnoBot) {
  const fallos: string[] = [];
  const visita = medioReal.perfilDelMedio({ userAgent: "", esTauri: false, esPWA: false });
  const perfil = leer(fallos, "el perfil del medio", () => (dep.perfilDelMedio ?? medioReal.perfilDelMedio)(dep.entorno()), visita);
  const pres = leer(fallos, "el presupuesto del medio", () => (dep.presupuestoMedio ?? medioReal.presupuestoMedio)(perfil, dep.ajustes),
    { disco_mb: 0, ram_mb: 0, capas_guardables: [], segundo_plano: false, motivo: "sin presupuesto" });
  const p = leer(fallos, "las preferencias de capas", dep.preferencias, PREFERENCIA_CAPAS_DEFECTO);
  const instaladas = leer(fallos, "las capas instaladas", dep.instaladas, []);
  const nodos = leer(fallos, "los pares y servidores", dep.nodos, []);
  const fuentes = leer(fallos, "las APIs gratis", dep.fuentes, FREE_CATALOG, []);
  const pago = leer(fallos, "el medidor de crédito", dep.presupuestoPago, null);
  const conexion = leer(fallos, "la conexión", dep.enLinea, true, false) ? perfil.base.conexion : "sin";
  const medio = MEDIO[perfil.plataforma] ?? "web";
  const ram = pres.ram_mb ?? (perfil.base.ramGb ?? 0) * 1024;
  const guardables = new Set<string>(pres.capas_guardables);
  const capasLocales = p.activo && p.capas.local ? CAPAS.filter((c) => guardables.has(c) &&
    instaladas.some((i) => i.capa === c && SHA.test(i.sha256) && (i.ramMinMb ?? 0) <= ram)) : [];
  const propio = (n: NodoCapas) => n.propio === true || (n.ambitos ?? []).some((a) => a === "propio" || a === "cuenta");
  const fueraDeAmbito = (n: NodoCapas) => t.privacidad === "ambito" && !!dep.ambito && !!n.ambitos?.length &&
    !n.ambitos.includes(dep.ambito) && !n.ambitos.includes("publico");
  const permitido = (n: NodoCapas) => n.conectado && p.activo && !fueraDeAmbito(n) && (n.tipo === "par"
    ? p.capas.mesh && (t.privacidad !== "privada" || propio(n))
    : n.tipo !== "api-gratis" && p.capas.nube && (n.tipo === "servidor-propio" || p.capas.colectiva));
  const remotas = new Map<string, Remota>();
  for (const n of nodos.filter(permitido)) for (const c of n.capas ?? []) {
    if (c.capa !== "adaptador" && SHA.test(c.sha256)) remotas.set(`${c.capa}|${n.tipo}`, { capa: c.capa, donde: n.tipo as Remota["donde"] });
  }
  const coste = dep.costeTurno;
  const externas: ApiExterna[] = fuentes.filter((s) => s.privacy === "cloud" && !s.id.startsWith("astraura") && !esFuenteDeMalla(s.id))
    .flatMap((s) => { const gratis = s.tier !== "paid"; // de pago sin coste medido: fuera (nunca se gasta a ciegas)
      const costeTurno = gratis ? 0 : positivo(leer(fallos, `el coste de ${s.id}`, coste && (() => coste(s.id)), null));
      return gratis || costeTurno > 0 ? [{ id: s.id, gratis, costeTurno, vision: s.models.some((m) => m.vision === true) }] : []; });
  const entrada: EntradaReparto = {
    ...t, medio, conexion, origen: dep.origen ?? "astraura", capasLocales, remotas: [...remotas.values()], externas,
    presupuesto: { disponible: positivo(pago?.disponible), reserva: positivo(pago?.reserva) },
    preferencias: p.activo ? { nivelador: aReparto(p.nivelador), externaFija: p.especifico?.fuente } : { nivelador: 1, apagadas: CAPAS },
  };
  const plan: Omit<EntradaPlanificador, "tarea" | "dificultad"> = {
    privacidad: t.privacidad, segundoPlano: pres.segundo_plano, ambito: dep.ambito, instaladas, nodos, preferencias: p,
    perfil: { medio, conexion, webgpu: perfil.webgpu.disponible, ramMb: ram }, presupuesto: { discoMb: pres.disco_mb, ramMb: ram },
  };
  return { entrada, plan, fallos };
}
/** La entrada del reparto con lo que hay de verdad. Sin turno, el más prudente: privado. Nunca lanza. */
export function entradaRepartoDesde(dep: DepRepartoVivo, turno: TurnoBot = { tarea: "conversacion", dificultad: "media", privacidad: "privada" }): EntradaReparto {
  try { return medir(dep, turno).entrada; } catch { return { ...turno, medio: "web", conexion: "sin", origen: dep.origen ?? "astraura",
    capasLocales: [], remotas: [], externas: [], presupuesto: { disponible: 0, reserva: 0 }, preferencias: { nivelador: 0 } }; }
}

/** `repartir()` del turno y, si el primer paso es de Astraura, su detalle con `planificar()`. Nunca lanza. */
export function planDelTurno(tarea: TareaBot, dificultad: TurnoBot["dificultad"], privacidad: TurnoBot["privacidad"], dep: DepRepartoVivo): PlanDelTurno {
  try {
    const { entrada, plan, fallos } = medir(dep, { tarea, dificultad, privacidad });
    const avisos = fallos.map((f) => `No se pudo leer ${f}: cuenta como que no hay.`);
    const reparto = repartir(entrada);
    const tipo = reparto.capa ? PLAN_TAREA[reparto.capa] : undefined;
    if (!tipo || !PLANIFICADOS.has(reparto.motor)) return { reparto, capas: null, detalle: null, avisos };
    const capas = planificar({ ...plan, tarea: tipo[0], dificultad: tipo[1] });
    const paso = capas.capa !== reparto.capa ? undefined
      : [capas, ...capas.respaldo].find((x) => x.donde === reparto.donde && x.modelo !== "ninguno");
    if (!paso) avisos.push(`El planificador no tiene la capa ${reparto.capa} en ${reparto.donde}: se usa el modelo por defecto del reparto.`);
    return { reparto, capas, avisos,
      detalle: paso ? { modelo: paso.modelo, nodo: paso.nodo, profundidad: paso === capas ? capas.profundidad : undefined } : null };
  } catch {
    const motivo = "No se pudo preparar el reparto de este turno: antes que inventar, no responde nadie.";
    return { reparto: { motor: "ninguno", donde: "ninguno", respaldo: [], motivo }, capas: null, detalle: null, avisos: ["El reparto vivo falló entero."] };
  }
}
