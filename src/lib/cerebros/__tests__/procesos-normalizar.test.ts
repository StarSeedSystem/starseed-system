import { describe, expect, it } from "vitest";
import {
  agruparPorTipo,
  desdeActualizaciones,
  desdeAgentesMac,
  desdeImaginacion,
  desdeInstalaciones,
  desdeLatidos,
  desdeNodos,
  desdePoligenesis,
  desdePresencia,
  desdeSuenos,
  desdeVentanas,
  unirProcesos,
} from "../procesos-normalizar";
import type { ProcesoActivo } from "../procesos";

const pr = (id: string, estado: ProcesoActivo["estado"]): ProcesoActivo => ({
  id, tipo: "genesis", nombre: id, estado, progreso: null, donde: "mac", desde: null, fuente: "prueba",
});

describe("normalizadores", () => {
  it("agentes: sesiones activas y procesos de agente/orquestador, sin servidor", () => {
    const r = desdeAgentesMac({
      sesiones: [{ id: "s1", activa: true, titulo: "Sesión", medio: "hermes", inicio: "2026-10-20T10:00:00Z" }, { id: "s2", activa: false }],
      procesos: [{ pid: 11, tipo: "agente", detalle: "opencode run", desde: "2026-10-20T10:00:00Z" }, { pid: 12, tipo: "servidor" }],
    });
    expect(r.map((x) => x.id)).toEqual(["agente:s1", "proceso:11"]);
    expect(r[0]).toMatchObject({ tipo: "genesis", estado: "en-marcha", donde: "hermes", desde: Date.parse("2026-10-20T10:00:00Z") });
  });
  it("latidos: fase, modelo, minutos y donde", () => {
    const [l] = desdeLatidos({ latidos: [{ tarea: "CB1", fase: "escribiendo", modelo: "m", minutos: 10, donde: "esta Mac" }] }, 1_000_000);
    expect(l).toMatchObject({ id: "latido:CB1", estado: "en-marcha", donde: "esta Mac", desde: 400_000 });
    expect(l.detalle).toContain("modelo m");
  });
  it("nodos: solo orquestadores de nodos vivos", () => {
    const r = desdeNodos({ ok: true, estado: { nodos: [{ nodo: "a1", vivo: true, orquestadores: ["orq"] }, { nodo: "b", vivo: false, orquestadores: ["x"] }, { nodo: "c", vivo: true, orquestadores: [] }] } });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "nodo:a1:orq", donde: "a1", tipo: "genesis" });
  });
  it("poligenesis: propuestas abiertas del historial y de la entidad", () => {
    const r = desdePoligenesis({
      entradas: [{ id: "e1", estado: "propuesta", titulo: "Cambio", at: 5, ambito: { tipo: "entidad", entidad: { nombre: "Grupo" } } }],
      lista: [{ id: "p1", titulo: "Votación", estado: "open", creada: "2026-10-20T00:00:00Z" }, { id: "p2", estado: "executed" }],
    });
    expect(r.map((x) => x.id)).toEqual(["poligenesis:e1", "poligenesis:p1"]);
    expect(r[0]).toMatchObject({ tipo: "poligenesis", donde: "Grupo", desde: 5 });
  });
  it("sueños: filas activas de Genesis y el estado de Astraura", () => {
    const mando = desdeSuenos({ datos: { sesion: { sesion: "2026-10-20", filas: [{ id: "f1", area: "diseño", lente: "armonía", estado: "analizando", subfase: "lectura 1/2" }, { id: "f2", estado: "verificado" }] } } });
    expect(mando).toHaveLength(1);
    expect(mando[0]).toMatchObject({ id: "sueno:f1", estado: "en-marcha", nombre: "diseño · armonía" });
    const astraura = desdeSuenos({ ok: true, data: { is_dreaming: true, operation_mode: "auto", cycles_completed: 3 } });
    expect(astraura[0]).toMatchObject({ id: "sueno:astraura", estado: "en-marcha" });
  });
  it("imaginación: procesos activos y ejecuciones en curso", () => {
    const r = desdeImaginacion({ imaginacion: { ok: true, data: { active_processes_count: 2, active_process_types: ["audio", "texto"] } }, runs: [{ id: "r1", title: "Run", status: "running", server: "starseed", created_at: "2026-10-20T00:00:00Z" }, { id: "r2", status: "done" }] });
    expect(r.map((x) => x.id)).toEqual(["imaginacion:audio", "imaginacion:texto", "imaginacion:r1"]);
    expect(r[2]).toMatchObject({ tipo: "imaginacion", donde: "starseed", desde: Date.parse("2026-10-20T00:00:00Z") });
  });
  it("instalaciones: pedida es descarga y descargada es instalación", () => {
    const r = desdeInstalaciones([{ id: "d1", appNombre: "App", estado: "pedida", neuronaNombre: "Mac", creada: 9 }, { id: "d2", appNombre: "Otra", estado: "descargada" }, { id: "d3", appNombre: "Hecha", estado: "instalada" }]);
    expect(r.map((x) => [x.id, x.tipo, x.estado])).toEqual([["instalacion:d1", "descarga", "esperando"], ["instalacion:d2", "instalacion", "en-marcha"]]);
    expect(r[0].donde).toBe("Mac");
  });
  it("actualizaciones: capas atrasadas y fuentes con versión nueva", () => {
    const r = desdeActualizaciones({ atrasos: [{ neuronaId: "n1", nombre: "Móvil", capa: "interfaz", tiene: "1", deberia: "2", motivo: "manual" }], fuentes: [{ id: "pkg", instalada: "1", remota: "2", estado: "hay-actualizacion" }, { id: "otro", estado: "igual" }] });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: "actualizacion:n1:interfaz", donde: "Móvil", detalle: "1 → 2" });
    expect(r[1]).toMatchObject({ id: "actualizacion:pkg", donde: "servidor" });
  });
  it("ventanas: solo las minimizadas, con su escritorio", () => {
    const r = desdeVentanas({ desktops: [{ id: "dsk", name: "Escritorio", windows: [{ id: "w1", minimized: true, contentRef: { name: "Editor", type: "app" } }, { id: "w2", minimized: false }] }] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "ventana:dsk:w1", nombre: "Editor", donde: "Escritorio", tipo: "app-fondo" });
  });
  it("presencia: solo medios no visibles, con su neurona", () => {
    const r = desdePresencia({ medios: [{ n: "n1", m: "m1", etiqueta: "Móvil", visible: false, desde: "2026-10-20T00:00:00Z", tipo: "movil" }, { n: "n2", m: "m2", visible: true }] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "presencia:n1:m1", donde: "n1", nombre: "Móvil", desde: Date.parse("2026-10-20T00:00:00Z") });
  });
});

describe("unirProcesos y agruparPorTipo", () => {
  it("quita duplicados por id y deja primero los que están en marcha", () => {
    const r = unirProcesos([pr("a", "esperando"), pr("b", "en-marcha")], [pr("a", "en-marcha"), pr("c", "fallando")]);
    expect(r.map((x) => x.id)).toEqual(["b", "a", "c"]);
  });
  it("agrupa por tipo", () => {
    expect(agruparPorTipo([pr("a", "en-marcha"), pr("b", "en-marcha")])).toEqual({ genesis: [pr("a", "en-marcha"), pr("b", "en-marcha")] });
  });
});

describe("entradas vacías o rotas", () => {
  const fuentes = [desdeAgentesMac, desdeLatidos, desdeNodos, desdePoligenesis, desdeSuenos, desdeImaginacion, desdeInstalaciones, desdeActualizaciones, desdeVentanas, desdePresencia];
  it("null, undefined, número, objeto roto y lista vacía → []", () => {
    for (const f of fuentes) for (const roto of [null, undefined, 42, "texto", { roto: true }, []]) expect(f(roto)).toEqual([]);
  });
});
