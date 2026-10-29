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

/* ── HFR1018I · manejador PURO de `capacidad.video.render` (video-por-malla.ts) ── */

import {
  esRecursoPrivado,
  extraerUrls,
  videoRenderPorMalla,
  type ContextoNeuronaVideo,
} from "@/lib/network/video-por-malla";

const SIN_GSAP = '<div><style>@keyframes a{0%{opacity:0}}</style><img src="https://cdn.example.org/f.png"></img></div>';
const CON_GSAP_EDITABLE = "<div><script>import { gsap } from 'gsap'; gsap.to('.a', { x: 1 });</script></div>";

const ctx = (sobre: Partial<ContextoNeuronaVideo> = {}): ContextoNeuronaVideo => ({
  cuentaLocal: "cuenta-local",
  grupoCompartido: "sala-7",
  encolar: () => "t-1",
  ...sobre,
});
const pide = (sobre: Partial<Parameters<typeof videoRenderPorMalla>[0]> = {}) =>
  ({ cuenta: "cuenta-local", composicion: SIN_GSAP, ...sobre });

describe("manejador capacidad.video.render (HFR1018I)", () => {
  it("misma cuenta: se valida y se encola con id de trabajo", () => {
    const encolados: unknown[] = [];
    const r = videoRenderPorMalla(pide({ formato: "webm" }), ctx({ encolar: (t) => (encolados.push(t), "htr-9") }));
    expect(r).toMatchObject({ aceptado: true, trabajoId: "htr-9" });
    expect(encolados[0]).toMatchObject({ formato: "webm", editar: false });
  });

  it("cuenta ajena sin grupo ⇒ rechazo legible; grupo compartido ⇒ admitida", () => {
    const fuera = videoRenderPorMalla(pide({ cuenta: "otra" }), ctx());
    expect(fuera).toMatchObject({ aceptado: false });
    expect(fuera.motivo).toContain("grupo con permiso");
    const conGrupo = videoRenderPorMalla(pide({ cuenta: "otra", grupo: "sala-7" }), ctx());
    expect(conGrupo.aceptado).toBe(true);
    const grupoAjeno = videoRenderPorMalla(pide({ cuenta: "otra", grupo: "sala-99" }), ctx());
    expect(grupoAjeno).toMatchObject({ aceptado: false, motivo: expect.stringContaining("grupo con permiso") });
  });

  it("sin composición ⇒ rechazo legible sin encolar", () => {
    const encolar = vi.fn(() => "t");
    const r = videoRenderPorMalla(pide({ composicion: "" }), ctx({ encolar }));
    expect(r).toMatchObject({ aceptado: false, motivo: expect.stringContaining("composición") });
    expect(encolar).not.toHaveBeenCalled();
  });

  it("GSAP: render (sin editar) pasa; editar por el OS se rechaza por licencia", () => {
    const sinEditar = videoRenderPorMalla(pide({ composicion: CON_GSAP_EDITABLE }), ctx());
    expect(sinEditar).toMatchObject({ aceptado: true, trabajoId: "t-1" });
    const r = videoRenderPorMalla(pide({ composicion: CON_GSAP_EDITABLE, editar: true }), ctx());
    expect(r).toMatchObject({ aceptado: false });
    expect(r.motivo).toContain("GSAP");
  });

  it("recurso remoto privado ajeno ⇒ rechazo y sin su valor en el mensaje; el propio pasa", () => {
    expect(esRecursoPrivado("http://localhost:4490/x")).toBe(true);
    expect(esRecursoPrivado("http://10.0.0.3/v.png")).toBe(true);
    expect(esRecursoPrivado("https://cdn.example.org/f.png")).toBe(false);
    expect(extraerUrls(SIN_GSAP)).toEqual(["https://cdn.example.org/f.png"]);
    const ajeno = videoRenderPorMalla(
      pide({ composicion: '<img src="http://192.168.1.7:4490/toma.mp4">' }), ctx());
    expect(ajeno).toMatchObject({ aceptado: false });
    expect(ajeno.motivo).not.toContain("192.168");
    const propio = videoRenderPorMalla(
      pide({ composicion: '<img src="http://10.0.0.2:4490/v.mp4">' }),
      ctx({ recursosPrivadosPropios: ["10.0.0.2"] }),
    );
    expect(propio).toMatchObject({ aceptado: true, trabajoId: "t-1" });
  });

  it("formato desconocido ⇒ «mp4»; cola que falla ⇒ rechazo legible sin lanzar", () => {
    const r = videoRenderPorMalla(pide({ formato: "avi" }), ctx());
    expect(r.aceptado).toBe(true);
    const fallo = videoRenderPorMalla(pide(), ctx({ encolar: () => { throw new Error("cola llena"); } }));
    expect(fallo).toMatchObject({ aceptado: false });
    expect((fallo as { aceptado: false; motivo: string }).motivo).toContain("cola llena");
  });
});
