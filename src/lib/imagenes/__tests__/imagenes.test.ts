import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODELOS_IMAGEN, memoriaNecesaria, modeloPorId } from "../modelos";
import { cabe, planImagen, type NeuronaImg, type PeticionImagen } from "../plan";
import { motoresPosibles, paqueteBase, type HierroImg } from "../sugerencias";

const n = (o: Partial<NeuronaImg>): NeuronaImg => ({
  id: "mac", capa: "dispositivo", gpu: "apple", vramGB: null, ramLibreGB: 6, motores: ["sdcpp"], instalados: [], ocupada: false, ...o,
});
const pet = (o: Partial<PeticionImagen> = {}): PeticionImagen => ({
  opciones: 4, prioridad: "calidad", comercial: false, necesita: ["texto-a-imagen"], conReferencia: false, permisoRemoto: false, permitirDePago: false, ...o,
});
const M = (id: string) => modeloPorId(id)!;
const MAC8: HierroImg = { so: "macos", gpu: "apple", vramGB: null, ramGB: 6, webgpu: true };
const A1: HierroImg = { so: "linux", gpu: "ninguna", vramGB: null, ramGB: 20, webgpu: false };
const PC24: HierroImg = { so: "linux", gpu: "nvidia", vramGB: 24, ramGB: 32, webgpu: true };

describe("catálogo verificado", () => {
  it("ids únicos y todos los modelos que pidió Alex", () => {
    const ids = MODELOS_IMAGEN.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["sd15", "sana-1600m", "pixart-sigma", "sdxl", "sd35-medium", "sd35-large", "flux1-dev", "flux1-schnell", "qwen-image", "qwen-image-2.1", "qwen-image-2.1-turbo", "krea-2-turbo", "z-image-turbo"]) {
      expect(ids).toContain(id);
    }
  });
  it("licencias honestas: Qwen-Image 2.1, Krea 2 y FLUX.1 dev no son comerciales; FLUX schnell y Qwen-Image sí", () => {
    expect(M("qwen-image-2.1").uso).toBe("no-comercial");
    expect(M("krea-2-turbo").uso).toBe("no-comercial");
    expect(M("flux1-dev").uso).toBe("no-comercial");
    expect(M("flux1-schnell").uso).toBe("libre");
    expect(M("qwen-image").uso).toBe("libre");
    expect(M("qwen-image-2.1-turbo").uso).toBe("no-comercial");
    expect(M("z-image-turbo").uso).toBe("libre");
  });
  it("la medida real del instalador manda sobre la orientativa", () => {
    expect(memoriaNecesaria(M("sdxl"), "gpu")).toBe(8);
    expect(memoriaNecesaria(M("sdxl"), "gpu", 6.3)).toBe(6.3);
  });
});

describe("cabe", () => {
  it("Mac de 8 GB: SD-Turbo y SD 1.5 sí; SDXL solo a 4 bits; FLUX no", () => {
    const mac = n({});
    expect(cabe(M("sd15"), mac).ok).toBe(true);
    expect(cabe(M("sdxl"), mac).cuantizacion).toBe("q4");
    expect(cabe(M("flux1-schnell"), mac).ok).toBe(false);
  });
  it("Sana necesita Diffusers: no corre con stable-diffusion.cpp", () => {
    expect(cabe(M("sana-1600m"), n({ ramLibreGB: 64 })).ok).toBe(false);
    expect(cabe(M("sana-1600m"), n({ gpu: "nvidia", vramGB: 8, motores: ["diffusers"] })).ok).toBe(true);
  });
  it("NVIDIA: nativo si cabe; si no, cuantizado con stable-diffusion.cpp", () => {
    expect(cabe(M("flux1-schnell"), n({ gpu: "nvidia", vramGB: 12, motores: ["comfyui", "sdcpp"] })).cuantizacion).toBe("nativa");
    expect(cabe(M("flux1-schnell"), n({ gpu: "nvidia", vramGB: 8, ramLibreGB: 4, motores: ["comfyui", "sdcpp"] })).cuantizacion).toBe("q8");
    expect(cabe(M("qwen-image"), n({ gpu: "nvidia", vramGB: 8, ramLibreGB: 4, motores: ["comfyui"] })).ok).toBe(false);
  });
});

describe("planImagen", () => {
  const mac = n({ instalados: ["sd-turbo", "sd15"] });
  const pc = n({ id: "pc", capa: "neurona", gpu: "nvidia", vramGB: 24, ramLibreGB: 32, motores: ["sdcpp", "comfyui"], instalados: ["qwen-image", "flux1-schnell", "flux1-dev"] });
  it("varias opciones con variedad de modelos, de lo cercano a lo lejano, con semillas seguidas", () => {
    const p = planImagen(pet(), [pc, mac], 100);
    expect(p.opciones).toHaveLength(4);
    expect(p.opciones[0].capa).toBe("dispositivo");
    expect(new Set(p.opciones.map((o) => o.modelo?.id)).size).toBe(4);
    expect(p.opciones.map((o) => o.semilla)).toEqual([100, 101, 102, 103]);
  });
  it("uso comercial: fuera FLUX dev, Qwen-Image 2.1 y Krea 2, y lo dice", () => {
    const p = planImagen(pet({ comercial: true }), [pc], 1);
    expect(p.opciones.some((o) => o.modelo?.id === "flux1-dev")).toBe(false);
    expect(p.descartes.join(" ")).toMatch(/FLUX.1 \[dev\].*uso comercial/);
  });
  it("con imagen de referencia nada sale de tus neuronas sin permiso", () => {
    const p = planImagen(pet({ conReferencia: true, necesita: ["texto-a-imagen"] }), [mac], 1);
    expect(p.opciones.every((o) => o.capa !== "web-gratis")).toBe(true);
    expect(p.descartes.join(" ")).toMatch(/hace falta tu permiso/);
  });
  it("sin nada instalado queda la web gratis (solo texto) y se completa con semillas", () => {
    const p = planImagen(pet({ opciones: 3 }), [n({})], 7);
    expect(p.opciones.map((o) => o.capa)).toEqual(["web-gratis", "web-gratis", "web-gratis"]);
  });
  it("pide edición y transparencia: solo Qwen-Image 2.1 puede", () => {
    const pc21 = { ...pc, instalados: ["qwen-image-2.1", "qwen-image"] };
    const p = planImagen(pet({ necesita: ["edicion", "transparencia"], opciones: 2 }), [pc21], 1);
    expect(new Set(p.opciones.map((o) => o.modelo?.id))).toEqual(new Set(["qwen-image-2.1"]));
  });
  it("sin GPU propia, los Spaces públicos (FLUX schnell, Qwen-Image) van antes que la web gratis", () => {
    const p = planImagen(pet({ opciones: 3, espacios: ["flux1-schnell", "qwen-image"] }), [n({})], 1);
    expect(p.opciones.map((o) => [o.capa, o.modelo?.id ?? o.motor])).toEqual([["espacio", "qwen-image"], ["espacio", "flux1-schnell"], ["web-gratis", "pollinations"]]);
  });
  it("con imagen de referencia y sin permiso, los Spaces tampoco", () => {
    const p = planImagen(pet({ conReferencia: true, espacios: ["flux1-schnell"] }), [n({})], 1);
    expect(p.opciones).toEqual([]);
    expect(p.descartes.join(" ")).toMatch(/Space: llevaría tu imagen fuera/);
  });
  it("una neurona ocupada no recibe trabajo", () => {
    const p = planImagen(pet({ opciones: 1 }), [{ ...pc, ocupada: true }], 1);
    expect(p.opciones[0].capa).toBe("web-gratis");
  });
});

describe("paquete base sugerido", () => {
  it("Mac de 8 GB: SD-Turbo rápido y SDXL a 4 bits; nada de texto legible", () => {
    const s = paqueteBase(MAC8, { comercial: false });
    expect(s.instalar.map((x) => [x.papel, x.modelo.id, x.cuantizacion])).toEqual([["rapido", "sd-turbo", "q8"], ["calidad", "sdxl", "q4"]]);
  });
  it("A1 sin GPU: nada de gama alta; FLUX schnell, SDXL y SD 3.5 Medium, avisando del gate", () => {
    const s = paqueteBase(A1, { comercial: false });
    expect(s.instalar.map((x) => x.modelo.id)).toEqual(["flux1-schnell", "sdxl", "sd35-medium"]);
    expect(s.instalar.every((x) => x.modelo.gama !== "alta")).toBe(true);
    expect(s.instalar[0].porQue).toMatch(/Hugging Face/);
  });
  it("PC con NVIDIA de 24 GB: Qwen-Image para calidad; lo que ya ofrece la malla no se repite", () => {
    const s = paqueteBase(PC24, { comercial: false });
    expect(s.instalar.find((x) => x.papel === "calidad")?.modelo.id).toBe("qwen-image");
    const m = paqueteBase(PC24, { comercial: false, enLaMalla: ["qwen-image"] });
    expect(m.desdeLaMalla.join(" ")).toMatch(/Qwen-Image/);
  });
  it("iPhone sin WebGPU: no cabe nada local y se dice", () => {
    const s = paqueteBase({ so: "ios", gpu: "apple", vramGB: null, ramGB: 6, webgpu: false }, { comercial: false });
    expect(s.instalar).toEqual([]);
    expect(s.nada).toMatch(/malla/);
    expect(motoresPosibles({ so: "ios", gpu: "apple", vramGB: null, ramGB: 6, webgpu: true })).toEqual(["onnx-web"]);
  });
});

describe("Z-Image-Turbo y el paquete personal", () => {
  it("Z-Image-Turbo es el rápido libre en un PC de 24 GB y lo dice en el porqué", () => {
    const s = paqueteBase(PC24, { comercial: false });
    const rapido = s.instalar.find((x) => x.papel === "rapido");
    expect(rapido?.modelo.id).toBe("z-image-turbo");
    expect(rapido?.motor).toBe("diffusers");
    expect(rapido?.cuantizacion).toBe("nativa");
    expect(rapido?.porQue).toContain("Modelo libre (Apache-2.0).");
  });
  it("sin permitirPersonal el Turbo no se propone aunque quepa", () => {
    for (const h of [MAC8, A1, PC24]) {
      const s = paqueteBase(h, { comercial: false });
      expect(s.instalar.some((x) => x.modelo.id === "qwen-image-2.1-turbo")).toBe(false);
    }
  });
  it("Mac de 8 GB con permiso personal: GGUF Q3_K_S (2,72 GB) en el papel de calidad", () => {
    const s = paqueteBase(MAC8, { comercial: false, permitirPersonal: true });
    const turbo = s.instalar.find((x) => x.modelo.id === "qwen-image-2.1-turbo");
    expect(turbo).toBeDefined();
    expect(turbo!.papel).toBe("calidad");
    expect(turbo!.motor).toBe("sdcpp");
    expect(turbo!.cuantizacion).toBe("q4");
    expect(turbo!.porQue).toMatch(/GGUF personal \(Q3_K_S 2,72 GB\):/);
    expect(turbo!.porQue).toMatch(/uso propio/);
  });
  it("A1 con permiso personal: Q4_K_M (4,2 GB) porque cabe en su memoria", () => {
    const s = paqueteBase(A1, { comercial: false, permitirPersonal: true });
    const turbo = s.instalar.find((x) => x.modelo.id === "qwen-image-2.1-turbo");
    expect(turbo?.porQue).toMatch(/GGUF personal \(Q4_K_M 4,2 GB\):/);
  });
  it("el permiso personal no salta la regla: nada no comercial en uso comercial", () => {
    const s = paqueteBase(MAC8, { comercial: true, permitirPersonal: true });
    expect(s.instalar.some((x) => x.modelo.id === "qwen-image-2.1-turbo")).toBe(false);
  });
  it("ni iOS (sin stable-diffusion.cpp) ni una neurona de 3 GB reciben el GGUF personal", () => {
    const ios = paqueteBase({ so: "ios", gpu: "apple", vramGB: null, ramGB: 8, webgpu: false }, { comercial: false, permitirPersonal: true });
    expect(ios.instalar.some((x) => x.modelo.id === "qwen-image-2.1-turbo")).toBe(false);
    const peque = paqueteBase({ so: "linux", gpu: "ninguna", vramGB: null, ramGB: 3, webgpu: false }, { comercial: false, permitirPersonal: true });
    expect(peque.instalar.some((x) => x.modelo.id === "qwen-image-2.1-turbo")).toBe(false);
  });
  it("no repite el papel de calidad: el Turbo sustituye a la calidad normal", () => {
    const s = paqueteBase(PC24, { comercial: false, permitirPersonal: true });
    expect(s.instalar.find((x) => x.papel === "rapido")?.modelo.id).toBe("z-image-turbo");
    const calidades = s.instalar.filter((x) => x.papel === "calidad");
    expect(calidades).toHaveLength(1);
    expect(calidades[0].modelo.id).toBe("qwen-image-2.1-turbo");
  });
  it("si otra neurona ya ofrece el Turbo, se usa desde la malla y no se duplica", () => {
    const s = paqueteBase(MAC8, { comercial: false, permitirPersonal: true, enLaMalla: ["qwen-image-2.1-turbo"] });
    expect(s.instalar.some((x) => x.modelo.id === "qwen-image-2.1-turbo")).toBe(false);
    expect(s.desdeLaMalla.join(" ")).toMatch(/Qwen-Image 2.1-Turbo/);
  });
  it("Z-Image-Turbo solo donde cabe: ni la Mac de 8 GB ni la A1 lo proponen", () => {
    for (const h of [MAC8, A1]) {
      expect(paqueteBase(h, { comercial: false }).instalar.some((x) => x.modelo.id === "z-image-turbo")).toBe(false);
    }
  });
  it("A1 con modelos personales: Turbo GGUF Q4_K_M (4,2 GB) y el resto del paquete igual", () => {
    const s = paqueteBase(A1, { comercial: false, permitirPersonal: true });
    const turbo = s.instalar.find((x) => x.modelo.id === "qwen-image-2.1-turbo");
    expect(turbo?.papel).toBe("calidad");
    expect(turbo?.porQue).toMatch(/GGUF personal \(Q4_K_M 4,2 GB\):/);
    expect(s.instalar.find((x) => x.papel === "rapido")?.modelo.id).toBe("flux1-schnell");
    expect(s.instalar.find((x) => x.papel === "texto")?.modelo.id).toBe("sd35-medium");
  });
});

describe("núcleo puro", () => {
  const DIR = path.join(__dirname, "..");
  const archivos = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
  it.each(archivos)("%s: ≤ 200 líneas, sin red, DOM, reloj ni aleatorio", (f) => {
    const src = readFileSync(path.join(DIR, f), "utf8");
    expect(src.split("\n").length).toBeLessThanOrEqual(200);
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|localStorage|document|window|navigator)\b\s*[.(]/);
    expect(codigo).not.toMatch(/\b(Date\.now|performance\.now|Math\.random|new Date)\b/);
    expect(codigo).not.toMatch(/from ["'](react|next|node:)/);
  });
});
