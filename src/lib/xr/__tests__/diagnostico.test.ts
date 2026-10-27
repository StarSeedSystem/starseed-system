/**
 * Pruebas de `src/lib/xr/diagnostico.ts` (puro, en node): estados por función esperada, iPhone sin WebXR,
 * sin sesión, privacidad del texto, orden estable y `vr: null` = «comprobando».
 */
import { describe, expect, it } from "vitest";
import { construirInforme, type DatosDiagnostico } from "../diagnostico";
import { evaluarCapacidades, planificarEntrada, type DatosNavegador } from "../capacidades";

const base = (extra: Partial<DatosNavegador> = {}): DatosNavegador => ({
  ua: "OculusBrowser/39.2 Chrome/136 Quest 3",
  seguro: true, tieneXR: true, vr: true, ar: true, ofreceSesion: true,
  tactil: false, webgl2: true, webgpu: true, instalada: true, ...extra,
});

const dd = (d: DatosNavegador, extra: Partial<DatosDiagnostico> = {}): DatosDiagnostico => {
  const capacidades = evaluarCapacidades(d, { modo: "auto" });
  return { datos: d, capacidades, plan: planificarEntrada(capacidades, { instalada: d.instalada }), ahora: 0, ...extra };
};

const SESION = {
  modo: "vr-inmersivo",
  funcionesConcedidas: ["local-floor", "hand-tracking"],
  frecuenciasSoportadas: [72, 90],
  frecuenciaActual: 72,
  foveacion: 0.5,
};

describe("construirInforme", () => {
  it("en Quest con enabledFeatures parcial: las no concedidas salen aviso y las concedidas, ok", () => {
    const informe = construirInforme(dd(base(), { sesion: SESION }));
    const funciones = informe.secciones.find((s) => s.nombre === "Funciones esperadas");
    expect(funciones).toBeDefined();
    const local = funciones!.lineas.find((l) => l.clave === "local-floor");
    const layers = funciones!.lineas.find((l) => l.clave === "layers");
    expect(local).toEqual({ clave: "local-floor", valor: "concedida", estado: "ok" });
    expect(layers).toEqual({ clave: "layers", valor: "no concedida", estado: "aviso" });
  });

  it("iPhone: «sin WebXR» con estado fallo y no rompe (plataforma ios, sin esperas)", () => {
    const informe = construirInforme(dd(base({ ua: "iPhone Safari", tieneXR: false, vr: false, ar: false, webgl2: true, tactil: true })));
    const webxr = informe.secciones[0].lineas.find((l) => l.clave === "WebXR");
    expect(webxr).toEqual({ clave: "WebXR", valor: "sin WebXR", estado: "fallo" });
    expect(informe.secciones.map((s) => s.nombre)).toContain("Funciones esperadas");
  });

  it("sin sesión: las funciones y la sesión salen «sin-probar»", () => {
    const informe = construirInforme(dd(base()));
    const sesion = informe.secciones.find((s) => s.nombre === "Sesión");
    expect(sesion!.lineas[0]).toEqual({ clave: "estado", valor: "sin sesión", estado: "sin-probar" });
    const funciones = informe.secciones.find((s) => s.nombre === "Funciones esperadas");
    expect(funciones!.lineas.every((l) => l.estado === "sin-probar")).toBe(true);
  });

  it("vr: null (aún comprobando) → línea VR «comprobando…» con estado sin-probar, sin fallo", () => {
    const informe = construirInforme(dd(base({ vr: null, ar: null })));
    const vr = informe.secciones[0].lineas.find((l) => l.clave === "VR");
    expect(vr).toEqual({ clave: "VR", valor: "comprobando…", estado: "sin-probar" });
    expect(informe.texto).not.toContain("fallo");
  });

  it("el texto no contiene signos de parámetros ni menciones de cuenta, aunque el dato los traiga", () => {
    const informe = construirInforme(dd(base({ ua: "clara?panel @cuenta local" })));
    expect(informe.texto.includes("?")).toBe(false);
    expect(informe.texto.includes("@")).toBe(false);
    expect(informe.texto).toContain("Informe de diagnóstico XR");
  });

  it("el orden es estable: dos construcciones con los mismos datos dan el mismo texto", () => {
    const a = construirInforme(dd(base(), { sesion: SESION, calidad: { nivel: "media", modo: "auto", frameMsMedia: 12, frameMsP95: 18 } }));
    const b = construirInforme(dd(base(), { sesion: SESION, calidad: { nivel: "media", modo: "auto", frameMsMedia: 12, frameMsP95: 18 } }));
    expect(a.texto).toBe(b.texto);
    expect(a.secciones.map((s) => s.nombre)).toEqual(b.secciones.map((s) => s.nombre));
  });

  it("estados del fotograma: 12 ms → bien; 25 ms → aviso; 40 ms → fallo", () => {
    const bien = construirInforme(dd(base(), { sesion: SESION, calidad: { nivel: "media", modo: "auto", frameMsMedia: 12 } }));
    const advertido = construirInforme(dd(base(), { sesion: SESION, calidad: { nivel: "baja", modo: "minima", frameMsMedia: 25 } }));
    const grave = construirInforme(dd(base(), { sesion: SESION, calidad: { nivel: "minima", modo: "minima", frameMsMedia: 40 } }));
    const medio = (i: ReturnType<typeof construirInforme>) =>
      i.secciones.find((s) => s.nombre === "Calidad")!.lineas.find((l) => l.clave === "fotograma medio");
    expect(medio(bien)!.estado).toBe("ok");
    expect(medio(advertido)!.estado).toBe("aviso");
    expect(medio(grave)!.estado).toBe("fallo");
  });

  it("micrófono y entradas: denegado es fallo; sin entradas con sesión es fallo; concedido es ok", () => {
    const denegado = construirInforme(dd(base(), { microfono: "denegado" }));
    expect(denegado.secciones.find((s) => s.nombre === "Micrófono")!.lineas[0].estado).toBe("fallo");
    const concedido = construirInforme(dd(base(), { microfono: "concedido" }));
    expect(concedido.secciones.find((s) => s.nombre === "Micrófono")!.lineas[0].estado).toBe("ok");
    const vacio = construirInforme(dd(base(), { sesion: SESION, entradas: [] }));
    expect(vacio.secciones.find((s) => s.nombre === "Entradas")!.lineas[0]).toEqual({ clave: "entradas", valor: "ninguna detectada", estado: "fallo" });
    const con = construirInforme(dd(base(), { sesion: SESION, entradas: ["tracked-pointer", "transient-pointer"] }));
    expect(con.secciones.find((s) => s.nombre === "Entradas")!.lineas[0].estado).toBe("ok");
  });

  it("la fecha es ISO y el informe siempre trae las siete secciones en orden fijo", () => {
    const informe = construirInforme(dd(base(), { ahora: 1760000000000 }));
    expect(informe.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(informe.secciones.map((s) => s.nombre)).toEqual([
      "Navegador", "Sesión", "Funciones esperadas", "Calidad", "Entradas", "Micrófono", "Entrada",
    ]);
  });
});


