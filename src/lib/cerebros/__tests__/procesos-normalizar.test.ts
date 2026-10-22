import { describe, expect, it } from "vitest";
import {
  agruparPorTipo, desdeActualizaciones, desdeAgentesMac, desdeImaginacion, desdeInstalaciones,
  desdeLatidos, desdeNodos, desdePoligenesis, desdePresencia, desdeSuenos, desdeVentanas,
  unirProcesos,
} from "../procesos-normalizar";
import type { ProcesoActivo } from "../procesos";

const base = { progreso: null, desde: null } as const;
const proc = (id: string, estado: ProcesoActivo["estado"]): ProcesoActivo => ({
  id, tipo: "genesis", nombre: id, estado, ...base, donde: "mac", fuente: "prueba",
});

describe("fuentes reales", () => {
  it("agentes: solo sesiones activas y procesos de agente/orquestador", () => {
    const r = {
      sesiones: [
        { id: "s1", titulo: "Ana", activa: true, medio: "hermes", modelo: "m", inicio: "2026-10-20T10:00:00Z" },
        { id: "s2", titulo: "Ida", activa: false },
      ],
      procesos: [
        { pid: 12, tipo: "agente", detalle: "opencode run" },
        { pid: 13, tipo: "servidor", detalle: "next start" },
      ],
    };
    const x = desdeAgentesMac(r);
    expect(x.map((p) => p.id)).toEqual(["agente:s1", "proceso:12"]);
    expect(x.every((p) => p.tipo === "genesis" && p.estado === "en-marcha")).toBe(true);
    expect(x[0].detalle).toBe("hermes · m");
    expect(x[0].desde).toBe(Date.parse("2026-10-20T10:00:00Z"));
  });

  it("latidos: tarea, fase, modelo, minutos y dónde, sin inventar progreso", () => {
    const x = desdeLatidos({ latidos: [{ tarea: "CB1013", fase: "escribiendo", modelo: "flash", minutos: 12, donde: "mac", titulo: "Normalizar" }] });
    expect(x).toHaveLength(1);
    expect(x[0]).toMatchObject({ id: "latido:CB1013", nombre: "Normalizar", estado: "en-marcha", donde: "mac", progreso: null });
    expect(x[0].detalle).toBe("escribiendo · flash · 12 min");
  });

  it("nodos: un Genesis por orquestador de cada nodo vivo", () => {
    const r = { ok: true, estado: { nodos: [
      { nodo: "a1", vivo: true, etiqueta: "A1", medio: "mac", orquestadores: ["cola-a", ""] },
      { nodo: "m2", vivo: false, orquestadores: ["cola-b"] },
    ] } };
    const x = desdeNodos(r);
    expect(x.map((p) => [p.id, p.donde, p.estado])).toEqual([["nodo:a1:cola-a", "a1", "en-marcha"]]);
  });

  it("poligenesis: propuestas del historial y propuestas abiertas", () => {
    const r = {
      entradas: [
        { id: "e1", estado: "propuesta", titulo: "Crear sala", at: 1700000000000, ambito: { tipo: "persona" } },
        { id: "e2", estado: "aplicada", titulo: "Ya hecha" },
      ],
      propuestas: [
        { id: "p1", titulo: "Votar", estado: "votacion" },
        { id: "p2", titulo: "Cerrada", estado: "aprobada" },
        { id: "p3", titulo: "Pendiente", estado: "pendiente" },
      ],
    };
    const x = desdePoligenesis(r);
    expect(x.map((p) => p.id)).toEqual(["propuesta:e1", "propuesta:p1", "propuesta:p3"]);
    expect(x.every((p) => p.tipo === "poligenesis" && p.estado === "esperando")).toBe(true);
  });

  it("sueños: orquestador, celdas en curso y estado de Astraura; nada verificado", () => {
    const r = {
      datos: { sesion: {
        sesion: "2026-10-20", orquestadorVivo: true, cuentas: { analizando: 2 },
        filas: [
          { id: "f1", area: "memoria", lente: "claridad", estado: "analizando", subfase: "lectura 1/9" },
          { id: "f2", estado: "verificado" },
        ],
      } },
      dreamStatus: { is_dreaming: true, operation_mode: "auto" },
    };
    const x = desdeSuenos(r);
    expect(x.map((p) => p.id)).toEqual(["sueno:2026-10-20:orquestador", "sueno:2026-10-20:f1", "sueno:astraura"]);
    expect(x[1].detalle).toBe("lectura 1/9");
    expect(x.every((p) => p.tipo === "sueno" && p.progreso === null)).toBe(true);
  });

  it("imaginación: estado real y runs en curso (done fuera)", () => {
    const r = {
      data: { active_processes_count: 2, sync_execution_state: { is_running: true, progress_percent: 50 } },
      runs: [
        { id: "r1", title: "Explorar", status: "running", server: "propio", mode: "fondo" },
        { id: "r2", title: "Hecha", status: "done" },
      ],
    };
    const x = desdeImaginacion(r);
    expect(x.map((p) => p.id)).toEqual(["imaginacion:astraura", "imaginacion:r1"]);
    expect(x[0].progreso).toBe(0.5);
    expect(x[1]).toMatchObject({ estado: "en-marcha", donde: "propio", detalle: "fondo" });
  });

  it("instalaciones: pedida es descarga y descargada es instalación", () => {
    const r = { instalaciones: [
      { id: "d1", appNombre: "Mapas", estado: "pedida", neuronaNombre: "Móvil" },
      { id: "d2", appNombre: "Notas", estado: "descargada" },
      { id: "d3", appNombre: "Hecha", estado: "instalada" },
    ] };
    const x = desdeInstalaciones(r);
    expect(x.map((p) => [p.tipo, p.estado])).toEqual([["descarga", "esperando"], ["instalacion", "en-marcha"]]);
    expect(x[0].donde).toBe("Móvil");
  });

  it("actualizaciones: capas pendientes y atrasos con su motivo", () => {
    const r = {
      neuronas: [{ neuronaId: "n1", nombre: "Mac", versiones: { interfaz: "b1", datos: "b2" } }],
      ultima: { interfaz: "b2", datos: "b2" },
      atrasos: [{ neuronaId: "n2", nombre: "Móvil", capa: "nativa", tiene: "v1", deberia: "v2", motivo: "fallo", texto: "falló: sin red" }],
    };
    const x = desdeActualizaciones(r);
    expect(x.map((p) => p.id)).toEqual(["actualizacion:n2:nativa", "actualizacion:n1:interfaz"]);
    expect(x[0].estado).toBe("fallando");
    expect(x[1].nombre).toBe("Interfaz · Mac");
    expect(x[1].detalle).toBe("tiene b1 · debería b2");
  });

  it("ventanas minimizadas y medios no visibles", () => {
    const v = desdeVentanas({ desktops: [{ id: "d1", name: "Escritorio", windows: [
      { id: "w1", minimized: true, contentRef: { name: "Notas", ref: "notes" } },
      { id: "w2", minimized: false, contentRef: { name: "Otra", ref: "x" } },
    ] }] });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: "ventana:d1:w1", nombre: "Notas", tipo: "app-fondo", estado: "pausado", detalle: "Minimizada" });
    const pr = desdePresencia({ medios: [
      { n: "n1", m: "m1", etiqueta: "Pestaña", tipo: "web", visible: false, desde: "2026-10-20T10:00:00Z" },
      { n: "n2", m: "m2", visible: true },
      { m: "m3", visible: false },
    ] });
    expect(pr.map((p) => [p.id, p.donde])).toEqual([["presencia:m1", "n1"]]);
    expect(pr[0].desde).toBe(Date.parse("2026-10-20T10:00:00Z"));
  });
});

describe("unir y agrupar", () => {
  it("quita duplicados por id y deja en marcha primero", () => {
    const x = unirProcesos([proc("b", "pausado")], [proc("a", "en-marcha"), proc("a", "pausado")]);
    expect(x.map((p) => [p.id, p.estado])).toEqual([["a", "en-marcha"], ["b", "pausado"]]);
    expect(Object.keys(agruparPorTipo(x))).toEqual(["genesis"]);
  });
});

describe("entradas vacías o rotas", () => {
  const fuentes = [desdeAgentesMac, desdeLatidos, desdeNodos, desdePoligenesis, desdeSuenos,
    desdeImaginacion, desdeInstalaciones, desdeActualizaciones, desdeVentanas, desdePresencia];
  it("devuelven [] sin inventar procesos", () => {
    for (const f of fuentes) for (const roto of [null, 7, {}, []]) expect(f(roto)).toEqual([]);
  });
});
