/**
 * huella — ¿mismo aparato? (2026-10-09). Los datos son los de la cuenta de Alex medidos ese día
 * (ids cambiados): 10 filas para 4 aparatos reales.
 */
import { describe, expect, it } from "vitest";
import {
  agruparPorAparato,
  candidatosParaEsteMedio,
  compararHuellas,
  esFichaVacia,
  normalizarGpu,
  pantallaDe,
  reconocimientoSeguro,
  type NeuronaHuella,
} from "../huella";

const fila = (id: string, name: string | null, caps: Record<string, unknown> | null, extra: Partial<NeuronaHuella> = {}): NeuronaHuella => ({
  id,
  name: name ?? undefined,
  capabilities: caps as NeuronaHuella["capabilities"],
  last_seen_at: "2026-10-09T22:00:00Z",
  created_at: "2026-09-10T00:00:00Z",
  ...extra,
});

const CUENTA: NeuronaHuella[] = [
  fila("maggaboard", "Neurona Maggaboard", { platform: "Android", browser: "Chrome 154", gpuRenderer: "Adreno (TM) 730", cores: "8", memoryGb: "8" }),
  fila("android-maggasukha", "Neurona Android Maggasukha", { platform: "Android", browser: "Chrome 154", gpuRenderer: "ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)", cores: "8", memoryGb: "8" }),
  fila("maggadroid-phone", "Maggadroid phone", { platform: "Android", browser: "Chrome 154", gpuRenderer: "Mali-G57 MC2", cores: "8", memoryGb: "4" }),
  fila("neurona-maggadroid", "Neurona Maggadroid", { platform: "Android", browser: "Chrome 153", gpuRenderer: "ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)", cores: "8", memoryGb: "4" }),
  fila("iseed", "📱 iseed maggadroid", { platform: "iOS", browser: "Safari 604", gpuRenderer: "Apple GPU", cores: "4" }),
  fila("mac-nativa", "💻 macOS", { platform: "macOS", browser: "", gpuRenderer: "Apple GPU", cores: "8" }),
  fila("neurona-macos", "Neurona macOS", { platform: "macOS", browser: "Chrome 154", gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)", cores: "8", memoryGb: "8" }, { created_at: "2026-09-06T00:00:00Z" }),
  fila("mac-chrome-154", "💻 macOS · Chrome 154", { platform: "macOS", browser: "Chrome 154", gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)", cores: "8", memoryGb: "8" }),
  fila("mac-chrome-152", "💻 macOS · Chrome 152", { platform: "macOS", browser: "Chrome 152", gpuRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)", cores: "8", memoryGb: "8" }),
  fila("fantasma", null, null),
];

describe("normalizarGpu", () => {
  it("quita ANGLE, (TM) y la versión de API para que el mismo chip se lea igual", () => {
    expect(normalizarGpu("ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)").modelo).toBe("apple m1");
    expect(normalizarGpu("Adreno (TM) 730").modelo).toBe("adreno 730");
    expect(normalizarGpu("ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)").modelo).toBe("adreno 730");
    expect(normalizarGpu("Mali-G57 MC2").modelo).toBe("mali-g57 mc2");
    expect(normalizarGpu("ANGLE (ARM, Mali-G57 MC2, OpenGL ES 3.2)").modelo).toBe("mali-g57 mc2");
  });
  it("«Apple GPU» (WebKit) está enmascarada pero se sabe que es Apple", () => {
    expect(normalizarGpu("Apple GPU")).toEqual({ familia: "apple", enmascarada: true });
    expect(normalizarGpu("")).toEqual({ familia: "desconocida", enmascarada: true });
  });
});

describe("compararHuellas", () => {
  const por = (id: string) => CUENTA.find((n) => n.id === id)!;
  it("misma GPU, núcleos y memoria → mismo aparato", () => {
    expect(compararHuellas(por("neurona-macos"), por("mac-chrome-152")).parecido).toBe("mismo");
    expect(compararHuellas(por("maggaboard"), por("android-maggasukha")).parecido).toBe("mismo");
  });
  it("otra GPU u otra memoria → distinto", () => {
    expect(compararHuellas(por("maggaboard"), por("maggadroid-phone")).parecido).toBe("distinto");
    expect(compararHuellas(por("neurona-macos"), por("iseed")).parecido).toBe("distinto");
  });
  it("la app nativa (GPU oculta) con el Chrome de la misma Mac → probable; con pantalla igual → mismo", () => {
    expect(compararHuellas(por("mac-nativa"), por("neurona-macos")).parecido).toBe("probable");
    const a = { ...por("mac-nativa"), capabilities: { ...por("mac-nativa").capabilities, pantalla: "900x1440@2" } };
    const b = { ...por("neurona-macos"), capabilities: { ...por("neurona-macos").capabilities, pantalla: "900x1440@2" } };
    expect(compararHuellas(a, b).parecido).toBe("mismo");
  });
  it("el nombre de máquina decide por encima de todo", () => {
    const a = fila("a", "x", { platform: "macOS", cores: 8, maquina: "abc" });
    const b = fila("b", "y", { platform: "macOS", cores: 8, maquina: "abc" });
    const c = fila("c", "z", { platform: "macOS", cores: 8, maquina: "def" });
    expect(compararHuellas(a, b).parecido).toBe("mismo");
    expect(compararHuellas(a, c).parecido).toBe("distinto");
  });
  it("una pantalla distinta descarta en un móvil, no en un ordenador (monitores externos)", () => {
    const m1 = fila("m1", "a", { platform: "Android", cores: 8, gpuRenderer: "Mali-G57 MC2", pantalla: "393x873@2.75" });
    const m2 = fila("m2", "b", { platform: "Android", cores: 8, gpuRenderer: "Mali-G57 MC2", pantalla: "412x915@2.63" });
    expect(compararHuellas(m1, m2).parecido).toBe("distinto");
    const d1 = fila("d1", "a", { platform: "macOS", cores: 8, memoryGb: 8, gpuRenderer: "Apple M1", pantalla: "900x1440@2" });
    const d2 = fila("d2", "b", { platform: "macOS", cores: 8, memoryGb: 8, gpuRenderer: "Apple M1", pantalla: "1080x1920@1" });
    expect(compararHuellas(d1, d2).parecido).toBe("mismo");
  });
});

describe("agruparPorAparato con la cuenta real", () => {
  it("10 filas → 3 grupos de repetidas (Mac ×4, Android Adreno ×2, Android Mali ×2); el iPhone y la fila vacía quedan solos", () => {
    const grupos = agruparPorAparato(CUENTA, new Set());
    const ids = grupos.map((g) => g.neuronas.map((n) => n.id).sort());
    expect(ids).toHaveLength(3);
    expect(ids).toContainEqual(["mac-chrome-152", "mac-chrome-154", "mac-nativa", "neurona-macos"]);
    expect(ids).toContainEqual(["android-maggasukha", "maggaboard"]);
    expect(ids).toContainEqual(["maggadroid-phone", "neurona-maggadroid"]);
    const mac = grupos.find((g) => g.neuronas.some((n) => n.id === "neurona-macos"))!;
    expect(mac.principal.id).toBe("neurona-macos"); // nombre puesto en el asistente + la más antigua
    expect(mac.certeza).toBe("probable"); // la app nativa oculta su GPU
  });
  it("la principal prefiere la que tiene nombre puesto por la persona", () => {
    const grupos = agruparPorAparato(CUENTA, new Set(["mac-chrome-154"]));
    expect(grupos.find((g) => g.neuronas.some((n) => n.id === "mac-chrome-154"))!.principal.id).toBe("mac-chrome-154");
  });
  it("una fila vacía no se agrupa con nada", () => {
    expect(esFichaVacia(CUENTA[9])).toBe(true);
    expect(agruparPorAparato(CUENTA).some((g) => g.neuronas.some((n) => n.id === "fantasma"))).toBe(false);
  });
});

describe("candidatosParaEsteMedio + reconocimientoSeguro", () => {
  it("un Chrome nuevo en la misma Mac reconoce su aparato sin preguntar", () => {
    const nuevo = fila("nuevo", "💻 macOS", { platform: "macOS", browser: "Chrome 155", cores: 8, memoryGb: 8, gpuRenderer: "Apple M1" });
    const cand = candidatosParaEsteMedio(nuevo, CUENTA);
    expect(cand[0].parecido).toBe("mismo");
    expect(cand[0].neurona.id).toBe("neurona-macos");
    expect(cand.every((c) => c.neurona.capabilities?.platform === "macOS")).toBe(true); // Android/iOS descartados
    expect(reconocimientoSeguro(cand)?.neurona.id).toBe("neurona-macos");
  });
  it("sin datos suficientes (dos aparatos «posibles») no adopta solo", () => {
    const nuevo = fila("nuevo", "x", { platform: "Android" });
    const cand = candidatosParaEsteMedio(nuevo, CUENTA);
    expect(cand.length).toBe(2);
    expect(reconocimientoSeguro(cand)).toBeNull();
  });
});

describe("pantallaDe", () => {
  it("ordena los lados (girar no cambia la huella) y redondea el dpr", () => {
    expect(pantallaDe(844, 390, 3)).toBe("390x844@3");
    expect(pantallaDe(390, 844, 2.625)).toBe("390x844@2.63");
    expect(pantallaDe(undefined, 844, 2)).toBeUndefined();
  });
});
