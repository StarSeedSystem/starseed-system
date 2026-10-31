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
import { manejarRenderVideoMalla, adjuntarServidorRenderMalla, VIDEO_RENDER_TIPO, type DepsVideoMalla, type MeshServidorRender, type ResolucionVideoMalla } from "@/lib/network/video-por-malla";
import { esMensajeCapacidadMalla, CAPACIDAD_MALLA_MAX_BYTES, bytesUtf8 } from "@/lib/network/capacidad-por-malla";

/** Narra el rechazo legible: {estado, motivo} de una resolución (0/«» si se aceptó). */
function rech(r: ResolucionVideoMalla): { estado: number; motivo: string } {
  return r.aceptado ? { estado: 0, motivo: "" } : { estado: r.estado, motivo: r.motivo };
}

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

/* ══════════════ HFR1018I · relé capacidad.video.render (video-por-malla.ts) ══════════════ */

const HTML_LIMPIO = HTML;
const HTML_CON_GSAP = "<div><script>import { gsap } from 'gsap'; gsap.to('.a', { x: 1 });</script></div>";

function depDefault(): DepsVideoMalla & { encolar: ReturnType<typeof vi.fn> } {
  return {
    miCuentaId: "cuenta-a",
    esGrupoConPermiso: vi.fn(() => true),
    encolar: vi.fn(() => "tr-1"),
  };
}

describe("manejarRenderVideoMalla · capacidad.video.render", () => {
  it("PETICIÓN de la misma cuenta, inline y sin formato: aceptado, mp4 por defecto", () => {
    const d = depDefault();
    const r = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicion: HTML_LIMPIO }, d);
    expect(r).toEqual({ aceptado: true, trabajoId: "tr-1" });
    expect(d.encolar).toHaveBeenCalledWith(expect.objectContaining({ formato: "mp4", composicion: HTML_LIMPIO }));
  });

  it("cuenta ajena sin grupo y sin cuenta/grupo: rechazos legibles de origen", () => {
    const d = depDefault();
    const ajena = manejarRenderVideoMalla({ cuentaId: "otra", composicion: HTML_LIMPIO }, d);
    expect(ajena).toMatchObject({ aceptado: false, estado: 403 });
    const anónima = manejarRenderVideoMalla({ composicion: HTML_LIMPIO }, d);
    expect(rech(anónima).motivo).toContain("de esta cuenta o de un grupo");
    expect(d.encolar).not.toHaveBeenCalled();
  });

  it("grupo CON permiso acepta (aunque la cuenta sea otra); grupo SIN permiso, no", () => {
    const d = depDefault();
    const ok = manejarRenderVideoMalla({ cuentaId: "otra", grupoId: "g1", composicion: HTML_LIMPIO }, d);
    expect(ok).toEqual({ aceptado: true, trabajoId: "tr-1" });
    expect(d.esGrupoConPermiso).toHaveBeenCalledWith("g1", "otra");
    d.esGrupoConPermiso = vi.fn(() => false);
    const no = manejarRenderVideoMalla({ cuentaId: "otra", grupoId: "g1", composicion: HTML_LIMPIO }, d);
    expect(no).toMatchObject({ aceptado: false, estado: 403, motivo: expect.stringContaining("no tiene permiso") });
  });

  it("licencia §2: GSAP se renderiza tal cual, pero NO se edita con el OS", () => {
    const d = depDefault();
    const render = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicion: HTML_CON_GSAP }, d);
    expect(render.aceptado).toBe(true);
    const editar = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicion: HTML_CON_GSAP, edicion: true }, d);
    expect(editar).toMatchObject({ aceptado: false, estado: 403, motivo: expect.stringContaining("GSAP") });
    expect(d.encolar).toHaveBeenCalledTimes(1);
  });

  it("GSAP declarado en `adaptadores` (composición POR REFERENCIA) tampoco se edita", () => {
    const d = depDefault();
    const r = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "ent::video-1", edicion: true, adaptadores: ["gsap"] }, d);
    expect(r).toMatchObject({ aceptado: false, estado: 403 });
  });

  it("entidad única: se referencia con composicionRef; inline+ref o nada se rechazan", () => {
    const d = depDefault();
    expect(manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "ent::video-1" }, d)).toEqual({ aceptado: true, trabajoId: "tr-1" });
    expect(rech(manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicion: HTML_LIMPIO, composicionRef: "ent::v" }, d)).estado).toBe(400);
    expect(rech(manejarRenderVideoMalla({ cuentaId: "cuenta-a" }, d)).motivo).toContain("composicionRef");
  });

  it("recursos: privado ajeno y privado sin cuenta se rechazan; el propio y público pasan", () => {
    const d = depDefault();
    const propio = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "e", recursos: [{ url: "https://priv.x/a.mp4", privado: true, cuentaId: "cuenta-a" }] }, d);
    expect(propio.aceptado).toBe(true);
    const ajeno = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "e", recursos: [{ url: "https://priv.x/b", privado: true, cuentaId: "otra" }] }, d);
    expect(ajeno).toMatchObject({ aceptado: false, estado: 403, motivo: expect.stringContaining("privado") });
    const sinDueño = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "e", recursos: [{ url: "https://x", privado: true }] }, d);
    expect(rech(sinDueño).estado).toBe(403);
    const roto = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "e", recursos: [42] }, d);
    expect(rech(roto).estado).toBe(400);
  });

  it("formato no soportado se rechaza; mayúsculas se normalizan", () => {
    const d = depDefault();
    expect(rech(manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "e", formato: "avi" }, d)).motivo).toContain("avi");
    expect(manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "e", formato: "WEBM" }, d).aceptado).toBe(true);
  });

  it("una composición inline que no cabe (16 KiB) pide SEGUÍR por referencia", () => {
    const d = depDefault();
    const grande = "x".repeat(CAPACIDAD_MALLA_MAX_BYTES + 1);
    expect(bytesUtf8(grande)).toBeGreaterThan(CAPACIDAD_MALLA_MAX_BYTES);
    const r = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicion: grande }, d);
    expect(r).toMatchObject({ aceptado: false, estado: 413, motivo: expect.stringContaining("composicionRef") });
    expect(d.encolar).not.toHaveBeenCalled();
  });

  it("cola que lanza ⇒ rechazo legible (500), sin lanzar; cuerpo basura ⇒ 400", () => {
    const d = depDefault();
    d.encolar = vi.fn(() => { throw new Error("cola llena"); });
    const r = manejarRenderVideoMalla({ cuentaId: "cuenta-a", composicionRef: "e" }, d);
    expect(r).toMatchObject({ aceptado: false, estado: 500, motivo: expect.stringContaining("cola llena") });
    expect(rech(manejarRenderVideoMalla("basura", d)).estado).toBe(400);
  });

  it("el tipo de capacidad del relé es 'render' (cuerpo de capacidad.pedir)", () => {
    expect(VIDEO_RENDER_TIPO).toBe("render");
  });
});

/* ══════════════ HFR1018I · rol SERVIDOR: el relé atiende `capacidad.pedir` tipo `render` ══════════════ */

/** Mesh de mentira: captura lo que el servidor envía y deja entregar mensajes. */
const meshFalso = () => {
  let recibir: ((peerId: string, data: string) => void) | null = null;
  const enviados: unknown[] = [];
  const mesh: MeshServidorRender = {
    userId: "c-local",
    sendToPeer: (_id, data) => { enviados.push(JSON.parse(data)); return true; },
    onPeer: (ev) => { recibir = ev.onMessage ?? null; return () => { recibir = null; }; },
  };
  return { mesh, enviados, entregar: (x: unknown) => recibir?.("peer-1", JSON.stringify(x)) };
};
const pedirRender = (cuerpo: unknown) => ({ t: "capacidad.pedir", id: "p7", tipo: "render", cuerpo });

describe("adjuntarServidorRenderMalla · rol SERVIDOR del relé", () => {
  it("misma cuenta: encola vía el manejador puro y contesta la REFERENCIA por trabajoId", () => {
    const { mesh, enviados, entregar } = meshFalso();
    const encolar = vi.fn(() => "tr-1");
    adjuntarServidorRenderMalla(mesh, { encolar });
    entregar(pedirRender({ cuentaId: "c-local", composicionRef: "e" }));
    expect(encolar).toHaveBeenCalledWith(expect.objectContaining({ composicionRef: "e", formato: "mp4" }));
    expect(enviados).toHaveLength(1);
    expect(esMensajeCapacidadMalla(enviados[0])).toBe(true);
    expect(enviados[0]).toEqual({ t: "capacidad.fin", id: "p7", resultado: { trabajoId: "tr-1" } });
  });

  it("grupo compartido por esta neurona entra por el permiso de préstamo", () => {
    const { mesh, enviados, entregar } = meshFalso();
    adjuntarServidorRenderMalla(mesh, { sesionGrupo: () => "g1", encolar: vi.fn(() => "t") });
    entregar(pedirRender({ cuentaId: "otra", grupoId: "g1", composicionRef: "e" }));
    expect(enviados[0]).toMatchObject({ t: "capacidad.fin", resultado: { trabajoId: "t" } });
  });

  it("cuenta ajena con un grupo que NO es el compartido: `capacidad.error` 403 y sin encolar", () => {
    const { mesh, enviados, entregar } = meshFalso();
    const encolar = vi.fn(() => "t");
    adjuntarServidorRenderMalla(mesh, { sesionGrupo: () => "g1", encolar });
    entregar(pedirRender({ cuentaId: "otra", grupoId: "g2", composicionRef: "e" }));
    expect(encolar).not.toHaveBeenCalled();
    expect(enviados[0]).toMatchObject({ t: "capacidad.error", estado: 403 });
  });

  it("sin cola de render en esta neurona: rechazo honesto 503, nunca pánico", () => {
    const { mesh, enviados, entregar } = meshFalso();
    adjuntarServidorRenderMalla(mesh, {});
    entregar(pedirRender({ cuentaId: "c-local", composicionRef: "e" }));
    expect(enviados[0]).toMatchObject({ t: "capacidad.error", estado: 503, mensaje: expect.stringContaining("cola de render") });
  });

  it("solo contesta `capacidad.pedir` tipo render: otros tipos y basura se ignoran en silencio", () => {
    const { mesh, enviados, entregar } = meshFalso();
    adjuntarServidorRenderMalla(mesh, { encolar: vi.fn(() => "t") });
    entregar({ t: "capacidad.pedir", id: "p9", tipo: "voz", cuerpo: {} });
    entregar("basura");
    entregar({ t: "capacidad.trozo", id: "p9", texto: "x" });
    expect(enviados).toHaveLength(0);
  });
});
