// @vitest-environment jsdom
/**
 * VID1110A · cámaras: clasificación con etiquetas reales (macOS, iOS, Android, Windows, Linux), cámara por defecto
 * (nunca Continuidad ni virtual teniendo la del propio aparato), opciones por capacidades y persistencia con migración.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  camaraRemotaComoInfo,
  clasificarCamara,
  CLAVE_DISPOSITIVOS,
  describirCamaras,
  elegirCamaraPorDefecto,
  guardarPreferencia,
  leerCapacidades,
  leerPreferencias,
  lineaCamaraElegida,
  migrarDispositivos,
  orientacionDe,
  plataformaDe,
  restriccionesDeOpciones,
  type TipoCamara,
} from "../camaras";

const TABLA: Array<[string, TipoCamara]> = [
  // macOS
  ["FaceTime HD Camera", "integrada"],
  ["FaceTime HD Camera (Built-in)", "integrada"],
  ["FaceTime HD Camera (05ac:8514)", "integrada"],
  ["MacBook Pro Camera", "integrada"],
  ["Cámara FaceTime HD (integrada)", "integrada"],
  ["Maggabook's iPhone Camera", "continuidad"],
  ["iPhone de Alex Camera", "continuidad"],
  ["iPhone 15 Pro Camera", "continuidad"],
  ["Desk View Camera", "continuidad"],
  ["Cámara de Continuidad", "continuidad"],
  ["Studio Display Camera", "externa"],
  ["OBS Virtual Camera", "virtual"],
  ["Snap Camera", "virtual"],
  ["Camo", "virtual"],
  ["NVIDIA Broadcast", "virtual"],
  // iOS / iPadOS (Safari)
  ["Front Camera", "integrada"],
  ["Back Camera", "integrada"],
  ["Back Dual Camera", "integrada"],
  ["Back Ultra Wide Camera", "integrada"],
  // Android (Chromium)
  ["camera2 1, facing front", "integrada"],
  ["camera2 0, facing back", "integrada"],
  ["camera2 3, facing external", "externa"],
  // Windows
  ["Integrated Camera", "integrada"],
  ["HP TrueVision HD Camera", "integrada"],
  ["Surface Front Camera", "integrada"],
  ["Logitech HD Webcam C920", "externa"],
  ["Logitech BRIO", "externa"],
  ["Razer Kiyo Pro", "externa"],
  ["Elgato Facecam", "externa"],
  ["DroidCam Source 3", "virtual"],
  ["ManyCam Virtual Webcam", "virtual"],
  // Linux
  ["Integrated_Webcam_HD: Integrate (usb-0000:00:14.0-8)", "integrada"],
  ["Chicony USB2.0 Camera", "integrada"],
  ["USB2.0 HD UVC WebCam", "externa"],
  ["Cámara desconocida rara", "externa"],
  // Antes del permiso el navegador no da etiqueta: se prueba primero como la del aparato.
  ["", "integrada"],
];

describe("clasificarCamara · etiquetas reales", () => {
  it.each(TABLA)("%s → %s", (etiqueta, tipo) => {
    expect(clasificarCamara(etiqueta)).toBe(tipo);
  });

  it("la orientación sale de la etiqueta cuando la trae", () => {
    expect(orientacionDe("camera2 1, facing front")).toBe("frontal");
    expect(orientacionDe("camera2 0, facing back")).toBe("trasera");
    expect(orientacionDe("Front Camera")).toBe("frontal");
    expect(orientacionDe("Back Dual Camera")).toBe("trasera");
    expect(orientacionDe("Integrated Camera")).toBeNull();
  });

  it("la plataforma se lee del user agent", () => {
    expect(plataformaDe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15")).toBe("mac");
    expect(plataformaDe("Mozilla/5.0 (Linux; Android 16; SM-X900) Chrome/130")).toBe("android");
    expect(plataformaDe("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(plataformaDe("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(plataformaDe("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(plataformaDe(undefined)).toBe("otra");
  });
});

describe("nombres y elección por defecto", () => {
  const mac = describirCamaras(
    [
      { id: "ph", nombre: "Maggabook's iPhone Camera" },
      { id: "dv", nombre: "Desk View Camera" },
      { id: "ft", nombre: "FaceTime HD Camera (Built-in)" },
      { id: "obs", nombre: "OBS Virtual Camera" },
    ],
    "mac",
  );

  it("nombres claros para el selector", () => {
    expect(mac.map((c) => c.nombre)).toEqual([
      "Cámara del iPhone (Continuidad)",
      "Vista de escritorio del iPhone (Continuidad)",
      "Cámara de esta Mac",
      "Cámara virtual · OBS Virtual Camera",
    ]);
  });

  it("el caso de prueba.32: en el Mac se elige la FaceTime aunque el iPhone sea el primero de la lista", () => {
    const e = elegirCamaraPorDefecto(mac);
    expect(e.camara?.id).toBe("ft");
    expect(e.motivo).toBe("integrada");
  });

  it("teniendo integrada, nunca elige Continuidad ni virtual, sea cual sea el orden", () => {
    for (const orden of [[0, 1, 2, 3], [3, 2, 1, 0], [1, 0, 3, 2]]) {
      expect(elegirCamaraPorDefecto(orden.map((i) => mac[i])).camara?.tipo).toBe("integrada");
    }
  });

  it("en un móvil elige la frontal y la trasera queda como alternativa", () => {
    const cel = describirCamaras([{ id: "t", nombre: "camera2 0, facing back" }, { id: "f", nombre: "camera2 1, facing front" }], "android");
    expect(cel.map((c) => c.nombre)).toEqual(["Cámara trasera", "Cámara frontal"]);
    expect(elegirCamaraPorDefecto(cel).camara?.id).toBe("f");
  });

  it("sin integrada: externa antes que Continuidad, y Continuidad antes que virtual", () => {
    const l = describirCamaras([{ id: "v", nombre: "OBS Virtual Camera" }, { id: "p", nombre: "iPhone Camera" }, { id: "u", nombre: "Logitech BRIO" }]);
    const e = elegirCamaraPorDefecto(l);
    expect(e.camara?.id).toBe("u");
    expect(e.motivo).toBe("sin-integrada");
    expect(elegirCamaraPorDefecto(l.filter((c) => c.id !== "u")).camara?.id).toBe("p");
  });

  it("una elección guardada manda mientras siga ahí (por id o, si cambió el id, por etiqueta)", () => {
    const e = elegirCamaraPorDefecto(mac, { id: "ph" });
    expect(e.camara?.id).toBe("ph");
    expect(e.motivo).toBe("guardada");
    expect(elegirCamaraPorDefecto(mac, { id: "viejo", etiqueta: "Maggabook's iPhone Camera" }).camara?.id).toBe("ph");
    // Si la guardada ya no existe, vuelve a la del aparato.
    expect(elegirCamaraPorDefecto(mac, { id: "viejo", etiqueta: "Otra" }).camara?.id).toBe("ft");
    expect(elegirCamaraPorDefecto([], { id: "x" })).toEqual({ camara: null, motivo: "ninguna" });
  });

  it("la línea del registro", () => {
    const ft = mac[2];
    expect(lineaCamaraElegida(ft, "integrada")).toBe('camara elegida="FaceTime HD Camera (Built-in)" (integrada) motivo=integrada');
    expect(lineaCamaraElegida(mac[0])).toBe('camara elegida="Maggabook\'s iPhone Camera" (continuidad)');
  });

  it("una cámara de otra neurona se ofrece como «Cámara de <neurona>»", () => {
    const r = camaraRemotaComoInfo({ neurona: "n1", nombreNeurona: "iPhone de Alex", flujo: "cam", ruta: "webrtc" });
    expect(r.nombre).toBe("Cámara de iPhone de Alex");
    expect(r.tipo).toBe("remota");
  });
});

describe("opciones de cámara según sus capacidades", () => {
  const pista = (cap: unknown) => ({ getCapabilities: () => cap });

  it("solo ofrece lo que la cámara dice poder hacer", () => {
    const c = leerCapacidades(pista({ height: { min: 120, max: 1080 }, frameRate: { min: 1, max: 30 }, zoom: { min: 1, max: 5, step: 0.1 }, torch: true, focusMode: ["continuous", "manual"], facingMode: ["environment"] }));
    expect(c.resoluciones).toEqual([240, 360, 480, 720, 1080]);
    expect(c.fps).toEqual([10, 15, 24, 30]);
    expect(c.zoom).toEqual({ min: 1, max: 5, paso: 0.1 });
    expect(c.linterna).toBe(true);
    expect(c.enfoque).toEqual(["continuous", "manual"]);
    const vacia = leerCapacidades(pista({}));
    expect(vacia).toMatchObject({ resoluciones: [], fps: [], zoom: null, linterna: false });
    expect(leerCapacidades(null).zoom).toBeNull();
    expect(leerCapacidades({ getCapabilities: () => { throw new Error("no"); } }).linterna).toBe(false);
  });

  it("WKWebView sin getCapabilities no rompe nada", () => {
    expect(leerCapacidades({}).resoluciones).toEqual([]);
  });

  it("las restricciones solo llevan lo soportado y acotado", () => {
    const cap = leerCapacidades(pista({ height: { min: 120, max: 720 }, frameRate: { max: 30 }, zoom: { min: 1, max: 3 }, torch: false }));
    const r = restriccionesDeOpciones({ alto: 1080, fps: 24, zoom: 9, linterna: true }, cap) as { height?: unknown; frameRate?: unknown; advanced?: Array<Record<string, unknown>> };
    expect(r.height).toBeUndefined(); // 1080 no está entre sus resoluciones
    expect(r.frameRate).toEqual({ ideal: 24, max: 24 });
    expect(r.advanced).toEqual([{ zoom: 3 }]); // acotado al máximo; la linterna no existe
  });
});

describe("lo que se recuerda por neurona", () => {
  beforeEach(() => localStorage.clear());

  it("guarda y lee por neurona, sin mezclar", () => {
    guardarPreferencia("mac", { camara: { id: "ft", etiqueta: "FaceTime HD Camera" } });
    guardarPreferencia("tableta", { camara: { id: "f", etiqueta: "camera2 1, facing front" }, micro: { id: "m", etiqueta: "Mic" } });
    expect(leerPreferencias("mac").camara?.id).toBe("ft");
    expect(leerPreferencias("mac").micro).toBeUndefined();
    expect(leerPreferencias("tableta").micro?.id).toBe("m");
  });

  it("las opciones se guardan por cámara y se suman", () => {
    guardarPreferencia("mac", { opciones: { "FaceTime HD Camera": { alto: 720, espejo: true } } });
    guardarPreferencia("mac", { opciones: { "Logitech BRIO": { zoom: 2 } } });
    const o = leerPreferencias("mac").opciones!;
    expect(o["FaceTime HD Camera"].alto).toBe(720);
    expect(o["Logitech BRIO"].zoom).toBe(2);
  });

  it("migra la forma v1 (global) a v2 y la reescribe", () => {
    localStorage.setItem(CLAVE_DISPOSITIVOS, JSON.stringify({ camara: { id: "ft", etiqueta: "FaceTime" }, altavoz: { id: "a", etiqueta: "Altavoz" } }));
    expect(leerPreferencias("mac").camara?.id).toBe("ft");
    const crudo = JSON.parse(localStorage.getItem(CLAVE_DISPOSITIVOS)!);
    expect(crudo.v).toBe(2);
    expect(crudo.neuronas.mac.altavoz.id).toBe("a");
  });

  it("basura o nada devuelve vacío sin lanzar", () => {
    expect(migrarDispositivos("{no es json", "x")).toEqual({ v: 2, neuronas: {} });
    expect(migrarDispositivos(null, "x")).toEqual({ v: 2, neuronas: {} });
    expect(migrarDispositivos({ v: 2, neuronas: { a: { camara: { id: 5 } } } }, "x").neuronas.a).toEqual({});
    localStorage.setItem(CLAVE_DISPOSITIVOS, "}{");
    expect(leerPreferencias("mac")).toEqual({});
  });

  it("sin localStorage no lanza", () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("bloqueado"); }, configurable: true });
    try {
      expect(() => guardarPreferencia("mac", { camara: { id: "x", etiqueta: "x" } })).not.toThrow();
      expect(leerPreferencias("mac")).toEqual({});
    } finally {
      if (orig) Object.defineProperty(globalThis, "localStorage", orig);
    }
  });
});
