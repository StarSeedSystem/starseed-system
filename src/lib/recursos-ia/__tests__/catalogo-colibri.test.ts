import { describe, expect, it } from "vitest";
import { modelosDeCapas } from "../catalogo";

type Entrada = Record<string, unknown>;

const capasDe = (entradas: Entrada[] | unknown[]) => modelosDeCapas({ capas: entradas });

const CODER: Entrada = {
	id: "colibri-qwen-coder",
	capa: "razon",
	modelo: "Qwen3-Coder-30B-A3B (int4)",
	runtime: "colibri",
	formato: "gguf",
	tamano_bytes: 19_400_000_000,
	ram_min_mb: 8192,
	estado: "por-verificar",
	medios: ["servidor"],
	streaming_disco: true,
};

const CLEF: Entrada = {
	id: "colibri-clef",
	capa: "profunda",
	modelo: "Clef: Qwen3.8-27B int8 con visión",
	runtime: "colibri",
	tamano_bytes: 52_000_000_000,
	estado: "por-verificar",
	medios: ["servidor"],
};

const LAYA: Entrada = {
	id: "colibri-laya",
	capa: "juicio",
	modelo: "Laya",
	runtime: "colibri",
	formato: "safetensors",
	tamano_bytes: 870_000_000,
	ram_min_mb: 1740,
	estado: "por-verificar",
	medios: ["servidor"],
};

const OLMOE: Entrada = {
	id: "colibri-olmoe-7b",
	capa: "palabra",
	modelo: "OLMoE 7B (int8 tras convertir)",
	runtime: "colibri",
	formato: "safetensors",
	tamano_bytes: 7168_000_000,
	ram_min_mb: 8192,
	estado: "por-verificar",
	medios: ["servidor"],
};

const QWEN3_CODER: Entrada = {
	id: "colibri-qwen3-coder-30b",
	capa: "razon",
	modelo: "Qwen3-Coder-30B-A3B (int4)",
	runtime: "colibri",
	formato: "safetensors",
	tamano_bytes: 19400_000_000,
	ram_min_mb: 8192,
	estado: "por-verificar",
	medios: ["servidor"],
};

const DEEPSEEK_FLASH: Entrada = {
	id: "colibri-deepseek-v4-flash-reap",
	capa: "profunda",
	modelo: "DeepSeek V4 Flash REAP 150B",
	runtime: "colibri",
	formato: "safetensors",
	tamano_bytes: 86732_000_000,
	ram_min_mb: 16384,
	estado: "por-verificar",
	medios: ["servidor"],
	streaming_disco: true,
};

const colibri = capasDe([CODER, CLEF]);
const porId = (id: string) => colibri.find((m) => m.id === id);

describe("modelosDeCapas · runtime colibri", () => {
	it("ambas entradas salen con runtime, arquitecturas y origen de capas", () => {
		expect(colibri).toHaveLength(2);
		for (const m of colibri) {
			expect(m.runtime).toBe("colibri");
			expect(m.arquitecturas).toEqual(["arm64", "x86_64"]);
			expect(m.origen).toBe("capas");
			expect(m.almacenamiento.soloLocal).toBe(true);
			expect(m.estado).toBe("en-pruebas");
		}
	});

	it("razón → texto, razon y codigo; profunda añade visión solo si el modelo la dice", () => {
		expect(porId("colibri-qwen-coder")?.capacidades.sort()).toEqual(["codigo", "razon", "texto"]);
		expect(porId("colibri-clef")?.capacidades.sort()).toEqual(["codigo", "razon", "texto", "vision"]);
	});

	it("bits 4 (int4) u 8 (int8) según lo que dice el propio modelo, nunca del tamaño", () => {
		expect(porId("colibri-qwen-coder")?.bits).toBe(4);
		expect(porId("colibri-clef")?.bits).toBe(8);
	});

	it("streaming_disco → modo «streaming» con disco local rápido y nota; los demás no", () => {
		const coder = porId("colibri-qwen-coder");
		expect(coder?.almacenamiento.modo).toBe("streaming");
		expect(coder?.almacenamiento.lecturaMinMBs).toBe(500);
		expect(coder?.notas).toContain("Streaming de expertos desde disco");
		expect(porId("colibri-clef")?.almacenamiento.modo).toBe("carga-completa");
		expect(porId("colibri-clef")?.almacenamiento.lecturaMinMBs).toBeUndefined();
	});

	it("todas escuchan en el 4480 de Colibri (el 8000 es de Astraura 1.58)", () => {
		for (const m of colibri) {
			expect(m.servidor).toEqual({ protocolo: "openai", url: "http://127.0.0.1:4480/v1" });
		}
	});

	it("tamaños desde el archivo real, redondeados por prudencia", () => {
		expect(porId("colibri-qwen-coder")?.disco).toEqual({ gb: 19.4, verificado: false });
		expect(porId("colibri-qwen-coder")?.ramMinGb).toBe(8);
		expect(porId("colibri-clef")?.disco).toEqual({ gb: 52, verificado: false });
	});

	it("ignora las entradas sin capa conocida o sin id", () => {
		expect(capasDe([{ id: "sin-capa", capa: "desconocida", runtime: "colibri", modelo: "X" }])).toHaveLength(0);
		expect(capasDe([{ capa: "razon", runtime: "colibri", modelo: "X" }])).toHaveLength(0);
	});

	it("medios: juicio y palabra solo 'servidor', razon y profunda 'servidor'", () => {
		const laya = capasDe([LAYA])[0];
		expect(laya?.medios).toEqual(["servidor"]);
		const olmoe = capasDe([OLMOE])[0];
		expect(olmoe?.medios).toEqual(["servidor"]);
		const qwen3_coder = capasDe([QWEN3_CODER])[0];
		expect(qwen3_coder?.medios).toEqual(["servidor"]);
		const deepseek = capasDe([DEEPSEEK_FLASH])[0];
		expect(deepseek?.medios).toEqual(["servidor"]);
	});

	it("formato: 'colibri-streaming' para los de streaming, 'gguf' para el resto", () => {
		const coder = capasDe([CODER])[0];
		expect(coder?.formato).toBe("gguf");
		const deepseek = capasDe([DEEPSEEK_FLASH])[0];
		expect(deepseek?.formato).toBe("colibri-streaming");
	});

	it("ordena el catálogo por prioridad (1.58-bit primero, recomendado > respaldo > en-pruebas > experimental)", () => {
		const entradas = [CODER, CLEF, LAYA, OLMOE, QWEN3_CODER, DEEPSEEK_FLASH];
		const resultado = capasDe(entradas);
		expect(resultado).toHaveLength(6);
	});

	it("incluye todos los modelos de Colibri sin duplicados", () => {
		const todas = capasDe([CODER, CLEF, LAYA, OLMOE, QWEN3_CODER, DEEPSEEK_FLASH]);
		const ids = new Set(todas.map((m) => m.id));
		expect(ids.size).toBe(todas.length);
	});
}
