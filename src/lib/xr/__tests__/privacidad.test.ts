import { describe, expect, it } from "vitest";
import { CLASES_DATO, DESTINOS, NUNCA_EN_REGISTROS, POLITICA, consentimiento, evaluarSalida } from "../privacidad";

const AHORA = 1_000_000;

describe("la cámara del passthrough", () => {
  it("no sale del dispositivo a NINGÚN destino, ni con consentimiento", () => {
    const c = [consentimiento("camara-passthrough", "nube-terceros", AHORA)];
    for (const d of DESTINOS.filter((x) => x !== "dispositivo")) {
      const v = evaluarSalida("camara-passthrough", d, AHORA, c);
      expect(v).toMatchObject({ permitido: false, requiere: "nunca" });
    }
    expect(evaluarSalida("camara-passthrough", "dispositivo", AHORA).permitido).toBe(true);
  });
});

describe("el mapa de la habitación", () => {
  it("se queda en el aparato; entre mis cuentas, sólo con consentimiento vigente", () => {
    expect(evaluarSalida("mapa-sala", "dispositivo", AHORA).permitido).toBe(true);
    expect(evaluarSalida("mapa-sala", "mismas-cuentas", AHORA)).toMatchObject({ permitido: false, requiere: "consentimiento" });
    const c = [consentimiento("mapa-sala", "mismas-cuentas", AHORA)];
    expect(evaluarSalida("mapa-sala", "mismas-cuentas", AHORA + 1000, c).permitido).toBe(true);
  });
  it("jamás a una sala, aunque haya consentimiento amplio", () => {
    const c = [consentimiento("mapa-sala", "sala-publica", AHORA)];
    for (const d of ["sala-privada", "sala-grupo", "sala-publica", "nube-terceros"] as const) expect(evaluarSalida("mapa-sala", d, AHORA, c)).toMatchObject({ permitido: false, requiere: "nunca" });
  });
  it("el consentimiento vence y no vale para otro dato", () => {
    const c = [consentimiento("mapa-sala", "mismas-cuentas", AHORA, 60_000)];
    expect(evaluarSalida("mapa-sala", "mismas-cuentas", AHORA + 61_000, c).permitido).toBe(false);
    expect(evaluarSalida("biometria", "mismas-cuentas", AHORA, c)).toMatchObject({ permitido: false, requiere: "consentimiento" });
  });
});

describe("lo que SÍ es de la sala", () => {
  it("la pose del avatar y el avatar viajan a cualquier sala pero no a terceros", () => {
    for (const d of ["sala-privada", "sala-grupo", "sala-publica"] as const) {
      expect(evaluarSalida("pose-avatar", d, AHORA).permitido).toBe(true);
      expect(evaluarSalida("avatar", d, AHORA).permitido).toBe(true);
    }
    expect(evaluarSalida("pose-avatar", "nube-terceros", AHORA).permitido).toBe(false);
  });
  it("la mirada y las articulaciones de las manos no llegan a nadie de la sala", () => {
    for (const d of ["sala-privada", "sala-grupo", "sala-publica"] as const) {
      expect(evaluarSalida("mirada", d, AHORA).permitido).toBe(false);
      expect(evaluarSalida("manos-articulaciones", d, AHORA).permitido).toBe(false);
    }
  });
  it("la voz a una sala pública pide permiso; lo dictado va a mis aparatos sin pedir", () => {
    expect(evaluarSalida("voz-audio", "sala-publica", AHORA)).toMatchObject({ permitido: false, requiere: "consentimiento" });
    expect(evaluarSalida("voz-texto", "mismas-cuentas", AHORA).permitido).toBe(true);
    expect(evaluarSalida("voz-texto", "nube-terceros", AHORA).requiere).toBe("consentimiento");
  });
  it("publicar un mundo a una sala pública necesita consentimiento (la tarjeta de confirmación)", () => {
    expect(evaluarSalida("mundo-spec", "sala-publica", AHORA).requiere).toBe("consentimiento");
    expect(evaluarSalida("mundo-spec", "nube-propia", AHORA).permitido).toBe(true);
  });
});

describe("la política es completa y coherente", () => {
  it("todas las clases de dato tienen regla y un motivo que se le puede enseñar a la persona", () => {
    for (const c of CLASES_DATO) {
      expect(POLITICA[c].motivo.length).toBeGreaterThan(20);
      expect(DESTINOS).toContain(POLITICA[c].libre);
    }
  });
  it("el techo con consentimiento nunca está por debajo del libre", () => {
    for (const c of CLASES_DATO) {
      const r = POLITICA[c];
      if (r.conConsentimiento) expect(DESTINOS.indexOf(r.conConsentimiento)).toBeGreaterThan(DESTINOS.indexOf(r.libre));
    }
  });
  it("los datos que no pueden salir del aparato son los que nunca deben estar en registros", () => {
    expect(NUNCA_EN_REGISTROS).toEqual(expect.arrayContaining(["camara-passthrough", "mirada"]));
    expect(NUNCA_EN_REGISTROS).not.toContain("avatar");
  });
  it("un consentimiento dura como mínimo un minuto aunque se pida menos", () => {
    expect(consentimiento("biometria", "mismas-cuentas", AHORA, 5).vence).toBe(AHORA + 60_000);
  });
});
