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
  admiteVideoMalla, esRecursoPrivado, validarPeticionVideoMalla, videoRenderPorMalla,
} from "../video-por-malla";

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

/* ── HFR1018I · manejador PURO de `capacidad.video.render` del relé `capacidad.*` ──
 * Admite solo la misma cuenta o la sesión de grupo compartida; GSAP: una composición
 * ajena se renderiza, pero el OS no la edita (adaptadores.ts, licencia §2); lo
 * privado no sale de las neuronas de su dueño. Todo inyectado, sin red ni procesos. */
describe("capacidad.video.render por la malla (HFR1018I)", () => {
  const CON_GSAP_OS = '<div><script>import { gsap } from "gsap"; gsap.to(".a", { x: 1 });</script></div>';
  const BASE = { cuenta: "alex", composicion: HTML };
  const ctx = { cuentaLocal: "alex", sesionGrupo: "sala-1" };
  const encolar = vi.fn(async () => "t1");
  const depsCtx = (extra: Record<string, unknown> = {}) => ({
    encolar,
    peticion: { ...BASE, ...extra },
  });

  it("validación: sin cuenta, sin composición o con formato raro se rechaza legible", () => {
    expect(validarPeticionVideoMalla({ composicion: HTML }).ok).toBe(false);
    expect(validarPeticionVideoMalla({ cuenta: "alex", composicion: "  " }).ok).toBe(false);
    const malFormato = validarPeticionVideoMalla({ cuenta: "alex", composicion: HTML, formato: "avi" });
    expect(malFormato.ok).toBe(false); expect((malFormato as { motivo: string }).motivo).toContain("formato");
    const bien = validarPeticionVideoMalla({ cuenta: "alex", composicion: HTML, formato: "webm" });
    expect(bien.ok).toBe(true);
  });

  it("misma cuenta pasa; la de otra cuenta sin grupo se rechaza, con el grupo se admite", async () => {
    const { peticion } = depsCtx();
    const r = await videoRenderPorMalla(peticion, ctx, { encolar });
    expect(r.ok).toBe(true); expect((r as { trabajoId: string }).trabajoId).toBe("t1");
    expect(encolar).toHaveBeenCalledWith({ composicion: HTML, formato: "mp4" });

    const ajena = { cuentaLocal: "otra", sesionGrupo: null };
    const rechazada = await videoRenderPorMalla(peticion, ajena, { encolar });
    expect(rechazada.ok).toBe(false); expect((rechazada as { motivo: string }).motivo).toContain("grupo");
    expect(admiteVideoMalla({ cuenta: "vecino", grupo: "sala-1" }, ctx).ok).toBe(true);
    expect(admiteVideoMalla({ cuenta: "vecino", grupo: "otra-sala" }, ctx).ok).toBe(false);
  });

  it("el OS no edita una composición con GSAP (licencia §2), pero sí la renderiza sin órdenes", async () => {
    const conOrdenes = await videoRenderPorMalla(depsCtx({ composicion: CON_GSAP_OS, ordenes: [{ type: "setText", target: ".t" }] }).peticion, ctx, { encolar });
    expect(conOrdenes.ok).toBe(false); expect((conOrdenes as { motivo: string }).motivo).toContain("licencia");
    expect(encolar).toHaveBeenCalledTimes(1);
    const sinOrdenes = await videoRenderPorMalla(depsCtx({ composicion: CON_GSAP_OS }).peticion, ctx, { encolar });
    expect(sinOrdenes.ok).toBe(true);
    const ordenesGsap = validarPeticionVideoMalla({ cuenta: "alex", composicion: HTML, ordenes: [{ type: "setAttribute", target: ".x", estilo: "gsap" }] });
    expect(ordenesGsap.ok).toBe(false);
  });

  it("recursos privados: la propia cuenta puede traerlos; en prestado a otro, no salen", async () => {
    expect(esRecursoPrivado("/api/recursos/foto.png")).toBe(true);
    expect(esRecursoPrivado("http://127.0.0.1:4490/media/clip.mp4")).toBe(true);
    expect(esRecursoPrivado("https://cdn.ejemplo.org/v.mp4")).toBe(false);
    expect(esRecursoPrivado("data:image/png;base64,AAAA")).toBe(false);
    const privadoHTML = '<video src="/api/recursos/clip"></video>';
    const propia = await videoRenderPorMalla(depsCtx({ composicion: privadoHTML }).peticion, ctx, { encolar });
    expect(propia.ok).toBe(true);
    const enPrestamo = ctx.sesionGrupo ? await videoRenderPorMalla({ cuenta: "vecino", grupo: "sala-1", composicion: privadoHTML }, ctx, { encolar }) : null;
    expect(enPrestamo?.ok).toBe(false);
    expect((enPrestamo as { motivo: string }).motivo).toContain("privados");
  });

  it("sin cola en la neurona o cola llena: rechazo legible, nunca pánico", async () => {
    const r = await videoRenderPorMalla({ ...BASE }, ctx, {});
    expect(r.ok).toBe(false); expect((r as { motivo: string }).motivo).toContain("sin cola de render");
    const llena = await videoRenderPorMalla({ ...BASE }, ctx, { encolar: vi.fn(async () => { throw new Error("/tmp/x/fallo"); }) });
    expect(llena.ok).toBe(false); expect((llena as { motivo: string }).motivo).toContain("no se encoló");
    expect((llena as { motivo: string }).motivo).not.toContain("/tmp/x");
  });
});
