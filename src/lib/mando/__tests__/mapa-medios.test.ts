import { describe, expect, it } from "vitest";
import { avisosDeMediosUnicos, construirMapaAlmacenamiento, filaAlmacenamiento } from "@/lib/mando/mapa-medios";
import type { MedioVivo } from "@/lib/mando/mapa-medios";
function medio(base: { id: string; nombre: string } & Partial<MedioVivo>): MedioVivo {
    return {
        medio: "linux",
        estado: "listo",
        capacidad: 0,
        detalle: "",
        discos: [],
        computo: { cpu: 0, ramMb: 0, contenedores: false },
        enjambre: { agentes: 0, tipo: "python" },
        capas: [],
        avisos: [],
        ...base,
    };
}
function mediosDePrueba(): MedioVivo[] {
    return [
        medio({
            id: "mac",
            nombre: "Esta Mac",
            medio: "mac",
            discos: [
                { libreGb: 100, origen: "Mac (local)" },
                { libreGb: 100, origen: "Drive (espejo)" },
            ],
            capas: ["disco", "ssh"],
        }),
        medio({
            id: "maggabox",
            nombre: "Maggabox",
            estado: "usable",
            discos: [{ libreGb: 415, origen: "Maggabox (SSH)" }],
            capas: ["ssh", "docker"],
        }),
        medio({
            id: "a1",
            nombre: "A1",
            medio: "nube",
            discos: [{ libreGb: 50, origen: "A1 (Oracle)" }],
            capas: ["disco", "nube"],
        }),
    ];
}
describe("filaAlmacenamiento", () => {
    it("suma los discos libres por origen y no cuenta el espejo en el total", () => {
        const fila = filaAlmacenamiento(mediosDePrueba());
        expect(fila.id).toBe("almacenamiento-global");
        expect(fila.capacidad).toBe(565);
        expect(fila.detalle).toHaveLength(4);
        expect(fila.detalle.find((d) => d.origen === "Drive (espejo)")?.discoLibres).toBe(100);
        expect(fila.porque).toContain("Total 565 GB libres en 4 orígenes (1 espejo).");
    });

    it("avisa cuando una capacidad vive en un solo medio", () => {
        const fila = filaAlmacenamiento(mediosDePrueba());
        expect(fila.estado).toBe("alerta");
        expect(fila.porque).toContain("nunca medio único: Maggabox solo tiene Maggabox (SSH)");
        expect(fila.porque).toContain("nunca medio único: Maggabox solo tiene docker");
        expect(fila.porque).toContain("nunca medio único: A1 solo tiene A1 (Oracle)");
    });

    it("bloquea el mapa sin medios conectados", () => {
        const fila = filaAlmacenamiento([]);
        expect(fila.estado).toBe("bloqueado");
        expect(fila.capacidad).toBe(0);
        expect(fila.detalle).toEqual([]);
        expect(fila.porque).toContain("Sin medios conectados");
    });
});

describe("construirMapaAlmacenamiento", () => {
    it("devuelve el agregado global primero y una fila por medio", () => {
        const filas = construirMapaAlmacenamiento(mediosDePrueba());
        expect(filas).toHaveLength(4);
        expect(filas[0].id).toBe("almacenamiento-global");
        expect(filas.map((fila) => fila.id)).toEqual(["almacenamiento-global", "mac", "maggabox", "a1"]);

        const mac = filas.find((fila) => fila.id === "mac");
        expect(mac?.capacidad).toBe(200);
        expect(mac?.detalle).toHaveLength(2);

        const maggabox = filas.find((fila) => fila.id === "maggabox");
        expect(maggabox?.capacidad).toBe(415);
        expect(maggabox?.estado).toBe("alerta");
        expect(maggabox?.porque).toContain("nunca medio único: Maggabox solo tiene Maggabox (SSH)");
    });

    it("traduce el estado del medio y respeta sus avisos propios", () => {
        const filas = construirMapaAlmacenamiento([
            medio({ id: "caido", nombre: "Caído", estado: "no_disponible" }),
            medio({ id: "alex", nombre: "Requiere Alex", estado: "requiere_alex" }),
            medio({ id: "aviso", nombre: "Con aviso", estado: "usable", avisos: ["SSH caído"] }),
        ]);
        expect(filas.find((fila) => fila.id === "caido")?.estado).toBe("bloqueado");
        expect(filas.find((fila) => fila.id === "alex")?.estado).toBe("alerta");
        const conAviso = filas.find((fila) => fila.id === "aviso");
        expect(conAviso?.estado).toBe("alerta");
        expect(conAviso?.porque).toContain("SSH caído");
    });
});

describe("avisosDeMediosUnicos", () => {
    it("ignora el espejo de Drive y cuenta las capacidades compartidas una sola vez", () => {
        const avisos = avisosDeMediosUnicos(mediosDePrueba());
        expect(avisos).toHaveLength(5);
        expect(avisos.some((aviso) => aviso.includes("Drive (espejo)"))).toBe(false);
    });

    it("no avisa cuando dos medios declaran el mismo origen", () => {
        const fila = filaAlmacenamiento([
            medio({ id: "a", nombre: "A", discos: [{ libreGb: 300, origen: "Maggabox (SSH)" }] }),
            medio({ id: "b", nombre: "B", discos: [{ libreGb: 200, origen: "Maggabox (SSH)" }] }),
        ]);
        expect(fila.detalle).toEqual([{ origen: "Maggabox (SSH)", discoLibres: 500 }]);
        expect(fila.estado).toBe("ok");
        expect(fila.porque).not.toContain("nunca medio único");
    });
});
