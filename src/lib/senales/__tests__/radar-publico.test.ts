import { describe, expect, it } from "vitest";
import { DEFAULT_MESH_PRIVACY, type MeshPrivacySettings } from "@/ai/astraura/mesh/privacy";
import { avatarUrlSegura } from "../perfil-centro";
import { cargaPublicaFaro, datosDeRadar, describirRadarPublico, emisionDeRadar, leerCargaPublica, tipoAparatoDesdeAgente } from "../radar-publico";

const P = (o: Partial<MeshPrivacySettings> = {}): MeshPrivacySettings => ({ ...DEFAULT_MESH_PRIVACY, ...o });

describe("la privacidad por defecto no enseña nada de ti", () => {
  it("anónima: sin nombre, foto, aparato ni posición", () => {
    expect(DEFAULT_MESH_PRIVACY).toMatchObject({ publicRadar: "anonymous", shareAvatar: false, shareDevice: false, sharePosition: false });
    const r = describirRadarPublico({ privacidad: P(), internetPublico: true, hayFoto: true });
    expect(r.emision).toBe("anonima");
    expect(r.lineas.filter((l) => l.visible).map((l) => l.etiqueta)).toEqual(["Región LoRa y nodos que ves"]);
  });
  it("el faro anónimo no lleva carga pública", () => {
    expect(cargaPublicaFaro(P(), "https://cdn.example.org/a.jpg", "mobile")).toBeNull();
    expect(cargaPublicaFaro(P({ publicRadar: "off", shareAvatar: true }), "https://cdn.example.org/a.jpg", "mobile")).toBeNull();
  });
});

describe("emisionDeRadar: la misma regla que el faro", () => {
  it("en privado, con internet privado u oculta: no emite, y dice por qué", () => {
    expect(emisionDeRadar(P({ visibility: "private", publicRadar: "visible" }), true)).toMatchObject({ emision: "no-emite", motivo: expect.stringContaining("privado") });
    expect(emisionDeRadar(P({ publicRadar: "visible" }), false)).toMatchObject({ emision: "no-emite", motivo: expect.stringContaining("sesión pública") });
    expect(emisionDeRadar(P({ publicRadar: "off" }), true)).toMatchObject({ emision: "no-emite" });
    expect(emisionDeRadar(P({ publicRadar: "visible" }), true).emision).toBe("publica");
  });
  it("sin emitir no hay líneas, y la ficha lo declara con su nota", () => {
    const r = describirRadarPublico({ privacidad: P({ publicRadar: "off" }), internetPublico: true, hayFoto: true });
    expect(r.lineas).toEqual([]);
    expect(datosDeRadar(r)[0]).toMatchObject({ valor: "no emites faro", estado: "declarado" });
  });
});

describe("modo visible: solo viaja lo que marcas", () => {
  it("foto y aparato solo si los marcas", () => {
    const foto = "https://cdn.example.org/a.jpg";
    expect(cargaPublicaFaro(P({ publicRadar: "visible" }), foto, "mobile")).toEqual({});
    expect(cargaPublicaFaro(P({ publicRadar: "visible", shareAvatar: true }), foto, "mobile")).toEqual({ a: foto });
    expect(cargaPublicaFaro(P({ publicRadar: "visible", shareDevice: true }), foto, "mobile")).toEqual({ d: "mobile" });
    expect(cargaPublicaFaro(P({ publicRadar: "visible", shareAvatar: true, shareDevice: true }), null, null)).toEqual({});
  });
  it("el resumen enseña qué se ve y qué no", () => {
    const r = describirRadarPublico({ privacidad: P({ publicRadar: "visible", shareName: true, shareAvatar: true }), internetPublico: true, hayFoto: false });
    const v = (e: string) => r.lineas.find((l) => l.etiqueta === e)!;
    expect(v("Nombre de la neurona").visible).toBe(true);
    expect(v("Foto del perfil")).toMatchObject({ visible: false, valor: "no hay foto que mostrar" });
    expect(v("Posición GPS").visible).toBe(false);
  });
});

describe("leerCargaPublica: lo que llega de un faro ajeno", () => {
  it("sin `pub` no es público", () => {
    expect(leerCargaPublica({ nid: "x" }, avatarUrlSegura)).toEqual({ publico: false });
    expect(leerCargaPublica(null, avatarUrlSegura)).toEqual({ publico: false });
    expect(leerCargaPublica("texto", avatarUrlSegura)).toEqual({ publico: false });
  });
  it("con `pub` es público y trae solo lo válido", () => {
    expect(leerCargaPublica({ pub: {} }, avatarUrlSegura)).toEqual({ publico: true });
    expect(leerCargaPublica({ pub: { a: "https://cdn.example.org/a.jpg", d: "tablet" } }, avatarUrlSegura)).toEqual({ publico: true, avatarUrl: "https://cdn.example.org/a.jpg", tipoAparato: "tablet" });
  });
  it("una foto peligrosa o un tipo inventado se descartan", () => {
    expect(leerCargaPublica({ pub: { a: "https://192.168.0.9/a.jpg", d: "nave" } }, avatarUrlSegura)).toEqual({ publico: true });
    expect(leerCargaPublica({ pub: { a: "javascript:alert(1)" } }, avatarUrlSegura)).toEqual({ publico: true });
  });
});

describe("tipoAparatoDesdeAgente", () => {
  it("móvil, tablet o escritorio; nunca «portátil» (un navegador no lo distingue)", () => {
    expect(tipoAparatoDesdeAgente("Mozilla/5.0 (Linux; Android 14) Mobile", true)).toBe("mobile");
    expect(tipoAparatoDesdeAgente("Mozilla/5.0 (iPhone; CPU iPhone OS 17)", true)).toBe("mobile");
    expect(tipoAparatoDesdeAgente("Mozilla/5.0 (iPad; CPU OS 17)", true)).toBe("tablet");
    expect(tipoAparatoDesdeAgente("Mozilla/5.0 (Macintosh; Intel Mac OS X)", false)).toBe("desktop");
    expect(tipoAparatoDesdeAgente("Mozilla/5.0 (X11; Linux x86_64)", true)).toBe("tablet");
  });
});
