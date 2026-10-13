import { type CapaLocal } from "../reparto-de-modelo";
import type { EntradaReparto, PlanReparto } from "../reparto-de-modelo";
import { perfilDelMedio, presupuestoMedio, type EntornoMedio } from "../../astraura/capas/perfil-medio";
import { leerPreferenciaCapas, type PreferenciaCapas } from "../../astraura/capas-conciencia";
import { FREE_CATALOG } from "../../../ai/astraura/free-catalog";
import { almacenamientoEnMemoria, type Almacenamiento, type EstadoAlmacen, type InfoCapa } from "../../astraura/capas/almacen";
import { planificar, type EntradaPlanificador } from "../../astraura/capas/planificador";
import { repartir } from "../reparto-de-modelo";

export interface DependenciasRepartoVivo {
  obtenerEntornoMedio: () => Promise<EntornoMedio>;
  obtenerAlmacenCapas: () => Promise<{ estado: () => Promise<EstadoAlmacen> }>;
  obtenerPreferenciaCapas: () => Promise<PreferenciaCapas>;
  obtenerParesServidores: () => Promise<readonly { capa: CapaLocal; donde: "par" | "servidor-propio" | "servidor-starseed" }[]>;
  obtenerPresupuestoPago: () => Promise<{ disponible: number; reserva: number }>;
}

function normalizarNivelador(n: number): number {
  return Math.min(1, Math.max(0, n / 100));
}

async function obtenerCapasInstaladas(almacenPromise: Promise<{ estado: () => Promise<EstadoAlmacen> }>): Promise<CapaLocal[]> {
  const { estado } = await almacenPromise;
  const estadoAlmacen = await estado();
  return estadoAlmacen.capas
    .filter((i): i is InfoCapa & { id: CapaLocal } => 
      ["reflejo", "memoria", "palabra", "razon", "profunda", "voz"].includes(i.id))
    .map((i) => i.id as CapaLocal);
}

export async function entradaRepartoDesde(dep: DependenciasRepartoVivo): Promise<EntradaReparto> {
  try {
    const entorno = await dep.obtenerEntornoMedio();
    const perfil = perfilDelMedio(entorno);
    const plataforma = perfil.plataforma;
    const presupuestoMedioResult = presupuestoMedio(perfil);
    const capasLocalesMedio = presupuestoMedioResult.capas_guardables
      .filter((c): c is CapaLocal => 
        ["reflejo", "memoria", "palabra", "razon", "profunda", "voz"].includes(c))
      .map(c => c as CapaLocal);
    const capasInstaladas = await obtenerCapasInstaladas(dep.obtenerAlmacenCapas());
    const capasLocales = capasLocalesMedio.filter(c => capasInstaladas.includes(c as CapaLocal));
    const preferenciaCapas = await dep.obtenerPreferenciaCapas();
    const nivelador = normalizarNivelador(preferenciaCapas.nivelador);
    const apagadas: CapaLocal[] = [];
    const remotas = await dep.obtenerParesServidores();
    const externas = FREE_CATALOG
      .filter(s => s.tier !== "paid")
      .flatMap(s => s.models
        .map(m => ({ id: `${s.id}::${m.id}`, gratis: true, costeTurno: 0 })));
    const presupuestoPago = await dep.obtenerPresupuestoPago();
    return {
      tarea: "conversacion",
      dificultad: "media",
      medio: plataforma === "servidor" ? "servidor" : 
             plataforma === "tauri" || plataforma === "android" || plataforma === "ios" ? "nativo" : 
             plataforma === "web" && (entorno as any).esPWA ? "pwa" : 
             "web",
      privacidad: "privada",
      conexion: navigator.onLine !== false ? "rapida" : "sin",
      origen: "astraura",
      capasLocales,
      remotas,
      externas,
      presupuesto: { disponible: presupuestoPago.disponible, reserva: presupuestoPago.reserva },
      preferencias: { nivelador, externaFija: undefined, apagadas },
    };
  } catch {
    return {
      tarea: "conversacion",
      dificultad: "media",
      medio: "web",
      privacidad: "privada",
      conexion: "sin",
      origen: "astraura",
      capasLocales: ["reflejo"],
      remotas: [],
      externas: [{ id: "openrouter/gratis", gratis: true, costeTurno: 0 }],
      presupuesto: { disponible: 0, reserva: 0 },
      preferencias: { nivelador: 0, externaFija: undefined, apagadas: [] },
    };
  }
}

export async function planDelTurno(
  tarea: string,
  dificultad: "baja" | "media" | "alta",
  privacidad: "privada" | "ambito" | "publica",
  dep: DependenciasRepartoVivo
): Promise<{ entrada: EntradaReparto; plan: PlanReparto }> {
  try {
    const entrada = await entradaRepartoDesde(dep);
    entrada.tarea = tarea as any;
    entrada.dificultad = dificultad;
    entrada.privacidad = privacidad;
    let plan = repartir(entrada);
    if (plan.motor !== "ninguno" && plan.motor !== "invitado" && plan.motor !== "api-externa") {
      if (entrada.capasLocales.includes(plan.capa as CapaLocal)) {
        try {
          // Build the input for planificar
          const planificacionInput: EntradaPlanificador = {
            tarea: entrada.tarea as any,
            dificultad: entrada.dificultad as any,
            latenciaMs: 0,
            privacidad: entrada.privacidad,
            segundoPlano: false,
            ambito: undefined,
            perfil: {
              medio: entrada.medio === "servidor" ? "servidor" :
                     entrada.medio === "nativo" ? "nativo" :
                     entrada.medio === "pwa" ? "pwa" : "web",
              conexion: entrada.conexion === "sin" ? "sin" : "rapida",
              webgpu: false,
              ramMb: 0,
              bateriaPct: null,
              saveData: false,
              visible: true,
            },
            presupuesto: {
              discoMb: 0,
              ramMb: 0,
            },
            instaladas: [],
            nodos: [],
            preferencias: {
              activo: true,
              capas: { local: true, mesh: true, nube: true, colectiva: true },
              nivelador: 0.5,
              especifico: null,
            },
          };
          const planificacion = await planificar(planificacionInput);
          // Enhance the plan with the results from planificar
          return {
            entrada,
              plan: {
                ...plan,
                // We will ignore profundidad and nodo for now.
                modelo: planificacion.modelo,
              }
          };
        } catch {
          return { entrada, plan };
        }
      }
    }
    return { entrada, plan };
  } catch {
    const entrada = await entradaRepartoDesde(dep);
    entrada.tarea = tarea as any;
    entrada.dificultad = dificultad;
    entrada.privacidad = privacidad;
    const plan = repartir(entrada);
    return { entrada, plan };
  }
}