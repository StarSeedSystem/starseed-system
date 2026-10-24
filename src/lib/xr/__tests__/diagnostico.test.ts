import { describe, expect, it } from "vitest";
import { construirInforme } from "@/lib/xr/diagnostico";
import type { DatosNavegador, CapacidadesXR, PlanEntrada } from "@/lib/xr/capacidades";
import type { SesionXR, CalidadXR } from "@/lib/xr/diagnostico";

const baseDatos: DatosNavegador = {
  ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 OculusBrowser/38.0 Chrome/134.0 Quest 3",
  seguro: true,
  tieneXR: true,
  vr: true,
  ar: true,
  ofreceSesion: false,
  tactil: false,
  webgl2: true,
  webgpu: false,
  instalada: false,
};

const baseCapacidadesQuest: CapacidadesXR = {
  plataforma: "quest",
  visor: true,
  modos: ["2d", "3d-pantalla", "vr-inmersivo", "ar-passthrough"],
  recomendado: "ar-passthrough",
  entradas: ["mandos", "manos", "voz"],
  funciones: [
    "local-floor",
    "bounded-floor",
    "hand-tracking",
    "layers",
    "anchors",
    "hit-test",
    "plane-detection",
    "mesh-detection",
    "depth-sensing",
  ],
  ofrecerSesion: false,
  motivos: ["Visor con cámara: el sistema se trabaja mejor sobre tu cuarto."],
  avisos: [],
};

const basePlan: PlanEntrada = {
  estrategia: "boton-universal",
  modo: "ar-passthrough",
  requiereGesto: true,
  botonUniversal: true,
  motivo: "Hace falta tocar el botón: el navegador no abre VR/AR sin un gesto.",
};

describe("XR1010AI: construirInforme - Informe de diagnóstico del visor", () => {
  it("crea un informe completo para Quest con todas las funciones concedidas", () => {
    const sesion: SesionXR = {
      modo: "ar-passthrough",
      funcionesConcedidas: [
        "local-floor",
        "bounded-floor",
        "hand-tracking",
        "layers",
        "anchors",
        "hit-test",
        "plane-detection",
        "mesh-detection",
        "depth-sensing",
      ],
      frecuenciasSoportadas: [72, 90, 120],
      frecuenciaActual: 90,
      foveacion: 0.5,
    };
    const calidad: CalidadXR = {
      nivel: "media",
      modo: "auto",
      frameMsMedia: 16.7,
      frameMsP95: 33.3,
    };
    const entradas = ["finger", "hand", "controller"];
    const microfono = "sin-probar";

    const informe = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      sesion,
      calidad,
      entradas,
      microfono,
      ahora: 1738425600000,
    });

    expect(informe.fecha).toBe("2025-02-02T00:00:00.000Z");
    expect(informe.titulo).toBe("Diagnóstico del visor para quest");
    expect(informe.secciones).toHaveLength(1);
    expect(informe.secciones[0].nombre).toBe("Compatibilidad");
    expect(informe.secciones[0].lineas).toHaveLength(12);
    expect(informe.texto).toContain("=== Diagnóstico del visor para quest ===");
    expect(informe.texto).toContain("vr: true (ok)");
    expect(informe.texto).toContain("ar: true (ok)");
    expect(informe.texto).toContain("nivel: media (ok)");
    expect(informe.texto).toContain("entradas: 3 (ok)");
    expect(informe.texto).toContain("local-floor: true (ok)");
    expect(informe.texto).toContain("plane-detection: true (ok)");
  });

  it("maneja Quest con funciones concedidas parcialmente (plane-detection como required)", () => {
    const sesion: SesionXR = {
      modo: "ar-passthrough",
      funcionesConcedidas: [
        "local-floor",
        "bounded-floor",
        "hand-tracking",
        "layers",
        "anchors",
        "hit-test",
        "depth-sensing",
      ],
      frecuenciasSoportadas: [72],
      frecuenciaActual: 72,
      foveacion: 1.0,
    };
    const calidad: CalidadXR = {
      nivel: "minima",
      modo: "auto",
    };
    const entradas = [];
    const microfono = "sin-probar";

    const informe = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      sesion,
      calidad,
      entradas,
      microfono,
      ahora: 1738425600000,
    });

    const planeDetectionLinea = informe.secciones[0].lineas.find((l) => l.clave === "plane-detection");
    expect(planeDetectionLinea?.estado).toBe("aviso");
    expect(informe.texto).toContain("plane-detection: false (aviso)");
    const entradasLinea = informe.secciones[0].lineas.find((l) => l.clave === "entradas");
    expect(entradasLinea?.estado).toBe("fallo");
  });

  it("marca sin-probar cuando no hay sesión XR", () => {
    const informe = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      ahora: 1738425600000,
    });

    const vrLinea = informe.secciones[0].lineas.find((l) => l.clave === "vr");
    expect(vrLinea?.estado).toBe("ok");
    const planeDetectionLinea = informe.secciones[0].lineas.find((l) => l.clave === "plane-detection");
    expect(planeDetectionLinea?.estado).toBe("sin-probar");
    expect(informe.texto).toContain("vr: true (ok)");
  });

  it("produce un texto plano limpio sin caracteres de URL y con @ y data- eliminados", () => {
    const sesion: SesionXR = {
      modo: "ar-passthrough",
      funcionesConcedidas: ["local-floor"],
      frecuenciasSoportadas: [72],
    };

    const informe = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      sesion,
      ahora: 1738425600000,
    });

    expect(informe.texto).not.toContain("?");
    expect(informe.texto).toContain("@");
    expect(informe.texto).not.toContain("data-");
    expect(informe.texto).toBeTruthy();
  });

  it("genera estados correctos para iPhone (sin WebXR)", () => {
    const datosIphone: DatosNavegador = {
      ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      seguro: true,
      tieneXR: false,
      vr: null,
      ar: null,
      ofreceSesion: false,
      tactil: true,
      webgl2: true,
      webgpu: false,
      instalada: false,
    };

    const capacidadesIphone: CapacidadesXR = {
      ...baseCapacidadesQuest,
      plataforma: "ios",
      visor: false,
      modos: ["2d", "3d-pantalla"],
      entradas: ["tactil", "voz"],
      funciones: [],
    };

    const informe = construirInforme({
      datos: datosIphone,
      capacidades: capacidadesIphone,
      plan: basePlan,
      ahora: 1738425600000,
    });

    expect(informe.titulo).toBe("Diagnóstico del visor para ios");
    expect(informe.secciones[0].lineas.find((l) => l.clave === "vr")!.estado).toBe("sin-probar");
    expect(informe.secciones[0].lineas.find((l) => l.clave === "ar")!.estado).toBe("sin-pro-bar");
  });

  it("muestra estados correctos cuando vr: null (aún comprobando)", () => {
    const datosComprobando: DatosNavegador = {
      ...baseDatos,
      vr: null,
      ar: true,
    };

    const informe = construirInforme({
      datos: datosComprobando,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      ahora: 1738425600000,
    });

    const vrLinea = informe.secciones[0].lineas.find((l) => l.clave === "vr");
    expect(vrLinea?.estado).toBe("sin-probar");
    const arLinea = informe.secciones[0].lineas.find((l) => l.clave === "ar");
    expect(arLinea?.estado).toBe("ok");
  });

  it("muestra estados correctos cuando existe calidad en la sesión", () => {
    const sesion: SesionXR = {
      modo: "ar-passthrough",
      funcionesConcedidas: ["local-floor"],
      frecuenciasSoportadas: [90],
      frecuenciaActual: 90,
      foveacion: 0.3,
    };
    const calidad: CalidadXR = {
      nivel: "media",
      modo: "auto",
      frameMsMedia: 11.1,
      frameMsP95: 22.2,
    };

    const informe = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      sesion,
      calidad,
      ahora: 1738425600000,
    });

    const frecuenciaActualLinea = informe.secciones[0].lineas.find((l) => l.clave === "frecuenciaActual");
    expect(frecuenciaActualLinea?.estado).toBe("ok");
    const foveacionLinea = informe.secciones[0].lineas.find((l) => l.clave === "foveacion");
    expect(foveacionLinea?.estado).toBe("ok");
    expect(informe.texto).toContain("frecuenciaActual: 90 (ok)");
    expect(informe.texto).toContain("foveacion: 0.3 (ok)");
  });

  it("muestra estados correctos para entradas si existen", () => {
    const entradas = ["finger", "hand", "controller", "pointer"];
    const informe = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      entradas,
      ahora: 1738425600000,
    });

    const entradasLinea = informe.secciones[0].lineas.find((l) => l.clave === "entradas");
    expect(entradasLinea?.estado).toBe("ok");
    expect(entradasLinea?.valor).toBe("4");
    expect(informe.texto).toContain("entradas: 4 (ok)");

    const entradasVacia: string[] = [];
    const informeVacio = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      entradas: entradasVacia,
      ahora: 1738425600000,
    });

    const entradasLineaVacia = informeVacio.secciones[0].lineas.find((l) => l.clave === "entradas");
    expect(entradasLineaVacia?.estado).toBe("fallo");
    expect(entradasLineaVacia?.valor).toBe("0");
  });

  it("muestra estados correctos para micrófono solo si se proporciona", () => {
    const microfonoConcedido = "concedido";
    const informeConcedido = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      microfono: microfonoConcedido,
      ahora: 1738425600000,
    });

    const microfonoLinea = informeConcedido.secciones[0].lineas.find((l) => l.clave === "micrófono");
    expect(microfonoLinea?.estado).toBe("ok");
    expect(microfonoLinea?.valor).toBe("concedido");
    expect(informeConcedido.texto).toContain("micrófono: concedido (ok)");

    const microfonoDenegado = "denegado";
    const informeDenegado = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      microfono: microfonoDenegado,
      ahora: 1738425600000,
    });

    const microfonoLineaDenegado = informeDenegado.secciones[0].lineas.find((l) => l.clave === "micrófono");
    expect(microfonoLineaDenegado?.estado).toBe("fallo");
    expect(microfonoLineaDenegado?.valor).toBe("denegado");
    expect(informeDenegado.texto).toContain("micrófono: denegado (fallo)");

    const microfonoSinProbar = "sin-probar";
    const informeSinProbar = construirInforme({
      datos: baseDatos,
      capacidades: baseCapacidadesQuest,
      plan: basePlan,
      microfono: microfonoSinProbar,
      ahora: 1738425600000,
    });

    const microfonoLineaSinProbar = informeSinProbar.secciones[0].lineas.find((l) => l.clave === "micrófono");
    expect(microfonoLineaSinProbar?.estado).toBe("sin-probar");
    expect(microfonoLineaSinProbar?.valor).toBe("sin-pro-bar");
    expect(informeSinProbar.texto).toContain("micrófono: sin-pro-bar (sin-pro-bar)");
  });
});
