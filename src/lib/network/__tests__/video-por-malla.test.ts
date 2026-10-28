// Casos rescatados de la rama nube/40126871156 (tarea RLB1020N) sobre el servicio hyperframes
// (servicios/hyperframes/src/rutas.mjs, HFR1018Fb) y, desde HFR1018I, casos del relé
// `capacidad.video.render` (src/lib/network/video-por-malla.ts): admisión por cuenta o grupo
// con permiso, bloqueo de GSAP del OS (detectarAdaptadores) y de recursos remotos privados
// ajenos, y cola inyectada. Todo puro: sin red, sin navegador real y sin procesos.

import { describe, it, expect, vi } from "vitest";
import { manejar } from "../../../../servicios/hyperframes/src/rutas.mjs";
import {
  renderVideoPorMalla, admiteVideoMalla, anfitrionesPrivadosAjenos, esAnfitrionPrivado,
  type ContextoServidaVideo,
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

  it("cola llena ⇒ rechazo legible y sin lanzar", async () => {
    const d = deps();
    d.cola.encolar = vi.fn(async () => { throw new Error("cola llena"); });
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: HTML } }, d);
    expect(r.estado).toBe(500);
    expect((r.cuerpo as { error: string }).error).toContain("cola llena");
  });
});

/* ══════════════════════ HFR1018I · relé `capacidad.video.render` (puro) ══════════════════════ */

const ctx = (extra: Partial<ContextoServidaVideo> = {}): ContextoServidaVideo => ({
  cuentaLocal: "ana", gruposPermitidos: ["g1"], origenesPropios: ["192.168.1.10"],
  encolar: () => "job-1", ...extra,
});

describe("renderVideoPorMalla", () => {
  it("misma cuenta: encola con formato por defecto y devuelve el id", () => {
    const encolar = vi.fn(() => "job-1");
    const r = renderVideoPorMalla({ cuenta: "ana", composicion: HTML }, ctx({ encolar }));
    expect(r).toMatchObject({ aceptado: true, trabajoId: "job-1", motivo: "Encolado para render." });
    expect(encolar).toHaveBeenCalledWith(expect.objectContaining({ cuenta: "ana", formato: "mp4", origen: "os" }));
  });

  it("admite la misma cuenta o un grupo con permiso; el resto se rechaza", () => {
    expect(admiteVideoMalla({ cuenta: "ana" }, ctx()).ok).toBe(true);
    expect(renderVideoPorMalla({ cuenta: "bea", grupo: "g1", composicion: HTML }, ctx()).aceptado).toBe(true);
    for (const p of [{ cuenta: "bea", grupo: "g2" }, { cuenta: "bea" }, {}]) {
      const r = renderVideoPorMalla({ composicion: HTML, ...p }, ctx());
      expect(r).toMatchObject({ aceptado: false });
      if (!r.aceptado) expect(r.motivo).toContain("Rechazo");
    }
  });

  it("GSAP: el editor del OS lo rechaza; una composición ajena se renderiza sin editarse", () => {
    expect(renderVideoPorMalla({ cuenta: "ana", composicion: CON_GSAP }, ctx())).toMatchObject({ aceptado: false });
    const r = renderVideoPorMalla({ cuenta: "ana", composicion: CON_GSAP, origen: "ajena" }, ctx());
    expect(r).toMatchObject({ aceptado: true, motivo: expect.stringContaining("no se edita") });
  });

  it("recursos remotos privados: los propios y los públicos pasan; los ajenos no", () => {
    const publico = '<img src="https://cdn.example.org/a.png">';
    const propio = '<img src="http://192.168.1.10/a.png">';
    const ajeno = '<img src="http://192.168.1.50/b.png">';
    expect(renderVideoPorMalla({ cuenta: "ana", composicion: publico + propio }, ctx()).aceptado).toBe(true);
    const r = renderVideoPorMalla({ cuenta: "ana", composicion: ajeno }, ctx());
    expect(r).toMatchObject({ aceptado: false });
    if (!r.aceptado) expect(r.motivo).not.toContain("192.168");
    expect(anfitrionesPrivadosAjenos(ajeno, [], ["192.168.1.10"])).toEqual(["192.168.1.50"]);
    expect(esAnfitrionPrivado("localhost")).toBe(true);
    expect(esAnfitrionPrivado("cdn.example.org")).toBe(false);
  });

  it("privado solo en neuronas propias; cola sin sitio o rota ⇒ rechazo legible sin rutas", () => {
    expect(renderVideoPorMalla({ cuenta: "bea", grupo: "g1", composicion: HTML, privado: true }, ctx()).aceptado).toBe(false);
    expect(renderVideoPorMalla({ cuenta: "ana", composicion: HTML, formato: "avi" }, ctx()).aceptado).toBe(false);
    expect(renderVideoPorMalla({ cuenta: "ana" }, ctx()).aceptado).toBe(false);
    expect(renderVideoPorMalla({ cuenta: "ana", composicion: HTML }, ctx({ encolar: () => null })).aceptado).toBe(false);
    const roto = renderVideoPorMalla({ cuenta: "ana", composicion: HTML }, ctx({ encolar: () => { throw new Error("/home/ana/cola"); } }));
    expect(roto).toMatchObject({ aceptado: false });
    if (!roto.aceptado) expect(roto.motivo).not.toContain("/home/");
  });
});
