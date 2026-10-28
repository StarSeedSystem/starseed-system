/**
 * GENESIS · PUENTE CON EL ENRUTADOR DE ASTRAURA (Ola 1019G · tarea G)
 * ------------------------------------------------------------------
 * Adaptador PURO: convierte la salida de `elegirCandidatos` (escalera local
 * primero) en los dos formatos que ya existen y que NO se tocan aquí:
 *   · `RouteCandidate` / `RankCandidatesOptions` de `src/ai/astraura/router.ts`
 *     — el orden de preferencia del enrutador de Astraura (solo se importan
 *     TIPOS; el router no se carga en runtime).
 *   · La cadena por papel del enjambre (`PapelRuta`), reutilizando
 *     `planDeRuta` de `src/lib/mando/enrutamiento.ts` tal cual.
 * Peldaño = puntuación: 1→60 bajando de 10 en 10 hasta el 6→10. Queda por
 * encima del ranking normal del enrutador (~0..30) y bajo el +100 del
 * override manual: la escalera manda y «elegido por ti» sigue ganando.
 * Lo no medido no se inventa: `quality` neutro (5), `limits` con la nota del
 * catálogo o vacía, y lo gratis solo se afirma cuando el catálogo lo trae.
 */

import type { RankCandidatesOptions, RouteCandidate } from "@/ai/astraura/router";
import { planDeRuta, type PapelRuta, type PlanRuta } from "@/lib/mando/enrutamiento";
import type { ModeloDisponible, SaludProveedor } from "@/lib/mando/modelos-disponibles";
import type { OpcionCatalogo, Papel } from "./catalogo-opciones";
import type { Candidato, Preferencias } from "./escalera";

/** Peldaño de la escalera (1 = Astraura local … 6 = de pago con permiso). */
type PeldanoEscalera = Candidato["peldano"];

/** Puntuación por peldaño: la escalera manda sobre el ranking normal. */
export const PUNTAJE_POR_PELDANO: Record<PeldanoEscalera, number> = { 1: 60, 2: 50, 3: 40, 4: 30, 5: 20, 6: 10 };

/** Tareas del enrutador a las que se traduce un papel, solo donde hay espejo claro. */
function fortalezasDe(papeles: readonly Papel[]): RouteCandidate["model"]["strengths"] {
  const tareas: RouteCandidate["model"]["strengths"] = [];
  if (papeles.includes("chat")) tareas.push("chat");
  if (papeles.includes("código")) tareas.push("code");
  if (papeles.includes("visión")) tareas.push("vision");
  return tareas;
}

/** Tier para el enrutador: gratis sin límite verificado se trata como de pago. */
function tierDe(opcion: OpcionCatalogo): RouteCandidate["source"]["tier"] {
  if (opcion.gratis === null) return "paid";
  return opcion.privacidad === "local" ? "local" : "free-key";
}

/** Espejo de `convertirPrivacidad` en catalogo-opciones (navegador → sin retención). */
function privacidadDe(privacy: OpcionCatalogo["privacidad"]): RouteCandidate["source"]["privacy"] {
  if (privacy === "local") return "local";
  return privacy === "nube-sin-retencion" ? "browser" : "cloud";
}

/** Modelo con lo que SABEMOS: la etiqueta y los papeles; potencia sin medida, neutro. */
function modeloRutaDe(opcion: OpcionCatalogo): RouteCandidate["model"] {
  return { id: opcion.id, label: opcion.nombre, strengths: fortalezasDe(opcion.papeles), quality: 5 };
}

/** De candidata a lo que el enrutador de Astraura entiende. Pura, sin I/O. */
export function aCandidatoRuta(candidata: Candidato, opcion: OpcionCatalogo): RouteCandidate {
  const motivo = `Peldaño ${candidata.peldano} · ${candidata.motivo}`;
  return {
    source: {
      id: opcion.id,
      label: opcion.nombre,
      tier: tierDe(opcion),
      providerId: opcion.id.startsWith("astraura-158") ? "astraura-158" : "openai-compatible",
      baseUrl: "", // la escalera no lleva URL de API: la aporta el motor que sirva el modelo
      requiresKey: opcion.requiereCuenta,
      getKeyUrl: opcion.enlaceClave ?? undefined,
      models: [modeloRutaDe(opcion)],
      limits: opcion.gratis?.nota ?? "", // sin límite gratuito verificado: vacío, no inventado
      why: motivo,
      privacy: privacidadDe(opcion.privacidad),
      weight: 7 - candidata.peldano, // soberanía: el peldaño 1 pesa más
    },
    model: modeloRutaDe(opcion),
    score: PUNTAJE_POR_PELDANO[candidata.peldano],
    reason: motivo,
    fromUser: candidata.peldano >= 5, // vinculada por la persona (5) o pago del ámbito (6)
  };
}

/** Todas las candidatas, ya en el orden de preferencia del enrutador. Pura. */
export function aplicarEscalera(params: {
  candidatas: Candidato[];
  catalogo: OpcionCatalogo[];
  /** Prohibidas del ámbito: defensa en la puerta, ni aunque lleguen elegidas. */
  prohibidos?: readonly string[];
}): RouteCandidate[] {
  const ficha = new Map(params.catalogo.map((opcion) => [opcion.id, opcion]));
  const prohibidas = new Set(params.prohibidos ?? []);
  const rutas: RouteCandidate[] = [];
  for (const candidata of params.candidatas) {
    if (prohibidas.has(candidata.candidatoId)) continue; // una prohibida no aparece
    const opcion = ficha.get(candidata.candidatoId);
    if (opcion) rutas.push(aCandidatoRuta(candidata, opcion));
  }
  // Orden estable (ES2019): empate de puntuación = el orden de la escalera,
  // que `elegirCandidatos` ya dejó desempatada por id.
  return rutas.sort((x, y) => y.score - x.score);
}

/** Preferencias del ámbito → opciones que `rankCandidates` ya entiende. */
export function opcionesRankingDe(preferencias: Preferencias): RankCandidatesOptions {
  // Restricción que SOLO puede negar (misma semántica que en el router):
  // el ámbito sin pago deja `personaAllowsPaid: false`; con pago no opina.
  if (!preferencias.permitirPago) return { personaAllowsPaid: false };
  return {};
}

/** De candidata a eslabón del catálogo vivo del enjambre. Pura. */
export function aModeloDisponible(candidata: Candidato, opcion: OpcionCatalogo): ModeloDisponible {
  const papeles = opcion.papeles;
  const papel: ModeloDisponible["papel"] = papeles.includes("escritor")
    ? "escritor"
    : papeles.includes("revisor")
      ? "revisor"
      : candidata.peldano <= 2
        ? "local" // escalera local sin papel declarado: cuenta como local del enjambre
        : "general";
  const modelo: ModeloDisponible = {
    id: opcion.id,
    proveedor: opcion.id,
    nombre: opcion.nombre,
    gratis: opcion.gratis !== null,
    contexto: null, // sin ventana de contexto verificada aquí: no se inventa
    salud: "desconocido", // la salud real la pone `planDeRuta` con la del supervisor
    papel,
  };
  if (papel === "escritor") modelo.escritor = true;
  return modelo;
}

/** Cadena por papel del enjambre, en el orden de la escalera. Pura. */
export function cadenaPorPapel(params: {
  candidatas: Candidato[];
  catalogo: OpcionCatalogo[];
  papel: PapelRuta;
  /** Salud del supervisor por proveedor (la que ya publica el enjambre). */
  salud?: Record<string, SaludProveedor>;
  clavesPresentes?: readonly string[];
  /** Reloj inyectable: `planDeRuta` lo usa para las cuotas «sin cupo hasta». */
  ahora?: number;
}): PlanRuta {
  const ficha = new Map(params.catalogo.map((opcion) => [opcion.id, opcion]));
  const modelos: ModeloDisponible[] = [];
  for (const candidata of params.candidatas) {
    const opcion = ficha.get(candidata.candidatoId);
    if (opcion) modelos.push(aModeloDisponible(candidata, opcion));
  }
  return planDeRuta(
    modelos,
    params.salud ?? {},
    params.clavesPresentes ?? [],
    params.papel,
    params.ahora,
  );
}
