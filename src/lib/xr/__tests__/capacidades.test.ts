import { describe, expect, it } from "vitest";
import { evaluarCapacidades, modeloQuest, planificarEntrada, plataformaDeDatos, refinarFunciones, type DatosNavegador } from "../capacidades";

const base: DatosNavegador = { ua: "", seguro: true, tieneXR: true, vr: false, ar: false, ofreceSesion: false, tactil: false, webgl2: true, webgpu: false, instalada: false };
const QUEST3 = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/38.0 SamsungBrowser/4.0 Chrome/134.0 VR Safari/537.36 Quest 3";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

describe("plataforma y modelo", () => {
  it("reconoce Quest por el token del navegador de Meta y distingue el modelo", () => {
    expect(plataformaDeDatos({ ...base, ua: QUEST3 })).toBe("quest");
    expect(modeloQuest(QUEST3)).toBe("quest-3");
    expect(modeloQuest("OculusBrowser Quest 2")).toBe("quest-2");
    expect(modeloQuest("OculusBrowser Quest Pro")).toBe("quest-pro");
    expect(modeloQuest(WIN)).toBeNull();
  });
  it("visionOS se anuncia como un Mac: sólo lo delata tener VR por WebXR", () => {
    expect(plataformaDeDatos({ ...base, ua: MAC, vr: true })).toBe("visionos");
    expect(plataformaDeDatos({ ...base, ua: MAC, tieneXR: false, vr: null })).toBe("escritorio");
  });
  it("Android con VR es un visor; sin VR es un móvil", () => {
    expect(plataformaDeDatos({ ...base, ua: PIXEL, vr: true })).toBe("android-xr");
    expect(plataformaDeDatos({ ...base, ua: PIXEL, ar: true })).toBe("android-movil");
  });
});

describe("evaluarCapacidades", () => {
  it("Quest con VR y AR: en el sistema se recomienda AR (se trabaja sobre el cuarto); un mundo VR, VR", () => {
    const d = { ...base, ua: QUEST3, vr: true, ar: true };
    expect(evaluarCapacidades(d).recomendado).toBe("ar-passthrough");
    expect(evaluarCapacidades(d, { contexto: "mundo-vr" }).recomendado).toBe("vr-inmersivo");
    expect(evaluarCapacidades(d).entradas).toEqual(expect.arrayContaining(["mandos", "manos", "voz"]));
  });
  it("Quest sólo con VR recomienda VR", () => {
    expect(evaluarCapacidades({ ...base, ua: QUEST3, vr: true, ar: false }).recomendado).toBe("vr-inmersivo");
  });
  it("la elección de la persona manda mientras el modo exista", () => {
    const d = { ...base, ua: QUEST3, vr: true, ar: true };
    expect(evaluarCapacidades(d, { modo: "vr-inmersivo" }).recomendado).toBe("vr-inmersivo");
    expect(evaluarCapacidades({ ...base, ua: WIN }, { modo: "vr-inmersivo" }).recomendado).toBe("3d-pantalla");
  });
  it("Android móvil con AR: 'ar-mano' sólo dentro de un mundo; el sistema se queda en 3D de pantalla", () => {
    const d = { ...base, ua: PIXEL, ar: true, tactil: true };
    expect(evaluarCapacidades(d).recomendado).toBe("3d-pantalla");
    expect(evaluarCapacidades(d, { contexto: "mundo-ar" }).recomendado).toBe("ar-mano");
  });
  it("iPhone: sin WebXR, 3D en pantalla y un aviso honesto", () => {
    const c = evaluarCapacidades({ ...base, ua: IPHONE, tieneXR: false, vr: null, ar: null, tactil: true });
    expect(c.recomendado).toBe("3d-pantalla");
    expect(c.avisos.join(" ")).toMatch(/Safari/);
  });
  it("sin contexto seguro no hay sesión inmersiva y se explica", () => {
    const c = evaluarCapacidades({ ...base, ua: QUEST3, vr: true, seguro: false });
    expect(c.modos).not.toContain("vr-inmersivo");
    expect(c.avisos.join(" ")).toMatch(/https/);
  });
  it("sin WebGL 2 se queda la interfaz plana", () => {
    expect(evaluarCapacidades({ ...base, ua: WIN, webgl2: false, tieneXR: false }).recomendado).toBe("2d");
  });
  it("escritorio con visor conectado sólo salta a VR dentro de un mundo VR", () => {
    const d = { ...base, ua: WIN, vr: true };
    expect(evaluarCapacidades(d).recomendado).toBe("3d-pantalla");
    expect(evaluarCapacidades(d, { contexto: "mundo-vr" }).recomendado).toBe("vr-inmersivo");
  });
});

describe("funciones habilitadas", () => {
  it("lo concedido sustituye a lo esperado y se ignora lo desconocido", () => {
    const c = evaluarCapacidades({ ...base, ua: QUEST3, vr: true });
    const r = refinarFunciones(c, ["local-floor", "hand-tracking", "magia-negra"]);
    expect(r.funciones).toEqual(["local-floor", "hand-tracking"]);
  });
});

describe("planificarEntrada", () => {
  const quest = evaluarCapacidades({ ...base, ua: QUEST3, vr: true, ar: true });
  it("PWA instalada en Quest: entra sola (el icono es el gesto)", () => {
    const p = planificarEntrada(quest, { instalada: true });
    expect(p.estrategia).toBe("auto-al-abrir");
    expect(p.requiereGesto).toBe(false);
  });
  it("Quest en el navegador con offerSession: deja que el navegador ofrezca el botón", () => {
    const c = evaluarCapacidades({ ...base, ua: QUEST3, vr: true, ar: true, ofreceSesion: true });
    expect(planificarEntrada(c, { instalada: false }).estrategia).toBe("oferta-navegador");
  });
  it("sin nada más, botón universal que exige gesto", () => {
    const c = evaluarCapacidades({ ...base, ua: QUEST3, vr: true, ar: true });
    const p = planificarEntrada(c, { instalada: false });
    expect(p).toMatchObject({ estrategia: "boton-universal", requiereGesto: true, botonUniversal: true });
    expect(planificarEntrada(c, { instalada: false, gesto: true }).requiereGesto).toBe(false);
  });
  it("sin modo inmersivo: sólo pantalla y sin botón", () => {
    const c = evaluarCapacidades({ ...base, ua: WIN, tieneXR: false });
    expect(planificarEntrada(c, { instalada: false })).toMatchObject({ estrategia: "solo-pantalla", botonUniversal: false });
  });
  it("una PWA instalada fuera de Quest no se abre sola", () => {
    const c = evaluarCapacidades({ ...base, ua: PIXEL, vr: true });
    expect(planificarEntrada(c, { instalada: true }).estrategia).not.toBe("auto-al-abrir");
  });
});
