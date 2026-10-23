import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    MODELOS_EXTRA,
    bitsDeModelo,
    catalogoRecursos,
    modeloPorId,
    modelosDeCapas,
    modelosLocales,
    ordenarPorPrioridad,
} from "../catalogo";
import { LOCAL_LLM_SPECS, LOCAL_VOICE_SPECS } from "@/ai/astraura/model-requirements";
import type { RequisitosModelo } from "../tipos";

const capasJson: unknown = JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8"));
const idsCapas = ((capasJson as { capas: { id: string; estado: string }[] }).capas)
    .filter((c) => c.estado !== "retirado")
    .map((c) => c.id);

describe("catálogo de recursos de IA · capas", () => {
    const capas = modelosDeCapas(capasJson);

    it("mapea todas las capas vigentes del JSON", () => {
        expect(capas.map((m) => m.id).sort()).toEqual([...idsCapas].sort());
        expect(capas.every((m) => m.origen === "capas")).toBe(true);
    });

    it("BitNet b1.58-2B-4T: 1.58 bits, razón y texto, tamaño real verificado", () => {
        const m = capas.find((x) => x.id === "bitnet-b1.58-2b-4t")!;
        expect(m.bits).toBe(1.58);
        expect(m.capacidades).toEqual(["razon", "texto"]);
        expect(m.runtime).toBe("bitnet-cpp");
        expect(m.disco).toEqual({ gb: 1.19, verificado: true });
        expect(m.ramMinGb).toBe(2);
        expect(m.licencia).toBe("MIT");
        expect(m.almacenamiento.modo).toBe("mmap");
    });

    it("capacidades por papel: reflejo, memoria, palabra, profunda y oído", () => {
        const por = (id: string) => capas.find((x) => x.id === id)!;
        expect(por("needle3-reflejo").capacidades).toContain("decision");
        expect(por("needle3-reflejo").bits).toBe(2); // CQ2
        expect(por("bitnet-embedding-0.6b").capacidades).toEqual(["embeddings"]);
        expect(por("bitnet-embedding-0.6b").bits).toBe(1.58);
        expect(por("ternary-bonsai-4b").capacidades).toEqual(["texto"]);
        expect(por("ternary-bonsai-4b").bits).toBe(1.58);
        expect(por("bonsai-1bit-1.7b").bits).toBe(1);
        expect(por("ternary-bonsai2-27b").capacidades).toEqual(["razon", "texto"]);
        for (const id of ["vibeasr-cpp", "phonon-2", "parakeet-tdt-0-6b-v3"]) {
            expect(por(id).capacidades).toEqual(["voz-asr"]);
        }
        expect(por("vibeasr-cpp").bits).toBe(1.58);
        expect(por("parakeet-tdt-0-6b-v3").bits).toBe(8);
        expect(por("phonon-2").formato).toBe("bps");
        expect(por("ternary-bonsai-1.7b-onnx").aceleradoresRequeridos).toEqual(["webgpu"]);
    });

    it("una capa sin SHA no es recomendable ni tiene tamaño verificado", () => {
        const m = capas.find((x) => x.id === "ternary-bonsai2-27b")!;
        expect(m.estado).toBe("en-pruebas");
        expect(m.disco.verificado).toBe(false);
        expect(m.disco.gb).toBe(5.93);
    });

    it("una capa retirada o mal formada no entra", () => {
        const json = {
            capas: [
                { id: "vieja", capa: "palabra", estado: "retirado", sha256: "a".repeat(64) },
                { capa: "palabra" },
                { id: "rara", capa: "desconocida" },
            ],
        };
        expect(modelosDeCapas(json)).toEqual([]);
        expect(modelosDeCapas(null)).toEqual([]);
    });
});

describe("catálogo de recursos de IA · completo", () => {
    const cat = catalogoRecursos();

    it("sin ids duplicados y memoizado (copias independientes)", () => {
        const ids = cat.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
        const otra = catalogoRecursos();
        expect(otra).not.toBe(cat);
        expect(otra.map((m) => m.id)).toEqual(ids);
        otra.reverse();
        expect(catalogoRecursos().map((m) => m.id)).toEqual(ids);
    });

    it("incluye capas, extras y especificaciones locales con Supertonic 3", () => {
        for (const id of [...idsCapas, "turbo-fieldfare-gemma4-26b-a4b", "astraura-158", "ollama-mid", "kokoro", "supertonic-3"]) {
            expect(modeloPorId(id, cat), id).toBeDefined();
        }
        // Solo modelos locales: nada de servidores de la nube.
        expect(modeloPorId("openrouter-llm", cat)).toBeUndefined();
    });

    it("los 1.58-bit van primero", () => {
        const primeroNo158 = cat.findIndex((m) => m.bits !== 1.58);
        expect(primeroNo158).toBeGreaterThan(0);
        expect(cat.slice(primeroNo158).every((m) => m.bits !== 1.58)).toBe(true);
        expect(cat.slice(0, primeroNo158).every((m) => m.bits === 1.58)).toBe(true);
    });

    it("todas las entradas cumplen el contrato mínimo", () => {
        for (const m of cat) {
            expect(m.capacidades.length, m.id).toBeGreaterThan(0);
            expect(m.medios.length, m.id).toBeGreaterThan(0);
            expect(m.ramMinGb, m.id).toBeGreaterThanOrEqual(0);
            expect(m.disco.gb === null || m.disco.gb > 0, m.id).toBe(true);
        }
    });
});

describe("TurboFieldfare", () => {
    const tf = modeloPorId("turbo-fieldfare-gemma4-26b-a4b")!;

    it("lee pesos del SSD local en cada token, con Metal 4 en Apple Silicon", () => {
        expect(MODELOS_EXTRA).toContain(tf);
        expect(tf.almacenamiento).toEqual({ modo: "streaming-ssd", lecturaMinMBs: 800, soloLocal: true });
        expect(tf.aceleradoresRequeridos).toEqual(["metal4"]);
        expect(tf.arquitecturas).toEqual(["arm64"]);
        expect(tf.so).toEqual(["macOS>=26"]);
        expect(tf.herramientasRequeridas).toEqual(["swift-6.2", "xcode-26"]);
        expect(tf.disco).toEqual({ gb: 14.3, verificado: false, descargaGb: 15 });
        expect(tf.ramMinGb).toBe(8);
        expect(tf.parametrosB).toBe(26);
        expect(tf.activosB).toBe(4);
        expect(tf.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:8080/v1" });
        expect(tf.estado).toBe("experimental");
        expect(tf.origen).toBe("biblioteca");
        expect(tf.notas).toMatch(/~2 GB/);
    });
});

describe("especificaciones locales", () => {
    const locales = modelosLocales([...LOCAL_LLM_SPECS, ...LOCAL_VOICE_SPECS]);

    it("los tramos genéricos no inventan tamaño: hay que preguntar", () => {
        for (const id of ["ollama-small", "ollama-mid", "ollama-large", "webllm"]) {
            const m = locales.find((x) => x.id === id)!;
            expect(m.disco.gb, id).toBeNull();
        }
    });

    it("lo concreto conserva su tamaño aproximado, sin darlo por verificado", () => {
        const m = locales.find((x) => x.id === "smollm3-webgpu")!;
        expect(m.disco).toEqual({ gb: 1.9, verificado: false });
        expect(m.aceleradoresRequeridos).toEqual(["webgpu"]);
        expect(m.almacenamiento.soloLocal).toBe(true);
    });

    it("una especificación sin ficha técnica sale en pruebas y sin tamaño", () => {
        const [m] = modelosLocales([
            { id: "nuevo", label: "Nuevo", kind: "llm", access: "local", engine: "Motor X", req: { minRamGb: 4 } },
            { id: "nube", label: "Nube", kind: "llm", access: "openrouter", engine: "OpenRouter", req: {} },
        ]);
        expect(m.id).toBe("nuevo");
        expect(m.estado).toBe("en-pruebas");
        expect(m.disco.gb).toBeNull();
        expect(m.ramMinGb).toBe(4);
    });
});

describe("bitsDeModelo y ordenarPorPrioridad", () => {
    it("deduce bits del texto", () => {
        expect(bitsDeModelo({ familia: "microsoft/BitNet", modelo: "BitNet b1.58-2B-4T" })).toBe(1.58);
        expect(bitsDeModelo({ id: "ternary-bonsai-8b" })).toBe(1.58);
        expect(bitsDeModelo({ id: "astraura-158" })).toBe(1.58);
        expect(bitsDeModelo({ modelo: "Bonsai 1-bit 1.7B" })).toBe(1);
        expect(bitsDeModelo({ modelo: "Bonsai-27B-Q1_0" })).toBe(1);
        expect(bitsDeModelo({ modelo: "Qwen3-4B-q4f16_1-MLC" })).toBe(4);
        expect(bitsDeModelo({ modelo: "parakeet q8_0" })).toBe(8);
        expect(bitsDeModelo({ formato: "cact" })).toBe(2);
        expect(bitsDeModelo({ modelo: "algo", formato: "gguf" })).toBe(4);
    });

    it("1.58 › estado › potencia", () => {
        const base = (id: string, bits: RequisitosModelo["bits"], estado: RequisitosModelo["estado"], parametrosB: number): RequisitosModelo => ({
            id, nombre: id, familia: "x", capacidades: ["texto"], bits, formato: "gguf", runtime: "llama-cpp", parametrosB,
            disco: { gb: 1, verificado: false }, ramMinGb: 1, almacenamiento: { modo: "mmap", soloLocal: false },
            medios: ["nativo"], licencia: "MIT", upstream: "", estado, origen: "propio",
        });
        const orden = ordenarPorPrioridad([
            base("q4-rec-grande", 4, "recomendado", 70),
            base("t-exp", 1.58, "experimental", 27),
            base("t-rec-chico", 1.58, "recomendado", 2),
            base("t-rec-grande", 1.58, "recomendado", 8),
            base("q4-respaldo", 4, "respaldo", 100),
            base("q4-pruebas", 4, "en-pruebas", 100),
        ]).map((m) => m.id);
        expect(orden).toEqual(["t-rec-grande", "t-rec-chico", "t-exp", "q4-rec-grande", "q4-respaldo", "q4-pruebas"]);
    });
});

describe("modelos de imagen (integración)", () => {
    it("entran del catálogo de Imágenes con el tamaño por confirmar", async () => {
        const { catalogoRecursos } = await import("../catalogo");
        const img = catalogoRecursos().filter((m) => m.capacidades.includes("imagen"));
        expect(img.length).toBeGreaterThan(5);
        expect(img.every((m) => m.disco.gb === null)).toBe(true);
        expect(img.find((m) => m.id === "img-sd-turbo")?.medios).toContain("web");
    });
});
