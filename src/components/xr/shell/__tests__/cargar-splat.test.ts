<<<<<<< HEAD
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
        expect(presupuestoSplat("baja")).toBe(0);
        expect(presupuestoSplat("media")).toBe(0);
        expect(presupuestoSplat("minima")).toBe(0);
=======
import { describe, it, expect } from "vitest";
import { URL_OK, puedeUsarSplat, PRESUPUESTO_SPLAT, urlSplatSegura, marcadorSplat, cargarSplat } from "@/lib/xr/splat";

const claseFalsa = (impl: () => Promise<unknown> | unknown) => {
    class Falsa {
        constructor() {
            return impl();
        }
    }
    return Falsa;
};

const URL_OK = "https://biblioteca.starseed.os/splats/jardin.spz";

describe("puedeUsarSplat", () => {
    it("sólo alta y máxima", () => {
        expect(puedeUsarSplat("maxima")).toBe(true);
        expect(puedeUsarSplat("alta")).toBe(true);
        expect(puedeUsarSplat("media")).toBe(false);
        expect(puedeUsarSplat("baja")).toBe(false);
        expect(puedeUsarSplat("minima")).toBe(false);
    });
});

describe("PRESUPUESTO_SPLAT", () => {
    it("por nivel: 1,5 M en alta y 3 M en máxima, 0 debajo", () => {
        expect(PRESUPUESTO_SPLAT.alta).toBe(1_500_000);
        expect(PRESUPUESTO_SPLAT.maxima).toBe(3_000_000);
        expect(PRESUPUESTO_SPLAT.media).toBe(0);
>>>>>>> 1eab57b81 (salvavidas · RTXR1010AM: trabajo del agente antes de las puertas (tsc / vitest))
    });
});

describe("urlSplatSegura", () => {
<<<<<<< HEAD
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
        expect(urlSplatDeObjeto(objeto({ tipo: "texto", contenido: "hola" }))).toBeNull();
=======
    it("https sí; http, credenciales y basura no", () => {
        expect(urlSplatSegura(URL_OK)).toBe(true);
        expect(urlSplatSegura("http://biblioteca.starseed.os/splats/jardin.spz")).toBe(false);
        expect(urlSplatSegura("https://ana:secreto@biblioteca.starseed.os/jardin.spz")).toBe(false);
        expect(urlSplatSegura("")).toBe(false);
        expect(urlSplatSegura("no es una url")).toBe(false);
    });
});

describe("marcadorSplat", () => {
    it("nivel bajo, sin enlace, o listo", () => {
        expect(marcadorSplat("media", URL_OK)).toBe("Este objeto necesita un aparato más potente.");
        expect(marcadorSplat("alta", undefined)).toBe("Este splat de la Biblioteca todavía no tiene enlace de descarga.");
        expect(marcadorSplat("maxima", URL_OK)).toBeNull();
>>>>>>> 1eab57b81 (salvavidas · RTXR1010AM: trabajo del agente antes de las puertas (tsc / vitest))
    });
});

describe("cargarSplat", () => {
<<<<<<< HEAD
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
});
=======
    it("URL http rechazada sin tocar el cargador", async () => {
        let construida = false;
        const r = await cargarSplat("http://insegura.os/splat.ply", {
            SplatMesh: claseFalsa(() => {
                construida = true;
                return Promise.resolve();
            }),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("https");
        expect(construida).toBe(false);
    });

    it("archivo de más de 60 MB se rechaza con motivo", async () => {
        const r = await cargarSplat(URL_OK, {
            bytes: 65 * 1024 * 1024,
            SplatMesh: claseFalsa(() => Promise.resolve()),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("60 MB");
        expect(65 * 1024 * 1024 > PRESUPUESTO_SPLAT.alta).toBe(true);
    });

    it("HEAD que responde Content-Length enorme también se rechaza", async () => {
        const pedir: typeof fetch = async () =>
            new Response(null, { headers: { "Content-Length": String(PRESUPUESTO_SPLAT.alta + 1) } });
        const r = await cargarSplat(URL_OK, { pedir, SplatMesh: claseFalsa(() => Promise.resolve()) });
        expect(r.ok).toBe(false);
    });

    it("cargador que lanza en el constructor devuelve {ok:false}", async () => {
        const r = await cargarSplat(URL_OK, {
            SplatMesh: claseFalsa(() => {
                throw new Error("GPU sin memoria");
            }),
            bytes: 1024,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("GPU sin memoria");
    });

    it("initialized que rechaza devuelve {ok:false}", async () => {
        const r = await cargarSplat(URL_OK, {
            SplatMesh: claseFalsa(() => Promise.reject(new Error("formato desconocido"))),
            bytes: 1024,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.motivo).toContain("formato desconocido");
    });

    it("carga feliz pasa la URL y el presupuesto del nivel a la malla", async () => {
        const vistas: SplatMeshOptions[] = [];
        const Clase = class CargoVisto {
            initialized: Promise<unknown>;
            constructor(opciones: SplatMeshOptions) {
                vistas.push(opciones);
                this.initialized = Promise.resolve();
            }
        } as unknown as MallaSplat;
        const r = await cargarSplat(URL_OK, { SplatMesh: Clase, nivel: "alta", bytes: 1024 });
        expect(r.ok).toBe(true);
        expect(vistas[0].url).toBe(URL_OK);
        expect(vistas[0].maxSplats).toBe(PRESUPUESTO_SPLAT.alta);
    });

    it("sin nivel no fija maxSplats", async () => {
        const vistas: SplatMeshOptions[] = [];
        const Clase = class CargoVisto {
            initialized: Promise<unknown>;
            constructor(opciones: SplatMeshOptions) {
                vistas.push(opciones);
                this.initialized = Promise.resolve();
            }
        } as unknown as MallaSplat;
        await cargarSplat(URL_OK, { SplatMesh: Clase, bytes: 1024 });
        expect(vistas[0].maxSplats).toBeUndefined();
    });
});
>>>>>>> 1eab57b81 (salvavidas · RTXR1010AM: trabajo del agente antes de las puertas (tsc / vitest))
