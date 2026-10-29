// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// La rama probaba un relé de vídeo por la malla (admite/validar/manejar_VIDEO_MALLA_*)
// que main NO adoptó: el vídeo vive en el servicio hyperframes de la neurona
// (servicios/hyperframes/src/rutas.mjs, HFR1018Fb). Se descartan la admisión por grupos,
// la validación de cuenta/origen/formato/duración y el bloqueo de GSAP al editar (ya
// cubierto por detectarAdaptadores en src/lib/video-html/__tests__/adaptadores.test.ts y
// por validarOrdenes en src/lib/__tests__/hyperframes-rutas.test.ts). Se rescatan los
// casos que la API de hoy no cubre todavía.

import { describe, it, expect, vi } from "vitest";
import { manejar } from "../../../../servicios/hyperframes/src/rutas.mjs";
import {
  cuentaAdmitida,
  manejarVideoPorMalla,
  recursoPrivadoAjeno,
  VIDEO_MALLA_MAX_COMPOSICION_BYTES,
  type DepsVideoMalla,
  type PeticionVideoMalla,
} from "@/lib/network/video-por-malla";

const HTML = "<div data-composition-id=\"a\"></div>";
const CON_GSAP = "<div><script>import { gsap } from 'gsap'; gsap.to('.a', { x: 1 });</script></div>";
const deps = () => ({
  version: "0.8.172",
  navegador: true,
  ffmpeg: false,
  lint: vi.fn(async () => ({ errores: [], avisos: [] })),
  editar: vi.fn(async (c: string) => c),
  cola: { encolar: vi.fn(async () => "t1"), estado: vi.fn() },
});

describe("servicio hyperframes · peticiones de vídeo (ramas de la nube)", () => {
  it("rechaza basura: sin composición en /lint, /editar y /render, sin encolar", async () => {
    const d = deps();
    const sinCuerpo = { composicion: null };
    for (const ruta of ["/lint", "/editar", "/render"]) {
      const r = await manejar({ metodo: "POST", ruta, cuerpo: sinCuerpo }, d);
      expect(r.estado).toBe(400);
      expect((r.cuerpo as { error: string }).error).toContain("composición");
    }
    expect(d.cola.encolar).not.toHaveBeenCalled();
  });

  it("una composición ajena con GSAP se puede renderizar (solo no se edita)", async () => {
    const d = deps();
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: CON_GSAP } }, d);
    expect(r.estado).toBe(202);
    expect((r.cuerpo as { id: string }).id).toBe("t1");
    expect(d.cola.encolar).toHaveBeenCalledWith({ composicion: CON_GSAP, formato: "mp4" });
  });

  it("cola llena ⇒ rechazo legible y sin lanzar", async () => {
    const d = deps();
    d.cola.encolar = vi.fn(async () => { throw new Error("cola llena"); });
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: HTML } }, d);
    expect(r.estado).toBe(500);
    expect((r.cuerpo as { error: string }).error).toContain("cola llena");
  });
});

/* ── HFR1018I · manejador puro de `capacidad.video.render` ──
 * Admite la misma cuenta o un grupo con permiso, bloquea GSAP editado por el OS,
 * bloquea recursos privados ajenos y encola. Todo inyectado: sin red ni reloj. */

const SIN_GSAP = "<div data-composition-id=\"a\"><style>@keyframes f{}</style></div>";

function depsVideo(over: Partial<DepsVideoMalla> = {}): DepsVideoMalla {
  return {
    cuentaLocal: "ana",
    grupos: [{ grupo: "equipo", miembros: ["ana", "bea"], permiteRender: true }],
    crearTrabajoId: () => "trabajo-1",
    encolar: vi.fn(() => true),
    ...over,
  };
}

function peticion(over: Partial<PeticionVideoMalla> = {}): PeticionVideoMalla {
  return { cuenta: "ana", composicion: SIN_GSAP, ...over };
}

describe("manejarVideoPorMalla · admisión por cuenta y grupo", () => {
  it("la misma cuenta entra y se encola con formato por defecto mp4", () => {
    const encolar = vi.fn(() => true);
    const r = manejarVideoPorMalla(peticion(), depsVideo({ encolar }));
    expect(r).toEqual({ aceptado: true, trabajoId: "trabajo-1" });
    expect(encolar).toHaveBeenCalledWith({
      trabajoId: "trabajo-1", cuenta: "ana", composicion: SIN_GSAP, formato: "mp4",
    });
  });

  it("otra cuenta sin grupo queda fuera con motivo legible", () => {
    const r = manejarVideoPorMalla(peticion({ cuenta: "carla" }), depsVideo());
    expect(r.aceptado).toBe(false);
    if (!r.aceptado) expect(r.motivo).toContain("grupo con permiso");
  });

  it("un miembro de un grupo con permiso de render entra", () => {
    const r = manejarVideoPorMalla(peticion({ cuenta: "bea", grupo: "equipo" }), depsVideo());
    expect(r.aceptado).toBe(true);
  });

  it("un grupo sin permiso o con no-miembro no entra", () => {
    const sinPermiso = depsVideo({ grupos: [{ grupo: "equipo", miembros: ["bea"], permiteRender: false }] });
    expect(manejarVideoPorMalla(peticion({ cuenta: "bea", grupo: "equipo" }), sinPermiso).aceptado).toBe(false);
    expect(manejarVideoPorMalla(peticion({ cuenta: "carla", grupo: "equipo" }), depsVideo()).aceptado).toBe(false);
  });

  it("cuentaAdmitida compara solo; no valida identidad", () => {
    expect(cuentaAdmitida({ cuenta: "ana" }, depsVideo())).toBe(true);
    expect(cuentaAdmitida({ cuenta: "bea", grupo: "equipo" }, depsVideo())).toBe(true);
    expect(cuentaAdmitida({ cuenta: "carla", grupo: "equipo" }, depsVideo())).toBe(false);
  });
});

describe("manejarVideoPorMalla · GSAP y recursos privados", () => {
  it("rechaza GSAP si la composición la editó el OS", () => {
    const r = manejarVideoPorMalla(peticion({ composicion: CON_GSAP }), depsVideo());
    expect(r.aceptado).toBe(false);
    if (!r.aceptado) expect(r.motivo).toContain("GSAP");
  });

  it("una composición ajena con GSAP se puede renderizar (solo no se edita)", () => {
    const encolar = vi.fn(() => true);
    const r = manejarVideoPorMalla(peticion({ composicion: CON_GSAP, origen: "ajena" }), depsVideo({ encolar }));
    expect(r.aceptado).toBe(true);
    expect(encolar).toHaveBeenCalledTimes(1);
  });

  it("bloquea recursos privados de otra cuenta y admite los propios", () => {
    const ajeno = peticion({ recursos: [{ url: "https://nube/x.png", privado: true, cuenta: "carla" }] });
    expect(manejarVideoPorMalla(ajeno, depsVideo()).aceptado).toBe(false);
    const propio = peticion({ recursos: [{ url: "https://nube/x.png", privado: true, cuenta: "ana" }] });
    expect(manejarVideoPorMalla(propio, depsVideo()).aceptado).toBe(true);
    expect(recursoPrivadoAjeno({ url: "u", privado: true, cuenta: "carla" }, "ana", "ana")).toBe(true);
    expect(recursoPrivadoAjeno({ url: "u", privado: true, cuenta: "ana" }, "ana", "zoe")).toBe(false);
    expect(recursoPrivadoAjeno({ url: "u" }, "ana", "ana")).toBe(false);
  });
});

describe("manejarVideoPorMalla · validación y cola", () => {
  it("rechaza composición vacía, formato inválido y composición enorme", () => {
    expect(manejarVideoPorMalla(peticion({ composicion: "  " }), depsVideo()).aceptado).toBe(false);
    const malFormato = { ...peticion(), formato: "avi" } as unknown as PeticionVideoMalla;
    expect(manejarVideoPorMalla(malFormato, depsVideo()).aceptado).toBe(false);
    const enorme = "x".repeat(VIDEO_MALLA_MAX_COMPOSICION_BYTES + 1);
    expect(manejarVideoPorMalla(peticion({ composicion: enorme }), depsVideo()).aceptado).toBe(false);
  });

  it("cola llena o sin id ⇒ rechazo legible, nunca lanza", () => {
    const llena = manejarVideoPorMalla(peticion(), depsVideo({ encolar: () => false }));
    expect(llena.aceptado).toBe(false);
    if (!llena.aceptado) expect(llena.motivo).toContain("cola");
    const sinId = manejarVideoPorMalla(peticion(), depsVideo({ crearTrabajoId: () => "" }));
    expect(sinId.aceptado).toBe(false);
    const basura = manejarVideoPorMalla(null as unknown as PeticionVideoMalla, depsVideo());
    expect(basura.aceptado).toBe(false);
  });
});
