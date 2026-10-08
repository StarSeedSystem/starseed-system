import { describe, expect, it } from "vitest";
import { leerPreferenciaCapas } from "../../capas-conciencia";
import {
  planificar,
  type CapaInstalada,
  type EntradaPlanificador,
  type NodoCapas,
} from "../planificador";

const SHA = "a".repeat(64);
const capa = (id: string, tipo: CapaInstalada["capa"], ramMinMb = 0): CapaInstalada =>
  ({ id, capa: tipo, sha256: SHA, ramMinMb, profundidad: tipo === "reflejo" ? 20 : undefined });
const TODAS: CapaInstalada[] = [
  capa("needle3-reflejo", "reflejo", 256),
  capa("bitnet-embedding-0.6b", "memoria", 512),
  capa("ternary-bonsai-4b", "palabra", 3072),
  capa("ternary-bonsai-8b", "razon", 6144),
  capa("ternary-bonsai2-27b", "profunda", 16384),
];
const nodo = (id: string, tipo: NodoCapas["tipo"], propio = false, latenciaMs = 40): NodoCapas =>
  ({ id, tipo, propio, conectado: true, capas: TODAS, latenciaMs });
const NODOS: NodoCapas[] = [
  nodo("par-cuenta", "par", true), nodo("par-publico", "par"),
  nodo("starseed", "servidor-starseed"), nodo("propio", "servidor-propio", true),
  { id: "api", tipo: "api-gratis", conectado: true, capas: [] },
];
const BASE: EntradaPlanificador = {
  tarea: "chat", dificultad: 0.2, privacidad: "publica", segundoPlano: false,
  perfil: { medio: "nativo", conexion: "rapida", webgpu: true, ramMb: 8192, bateriaPct: 80, visible: true },
  presupuesto: { discoMb: 8000, ramMb: 8192 }, instaladas: TODAS, nodos: NODOS,
  preferencias: leerPreferenciaCapas(),
};
const caso = (cambio: Partial<EntradaPlanificador>): EntradaPlanificador => ({ ...BASE, ...cambio });

describe("planificar", () => {
  const escenarios: Array<[string, EntradaPlanificador, Partial<ReturnType<typeof planificar>>]> = [
    ["conversación nativa", BASE, { capa: "palabra", donde: "local", modelo: "ternary-bonsai-4b" }],
    ["web sin WebGPU", caso({ perfil: { ...BASE.perfil, medio: "web", webgpu: false } }), { capa: "palabra", donde: "par" }],
    ["PWA con WebGPU", caso({ perfil: { ...BASE.perfil, medio: "pwa" } }), { capa: "palabra", donde: "local" }],
    ["app con 8 GB", caso({ tarea: "reasoning", dificultad: 0.7 }), { capa: "razon", donde: "local" }],
    ["servidor capaz", caso({ tarea: "long", perfil: { ...BASE.perfil, medio: "servidor", ramMb: 32768 }, presupuesto: { discoMb: 12000, ramMb: 32768 } }), { capa: "profunda", donde: "local" }],
    ["sin red con capa local", caso({ perfil: { ...BASE.perfil, conexion: "sin" } }), { donde: "local" }],
    ["sin red ni capa local", caso({ perfil: { ...BASE.perfil, conexion: "sin" }, instaladas: [] }), { modelo: "ninguno", donde: "local" }],
    ["privado con pares públicos", caso({ privacidad: "privada", instaladas: [], nodos: [NODOS[1], NODOS[2], NODOS[4]] }), { modelo: "ninguno" }],
    ["privado con par de cuenta", caso({ privacidad: "privada", instaladas: [], nodos: [NODOS[0]] }), { donde: "par", nodo: "par-cuenta" }],
    ["privado con servidor propio", caso({ privacidad: "privada", instaladas: [], nodos: [NODOS[3]] }), { donde: "servidor-propio" }],
    ["ámbito en StarSeed", caso({ privacidad: "ambito", instaladas: [], nodos: [NODOS[2]] }), { donde: "servidor-starseed" }],
    ["segundo plano", caso({ tarea: "code", segundoPlano: true }), { capa: "reflejo", modelo: "needle3-reflejo" }],
    ["batería baja", caso({ perfil: { ...BASE.perfil, bateriaPct: 10 } }), { capa: "reflejo" }],
    ["ahorro de datos", caso({ perfil: { ...BASE.perfil, saveData: true } }), { capa: "reflejo" }],
    ["pestaña oculta", caso({ perfil: { ...BASE.perfil, visible: false } }), { capa: "reflejo" }],
    ["capa local apagada", caso({ preferencias: leerPreferenciaCapas({ capa158Local: false }) }), { donde: "par" }],
    ["malla apagada", caso({ instaladas: [], preferencias: leerPreferenciaCapas({ capa158Mesh: false }) }), { donde: "servidor-starseed" }],
    ["nube apagada", caso({ instaladas: [], nodos: [NODOS[0], NODOS[2]], preferencias: leerPreferenciaCapas({ capa158Nube: false }) }), { donde: "par" }],
    ["colectiva apagada", caso({ instaladas: [], nodos: [NODOS[2], NODOS[3]], preferencias: leerPreferenciaCapas({ capa158Colectiva: false }) }), { donde: "servidor-propio" }],
    ["capas 1.58 apagadas", caso({ instaladas: [], preferencias: leerPreferenciaCapas({ astraura158Activo: false }) }), { donde: "api-gratis" }],
    ["nivelador 0", caso({ preferencias: leerPreferenciaCapas({ nivelador158: 0 }) }), { donde: "par" }],
    ["nivelador 100", caso({ preferencias: leerPreferenciaCapas({ nivelador158: 100 }) }), { donde: "local" }],
    ["embeddings", caso({ tarea: "embedding" }), { capa: "memoria", modelo: "bitnet-embedding-0.6b" }],
    ["RAG", caso({ tarea: "rag" }), { capa: "memoria" }],
    ["visión", caso({ tarea: "vision" }), { capa: "profunda", donde: "par" }],
    ["dificultad extrema", caso({ dificultad: 0.9 }), { capa: "profunda" }],
    ["dificultad media", caso({ dificultad: 0.6 }), { capa: "razon" }],
    ["respuesta rápida", caso({ tarea: "fast" }), { capa: "reflejo" }],
    ["herramientas", caso({ tarea: "tools" }), { capa: "reflejo" }],
    ["latencia deseada", caso({ instaladas: [], latenciaMs: 100, nodos: [nodo("lento", "par", false, 900), nodo("rápido", "servidor-starseed", false, 20)] }), { nodo: "rápido" }],
    ["SHA ausente", caso({ perfil: { ...BASE.perfil, conexion: "sin" }, instaladas: [{ ...TODAS[2], sha256: "por-verificar" }] }), { modelo: "ninguno" }],
  ];

  it.each(escenarios)("resuelve %s", (_nombre, entrada, esperado) => {
    expect(planificar(entrada)).toMatchObject(esperado);
  });

  it("limita el respaldo y conserva la privacidad", () => {
    const plan = planificar(caso({ privacidad: "privada" }));
    expect(plan.respaldo.length).toBeLessThanOrEqual(4);
    expect(plan.respaldo.every((p) => p.donde === "local" || p.donde === "par" || p.donde === "servidor-propio")).toBe(true);
  });

  it("ajusta la profundidad de Needle al presupuesto", () => {
    expect(planificar(caso({ tarea: "fast", presupuesto: { discoMb: 12, ramMb: 8192 } })).profundidad).toBe(6);
  });
});
