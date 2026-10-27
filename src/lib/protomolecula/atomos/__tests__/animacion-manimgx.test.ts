/**
 * Pruebas PURAS del átomo «Animación 3D (ManimGX)»: registro, parámetros y la
 * traducción parámetros → envío y salidas del render. No hay red ni Worker.
 * Contratos: architecture/repos-3d-oido-agentes-1023.md §3; protomolecula.md §11.1
 */
import { describe, it, expect } from "vitest";
import { registrarAtomo, MAX_PARAMETROS } from "@/lib/protomolecula/registro-atomos";
import { ANIMACION_MANIMGX, enviarDesde, escenaValida, renderizarAnimacion } from "../animacion-manimgx";

const CODIGO = "def construir():\n    return Circle()";

describe("registro del átomo animacion-manimgx", () => {
  it("pasa el registro con sus topes y sin parámetros duplicados", () => {
    expect(registrarAtomo(ANIMACION_MANIMGX)).toEqual({ ok: true });
    expect(ANIMACION_MANIMGX.parametros.length).toBeLessThanOrEqual(MAX_PARAMETROS);
    const ids = ANIMACION_MANIMGX.parametros.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declara categoría 3d, integración wasm-en-worker y salida MP4", () => {
    expect(ANIMACION_MANIMGX.categoria).toBe("3d");
    expect(ANIMACION_MANIMGX.integracion).toBe("wasm-en-worker");
    expect(ANIMACION_MANIMGX.control).toBe("total");
    expect(ANIMACION_MANIMGX.salidas).toEqual(["mp4"]);
    expect(ANIMACION_MANIMGX.entradas).toEqual(["py"]);
    expect(ANIMACION_MANIMGX.ficha?.repo).toContain("academa-labs/manimgx");
  });

  it("declara los parámetros pedidos con sus defectos", () => {
    const porId = new Map(ANIMACION_MANIMGX.parametros.map((p) => [p.id, p]));
    expect([...porId.keys()]).toEqual([
      "calidad", "fps", "duracion", "rotacion-camara", "color-fondo", "renderizar",
    ]);
    expect(porId.get("calidad")?.defecto).toBe("1080p");
    expect(porId.get("fps")?.defecto).toBe(30);
    expect(porId.get("duracion")?.defecto).toBe(10);
    expect(porId.get("rotacion-camara")?.defecto).toBe(0);
    expect(porId.get("color-fondo")?.defecto).toBe("oscuro");
    expect(porId.get("renderizar")?.tipo).toBe("disparo");
    expect(porId.get("fps")?.unidad).toBe("fps");
    expect(porId.get("duracion")?.unidad).toBe("s");
    expect(porId.get("rotacion-camara")?.unidad).toBe("grados");
  });

  it("el disparo renderizar queda fuera de los parámetros que el dictado mueve por valor", () => {
    const renderizar = ANIMACION_MANIMGX.parametros.find((p) => p.id === "renderizar");
    expect(renderizar?.opciones).toBeUndefined();
    expect(renderizar?.min).toBeUndefined();
  });
});

describe("enviarDesde (parámetros → envío al Worker)", () => {
  it("con defectos produce 1080p, 30 fps, 10 s y el fondo oscuro del OS", () => {
    const r = enviarDesde({}, CODIGO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envio.ancho).toBe(1920);
    expect(r.envio.alto).toBe(1080);
    expect(r.envio.fps).toBe(30);
    expect(r.envio.rotacionCamara).toBe(0);
    expect(r.envio.colorFondo).toBe("#0b0b14");
    expect(r.envio.escena.codigoPython).toBe(CODIGO);
    expect(r.envio.escena.duracionMaxSegundos).toBe(10);
  });

  it("acepta calidades y colores declarados, y acota la rotación a su rango", () => {
    const r = enviarDesde(
      { calidad: "4k", "color-fondo": "blanco", "rotacion-camara": 720, fps: 120, duracion: 300 },
      CODIGO,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envio.ancho).toBe(3840);
    expect(r.envio.colorFondo).toBe("#ffffff");
    expect(r.envio.rotacionCamara).toBe(360);
    expect(r.envio.fps).toBe(60);
    expect(r.envio.escena.duracionMaxSegundos).toBe(60);
  });

  it("un valor roto no mueve nada: vuelve al defecto sin lanzar", () => {
    const r = enviarDesde(
      { calidad: "8k", fps: NaN, duracion: undefined, "rotacion-camara": "norte", "color-fondo": 42 },
      CODIGO,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.envio.ancho).toBe(1920); // calidad desconocida → defecto
    expect(r.envio.fps).toBe(30);
    expect(r.envio.escena.duracionMaxSegundos).toBe(10);
    expect(r.envio.rotacionCamara).toBe(0);
    expect(r.envio.colorFondo).toBe("#0b0b14");
  });

  it("la calidad admite solo las opciones declaradas en la definición", () => {
    const opciones = ANIMACION_MANIMGX.parametros.find((p) => p.id === "calidad")?.opciones ?? [];
    expect(opciones).toEqual(["720p", "1080p", "4k"]);
  });
});

describe("escenaValida y acción renderizar", () => {
  it("rechaza código vacío, en blanco y no-texto", () => {
    expect(escenaValida("")).toEqual({ ok: false, motivo: "falta el código Python de la escena" });
    expect(escenaValida("   \n  ")).toEqual({ ok: false, motivo: "falta el código Python de la escena" });
  });

  it("un envío invocado con un envío fallido devuelve error honesto y sin MP4", async () => {
    const informe = await renderizarAnimacion({ ok: false, motivo: "falta el código Python de la escena" });
    expect(informe.bytes).toBeNull();
    expect(informe.mp4).toBeNull();
    expect(informe.cancelado).toBe(false);
    expect(informe.error).toBe("falta el código Python de la escena");
  });

  it("sin WebGPU en el medio, el render avisa con su motivo y no produce bytes", async () => {
    const envio = enviarDesde({ duracion: 5 }, CODIGO);
    expect(envio.ok).toBe(true);
    if (!envio.ok) return;
    const informe = await renderizarAnimacion(envio);
    expect(informe.escena).toBe(envio.envio.escena.nombre);
    expect(informe.bytes).toBeNull();
    expect(informe.mp4).toBeNull();
    if (informe.error !== undefined) {
      expect(typeof informe.error).toBe("string");
    }
    expect(typeof informe.cancelado).toBe("boolean");
  });
});
