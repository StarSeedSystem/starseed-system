import { describe, expect, it } from "vitest";

import { construirMapaAlmacenamiento, filaAlmacenamiento, type MedioVivo } from "@/lib/mando/mapa-medios";

function medio(parcial: Partial<MedioVivo> & Pick<MedioVivo, "id" | "nombre">): MedioVivo {
    return {
        medio: "mac",
        estado: "listo",
        capacidad: 1,
        detalle: "",
        discos: [],
        computo: { cpu: 0, ramMb: 0, contenedores: false },
        enjambre: { agentes: 0, tipo: "python" },
        capas: [],
        avisos: [],
        ...parcial,
    };
}

const mac = medio({
    id: "mac",
    nombre: "Mac",
    medio: "mac",
    detalle: "hardware local de Alex",
    discos: [
        { libreGb: 100, origen: "Mac local" },
        { libreGb: 0, origen: "Drive (espejo)" },
    ],
});

const maggabox = medio({
    id: "maggabox",
    nombre: "Maggabox",
    medio: "linux",
    detalle: "sonda SSH a starseed-nodo-1",
    discos: [{ libreGb: 415, origen: "Maggabox (SSH)" }],
});

const a1 = medio({
    id: "a1",
    nombre: "A1",
    medio: "nube",
    detalle: "estado de Oracle",
    discos: [{ libreGb: 50, origen: "A1 (Oracle)" }],
});

describe("filaAlmacenamiento", () => {
    it("suma los discos libres por origen y marca los medios únicos", () => {
        const fila = filaAlmacenamiento([mac, maggabox, a1]);
        expect(fila.id).toBe("almacenamiento-global");
        expect(fila.detalle).toHaveLength(4);
        expect(fila.capacidad).toBe(565);
        expect(fila.estado).toBe("alerta");
        expect(fila.porque).toContain("565 GB");
        expect(fila.porque).toContain("nunca medio único: Mac solo tiene Mac local");
    });

    it("no cuenta el espejo como capacidad única", () => {
        const fila = filaAlmacenamiento([mac]);
        expect(fila.porque).not.toContain("Drive solo tiene");
        expect(fila.porque).toContain("nunca medio único: Mac solo tiene Mac local");
    });

    it("un origen compartido entre dos medios deja de ser único", () => {
        const maggaboxConCopia = { ...maggabox, discos: [...maggabox.discos, { libreGb: 20, origen: "Réplica P2P" }] };
        const a1ConCopia = { ...a1, discos: [...a1.discos, { libreGb: 20, origen: "Réplica P2P" }] };
        const fila = filaAlmacenamiento([maggaboxConCopia, a1ConCopia]);
        expect(fila.porque).not.toContain("solo tiene Réplica P2P");
    });

    it("sin medios el mapa global queda bloqueado", () => {
        const fila = filaAlmacenamiento([]);
        expect(fila.estado).toBe("bloqueado");
        expect(fila.capacidad).toBe(0);
        expect(fila.detalle).toEqual([]);
    });
});

describe("construirMapaAlmacenamiento", () => {
    it("devuelve una fila por medio y la global al final", () => {
        const filas = construirMapaAlmacenamiento([mac, maggabox, a1]);
        expect(filas).toHaveLength(4);
        expect(filas.map((f) => f.id)).toEqual(["mac", "maggabox", "a1", "almacenamiento-global"]);
        expect(filas.find((f) => f.id === "mac")?.capacidad).toBe(100);
        expect(filas.find((f) => f.id === "maggabox")?.capacidad).toBe(415);
        expect(filas.find((f) => f.id === "a1")?.capacidad).toBe(50);
        expect(filas.find((f) => f.id === "mac")?.estado).toBe("alerta");
    });

    it("un medio no disponible queda bloqueado", () => {
        const filas = construirMapaAlmacenamiento([{ ...a1, estado: "no_disponible" }]);
        expect(filas.find((f) => f.id === "a1")?.estado).toBe("bloqueado");
    });

    it("sin medios solo devuelve la fila global bloqueada", () => {
        const filas = construirMapaAlmacenamiento([]);
        expect(filas).toHaveLength(1);
        expect(filas[0]?.id).toBe("almacenamiento-global");
        expect(filas[0]?.estado).toBe("bloqueado");
    });
});
