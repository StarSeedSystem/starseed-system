import { describe, expect, it } from "vitest";
import type { EstadoAutonomo } from "../remoto-nodos";
import type { Neuron } from "@/lib/neurons/neurons";
import { construirMediosDesarrollo } from "../medios-desarrollo";

describe("construirMediosDesarrollo", () => {
    it("incluye la neurona actual, Oracle A1, neuronas de la malla y entornos aun con la Mac apagada", () => {
        const estado: EstadoAutonomo = {
            modo: "bus",
            lider: "oracle-a1-main",
            termino: 9,
            autonomia: true,
            nodos: [
                {
                    nodo: "oracle-a1-main",
                    medio: "oracle-a1",
                    etiqueta: "Oracle A1 (24/7)",
                    modo: "real",
                    vivo: true,
                    lider: true,
                    hace_ms: 15_000,
                    puntos: 1500,
                    orquestadores: ["cola-a1"],
                    caidos: [],
                    disco_gb: 90,
                    ram_libre_mb: 12000,
                    trabajo: {},
                    enCurso: [],
                    contenedor: null,
                },
                {
                    nodo: "mac-off",
                    medio: "mac",
                    etiqueta: "Mac de desarrollo",
                    modo: "real",
                    vivo: false,
                    lider: false,
                    hace_ms: 900_000,
                    puntos: 1000,
                    orquestadores: [],
                    caidos: [],
                    disco_gb: null,
                    ram_libre_mb: null,
                    trabajo: {},
                    enCurso: [],
                    contenedor: null,
                },
            ],
            medidores: {},
            decisiones: [],
            ordenes: [],
            fotoHaceMs: 12_000,
            liderSeco: false,
        };
        const neuronas: Neuron[] = [
            {
                id: "n-phone",
                name: "Maggaboard",
                kind: "mobile",
                capabilities: { platform: "Android" },
                permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
                online: true,
                isThisDevice: true,
            },
            {
                id: "n-box",
                name: "Maggabox",
                kind: "desktop",
                capabilities: { platform: "Linux", ollama: true, hermesInstalled: true, meshDeviceId: "mesh-box" },
                permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
                online: true,
                isThisDevice: false,
            },
        ];

        const medios = construirMediosDesarrollo({
            origenPagina: "http://127.0.0.1:47610",
            hostname: "127.0.0.1",
            puerto: "47610",
            nombreActual: "Maggaboard",
            idUnicoActual: "phone-01",
            plataformaActual: "Android",
            neuronas,
            estadoAutonomo: estado,
        });

        expect(medios.find((m) => m.tipo === "actual")?.detalle).toContain("@phone-01");
        expect(medios.find((m) => m.tipo === "oracle" && m.lider)?.activo).toBe(true);
        expect(medios.find((m) => m.tipo === "mac")?.activo).toBe(false);
        expect(medios.find((m) => m.id === "neurona:n-box")?.etiquetas).toEqual(["Ollama", "Hermes", "Malla P2P"]);
        expect(medios.find((m) => m.tipo === "produccion")?.activo).toBe(true);
    });
});
