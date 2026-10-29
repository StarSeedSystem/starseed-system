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

/* ─ Manejador PURO `capacidad.video.render` (src/lib/network/video-por-malla.ts) ─ */

import type { MsgPedir } from "../../../../src/lib/network/capacidad-por-malla";
import {
  FORMATO_VIDEO_DEFECTO,
  admiteOrigen,
  esCuerpoVideoRender,
  manejarPeticionVideoMalla,
  recursosPrivadosAjenos,
} from "../../../../src/lib/network/video-por-malla";

const pedir = (cuerpo: unknown, tipo: string = "render"): MsgPedir =>
  ({ t: "capacidad.pedir", id: "p1", tipo, cuerpo } as MsgPedir);
const ctx = (encolar = async () => "t1") => ({
  oferta: { cuentaId: "mía", gruposPrestados: ["g1"] },
  miCuentaId: "mía",
  encolar: vi.fn(encolar),
});

describe("video por la malla · manejador puro de capacidad.video.render", () => {
  it("admite la misma cuenta o un grupo prestado; rechaza un origen ajeno", () => {
    expect(admiteOrigen({ cuentaId: "mía" }, { cuentaId: "mía" })).toBe(true);
    expect(admiteOrigen({ cuentaId: "otra", grupos: ["g1", "x"] }, { cuentaId: "mía", gruposPrestados: ["g1"] })).toBe(true);
    expect(admiteOrigen({ cuentaId: "otra" }, { cuentaId: "mía", gruposPrestados: ["g1"] })).toBe(false);
    expect(admiteOrigen({ cuentaId: "otra", grupos: ["g2"] }, { cuentaId: "mía", gruposPrestados: ["g1"] })).toBe(false);
    expect(admiteOrigen({}, { cuentaId: "mía" })).toBe(false);
  });

  it("guard del cuerpo: composición con html, formato admitido y recursos con url", () => {
    expect(esCuerpoVideoRender({ composicion: { html: "<div></div>" } })).toBe(true);
    expect(esCuerpoVideoRender({ composicion: { html: "x" }, formato: "webm" })).toBe(true);
    expect(esCuerpoVideoRender({ composicion: { html: "x" }, formato: "avi" })).toBe(false);
    expect(esCuerpoVideoRender({ composicion: {} })).toBe(false);
    expect(esCuerpoVideoRender({ composicion: { html: "x", recursos: [{}] } })).toBe(false);
    expect(esCuerpoVideoRender(null)).toBe(false);
  });

  it("recursos privados ajenos: los propios y públicos pasan", () => {
    expect(recursosPrivadosAjenos([{ url: "a", privado: true, cuentaId: "mía" }], "mía")).toEqual([]);
    expect(recursosPrivadosAjenos([{ url: "a", privado: true, cuentaId: "otra" }], "mía")).toHaveLength(1);
    expect(recursosPrivadosAjenos([{ url: "a", privado: true }], "mía")).toHaveLength(1);
    expect(recursosPrivadosAjenos([{ url: "a", privado: true }])).toHaveLength(1);
    expect(recursosPrivadosAjenos([{ url: "a" }], "mía")).toEqual([]);
  });

  it("encola un render válido: aceptado con trabajoId y formato por defecto", async () => {
    const c = ctx();
    const r = await manejarPeticionVideoMalla(pedir({ composicion: { html: HTML } }), { cuentaId: "mía" }, c);
    expect(r).toEqual({ aceptado: true, trabajoId: "t1" });
    expect(c.encolar).toHaveBeenCalledWith({ peticionId: "p1", composicion: { html: HTML }, formato: FORMATO_VIDEO_DEFECTO });
  });

  it("rechaza tipo ajeno, cuerpo roto, origen ajeno y formato raro, sin encolar", async () => {
    const c = ctx();
    const casos: [MsgPedir, { cuentaId: string }][] = [
      [pedir({}, "voz"), { cuentaId: "mía" }],
      [pedir({}), { cuentaId: "mía" }],
      [pedir({ composicion: { html: "x" } }), { cuentaId: "otra" }],
      [pedir({ composicion: { html: "x" }, formato: "avi" }), { cuentaId: "mía" }],
    ];
    for (const [msg, origen] of casos) {
      const r = await manejarPeticionVideoMalla(msg as MsgPedir, origen, c);
      expect(r.aceptado).toBe(false);
      expect((r as { motivo: string }).motivo.length).toBeGreaterThan(0);
    }
    expect(c.encolar).not.toHaveBeenCalled();
  });

  it("GSAP solo bloquea la edición del OS; renderizar una composición ajena con GSAP se admite", async () => {
    const editarRechazado = await manejarPeticionVideoMalla(
      pedir({ composicion: { html: CON_GSAP }, editarVisualmente: true }),
      { cuentaId: "mía" },
      ctx(),
    );
    expect(editarRechazado.aceptado).toBe(false);
    expect((editarRechazado as { motivo: string }).motivo).toContain("GSAP");

    const renderAceptado = await manejarPeticionVideoMalla(
      pedir({ composicion: { html: CON_GSAP } }),
      { cuentaId: "mía" },
      ctx(),
    );
    expect(renderAceptado).toEqual({ aceptado: true, trabajoId: "t1" });
  });

  it("recursos privados ajenos en el cuerpo ⇒ rechazo legible; los propios pasan", async () => {
    const ajeno = await manejarPeticionVideoMalla(
      pedir({ composicion: { html: HTML, recursos: [{ url: "a", privado: true, cuentaId: "otra" }] } }),
      { cuentaId: "mía" },
      ctx(),
    );
    expect(ajeno.aceptado).toBe(false);
    expect((ajeno as { motivo: string }).motivo).toContain("privado");

    const propio = await manejarPeticionVideoMalla(
      pedir({ composicion: { html: HTML, recursos: [{ url: "a", privado: true, cuentaId: "mía" }] } }),
      { cuentaId: "mía" },
      ctx(),
    );
    expect(propio.aceptado).toBe(true);
  });

  it("cola rota o sin identificador ⇒ rechazo legible y sin lanzar", async () => {
    const rota = ctx(async () => { throw new Error("cola llena"); });
    const r1 = await manejarPeticionVideoMalla(pedir({ composicion: { html: HTML } }), { cuentaId: "mía" }, rota);
    expect(r1.aceptado).toBe(false);
    expect((r1 as { motivo: string }).motivo).toContain("cola llena");

    const sinId = ctx(async () => "");
    const r2 = await manejarPeticionVideoMalla(pedir({ composicion: { html: HTML } }), { cuentaId: "mía" }, sinId);
    expect(r2.aceptado).toBe(false);
    expect((r2 as { motivo: string }).motivo).toContain("identificador");
  });
});
