import { describe, expect, it } from "vitest";
import crudoRegistro from "../registro-sistemas.json";
import { CATALOGO_CAPAS, DESCARTES_REGISTRO, REGISTRO_SISTEMAS, construirRegistro, leerCatalogoCapas, sistemaPorId } from "../registro";
import { encajeRam, evaluarEncaje, fusionarHuellas, huellaDesdeCapacidades, huellaDesdeSondeo, mejorNeuronaPara } from "../detector";
import { FAMILIAS, type HuellaAparato, type SistemaMejorable } from "../tipos";

const sis = (id: string): SistemaMejorable => {
  const s = sistemaPorId(id);
  if (!s) throw new Error(`falta ${id} en el registro`);
  return s;
};

/** La Mac M1 de Alex vista por el sondeo (16 GB, Metal, servicio local). */
const MAC: HuellaAparato = {
  neuronaId: "mac",
  nombre: "Mac M1",
  sistema: "macos",
  ramMb: 16384,
  ramEsCota: false,
  discoLibreMb: 80_000,
  cuotaWebLibreMb: null,
  nucleos: 8,
  gpu: { familia: "apple", modelo: "apple m1", vramMb: null },
  aceleraciones: ["cpu", "metal"],
  aceleracionesInferidas: false,
  medios: ["servidor"],
  enLinea: true,
  medida: "sondeo",
};

/** Una tablet Android con la app instalada, vista solo por el navegador. */
const TABLET = huellaDesdeCapacidades(
  "tablet",
  { platform: "Android", memoryGb: 4, cores: 8, gpuRenderer: "ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)", webgpu: true, storageQuotaGb: 20, storageUsedGb: 2, medios: { m1: { tipo: "app-instalada" } } },
  { nombre: "Tablet", enLinea: true },
);

describe("registro de sistemas", () => {
  it("carga todo el registro sin descartes y cubre las cinco familias", () => {
    expect(DESCARTES_REGISTRO).toEqual([]);
    expect(REGISTRO_SISTEMAS.length).toBe((crudoRegistro as { sistemas: unknown[] }).sistemas.length);
    for (const f of FAMILIAS) expect(REGISTRO_SISTEMAS.some((s) => s.familia === f)).toBe(true);
  });

  it("ids únicos y cada sistema con fuente, medios y preferencia 1-5", () => {
    const ids = REGISTRO_SISTEMAS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of REGISTRO_SISTEMAS) {
      expect(s.fuente.ref).toBeTruthy();
      expect(s.medios.length).toBeGreaterThan(0);
      expect(s.preferencia).toBeGreaterThanOrEqual(1);
      expect(s.preferencia).toBeLessThanOrEqual(5);
    }
  });

  it("las capas de Astraura toman RAM, disco y medios del catálogo firmado (disco real de tamano_bytes)", () => {
    const vibe = sis("vibeasr-cpp");
    const cat = CATALOGO_CAPAS.get("vibeasr-cpp");
    expect(cat?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(vibe.requisitos.ramMinMb).toBe(1024);
    // 1 695 957 664 bytes → 1618 MB, no los 500 de disco_mb.
    expect(vibe.requisitos.discoMb).toBe(1618);
    expect(vibe.medios).toEqual(["nativa", "servidor"]);
  });

  it("descarta lo que viene mal y dice por qué", () => {
    const r = construirRegistro(
      {
        sistemas: [
          { id: "a", familia: "voz-tts", capa: "servicios", fuente: { tipo: "pypi", ref: "x" }, medios: ["servidor"] },
          { id: "a", familia: "voz-tts", capa: "servicios", fuente: { tipo: "pypi", ref: "x" }, medios: ["servidor"] },
          { id: "b", familia: "magia", capa: "servicios", fuente: { tipo: "pypi", ref: "x" }, medios: ["web"] },
          { id: "c", familia: "codigo", capa: "modelos", fuente: { tipo: "catalogo-capas", ref: "no-existe" } },
          { id: "d", familia: "codigo", capa: "modelos", fuente: { tipo: "npm", ref: "y" }, medios: [] },
        ],
      },
      leerCatalogoCapas({ capas: [] }),
    );
    expect(r.sistemas.map((s) => s.id)).toEqual(["a"]);
    expect(r.descartes).toHaveLength(4);
    expect(r.descartes.join(" ")).toMatch(/repetido/);
  });

  it("un sha «por-verificar» del catálogo cuenta como ausente", () => {
    const c = leerCatalogoCapas({ capas: [{ id: "x", sha256: "por-verificar", medios: ["nativo"], disco_mb: 10 }] });
    expect(c.get("x")?.sha256).toBeNull();
    expect(c.get("x")?.medios).toEqual(["nativa"]);
  });
});

describe("huella del aparato", () => {
  it("desde el navegador: RAM como cota, medios y aceleraciones inferidas", () => {
    expect(TABLET.sistema).toBe("android");
    expect(TABLET.ramMb).toBe(4096);
    expect(TABLET.ramEsCota).toBe(true);
    expect(TABLET.medios).toEqual(["pwa"]);
    expect(TABLET.aceleraciones).toEqual(["wasm", "webgpu"]);
    expect(TABLET.cuotaWebLibreMb).toBe(18 * 1024);
  });

  it("localhost implica servicio local; Apple en macOS implica Metal (inferido)", () => {
    const h = huellaDesdeCapacidades("mac-nav", { platform: "macOS", memoryGb: 8, gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)", medios: { a: { tipo: "local" } } });
    expect(h.medios).toEqual(["servidor", "web"]);
    expect(h.aceleraciones).toContain("metal");
    expect(h.aceleracionesInferidas).toBe(true);
  });

  it("el sondeo manda al fusionar y suma los medios", () => {
    const nav = huellaDesdeCapacidades("mac", { platform: "macOS", memoryGb: 8, webgpu: true, medios: { a: { tipo: "navegador" } } });
    const son = huellaDesdeSondeo("mac", { sistema: "macos", ram_mb: 16384, disco_libre_mb: 50000, nucleos: 8, gpu: { familia: "apple", modelo: "Apple M1" }, aceleraciones: ["cpu", "metal", "inventada"] });
    const f = fusionarHuellas(nav, son);
    expect(f?.ramMb).toBe(16384);
    expect(f?.ramEsCota).toBe(false);
    expect(f?.medios).toEqual(["servidor", "web"]);
    expect(f?.aceleraciones).toEqual(["cpu", "wasm", "webgpu", "metal"]);
    expect(f?.medida).toBe("ambos");
    expect(huellaDesdeSondeo("x", null)).toBeNull();
  });
});

describe("encaje de RAM con la cota del navegador", () => {
  it("lee bien deviceMemory: cota < 8 GB es [v, 2v); 8 GB es «8 o más»", () => {
    expect(encajeRam({ ramMb: 4096, ramEsCota: true }, 4096)).toBe("cabe");
    expect(encajeRam({ ramMb: 2048, ramEsCota: true }, 4096)).toBe("no-cabe");
    expect(encajeRam({ ramMb: 2048, ramEsCota: true }, 3072)).toBe("no-se-sabe");
    expect(encajeRam({ ramMb: 8192, ramEsCota: true }, 16384)).toBe("no-se-sabe");
    expect(encajeRam({ ramMb: 8192, ramEsCota: false }, 16384)).toBe("no-cabe");
    expect(encajeRam({ ramMb: null, ramEsCota: false }, 1)).toBe("no-se-sabe");
  });
});

describe("detector por sistema", () => {
  it("OmniVoice cabe en la Mac como servicio local", () => {
    const e = evaluarEncaje(sis("omnivoice-cpp"), MAC);
    expect(e.veredicto).toBe("instalable");
    expect(e.medio).toBe("servidor");
  });

  it("VoxCPM cabe en la Mac (Metal; 2/3 de 16 GB de memoria unificada ≥ 6 GB); GPT-SoVITS pide CUDA y no hay", () => {
    expect(evaluarEncaje(sis("voxcpm"), MAC).veredicto).toBe("instalable");
    const g = evaluarEncaje(sis("gpt-sovits"), MAC);
    expect(g.veredicto).toBe("no-cabe");
    expect(g.carencias[0].recurso).toBe("aceleracion");
    expect(g.carencias[0].texto).toMatch(/cuda/);
  });

  it("Wan 2.2 en la Mac: falta CUDA (no se inventa compatibilidad Metal)", () => {
    const e = evaluarEncaje(sis("wan-2.2"), MAC);
    expect(e.veredicto).toBe("no-cabe");
  });

  it("sin medio: la tablet solo tiene la app instalada y Ollama necesita servicio local o app nativa", () => {
    const e = evaluarEncaje(sis("ollama"), TABLET);
    expect(e.veredicto).toBe("sin-medio");
    expect(e.carencias[0].texto).toMatch(/servicio local o app nativa/);
  });

  it("Kokoro web cabe en la tablet (WebGPU, 4 GB de cota ≥ 2 GB)", () => {
    const e = evaluarEncaje(sis("kokoro-web"), TABLET);
    expect(e.veredicto).toBe("instalable");
    expect(e.medio).toBe("pwa");
  });

  it("sin datos: un navegador que dice «8 GB» frente a un sistema de 16 GB", () => {
    const h = huellaDesdeCapacidades("pc", { platform: "Linux", memoryGb: 8, cores: 16, gpuRenderer: "NVIDIA GeForce RTX 3090", medios: { a: { tipo: "local" } } });
    const e = evaluarEncaje(sis("ace-step-1.5"), h);
    expect(e.veredicto).toBe("sin-datos");
    expect(e.dudas.map((d) => d.recurso)).toContain("ram");
  });

  it("disco: la cuota del navegador limita lo que se guarda en web", () => {
    const h: HuellaAparato = { ...TABLET, cuotaWebLibreMb: 100 };
    const e = evaluarEncaje(sis("kokoro-web"), h);
    expect(e.veredicto).toBe("no-cabe");
    expect(e.carencias[0].recurso).toBe("disco");
  });

  it("mejor en otra neurona: lo que no cabe en la tablet cabe en la Mac", () => {
    const alt = mejorNeuronaPara(sis("omnivoice-cpp"), [TABLET, MAC], "tablet");
    expect(alt).toEqual({ neuronaId: "mac", nombre: "Mac M1", medio: "servidor" });
    expect(mejorNeuronaPara(sis("gpt-sovits"), [TABLET, MAC])).toBeNull();
  });
});
