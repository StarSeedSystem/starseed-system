import { beforeEach, vi, describe, expect, it } from "vitest";
import { componerProcesos, type FuentesProcesos, leerProcesos } from "../procesos-fuentes";

const FuentesProcesosMock: FuentesProcesos = {
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
        const r = componerProcesos(FuentesProcesosMock);
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

    it("no mezcla procesos en marcha con los que esperan", () => {
        const r = componerProcesos({
            poligenesis: { propuestas: [{ id: "p1", titulo: "Votación", estado: "open" }] },
            medidores: { latidos: [{ tarea: "CB1", fase: "escribiendo", modelo: "m", minutos: 1, donde: "mac" }] },
        });
        expect(r[0].estado).toBe("en-marcha");
        expect(r[r.length - 1].estado).toBe("esperando");
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

describe("leerProcesos - firmas y comportamiento básico", () => {
    it(" existe y devuelve la estructura esperada", async () => {
        const result = await leerProcesos({});
        expect(result).toHaveProperty("procesos");
        expect(result).toHaveProperty("hardware");
        expect(result).toHaveProperty("fuentes");
        expect(Array.isArray(result.fuentes)).toBe(true);
    });

    it("incluirMac por defecto incluye hardware", async () => {
        const result = await leerProcesos({});
        const hwEntry = result.fuentes.find((f: any) => f.nombre.includes("hardware"));
        expect(hwEntry).toBeDefined();
    });

    it("incluirMac falso omite hardware", async () => {
        const result = await leerProcesos({ incluirMac: false });
        const hwEntry = result.fuentes.find((f: any) => f.nombre.includes("hardware"));
        expect(hwEntry).toBeDefined();
        expect(hwEntry!.nombre).toContain("solo Mac");
    });
});