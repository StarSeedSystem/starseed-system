import { describe, it, expect } from "vitest";
import {
  VIDEO_RENDER_TIPO,
  validarPeticionRender,
  crearPeticionCapacidadVideo,
  type PeticionRenderVideo,
  type ComposicionVideo,
} from "@/lib/network/video-por-malla";

function composicionValida(html?: string, recursos?: ComposicionVideo["recursos"]): ComposicionVideo {
  return {
    html: html || `<div data-composition-id="main"><style>@keyframes test { to { opacity: 1; } }</style><div class="clip" data-start="0" data-duration="3">Test</div></div>`,
    recursos: recursos || [],
  };
}

function peticionBase(overrides: Partial<PeticionRenderVideo> = {}): PeticionRenderVideo {
  return {
    composicion: composicionValida(),
    cuentaId: "cuenta-123",
    ...overrides,
  };
}

describe("video-por-malla — validarPeticionRender (puro)", () => {
  it("acepta composición válida sin GSAP y sin recursos privados", () => {
    const peticion = peticionBase();
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(true);
    expect(resultado.trabajoId).toBeDefined();
    expect(resultado.adaptadores?.editableVisualmente).toBe(true);
  });

  it("rechaza composición vacía", () => {
    const peticion = peticionBase({ composicion: { html: "", recursos: [] } });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(false);
    expect(resultado.motivo).toContain("Composición vacía");
  });

  it("rechaza composición con GSAP (no editable visualmente)", () => {
    const htmlConGsap = `<div><script>import { gsap } from 'gsap'; gsap.to('.box', { x: 100 });</script></div>`;
    const peticion = peticionBase({ composicion: composicionValida(htmlConGsap) });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(false);
    expect(resultado.motivo).toContain("licencia de GSAP Standard");
    expect(resultado.adaptadores?.editableVisualmente).toBe(false);
  });

  it("rechaza recurso privado de otra cuenta", () => {
    const peticion = peticionBase({
      composicion: composicionValida(undefined, [
        { url: "https://otra-cuenta.com/video.mp4", tipo: "video", cuentaId: "cuenta-456", privado: true },
      ]),
    });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(false);
    expect(resultado.motivo).toContain("Recurso privado ajeno");
  });

  it("acepta recurso público de otra cuenta", () => {
    const peticion = peticionBase({
      composicion: composicionValida(undefined, [
        { url: "https://publico.com/video.mp4", tipo: "video", cuentaId: "cuenta-456", privado: false },
      ]),
    });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(true);
  });

  it("acepta recurso privado de la misma cuenta", () => {
    const peticion = peticionBase({
      composicion: composicionValida(undefined, [
        { url: "https://mi-cuenta.com/video.mp4", tipo: "video", cuentaId: "cuenta-123", privado: true },
      ]),
    });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(true);
  });

  it("rechaza petición de grupo sin permiso (rol observador)", () => {
    const peticion = peticionBase({ grupoId: "grupo-1", rolEnGrupo: "observador" });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(false);
    expect(resultado.motivo).toContain("Sin permiso en el grupo");
  });

  it("acepta petición de grupo con rol editor", () => {
    const peticion = peticionBase({ grupoId: "grupo-1", rolEnGrupo: "editor" });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(true);
  });

  it("acepta petición de grupo con rol dueño", () => {
    const peticion = peticionBase({ grupoId: "grupo-1", rolEnGrupo: "dueño" });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(true);
  });

  it("acepta petición de grupo con rol comentarista (no editor)", () => {
    const peticion = peticionBase({ grupoId: "grupo-1", rolEnGrupo: "comentarista" });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(false);
    expect(resultado.motivo).toContain("Sin permiso en el grupo");
  });

  it("rechaza composición con TweenMax (GSAP legacy)", () => {
    const htmlConTweenMax = `<div><script>TweenMax.to('.box', 1, { x: 100 });</script></div>`;
    const peticion = peticionBase({ composicion: composicionValida(htmlConTweenMax) });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(false);
    expect(resultado.adaptadores?.usados).toContain("gsap");
  });

  it("rechaza composición con TimelineMax (GSAP legacy)", () => {
    const htmlConTimelineMax = `<div><script>const tl = new TimelineMax(); tl.to('.box', 1, { x: 100 });</script></div>`;
    const peticion = peticionBase({ composicion: composicionValida(htmlConTimelineMax) });
    const resultado = validarPeticionRender(peticion);
    expect(resultado.aceptado).toBe(false);
    expect(resultado.adaptadores?.usados).toContain("gsap");
  });
});

describe("video-por-malla — crearPeticionCapacidadVideo (puro)", () => {
  it("devuelve MsgPedir válido cuando la validación pasa", () => {
    const peticion = peticionBase();
    const resultado = crearPeticionCapacidadVideo(peticion);
    expect("t" in resultado).toBe(true);
    if ("t" in resultado) {
      expect(resultado.t).toBe("capacidad.pedir");
      expect(resultado.tipo).toBe(VIDEO_RENDER_TIPO);
      expect(resultado.id).toBeDefined();
      expect(resultado.cuerpo).toBeDefined();
      expect(resultado.sesionId).toContain("video-render-");
    }
  });

  it("devuelve { ok: false, motivo } cuando la validación falla", () => {
    const peticion = peticionBase({ composicion: { html: "", recursos: [] } });
    const resultado = crearPeticionCapacidadVideo(peticion);
    expect("ok" in resultado).toBe(true);
    if ("ok" in resultado) {
      expect(resultado.ok).toBe(false);
      expect(resultado.motivo).toBeDefined();
    }
  });

  it("incluye grupoId y rolEnGrupo en el cuerpo cuando se proveen", () => {
    const peticion = peticionBase({ grupoId: "grupo-1", rolEnGrupo: "editor" });
    const resultado = crearPeticionCapacidadVideo(peticion);
    expect("t" in resultado).toBe(true);
    if ("t" in resultado) {
      expect(resultado.cuerpo.grupoId).toBe("grupo-1");
      expect(resultado.cuerpo.rolEnGrupo).toBe("editor");
    }
  });
});

describe("video-por-malla — constantes", () => {
  it("VIDEO_RENDER_TIPO es 'render'", () => {
    expect(VIDEO_RENDER_TIPO).toBe("render");
  });
});