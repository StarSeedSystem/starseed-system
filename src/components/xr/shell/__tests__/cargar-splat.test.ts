/**
 * XR1010AM · splats gaussianos: nivel, presupuesto, seguridad de URL y carga perezosa.
 * Todo puro: el descargador y el constructor de Spark se inyectan, así que no hay red,
 * ni disco, ni WebGL. Los motivos se comprueban tal como los lee la persona.
 */
import { describe, expect, it } from "vitest";
import type { ObjetoMundo } from "../../../../lib/xr/mundo-tipos";
import {
    cargarSplat,
    MAX_BYTES_SPLAT,
    MOTIVO_SPLAT_GRANDE,
    MOTIVO_URL_INSEGURA,
    presupuestoSplat,
    puedeUsarSplat,
    urlSplatDeObjeto,
    urlSplatSegura,
    type OpcionesSplatMesh,
} from "../cargar-splat";

class MallaFalsa {
    static ultima: OpcionesSplatMesh | null = null;
    constructor(opciones?: OpcionesSplatMesh) {
        MallaFalsa.ultima = opciones ?? null;
    }
}

const URL = "https://cdn.ejemplo.org/mundos/bosque.spz";

function objeto(fuente: ObjetoMundo["fuente"]): ObjetoMundo {
    return { id: "obj", nombre: "Bosque", fuente, pos: [0, 0, 0], rot: [0, 0, 0], esc: [1, 1, 1], color: "#10B981", prioridad: 1 };
}

describe("puedeUsarSplat", () => {
    it("solo los niveles alta y máxima pintan splats", () => {
        expect(puedeUsarSplat("minima")).toBe(false);
        expect(puedeUsarSplat("baja")).toBe(false);
        expect(puedeUsarSplat("media")).toBe(false);
        expect(puedeUsarSplat("alta")).toBe(true);
        expect(puedeUsarSplat("maxima")).toBe(true);
    });
});

describe("presupuestoSplat", () => {
    it("reserva 1,5 M de puntos en alta, 3 M en máxima y nada en los niveles bajos", () => {
        expect(presupuestoSplat("alta")).toBe(1_500_000);
        expect(presupuestoSplat("maxima")).toBe(3_000_000);
        expect(presupuestoSplat("media")).toBe(0);
        expect(presupuestoSplat("minima")).toBe(0);
    });
});

describe("urlSplatSegura", () => {
    it("acepta https y rechaza http, credenciales y rutas relativas", () => {
        expect(urlSplatSegura(URL)).toBe(true);
        expect(urlSplatSegura("http://cdn.ejemplo.org/bosque.spz")).toBe(false);
        expect(urlSplatSegura("https://ana:secreto@cdn.ejemplo.org/bosque.spz")).toBe(false);
        expect(urlSplatSegura("/mundos/bosque.spz")).toBe(false);
        expect(urlSplatSegura("")).toBe(false);
    });
});

describe("urlSplatDeObjeto", () => {
    it("solo devuelve la URL cuando el objeto es un splat de la Biblioteca", () => {
        expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: URL, formato: "splat" }))).toBe(URL);
        expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: URL, formato: "glb" }))).toBeNull();
        expect(urlSplatDeObjeto(objeto({ tipo: "primitiva", forma: "caja" }))).toBeNull();
    });
});

describe("cargarSplat", () => {
    it("un archivo por encima del tope no se carga y lo explica", async () => {
        const resultado = await cargarSplat(URL, {
            SplatMesh: MallaFalsa,
            pedirBytes: async () => new ArrayBuffer(2_048),
            maxBytes: 1_024,
        });
        expect(resultado).toEqual({ ok: false, motivo: MOTIVO_SPLAT_GRANDE });
        expect(MAX_BYTES_SPLAT).toBe(60 * 1024 * 1024);
    });

    it("si el descargador lanza, devuelve motivo en vez de propagar la excepción", async () => {
        const resultado = await cargarSplat(URL, {
            SplatMesh: MallaFalsa,
            pedirBytes: async () => { throw new Error("sin red"); },
        });
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) expect(resultado.motivo).toContain("sin red");
    });

    it("si el cargador falso lanza al construir, devuelve { ok:false }", async () => {
        class SplatQueFalla {
            constructor() { throw new Error("WebGL no disponible"); }
        }
        const resultado = await cargarSplat(URL, {
            SplatMesh: SplatQueFalla,
            pedirBytes: async () => new ArrayBuffer(64),
        });
        expect(resultado.ok).toBe(false);
        if (!resultado.ok) expect(resultado.motivo).toContain("WebGL no disponible");
    });

    it("una URL insegura se rechaza antes de pedir un solo byte", async () => {
        let pedidos = 0;
        const resultado = await cargarSplat("http://cdn.ejemplo.org/bosque.spz", {
            SplatMesh: MallaFalsa,
            pedirBytes: async () => { pedidos += 1; return new ArrayBuffer(8); },
        });
        expect(pedidos).toBe(0);
        expect(resultado).toEqual({ ok: false, motivo: MOTIVO_URL_INSEGURA });
    });

    it("con url y bytes válidos crea la malla con el presupuesto del nivel", async () => {
        MallaFalsa.ultima = null;
        const resultado = await cargarSplat(URL, {
            SplatMesh: MallaFalsa,
            pedirBytes: async () => new ArrayBuffer(128),
            maxSplats: presupuestoSplat("maxima"),
        });
        expect(resultado.ok).toBe(true);
        if (resultado.ok) expect(resultado.bytes).toBe(128);
        const opciones = MallaFalsa.ultima as OpcionesSplatMesh | null;
        expect(opciones).toMatchObject({ url: URL, maxSplats: 3_000_000 });
        expect(opciones?.fileBytes).toBeInstanceOf(ArrayBuffer);
    });

    it("sin tope explícito usa los 60 MB reales: un archivo mayor se rechaza y lo explica", async () => {
        const resultado = await cargarSplat(URL, {
            SplatMesh: MallaFalsa,
            pedirBytes: async () => new ArrayBuffer(MAX_BYTES_SPLAT + 1),
        });
        expect(resultado).toEqual({ ok: false, motivo: MOTIVO_SPLAT_GRANDE });
    });

    it("sin maxSplats explícito aplica el presupuesto de alta (1,5 M) a la malla", async () => {
        MallaFalsa.ultima = null;
        const resultado = await cargarSplat(URL, {
            SplatMesh: MallaFalsa,
            pedirBytes: async () => new ArrayBuffer(64),
        });
        expect(resultado.ok).toBe(true);
        expect(MallaFalsa.ultima).toMatchObject({ url: URL, maxSplats: presupuestoSplat("alta") });
    });
});
