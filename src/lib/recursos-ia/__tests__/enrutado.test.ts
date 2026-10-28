import { describe, it, expect } from "vitest";
import { destinoDeIA, hostDeRuta, sinAntena, urlServidor } from "../enrutado";
import { PUERTO_SERVIDOR_IA } from "../oferta-desde-asignaciones";
import type {
    Alcance,
    Asignacion,
    ConfigTopologia,
    InventarioRecursos,
    MedioAlmacen,
    NeuronaRecursos,
    Procesador,
    Via,
} from "../tipos";

const ESTA = "n-mac";
const A1 = "n-a1";
const ALCANCE: Alcance = { tipo: "perfil", id: "alex", visibilidad: "privada" };
const SIN_ASIGNACIONES: Record<string, Asignacion> = {};

/** Neurona mínima para el inventario de prueba. */
function neurona(id: string, nombre: string, vias: Via[], online = true): NeuronaRecursos {
    return {
        id,
        nombre,
        online,
        esEsta: id === ESTA,
        vias,
        procesadores: [procesador({ id: `${id}:cpu`, neuronaId: id, nombre: `${nombre} · CPU`, via: "local" })],
        almacenes: [],
    };
}

function procesador(datos: { id: string; neuronaId: string; nombre: string; via: Via; tipo?: Procesador["tipo"]; disponible?: boolean; prestable?: boolean }): Procesador {
    return {
        id: datos.id,
        neuronaId: datos.neuronaId,
        tipo: datos.tipo ?? "cpu",
        nombre: datos.nombre,
        aceleradores: [],
        runtimes: [],
        via: datos.via,
        disponible: datos.disponible ?? true,
        propio: true,
        ...(datos.prestable !== undefined ? { prestable: datos.prestable } : {}),
        fuente: "detectado",
    };
}

/** Almacén `servidor-externo` para declarar la dirección del servidor de IA de una neurona. */
function almacenServidor(neuronaId: string, ruta: string): MedioAlmacen {
    return {
        id: `${neuronaId}:srv-ia`,
        tipo: "servidor-externo",
        etiqueta: "Servidor de IA",
        neuronaId,
        ruta,
        via: "local",
        persistente: true,
        privado: true,
        disponible: true,
        fuente: "declarado",
    };
}

/** Inventario de prueba con esta neurona y otras opcionales. */
function inventario(opciones: Partial<InventarioRecursos> = {}): InventarioRecursos {
    return {
        generado: "2026-10-28T00:00:00.000Z",
        estaNeuronaId: opciones.estaNeuronaId ?? ESTA,
        neuronas: opciones.neuronas ?? [neurona(ESTA, "Mac de Alex", ["local", "malla-local"])],
        almacenesSueltos: opciones.almacenesSueltos ?? [],
        procesadoresSueltos: opciones.procesadoresSueltos ?? [],
        ...(opciones.modelosInstalados !== undefined ? { modelosInstalados: opciones.modelosInstalados } : {}),
        avisos: [],
    };
}

/** Plan de topología de prueba. */
function plan(opciones: Partial<ConfigTopologia> = {}): ConfigTopologia {
    return {
        topologia: "cada-neurona",
        vias: ["local", "malla-local", "red-starseed"],
        alcance: ALCANCE,
        ...opciones,
    };
}

describe("hostDeRuta", () => {
    it("saca el host de un origen http", () => {
        expect(hostDeRuta("http://a1.local:4480/v1", false)).toBe("a1.local");
    });

    it("acepta un host pelado y descarta el bucle entre neuronas", () => {
        expect(hostDeRuta("a1.local", false)).toBe("a1.local");
        expect(hostDeRuta("127.0.0.1", false)).toBeNull();
        expect(hostDeRuta("localhost", true)).toBe("localhost");
        expect(hostDeRuta("/Volumes/SSD", false)).toBeNull();
    });
});

describe("urlServidor", () => {
    it("usa el puerto fijo del servidor propio de IA", () => {
        expect(urlServidor("a1.local")).toBe(`http://a1.local:${PUERTO_SERVIDOR_IA}/v1`);
    });
});

describe("sinAntena", () => {
    it("solo las decisiones vuelven por antena", () => {
        expect(sinAntena(["antena", "red-starseed"], "texto")).toEqual(["red-starseed"]);
        expect(sinAntena(["antena", "red-starseed"], "decision")).toEqual(["antena", "red-starseed"]);
    });
});



describe("destinoDeIA · cada-neurona", () => {
    it("va a esta neurona por local", () => {
        const d = destinoDeIA(plan(), SIN_ASIGNACIONES, inventario(), "texto");
        expect(d).toEqual({ via: "local", neuronaId: ESTA, baseUrl: null, motivo: expect.any(String) });
    });
});

describe("destinoDeIA · servidor-propio", () => {
    const inventarioA1 = (ruta?: string, vias: Via[] = ["malla-local", "red-starseed"], online = true): InventarioRecursos => {
        const a1 = neurona(A1, "A1 de la cuenta", vias, online);
        if (ruta) a1.almacenes.push(almacenServidor(A1, ruta));
        return inventario({ neuronas: [neurona(ESTA, "Mac de Alex", ["local", "malla-local"]), a1] });
    };
    const planPropio = plan({ topologia: "servidor-propio", servidorNeuronaId: A1 });

    it("devuelve la URL del servidor declarado de la neurona elegida", () => {
        const d = destinoDeIA(planPropio, SIN_ASIGNACIONES, inventarioA1("http://a1.local:8080/v1"), "texto");
        expect(d.neuronaId).toBe(A1);
        expect(d.via).toBe("malla-local");
        expect(d.baseUrl).toBe(`http://a1.local:${PUERTO_SERVIDOR_IA}/v1`);
    });

    it("sin host conocido: baseUrl nula con un motivo legible", () => {
        const d = destinoDeIA(planPropio, SIN_ASIGNACIONES, inventarioA1(), "texto");
        expect(d.baseUrl).toBeNull();
        expect(d.via).toBe("malla-local");
        expect(d.motivo).toContain("A1 de la cuenta");
    });

    it("si el servidor es esta misma neurona, la vía es local", () => {
        const propioLocal = plan({ topologia: "servidor-propio", servidorNeuronaId: ESTA });
        const inv = inventario();
        inv.neuronas[0].almacenes.push(almacenServidor(ESTA, "http://localhost:4480/v1"));
        expect(destinoDeIA(propioLocal, SIN_ASIGNACIONES, inv, "texto").via).toBe("local");
        expect(destinoDeIA(propioLocal, SIN_ASIGNACIONES, inv, "texto").baseUrl).toBe(`http://localhost:${PUERTO_SERVIDOR_IA}/v1`);
    });
    it("neurona apagada o invisible: por el enrutador (internet) y sin URL", () => {
        const apagada = destinoDeIA(planPropio, SIN_ASIGNACIONES, inventarioA1("http://a1.local:4480/v1", ["malla-local"], false), "texto");
        expect(apagada.via).toBe("internet");
        expect(apagada.baseUrl).toBeNull();
        expect(apagada.neuronaId).toBe("");
        const invisible = destinoDeIA(planPropio, SIN_ASIGNACIONES, inventario(), "texto");
        expect(invisible.via).toBe("internet");
        expect(invisible.baseUrl).toBeNull();
    });

    it("el chat nunca viaja por antena, aunque el plan la permita; las decisiones sí", () => {
        const inv = inventarioA1(undefined, ["antena", "red-starseed"]);
        const planAntena = plan({ topologia: "servidor-propio", servidorNeuronaId: A1, vias: ["antena", "red-starseed"] });
        expect(destinoDeIA(planAntena, SIN_ASIGNACIONES, inv, "texto").via).toBe("red-starseed");
        expect(destinoDeIA(planAntena, SIN_ASIGNACIONES, inv, "decision").via).toBe("antena");
        const soloAntena = inventarioA1(undefined, ["antena"]);
        expect(destinoDeIA(planAntena, SIN_ASIGNACIONES, soloAntena, "texto").via).toBe("internet");
    });
});

describe("destinoDeIA · fragmentada", () => {
    const planFrag = plan({ topologia: "fragmentada", porCapacidad: { imagen: { procesaEn: `${A1}:gpu` } } });

    it("va a la neurona asignada a esa capacidad", () => {
        const a1 = neurona(A1, "A1 de la cuenta", ["malla-local", "red-starseed"]);
        const gpu = procesador({ id: `${A1}:gpu`, neuronaId: A1, nombre: "A1 · GPU", via: "malla-local", tipo: "gpu" });
        a1.procesadores.push(gpu);
        const d = destinoDeIA(planFrag, SIN_ASIGNACIONES, inventario({ neuronas: [neurona(ESTA, "Mac", ["local"]), a1] }), "imagen");
        expect(d.via).toBe("malla-local");
        expect(d.neuronaId).toBe(A1);
        expect(d.baseUrl).toBeNull();
        expect(d.motivo).toContain("imagen");
    });

    it("sin asignación o con procesador caído, se procesa en esta neurona", () => {
        const sinAsignar = plan({ topologia: "fragmentada" });
        expect(destinoDeIA(sinAsignar, SIN_ASIGNACIONES, inventario(), "imagen").neuronaId).toBe(ESTA);
        const a1 = neurona(A1, "A1", ["malla-local"]);
        a1.procesadores.push(procesador({ id: `${A1}:gpu`, neuronaId: A1, nombre: "A1 · GPU", via: "malla-local", disponible: false }));
        expect(destinoDeIA(planFrag, SIN_ASIGNACIONES, inventario({ neuronas: [neurona(ESTA, "Mac", ["local"]), a1] }), "imagen").neuronaId).toBe(ESTA);
    });
    it("a un servidor suelto asignado, por la vía que el procesador declara", () => {
        const planServ = plan({ topologia: "fragmentada", porCapacidad: { razon: { procesaEn: "servidor:s1" } } });
        const inv = inventario({ procesadoresSueltos: [procesador({ id: "servidor:s1", neuronaId: "servidor:s1", nombre: "Servidor del cerebro", via: "internet" })] });
        const d = destinoDeIA(planServ, SIN_ASIGNACIONES, inv, "razon");
        expect(d.via).toBe("internet");
        expect(d.neuronaId).toBe("servidor:s1");
    });
});

describe("destinoDeIA · comunal", () => {
    it("va al servidor comunal prestado y disponible", () => {
        const inv = inventario({ procesadoresSueltos: [procesador({ id: "servidor:com1", neuronaId: "servidor:com1", nombre: "Servidor comunal", via: "red-starseed", tipo: "servidor", prestable: true })] });
        const d = destinoDeIA(plan({ topologia: "comunal" }), SIN_ASIGNACIONES, inv, "texto");
        expect(d.via).toBe("red-starseed");
        expect(d.neuronaId).toBe("servidor:com1");
        expect(d.baseUrl).toBeNull();
    });

    it("sin servidor comunal: por el enrutador (internet)", () => {
        const d = destinoDeIA(plan({ topologia: "comunal" }), SIN_ASIGNACIONES, inventario(), "texto");
        expect(d.via).toBe("internet");
        expect(d.baseUrl).toBeNull();
    });

    it("un servidor comunal que solo llega por antena no sirve para el chat", () => {
        const inv = inventario({ procesadoresSueltos: [procesador({ id: "servidor:com1", neuronaId: "servidor:com1", nombre: "Nodo con antena", via: "antena", tipo: "servidor", prestable: true })] });
        expect(destinoDeIA(plan({ topologia: "comunal" }), SIN_ASIGNACIONES, inv, "texto").via).toBe("internet");
        expect(destinoDeIA(plan({ topologia: "comunal" }), SIN_ASIGNACIONES, inv, "decision").via).toBe("antena");
    });
});

describe("destinoDeIA · almacen-externo", () => {
    it("los modelos externos se procesan en esta neurona por local", () => {
        const inv = inventario({ almacenesSueltos: [{ id: "disco-usb", tipo: "servidor-externo", etiqueta: "SSD externo", via: "local", persistente: true, privado: true, disponible: true, fuente: "declarado" }] });
        const d = destinoDeIA(plan({ topologia: "almacen-externo", almacenExternoId: "disco-usb" }), SIN_ASIGNACIONES, inv, "texto");
        expect(d.via).toBe("local");
        expect(d.neuronaId).toBe(ESTA);
        expect(d.motivo).toContain("SSD externo");
    });
});
