import { afterEach, describe, expect, it, vi } from "vitest";
import { componerProcesos, hardwareDeLecturas, leerProcesos, type FuentesProcesos } from "../procesos-fuentes";

const m = vi.hoisted(() => ({
    autonomo: vi.fn(), historial: vi.fn(), entidades: vi.fn(), propuestas: vi.fn(),
    sueno: vi.fn(), imaginacion: vi.fn(), ejecuciones: vi.fn(), instalaciones: vi.fn(),
    ventanas: vi.fn(), neuronas: vi.fn(), presencia: vi.fn(),
}));
vi.mock("@/lib/metagenesis/remoto-nodos-cliente", () => ({ leerEstadoAutonomo: m.autonomo }));
vi.mock("@/lib/genesis/historial", () => ({ leerHistorial: m.historial }));
vi.mock("@/lib/genesis/entidades", () => ({ misEntidades: m.entidades, propuestasDe: m.propuestas }));
vi.mock("@/lib/astraura/astraura-158-client", () => ({
    fetchAstraura158DreamStatus: m.sueno, fetchAstraura158ImaginationStatus: m.imaginacion,
}));
vi.mock("@/lib/aurora/imagine", () => ({ listRuns: m.ejecuciones }));
vi.mock("@/lib/instalaciones/instalaciones-store", () => ({ leerInstalaciones: m.instalaciones }));
vi.mock("@/components/desktop/desktop-store", () => ({ readDesktopsSnapshot: m.ventanas }));
vi.mock("@/lib/neurons/neurons", () => ({ listNeurons: m.neuronas }));
vi.mock("@/lib/neurons/presencia", () => ({ presenciaActual: m.presencia }));

const PUBLICACIONES: Record<string, unknown> = {}, pesados: string[] = [];

function simular(estado: number, cuerpo: unknown): Response {
    return { ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo } as unknown as Response;
}

function publicar(url: string): Promise<Response> {
    pesados.push(url);
    const plan = PUBLICACIONES[url] ?? "404";
    if (plan === "colgar") return new Promise<Response>(() => {});
    return plan === "roto" ? Promise.reject(new Error("HTTP 500"))
        : Promise.resolve(simular(plan === "404" ? 404 : 200, plan === "404" ? null : plan));
}

function bases(): void {
    vi.clearAllMocks();
    pesados.length = 0;
    Object.assign(PUBLICACIONES, {
        "/api/mando/agentes": { sesiones: [{ id: "s1", activa: true, titulo: "Sesión viva", medio: "hermes" }], procesos: [] },
        "/api/mando/medidores": { latidos: [{ tarea: "CB1", fase: "escribiendo", modelo: "m", minutos: 2 }] },
        "/api/mando/suenos": { datos: { sesion: { sesion: "2026-10-20", filas: [] } } },
        "/api/mando/hardware": { cpuPct: 41, nucleos: 10, carga: 2.5, ramUsadaMb: 4096, ramTotalMb: 8192, gpuPct: 7, gpuNombre: "M3", discoLibreGb: 100, discoTotalGb: 500, bateriaPct: 78, cargando: false },
    });
    m.autonomo.mockResolvedValue({ ok: true, estado: { nodos: [{ nodo: "a1", vivo: true, orquestadores: ["c"], cpu_pct: 3, ram_total_mb: 100, ram_libre_mb: 50 }] } });
    m.historial.mockResolvedValue({ entradas: [] }); m.entidades.mockResolvedValue({ ok: false });
    m.sueno.mockResolvedValue({ ok: true, data: { is_dreaming: true, operation_mode: "auto" } });
    m.imaginacion.mockResolvedValue({ ok: true, data: { active_processes_count: 0 } });
    m.ejecuciones.mockResolvedValue([]); m.instalaciones.mockImplementation(() => []);
    m.ventanas.mockImplementation(() => ({ desktops: [] })); m.presencia.mockReturnValue({ medios: [] });
    m.neuronas.mockResolvedValue([{ id: "n1", nombre: "Móvil", capabilities: { bateria: { level: 72, charging: false }, cuota: { total_gb: 12, libre_gb: 5 } } }]);
    vi.stubGlobal("fetch", vi.fn(async (entrada: string | URL) => publicar(String(entrada))));
}

const fuente = (r: Awaited<ReturnType<typeof leerProcesos>>, nombre: string) => r.fuentes.find((f) => f.nombre === nombre);

afterEach(() => { vi.unstubAllGlobals(); });

const fuentes: FuentesProcesos = {
    agentes: {
        sesiones: [{ id: "s1", activa: true, titulo: "Sesión viva", medio: "hermes", inicio: "2026-10-20T10:00:00Z" }],
        procesos: [{ pid: 7, tipo: "orquestador", detalle: "orquestador", desde: "2026-10-20T10:00:00Z" }],
    },
    medidores: { latidos: [{ tarea: "CB1", fase: "escribiendo", modelo: "m", minutos: 4, donde: "mac" }] },
    nodos: { ok: true, estado: { nodos: [{ nodo: "a1", vivo: true, orquestadores: ["cola-auto"] }] } },
    poligenesis: {
        entradas: [{ id: "e1", estado: "propuesta", titulo: "Cambio", at: 5, ambito: { tipo: "persona" } }],
        propuestas: [{ id: "p1", titulo: "Votación", estado: "open", creada: "2026-10-20T00:00:00Z" }],
    },
    suenos: { datos: { sesion: { sesion: "2026-10-20", filas: [{ id: "f1", area: "diseño", lente: "armonía", estado: "analizando" }] } } },
    suenosAstraura: { ok: true, data: { is_dreaming: true, operation_mode: "auto" } },
    imaginacion: {
        data: { active_processes_count: 1 },
        runs: [{ id: "r1", title: "Run", status: "running", server: "starseed", created_at: "2026-10-20T00:00:00Z" }],
    },
    instalaciones: [
        { id: "d1", appNombre: "App", estado: "pedida", neuronaNombre: "Mac" },
        { id: "d2", appNombre: "Otra", estado: "descargada" },
        { id: "d3", appNombre: "Hecha", estado: "instalada" },
    ],
    actualizaciones: { atrasos: [{ neuronaId: "n1", nombre: "Móvil", capa: "interfaz", tiene: "1", deberia: "2", motivo: "fallo", texto: "falló: sin red" }] },
    ventanas: { desktops: [{ id: "dsk", name: "Escritorio", windows: [{ id: "w1", minimized: true, contentRef: { name: "Editor", type: "app" } }] }] },
    presencia: { medios: [{ n: "n1", m: "m1", etiqueta: "Móvil", visible: false, tipo: "movil", desde: "2026-10-20T00:00:00Z" }] },
};

describe("componerProcesos", () => {
    it("junta una muestra de cada fuente sin duplicar y deja en marcha primero", () => {
        const r = componerProcesos(fuentes);
        expect(r.map((x) => x.id)).toEqual(expect.arrayContaining([
            "agente:s1",
            "proceso:7",
            "latido:CB1",
            "nodo:a1:cola-auto",
            "propuesta:e1",
            "propuesta:p1",
            "sueno:2026-10-20:f1",
            "sueno:astraura",
            "imaginacion:astraura",
            "imaginacion:r1",
            "instalacion:d1",
            "instalacion:d2",
            "actualizacion:n1:interfaz",
            "ventana:dsk:w1",
            "presencia:m1",
        ]));
        expect(r.some((x) => x.id === "instalacion:d3")).toBe(false);
        expect(r[0].estado).toBe("en-marcha");
        expect(r.every((x) => x.fuente.length > 0)).toBe(true);
        expect(r.find((x) => x.id === "actualizacion:n1:interfaz")?.estado).toBe("fallando");
    });

    it("fuentes vacías o rotas no inventan procesos", () => {
        expect(componerProcesos({})).toEqual([]);
        expect(componerProcesos({
            agentes: { sesiones: "roto" },
            medidores: 42,
            nodos: { estado: { nodos: [null, {}] } },
            poligenesis: { entradas: [{ id: 1 }], propuestas: [{ titulo: "sin id" }] },
            suenos: { datos: null },
            imaginacion: { data: null },
            instalaciones: [{ estado: "pedida" }],
            actualizaciones: { atrasos: [{}] },
            ventanas: { desktops: [{ windows: [{}] }] },
            presencia: { medios: [{}] },
        })).toEqual([]);
    });
});

describe("leerProcesos", () => {
    it("lee las doce fuentes en paralelo, mide el tiempo real y añade el hardware", async () => {
        bases();
        const r = await leerProcesos({ plazoMs: 200 });
        expect(r.fuentes.length).toBe(12);
        expect(r.fuentes.every((f) => f.ok && typeof f.ms === "number" && f.ms >= 1)).toBe(true);
        expect(r.procesos.map((p) => p.id)).toEqual(expect.arrayContaining(["agente:s1", "latido:CB1", "sueno:astraura"]));
        expect(r.hardware.map((h) => h.tipo)).toEqual(["mac", "a1", "neurona"]);
        expect(r.hardware.find((h) => h.tipo === "mac")?.cpuPct).toBe(41);
    });

    it("una fuente que rechaza no tumba a las demás", async () => {
        bases();
        m.ejecuciones.mockRejectedValue(new Error("sin red"));
        const r = await leerProcesos({ plazoMs: 200 });
        expect(fuente(r, "listRuns()")?.ok).toBe(false);
        expect(fuente(r, "listRuns()")?.motivo).toBe("no disponible aquí");
        expect(r.procesos.map((p) => p.id)).toContain("agente:s1");
    });

    it("un 404 es «no disponible aquí», no un fallo, y no da conectividad falsa", async () => {
        bases();
        PUBLICACIONES["/api/mando/hardware"] = "404";
        PUBLICACIONES["/api/mando/suenos"] = "404";
        const r = await leerProcesos({ plazoMs: 200 });
        expect(fuente(r, "/api/mando/hardware")?.motivo).toBe("no disponible aquí");
        expect(r.hardware.map((h) => h.tipo)).toEqual(["a1", "neurona"]);
        expect(fuente(r, "/api/mando/suenos")?.ok).toBe(false);
        expect(r.procesos.map((p) => p.id)).toContain("sueno:astraura");
        expect(r.procesos.some((p) => p.fuente === "/api/mando/suenos")).toBe(false);
    });

    it("el tope corta a la fuente colgada y el resto sigue", async () => {
        bases();
        m.ejecuciones.mockReturnValue(new Promise(() => {}));
        const r = await leerProcesos({ plazoMs: 50 });
        expect(fuente(r, "listRuns()")?.ok).toBe(false);
        expect(fuente(r, "listRuns()")?.motivo).toContain("colgada");
        expect(fuente(r, "/api/mando/agentes")?.ok).toBe(true);
    });

    it("incluirMac en falso salta las fuentes de la Mac", async () => {
        bases();
        const r = await leerProcesos({ incluirMac: false, plazoMs: 200 });
        expect(r.fuentes.length).toBe(8);
        expect(pesados).toEqual([]);
        expect(r.hardware.map((h) => h.tipo)).toEqual(["a1", "neurona"]);
    });
});

describe("hardwareDeLecturas", () => {
    it("junta Mac, nodos y neuronas; lo no leído no inventa entradas", () => {
        const ahora = 1000;
        const r = hardwareDeLecturas(
            { cpuPct: 12 },
            { ok: true, estado: { nodos: [{ nodo: "a1", vivo: true }] } },
            [{ id: "n1" }],
            ahora,
        );
        expect(r.map((h) => h.tipo)).toEqual(["mac", "a1", "neurona"]);
        expect(hardwareDeLecturas(null, { ok: false, estado: { nodos: [{ nodo: "x" }] } }, null, ahora)).toEqual([]);
    });
});
