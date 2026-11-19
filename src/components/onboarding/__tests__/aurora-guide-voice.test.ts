import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auroraTranscript, auroraBridge } from "../aurora-guide-voice";

describe("auroraTranscript", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.stubGlobal("window", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.window = originalWindow;
  });

  it("devuelve string vacía sin window (SSR/Node)", () => {
    expect(auroraTranscript()).toBe("");
  });

  it("devuelve string vacía cuando no hay puente STARSEED_AURORA", () => {
    const ventana = {} as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraTranscript()).toBe("");
  });

  it("devuelve string vacía cuando el puente existe pero no tiene getState", () => {
    const puente = {} as any;
    const ventana = { STARSEED_AURORA: puente } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraTranscript()).toBe("");
  });

  it("devuelve string vacía cuando getState devuelve null", () => {
    const puente = { getState: () => null } as any;
    const ventana = { STARSEED_AURORA: puente } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraTranscript()).toBe("");
  });

  it("devuelve transcript + interim cuando getState devuelve valores", () => {
    const puente = { getState: () => ({ transcript: "hola", interim: "mundo" }) } as any;
    const ventana = { STARSEED_AURORA: puente } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraTranscript()).toBe("hola mundo");
  });

  it("devuelve solo transcript cuando interim es undefined (sin espacio final)", () => {
    const puente = { getState: () => ({ transcript: "siguiente" }) } as any;
    const ventana = { STARSEED_AURORA: puente } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraTranscript()).toBe("siguiente");
  });

  it("devuelve solo interim cuando transcript es undefined (sin espacio inicial)", () => {
    const puente = { getState: () => ({ interim: "continúa" }) } as any;
    const ventana = { STARSEED_AURORA: puente } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraTranscript()).toBe("continúa");
  });

  it("NO lanza cuando getState tira error (fail-open)", () => {
    const puente = { getState: () => { throw new Error("boom"); } } as any;
    const ventana = { STARSEED_AURORA: puente } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(() => auroraTranscript()).not.toThrow();
    expect(auroraTranscript()).toBe("");
  });

  it("NO lanza cuando acceder a STARSEED_AURORA tira error", () => {
    const ventana = {
      get STARSEED_AURORA() { throw new Error("acceso denegado"); }
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(() => auroraTranscript()).not.toThrow();
    expect(auroraTranscript()).toBe("");
  });
});

describe("auroraBridge", () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.stubGlobal("window", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.window = originalWindow;
  });

  it("devuelve null sin window", () => {
    expect(auroraBridge()).toBeNull();
  });

  it("devuelve null cuando no existe STARSEED_AURORA", () => {
    const ventana = {} as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraBridge()).toBeNull();
  });

  it("devuelve el puente cuando existe y es objeto", () => {
    const puente = { speak: () => {} } as any;
    const ventana = { STARSEED_AURORA: puente } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraBridge()).toBe(puente);
  });

  it("devuelve null cuando STARSEED_AURORA no es objeto", () => {
    const ventana = { STARSEED_AURORA: "no-objeto" } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(auroraBridge()).toBeNull();
  });

  it("NO lanza cuando acceder a STARSEED_AURORA tira error", () => {
    const ventana = {
      get STARSEED_AURORA() { throw new Error("acceso denegado"); }
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal("window", ventana);
    expect(() => auroraBridge()).not.toThrow();
    expect(auroraBridge()).toBeNull();
  });
});