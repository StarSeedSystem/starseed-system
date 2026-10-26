import { describe, expect, it } from "vitest";
import { consejoSinPantalla, detectarSoporte, entornoDelNavegador, plataformaDe } from "../soporte";
import {
  GrabadorFalso,
  UA_CHROME_ANDROID,
  UA_CHROME_ESCRITORIO,
  UA_FIREFOX_ESCRITORIO,
  UA_SAFARI_IPHONE,
  UA_SAFARI_MAC,
  entornoFalso,
} from "../falsos-prueba";

describe("grabación · detección de soporte", () => {
  it("Chrome de escritorio: pantalla, cámara y sonido del sistema probable", () => {
    const s = detectarSoporte(entornoFalso());
    expect(s).toMatchObject({ plataforma: "escritorio", pantalla: true, camara: true, grabadora: true, sonidoSistema: "probable", motivoSinPantalla: null });
  });

  it("formatos: WebM en Chrome, MP4 en Safari, ambos si el navegador sabe los dos", () => {
    GrabadorFalso.reiniciar(["video/webm", "video/mp4"]);
    expect(detectarSoporte(entornoFalso()).formatos).toEqual({ webm: true, mp4: true });
    GrabadorFalso.reiniciar(["video/webm"]);
    expect(detectarSoporte(entornoFalso()).formatos).toEqual({ webm: true, mp4: false });
    GrabadorFalso.reiniciar(["video/mp4"]);
    expect(detectarSoporte(entornoFalso()).formatos).toEqual({ webm: false, mp4: true });
    expect(detectarSoporte(entornoFalso({ MediaRecorder: {} })).formatos).toEqual({ webm: false, mp4: false });
    GrabadorFalso.reiniciar(["video/webm;codecs=vp9,opus", "video/webm;codecs=vp9", "video/webm"]);
  });

  it("Firefox de escritorio: pantalla sí, sonido del sistema improbable", () => {
    const s = detectarSoporte(entornoFalso({ userAgent: UA_FIREFOX_ESCRITORIO }));
    expect(s.pantalla).toBe(true);
    expect(s.sonidoSistema).toBe("improbable");
  });

  it("Safari de escritorio: pantalla sí, sonido improbable", () => {
    const s = detectarSoporte(entornoFalso({ userAgent: UA_SAFARI_MAC, plataforma: "MacIntel" }));
    expect(s.pantalla).toBe(true);
    expect(s.plataforma).toBe("escritorio");
    expect(s.sonidoSistema).toBe("improbable");
  });

  it("iPhone (sin getDisplayMedia): sin pantalla por «ios», pero con cámara", () => {
    const s = detectarSoporte(
      entornoFalso({
        userAgent: UA_SAFARI_IPHONE,
        plataforma: "iPhone",
        puntosTactiles: 5,
        mediaDevices: { getUserMedia: async () => ({}) },
      }),
    );
    expect(s).toMatchObject({ plataforma: "ios", pantalla: false, camara: true, motivoSinPantalla: "ios", sonidoSistema: "improbable" });
  });

  it("iPad que se presenta como Mac táctil cuenta como iOS", () => {
    expect(plataformaDe(UA_SAFARI_MAC, "MacIntel", 5)).toBe("ios");
    expect(plataformaDe(UA_SAFARI_MAC, "MacIntel", 0)).toBe("escritorio");
  });

  it("Chrome de Android sin getDisplayMedia: motivo «android»", () => {
    const s = detectarSoporte(entornoFalso({ userAgent: UA_CHROME_ANDROID, plataforma: "Linux armv81", puntosTactiles: 5, mediaDevices: { getUserMedia: async () => ({}) } }));
    expect(s).toMatchObject({ plataforma: "android", pantalla: false, camara: true, motivoSinPantalla: "android" });
  });

  it("sin contexto seguro no hay nada (ni pantalla ni cámara)", () => {
    const s = detectarSoporte(entornoFalso({ contextoSeguro: false }));
    expect(s).toMatchObject({ pantalla: false, camara: false, motivoSinPantalla: "contexto-inseguro" });
  });

  it("sin MediaRecorder no hay pantalla ni cámara aunque existan las APIs", () => {
    const s = detectarSoporte(entornoFalso({ MediaRecorder: null }));
    expect(s).toMatchObject({ pantalla: false, camara: false, grabadora: false, motivoSinPantalla: "sin-grabadora" });
  });

  it("sin mediaDevices: «sin-api» en escritorio", () => {
    const s = detectarSoporte(entornoFalso({ mediaDevices: null }));
    expect(s).toMatchObject({ pantalla: false, camara: false, motivoSinPantalla: "sin-api" });
  });

  it("systemAudio declarado por el navegador cuenta como probable", () => {
    const s = detectarSoporte(
      entornoFalso({
        userAgent: UA_FIREFOX_ESCRITORIO,
        mediaDevices: { getDisplayMedia: async () => ({}), getUserMedia: async () => ({}), getSupportedConstraints: () => ({ systemAudio: true }) },
      }),
    );
    expect(s.sonidoSistema).toBe("probable");
  });

  it("getSupportedConstraints que lanza no rompe la detección", () => {
    const s = detectarSoporte(
      entornoFalso({
        userAgent: UA_FIREFOX_ESCRITORIO,
        mediaDevices: {
          getDisplayMedia: async () => ({}),
          getUserMedia: async () => ({}),
          getSupportedConstraints: () => {
            throw new Error("no");
          },
        },
      }),
    );
    expect(s.pantalla).toBe(true);
    expect(s.sonidoSistema).toBe("improbable");
  });

  it("en el servidor (sin window) el entorno es vacío y no soporta nada", () => {
    // Estas pruebas corren en node: no hay window.
    const e = entornoDelNavegador();
    const s = detectarSoporte(e);
    expect(s.pantalla).toBe(false);
    expect(s.camara).toBe(false);
  });

  it("cada motivo tiene título, motivo y pasos; iOS enseña la grabación de pantalla del sistema", () => {
    for (const m of ["ios", "android", "contexto-inseguro", "sin-grabadora", "sin-api"] as const) {
      const c = consejoSinPantalla(m);
      expect(c.titulo.length).toBeGreaterThan(10);
      expect(c.motivo.length).toBeGreaterThan(10);
      expect(c.pasos.length).toBeGreaterThan(0);
    }
    expect(consejoSinPantalla("ios").pasos.join(" ")).toMatch(/Grabación de pantalla/);
    expect(consejoSinPantalla("android").pasos.join(" ")).toMatch(/Grabadora de pantalla/);
  });

  it("los dobles de prueba arrancan limpios", () => {
    GrabadorFalso.reiniciar(["video/webm"]);
    expect(GrabadorFalso.isTypeSupported("video/webm")).toBe(true);
    expect(UA_CHROME_ESCRITORIO).toMatch(/Chrome/);
  });
});
