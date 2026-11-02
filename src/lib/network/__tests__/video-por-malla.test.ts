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

  it("sin cola de render en esta neurona: rechazo honesto 503, nunca pánico", async () => {
    const sinCola = { version: "0.8.172" };
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: HTML } }, sinCola);
    expect(r.estado).toBe(503);
    expect((r.cuerpo as { error: string }).error).toContain("sin cola de render");
    const trabajo = await manejar({ metodo: "GET", ruta: "/trabajos/t1" }, sinCola);
    expect(trabajo.estado).toBe(503);
    expect((trabajo.cuerpo as { error: string }).error).toContain("sin cola de render");
  });

  it("cola llena ⇒ rechazo legible y sin lanzar", async () => {
    const d = deps();
    d.cola.encolar = vi.fn(async () => { throw new Error("cola llena"); });
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: HTML } }, d);
    expect(r.estado).toBe(500);
    expect((r.cuerpo as { error: string }).error).toContain("cola llena");
  });
});

/* ════════════════ VST1018I · capacidad.video.render por la malla ════════════════
 * La capa de malla rescata aquí los casos que el servicio local no juzga: admisión
 * por cuenta/grupo con permiso y bloqueo de recursos privados ajenos: lo que el
 * servicio local no juzga (contrato: architecture/video-hyperframes.md §4 y
 * apps-en-la-malla.md §6). */

import {
  extraerReferenciasRecursos,
  esReferenciaAdmitida,
} from "@/lib/network/video-por-malla";

describe("recursos de la composición por la malla", () => {
  it("extrae src/href y url() y admite lo embebido, relativo, Biblioteca o por archivos-malla", () => {
    const html = '<img src="data:image/png;base64,AAAA"><video src="clip.mp4"></video>'
      + '<div style="background:url(starseed://library/fondo.webp)">'
      + '<a href="local-archivos-malla://t1"></a></div>';
    const refs = extraerReferenciasRecursos(html);
    expect(refs.some((r) => r === "data:image/png;base64,AAAA")).toBe(true);
    expect(refs.some((r) => r === "clip.mp4")).toBe(true);
    expect(refs.some((r) => r === "starseed://library/fondo.webp")).toBe(true);
    expect(refs.every((r) => esReferenciaAdmitida(r))).toBe(true);
  });

  it("rechaza recursos privados ajenos: entidades del OS fuera de la Biblioteca y esquemas locales", () => {
    expect(esReferenciaAdmitida("starseed://store/obra-1")).toBe(false);
    expect(esReferenciaAdmitida("starseed://cuenta-ajena/privado/medio")).toBe(false);
    expect(esReferenciaAdmitida("file:///etc/passwd")).toBe(false);
    expect(esReferenciaAdmitida("blob:https://otro/abc")).toBe(false);
    expect(esReferenciaAdmitida("http://127.0.0.1:4490/media/privado")).toBe(false);
    expect(esReferenciaAdmitida("https://servidor-publico.org/media.mp4")).toBe(true);
  });
});

import {
  videoRenderPorMalla,
  type ContextoServidaVideo,
  type PeticionVideoMalla,
} from "@/lib/network/video-por-malla";

const ctx = (): ContextoServidaVideo => ({ cuentaLocal: "cuenta-propia", gruposPermitidos: ["grupo-ok"], sirveRender: true });
const pet = (sobre: Partial<PeticionVideoMalla> = {}): PeticionVideoMalla => ({
  cuenta: "cuenta-propia", composicion: HTML, formato: "mp4", duracionSeg: 3, ...sobre,
});

describe("videoRenderPorMalla · capacidad.video.render (manejador puro del relé)", () => {
  it("misma cuenta: valida y encola; devuelve trabajoId y el trabajo", async () => {
    const encolados: unknown[] = [];
    const r = await videoRenderPorMalla(pet(), ctx(), { encolar: async (t) => { encolados.push(t); return "t-vídeo"; } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.trabajoId).toBe("t-vídeo");
      expect(r.trabajo).toMatchObject({ formato: "mp4", duracionSeg: 3, cuenta: "cuenta-propia", editable: true });
    }
    expect(encolados).toHaveLength(1);
  });

  it("cuenta ajena sin grupo: rechazo legible y no encola", async () => {
    const encolar = vi.fn(async () => "nada");
    const r = await videoRenderPorMalla(pet({ cuenta: "otra" }), ctx(), { encolar });
    expect(r.ok).toBe(false);
    expect((r as { motivo: string }).motivo).toContain("misma cuenta o de un grupo");
    expect(encolar).not.toHaveBeenCalled();
  });

  it("grupo con permiso entra; grupo sin permiso no", async () => {
    const encolar = async () => "t2";
    const dentro = await videoRenderPorMalla(pet({ cuenta: "otra", grupo: "grupo-ok" }), ctx(), { encolar });
    expect(dentro.ok).toBe(true);
    const fuera = await videoRenderPorMalla(pet({ cuenta: "otra", grupo: "otro-grupo" }), ctx(), { encolar });
    expect(fuera.ok).toBe(false);
  });

  it("sin cola de render en esta neurona: rechazo honesto", async () => {
    const r = await videoRenderPorMalla(pet(), { ...ctx(), sirveRender: false }, { encolar: async () => "x" });
    expect(r.ok).toBe(false);
    expect((r as { motivo: string }).motivo).toContain("cola de render");
  });

  it("el OS no edita una composición con GSAP; en solo render se renderiza sin marcarla editable", async () => {
    const gR = await videoRenderPorMalla(pet({ composicion: CON_GSAP, editar: true }), ctx(), { encolar: async () => "x" });
    expect(gR.ok).toBe(false);
    expect((gR as { motivo: string }).motivo).toContain("GSAP");
    const encolados: unknown[] = [];
    const sR = await videoRenderPorMalla(pet({ cuenta: "cuenta-ajena", grupo: "grupo-ok", composicion: CON_GSAP }),
      ctx(), { encolar: async (t) => { encolados.push(t); return "t3"; } });
    expect(sR.ok).toBe(true);
    if (sR.ok) expect(sR.trabajo.editable).toBe(false);
  });

  it("formato y duración fuera de lo admitido: rechazo legible y sin encolar", async () => {
    const encolar = vi.fn(async () => "nada");
    for (const sobre of [{ formato: "avi" }, { duracionSeg: 0 }, { duracionSeg: Number.NaN }]) {
      const r = await videoRenderPorMalla(pet(sobre), ctx(), { encolar });
      expect(r.ok).toBe(false);
      expect((r as { motivo: string }).motivo.length).toBeGreaterThan(10);
    }
    expect(encolar).not.toHaveBeenCalled();
  });

  it("recurso remoto privado ajeno: rechazo y sin encolar", async () => {
    const r = await videoRenderPorMalla(
      pet({ composicion: '<img src="starseed://cuenta-ajena/privado/medio">' }),
      ctx(), { encolar: async () => "x" },
    );
    expect(r.ok).toBe(false);
    expect((r as { motivo: string }).motivo).toContain("privado");
  });

  it("si la cola lanza o la composición no llega, rechazo legible y nunca se lanza", async () => {
    const llena = await videoRenderPorMalla(pet(), ctx(), { encolar: async () => { throw new Error("cola llena"); } });
    expect(llena.ok).toBe(false);
    expect((llena as { motivo: string }).motivo).toContain("cola llena");
    const vacia = await videoRenderPorMalla(pet({ composicion: "" }), ctx(), { encolar: async () => "x" });
    expect(vacia.ok).toBe(false);
    expect((vacia as { motivo: string }).motivo).toContain("composición");
  });
});
