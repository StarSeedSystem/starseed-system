// Rescate de la rama nube/40126871156 (tarea RLB1020N) · casos adaptados a la API de hoy.
// La rama probaba un relé de vídeo por la malla que main NO adoptó: el vídeo vive en el
// servicio hyperframes de la neurona (servicios/hyperframes/src/rutas.mjs, HFR1018Fb). Se
// descartan allí la admisión por grupos, la validación de cuenta/origen/formato/duración y
// el bloqueo de GSAP al editar (ya cubierto por detectarAdaptadores en
// src/lib/video-html/__tests__/adaptadores.test.ts y por validarOrdenes en
// src/lib/__tests__/hyperframes-rutas.test.ts). HFR1018I añade aquí el manejador PURO de
// `capacidad.video.render`: admite cuenta propia o grupo con permiso, prohíbe recursos
// remotos o rutas ajenas fuera del proyecto y la EDICIÓN por el OS de composiciones con
// GSAP (§2 del contrato); la elección de la neurona la hace la bolsa de recursos y aquí
// solo se valida y se encola. Sin red, sin disco, sin procesos.

import { describe, it, expect, vi } from "vitest";
import { manejar } from "../../../../servicios/hyperframes/src/rutas.mjs";
import {
  FORMATOS_VIDEO, manejarRenderVideo, parsearRenderVideo, primerRecursoProhibido,
  type ContextoRenderVideo, type PeticionEnCola,
} from "../video-por-malla";

const HTML = "<div data-composition-id=\"a\"></div>";
const CON_GSAP = "<div><script>import { gsap } from 'gsap'; gsap.to('.a', { x: 1 });</script></div>";

/** Neurona que sirve: cuenta propia fija, cola falsa observable, sin red ni disco. */
const ctx = (cuentaLocal = "c-propia"): ContextoRenderVideo & { encoladas: PeticionEnCola[] } => {
  const encoladas: PeticionEnCola[] = [];
  return {
    cuentaLocal,
    encolar: (p) => { encoladas.push(p); return p.trabajoId; },
    encoladas,
  };
};

describe("capacidad.video.render · manejador puro", () => {
  it("la misma cuenta se acepta y se encola con su trabajoId (referencia, no copia)", () => {
    const c = ctx();
    const r = manejarRenderVideo({ cuenta: "c-propia", composicion: HTML }, c);
    expect(r).toMatchObject({ aceptado: true, motivo: expect.stringContaining("misma cuenta") });
    expect((r as { trabajoId: string }).trabajoId).toMatch(/^vr-/);
    expect(c.encoladas).toHaveLength(1);
    expect(c.encoladas[0]).toMatchObject({ cuenta: "c-propia", composicion: HTML, formato: "mp4" });
  });

  it("cuenta ajena sin grupo con permiso se rechaza y no se encola", () => {
    const c = ctx();
    expect(manejarRenderVideo({ cuenta: "otra", composicion: HTML }, c).motivo)
      .toContain("misma cuenta o de un grupo con permiso");
    expect(c.encoladas).toHaveLength(0);
  });

  it("un grupo con permiso en esta neurona entra; un grupo ajeno no", () => {
    expect(manejarRenderVideo({ cuenta: "otra", grupo: "g1", composicion: HTML }, { ...ctx(), sesionGrupo: "g1" }).aceptado).toBe(true);
    expect(manejarRenderVideo({ cuenta: "otra", grupo: "g1", composicion: HTML }, ctx()).aceptado).toBe(false);
  });

  it("petición mal formada: sin cuenta, sin composición, formato raro o variables raras", () => {
    expect(parsearRenderVideo({})).toBeNull();
    expect(parsearRenderVideo({ cuenta: "c", composicion: "  " })).toBeNull();
    expect(parsearRenderVideo({ cuenta: "c", composicion: HTML, formato: "avi" })).toBeNull();
    expect(parsearRenderVideo({ cuenta: "c", composicion: HTML, variables: { a: {} } })).toBeNull();
    expect(manejarRenderVideo(null, ctx()).motivo).toContain("mal formada");
  });

  it("composición demasiado grande para el mensaje: rechazo legible sin encolar", () => {
    const c = { ...ctx(), topeComposicionBytes: 10 };
    expect(manejarRenderVideo({ cuenta: "c-propia", composicion: HTML }, c).motivo)
      .toContain("demasiado grande");
    expect(c.encoladas).toHaveLength(0);
  });

  it("ningún recurso remoto ajeno sale a buscar al renderizar y ninguna ruta sale del proyecto", () => {
    expect(primerRecursoProhibido("<img src=\"https://x.org/a.png\">")).toContain("recurso remoto");
    expect(primerRecursoProhibido("<div style=\"background:url(https://x.org/a.png)\">")).toContain("recurso remoto");
    for (const mal of ["<img src=\"/etc/passwd\">", "<img src=\"../secreto.png\">", "<img src=\"~/x.png\">", "<img src=\"C:\\x.png\">"]) {
      expect(primerRecursoProhibido(mal)).toContain("fuera del proyecto");
    }
    expect(primerRecursoProhibido("<img src=\"recursos/a.png\">")).toBeNull();
    const c = ctx();
    const r = manejarRenderVideo({ cuenta: "c-propia", composicion: "<img src=\"https://x.org/a.png\">" }, c);
    expect(r.aceptado).toBe(false);
    expect(c.encoladas).toHaveLength(0);
  });

  it("composición ajena con GSAP se renderiza pero nunca se edita por el OS (§2)", () => {
    expect(manejarRenderVideo({ cuenta: "c-propia", composicion: CON_GSAP }, ctx()).aceptado).toBe(true);
    const c = ctx();
    const r = manejarRenderVideo({ cuenta: "c-propia", composicion: CON_GSAP, ordenes: [{ type: "setText", target: "#t", value: "Hola" }] }, c);
    expect(r.aceptado).toBe(false);
    expect(r.motivo).toContain("GSAP");
    expect(c.encoladas).toHaveLength(0);
  });

  it("cola llena ⇒ rechazo legible y sin construir el trabajo", () => {
    const c: ContextoRenderVideo = { cuentaLocal: "c-propia", encolar: () => null };
    expect(manejarRenderVideo({ cuenta: "c-propia", composicion: HTML }, c).motivo)
      .toContain("cola de render está llena");
  });

  it("formato elegido viaja a la cola y el catálogo trae los seis formatos", () => {
    const c = ctx();
    manejarRenderVideo({ cuenta: "c-propia", composicion: HTML, formato: "webm" }, c);
    expect(c.encoladas[0]?.formato).toBe("webm");
    expect(FORMATOS_VIDEO).toContain("hls");
    expect(FORMATOS_VIDEO).toHaveLength(6);
  });
});

// ── Casos rescatados de la rama de la nube (servicio hyperframes de la neurona) ──

describe("servicio hyperframes · peticiones de vídeo (ramas de la nube)", () => {
  const servicioDeps = () => ({
    version: "0.8.172",
    navegador: true,
    ffmpeg: false,
    lint: vi.fn(async () => ({ errores: [], avisos: [] })),
    editar: vi.fn(async (comp: string) => comp),
    cola: { encolar: vi.fn(async () => "t1"), estado: vi.fn() },
  });

  it("rechaza basura: sin composición en /lint, /editar y /render, sin encolar", async () => {
    const d = servicioDeps();
    const sinCuerpo = { composicion: null };
    for (const ruta of ["/lint", "/editar", "/render"]) {
      const r = await manejar({ metodo: "POST", ruta, cuerpo: sinCuerpo }, d);
      expect(r.estado).toBe(400);
      expect((r.cuerpo as { error: string }).error).toContain("composición");
    }
    expect(d.cola.encolar).not.toHaveBeenCalled();
  });

  it("una composición ajena con GSAP se puede renderizar (solo no se edita)", async () => {
    const d = servicioDeps();
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: CON_GSAP } }, d);
    expect(r.estado).toBe(202);
    expect((r.cuerpo as { id: string }).id).toBe("t1");
    expect(d.cola.encolar).toHaveBeenCalledWith({ composicion: CON_GSAP, formato: "mp4" });
  });

  it("cola llena ⇒ rechazo legible y sin lanzar", async () => {
    const d = servicioDeps();
    d.cola.encolar = vi.fn(async () => { throw new Error("cola llena"); });
    const r = await manejar({ metodo: "POST", ruta: "/render", cuerpo: { composicion: HTML } }, d);
    expect(r.estado).toBe(500);
    expect((r.cuerpo as { error: string }).error).toContain("cola llena");
  });
});
