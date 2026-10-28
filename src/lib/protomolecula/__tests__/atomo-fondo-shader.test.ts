/**
 * Pruebas puras del átomo «Fondo con shaders» (FSH1018O): registro, parámetros del panel y el plan que
 * devuelve un `SetFondo` válido con capas, difusión y alcance. Sin GPU, sin red, sin disco y sin DOM.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { FONDO_SHADER, planFondo, propsDelCatalogo } from "../atomos/fondo-shader";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";
import { construirCatalogo } from "@/lib/appearance/catalogo-shaders";

const catalogo = construirCatalogo([
  { name: "Aurora", category: "Fondos", description: "Aurora", propsMetadata: { intensity: { default: 0.7 }, speed: { default: 0.5 } } },
  { name: "MeshGradient", category: "Fondos", description: "Degradado" },
  { name: "WebcamTexture", category: "Cámara", description: "Cámara" },
]);
const base = { catalogo, ahora: () => new Date("2026-10-28T12:00:00.000Z"), crearId: () => "fondo-prueba" };

function exito(r: ReturnType<typeof planFondo>) {
  if (!r.ok) throw new Error(r.motivos.join(" · "));
  return r;
}

describe("átomo fondo con shaders", () => {
  beforeEach(() => limpiarRegistro());

  it("se registra con el id «shaders» y declara efecto, props, capas, difusión y alcance", () => {
    expect(registrarAtomo(FONDO_SHADER)).toEqual({ ok: true });
    expect(FONDO_SHADER.herramientaId).toBe("shaders");
    expect(FONDO_SHADER.categoria).toBe("imagen");
    expect(FONDO_SHADER.control).toBe("total");
    expect(FONDO_SHADER.salidas).toEqual(["json"]);
    expect(FONDO_SHADER.parametros.map((p) => p.id)).toEqual(["efecto", "props", "capas", "difusion", "alcance"]);
    const capas = FONDO_SHADER.parametros.find((p) => p.id === "capas");
    expect(capas).toMatchObject({ tipo: "entero", min: 1, max: 8, defecto: 1 });
    const alcance = FONDO_SHADER.parametros.find((p) => p.id === "alcance");
    expect(alcance?.opciones).toEqual(["cuenta", "perfil", "app", "pagina", "seccion", "entidad"]);
  });

  it("las props del catálogo salen solo de las que traen default", () => {
    const aurora = catalogo.Fondos.find((e) => e.name === "Aurora");
    expect(aurora && propsDelCatalogo(aurora)).toEqual({ intensity: 0.7, speed: 0.5 });
    const degradado = catalogo.Fondos.find((e) => e.name === "MeshGradient");
    expect(degradado && propsDelCatalogo(degradado)).toEqual({});
  });

  it("el plan por defecto devuelve un SetFondo con la base actual (Spline) y una capa shader", () => {
    const r = exito(planFondo(base));
    expect(r.set.formato).toBe("starseed-fondo");
    expect(r.set.version).toBe(1);
    expect(r.set.base).toBeNull();
    expect(r.set.id).toBe("fondo-prueba");
    expect(r.set.creado).toBe("2026-10-28T12:00:00.000Z");
    expect(r.set.capas).toHaveLength(1);
    expect(r.set.capas[0].preset?.components[0]).toMatchObject({ type: "Aurora", props: { intensity: 0.7, speed: 0.5 } });
    expect(r.alcance).toBe("perfil");
    expect(r.avisos.some((a) => a.includes("Spline"))).toBe(true);
    expect(r.archivo).toBe("fondo-aurora.starseed-fondo.json");
  });

  it("varias capas, props propias, difusión y alcance de página", () => {
    const r = exito(planFondo({ ...base, valores: { capas: 3, props: "personalizadas", difusion: "desenfoque", alcance: "pagina" }, props: { intensity: 1.2 } }));
    expect(r.set.capas).toHaveLength(4);
    expect(r.set.capas[0].preset?.components[0]?.props).toEqual({ intensity: 1.2 });
    expect(r.set.capas[3]).toMatchObject({ kind: "difusion", difusion: { modo: "desenfoque", desenfoquePx: 24 } });
    expect(r.alcance).toBe("pagina");
    const tope = exito(planFondo({ ...base, valores: { capas: 8, difusion: "blanco" } }));
    expect(tope.set.capas).toHaveLength(8);
    expect(tope.avisos.some((a) => a.includes("7 capas"))).toBe(true);
  });

  it("misma entrada, mismo plan (sin reloj ni id aleatorios)", () => {
    expect(planFondo(base)).toEqual(planFondo(base));
  });

  it("la cámara exige permiso explícito y nunca entra en un set compartido", () => {
    expect(planFondo({ ...base, valores: { efecto: "WebcamTexture" } }).ok).toBe(false);
    expect(planFondo({ ...base, valores: { efecto: "WebcamTexture" }, permisoCamara: true, compartido: true }).ok).toBe(false);
    const permitido = exito(planFondo({ ...base, valores: { efecto: "WebcamTexture" }, permisoCamara: true }));
    expect(permitido.set.capas[0].preset?.components[0]?.type).toBe("WebcamTexture");
  });

  it("un efecto que el catálogo instalado no trae se rechaza con su motivo", () => {
    const r = planFondo({ ...base, valores: { efecto: "Nebula" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivos[0]).toContain("Nebula");
  });
});
