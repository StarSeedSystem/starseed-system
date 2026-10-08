import type { classifyTask, estimateDifficulty } from "@/ai/astraura/router";
import { sesgoNivelador, type PreferenciaCapas } from "@/lib/astraura/capas-conciencia";
import { profundidadNeedle, type Capa } from "./catalogo";

type Tarea = ReturnType<typeof classifyTask>["kind"];
type Dificultad = ReturnType<typeof estimateDifficulty>;
export type DondeCapa = "local" | "par" | "servidor-starseed" | "servidor-propio" | "api-gratis";
export interface PerfilPlanificador {
  medio: "web" | "pwa" | "nativo" | "servidor";
  conexion: "sin" | "lenta" | "rapida";
  webgpu?: boolean; ramMb: number; bateriaPct?: number | null;
  saveData?: boolean; visible?: boolean;
}
export interface PresupuestoCapas { discoMb: number; ramMb: number; }
export interface CapaInstalada { id: string; capa: Capa; sha256: string; ramMinMb?: number; profundidad?: number; }
export interface NodoCapas {
  id: string;
  tipo: Exclude<DondeCapa, "local">;
  conectado: boolean;
  propio?: boolean;
  ambitos?: readonly string[];
  capas?: readonly CapaInstalada[];
  latenciaMs?: number;
}
export interface PasoPlan { modelo: string; donde: DondeCapa; nodo?: string; }
export interface PlanCapas extends PasoPlan {
  capa: Capa;
  profundidad?: number;
  respaldo: PasoPlan[];
  motivo: string;
}
export interface EntradaPlanificador {
  tarea: Tarea;
  dificultad: Dificultad;
  latenciaMs?: number;
  privacidad: "privada" | "ambito" | "publica";
  segundoPlano: boolean;
  ambito?: string;
  perfil: PerfilPlanificador;
  presupuesto: PresupuestoCapas;
  instaladas: readonly CapaInstalada[];
  nodos: readonly NodoCapas[];
  preferencias: PreferenciaCapas;
}
const ORDEN: Record<Capa, readonly string[]> = {
  reflejo: ["needle3-reflejo"],
  memoria: ["bitnet-embedding-0.6b", "bitnet-embedding-270m", "needle3-reflejo"],
  palabra: ["ternary-bonsai-4b", "ternary-bonsai-1.7b", "bonsai-1bit-1.7b"],
  razon: ["ternary-bonsai-8b", "bitnet-b1.58-2b-4t", "ternary-bonsai-4b"],
  profunda: ["ternary-bonsai2-27b", "bonsai-1bit-27b", "ternary-bonsai-8b"],
  voz: ["vibeasr-cpp"],
  adaptador: [],
};

const PROFUNDAS = new Set<Tarea>(["vision", "long", "training", "inference"]);
const RAZON = new Set<Tarea>(["code", "reasoning", "orchestration", "dag", "theory", "quantization"]);

function capaPara(e: EntradaPlanificador): Capa {
  const fondo = e.segundoPlano || e.perfil.visible === false || e.perfil.saveData === true ||
    (e.perfil.bateriaPct != null && e.perfil.bateriaPct < 20);
  if (fondo || e.tarea === "fast" || e.tarea === "tools") return "reflejo";
  if (e.tarea === "embedding" || e.tarea === "rag") return "memoria";
  if (PROFUNDAS.has(e.tarea) || e.dificultad >= 0.85) return "profunda";
  if (RAZON.has(e.tarea) || e.dificultad >= 0.55) return "razon";
  return "palabra";
}

function verificada(c: CapaInstalada): boolean {
  return /^[0-9a-f]{64}$/.test(c.sha256);
}

interface Candidato extends PasoPlan { puntos: number; capa?: CapaInstalada; }

export function planificar(entrada: EntradaPlanificador): PlanCapas {
  const capa = capaPara(entrada);
  const { preferencias: p, perfil } = entrada;
  const hayRed = perfil.conexion !== "sin";
  const fondo = entrada.segundoPlano || perfil.visible === false || perfil.saveData === true ||
    (perfil.bateriaPct != null && perfil.bateriaPct < 20);
  const orden = ORDEN[capa];
  const puntuarModelo = (id: string) => orden.includes(id) ? orden.length - orden.indexOf(id) : 0;
  const candidatos: Candidato[] = [];
  const limiteRam = Math.min(perfil.ramMb, entrada.presupuesto.ramMb);
  if (p.activo && p.capas.local) {
    for (const instalada of entrada.instaladas) {
      const webIncapaz = perfil.medio === "web" && capa !== "reflejo" && !perfil.webgpu;
      if (instalada.capa === capa && verificada(instalada) && !webIncapaz &&
          (instalada.ramMinMb ?? 0) <= limiteRam) {
        candidatos.push({ modelo: instalada.id, donde: "local", capa: instalada,
          puntos: 30 + puntuarModelo(instalada.id) + sesgoNivelador(p, "astraura-158-local") });
      }
    }
  }
  if (hayRed) for (const nodo of entrada.nodos) {
    if (!nodo.conectado || (fondo && capa !== "reflejo")) continue;
    if (nodo.tipo === "par" && (!p.activo || !p.capas.mesh)) continue;
    if ((nodo.tipo === "servidor-starseed" || nodo.tipo === "servidor-propio") && (!p.activo || !p.capas.nube || (nodo.tipo === "servidor-starseed" && !p.capas.colectiva))) continue;
    if (entrada.privacidad === "ambito" && entrada.ambito && nodo.ambitos?.length &&
        !nodo.ambitos.includes(entrada.ambito) && !nodo.ambitos.includes("publico")) continue;
    const parPropio = nodo.tipo === "par" && (nodo.propio || nodo.ambitos?.some((a) => a === "propio" || a === "cuenta"));
    if (entrada.privacidad === "privada" && nodo.tipo !== "servidor-propio" && !parPropio) continue;
    const capas = nodo.capas?.filter((c) => c.capa === capa && verificada(c)) ?? [];
    if (nodo.tipo === "api-gratis" && entrada.privacidad !== "privada") {
      candidatos.push({ modelo: "enrutador-gratis", donde: nodo.tipo, nodo: nodo.id,
        puntos: 10 + sesgoNivelador(p, "openrouter") });
    }
    for (const disponible of capas) candidatos.push({ modelo: disponible.id, donde: nodo.tipo, nodo: nodo.id,
      capa: disponible, puntos: 24 + puntuarModelo(disponible.id) - ((nodo.latenciaMs ?? 0) > (entrada.latenciaMs ?? Infinity) ? 8 : 0) });
  }
  candidatos.sort((a, b) => b.puntos - a.puntos || a.modelo.localeCompare(b.modelo));
  const elegido = candidatos[0];
  if (!elegido) return { capa, modelo: "ninguno", donde: "local", respaldo: [],
    motivo: "No hay una capa verificada permitida para este medio y privacidad." };
  const profundidad = capa === "reflejo"
    ? Math.min(elegido.capa?.profundidad ?? 20, profundidadNeedle(entrada.presupuesto.discoMb)) || undefined
    : undefined;
  return { capa, modelo: elegido.modelo, donde: elegido.donde, nodo: elegido.nodo, profundidad,
    respaldo: candidatos.slice(1, 5).map(({ modelo, donde, nodo }) => ({ modelo, donde, nodo })),
    motivo: `${fondo ? "Segundo plano" : "Reflejo previo"}; ${capa} en ${elegido.donde}, con privacidad ${entrada.privacidad}.` };
}
