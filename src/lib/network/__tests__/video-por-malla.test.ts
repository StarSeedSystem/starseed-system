/*
 * HFR1018I · video-por-malla.test.ts — manejador PURO del relé `capacidad.video.render`
 * (video-por-malla.ts). Fusión a mano de dos historias: los casos de rutas.mjs que main
 * rescató de nube/40126871156 (RLB1020N, aún sin cobertura en hyperframes-rutas.test.ts)
 * y los casos del módulo puro que nube/41253382108 trajo (admisión por cuenta/grupo,
 * GSAP prohibido al editar, recursos privados ajenos y { aceptado, trabajoId } o rechazo
 * legible con cola inyectada). Sin red, sin navegador y sin procesos: todo inyectado.
 */
import { describe, it, expect, vi } from "vitest";
import { manejar } from "../../../../servicios/hyperframes/src/rutas.mjs";
import {
  VIDEO_MALLA_MAX_COMPOSICION, validarPeticionVideoRender, admiteVideoRenderMalla,
  extraerRecursosRemotos, validarRecursosRenderMalla, videoRenderPorMalla,
  atenderPedidoRenderMalla, adjuntarServidorRenderMalla,
  type PeticionVideoRenderMalla, type RecursoVideoRemoto, type ContextoServidaVideo,
  type MeshRenderServidor,
} from "@/lib/network/video-por-malla";
import type { PeerEvents } from "@/lib/network/webrtc-mesh";

const HTML = `<div data-composition-id="a"></div>`;
const CON_GSAP = `<div><script>import { gsap } from 'gsap'; gsap.to('.a', { x: 1 });</script></div>`;
const FOTO = "http://cinta.local/piezas/foto.png";
const NEURONA: ContextoServidaVideo = { cuentaLocal: "sami", gruposPresta: ["estudio"] };
const deps = () => ({
  version: "0.8.172",
  navegador: true,
  ffmpeg: false,
  lint: vi.fn(async () => ({ errores: [], avisos: [] })),
  editar: vi.fn(async (c: string) => c),
  cola: { encolar: vi.fn(async () => "t1"), estado: vi.fn() },
});
const peticion = (sobre: Record<string, unknown> = {}): Record<string, unknown> => ({ cuenta: "sami", composicion: HTML, ...sobre });
/** Motivo de rechazo, o cadena vacía si la petición pasa (así se acota el sindicato). */
const motivoDeValidar = (x: unknown): string => { const r = validarPeticionVideoRender(x); return r.ok ? "" : r.motivo; };
/** Un microtacto: las respuestas del servidor salen en microtareas (permite real setTimeout). */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("servicio hyperframes · peticiones de vídeo (rescate RLB1020N)", () => {
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

describe("validarPeticionVideoRender", () => {
  it("sin cuenta o sin composición (inline ni id) ⇒ rechazo legible", () => {
    expect(motivoDeValidar({ composicion: HTML })).toContain("cuenta");
    expect(motivoDeValidar({ cuenta: "sami" })).toContain("composición");
    expect(motivoDeValidar(peticion({ composicion: "   " }))).toContain("composición");
  });

  it("inline mayor que el tope, formato y duración inválidos ⇒ rechazo", () => {
    const grande = { cuenta: "sami", composicion: "x".repeat(VIDEO_MALLA_MAX_COMPOSICION + 1) };
    expect(motivoDeValidar(grande)).toContain("tope");
    expect(motivoDeValidar(peticion({ formato: "avi" }))).toContain("formato");
    expect(motivoDeValidar(peticion({ duracionS: 0 }))).toContain("duración");
  });

  it("una petición correcta, por id o inline, pasa", () => {
    expect(motivoDeValidar(peticion({ composicionId: "eq-1" }))).toBe("");
    expect(motivoDeValidar(peticion({ formato: "mp4", duracionS: 3 }))).toBe("");
  });
});

describe("admiteVideoRenderMalla", () => {
  const IGUAL: PeticionVideoRenderMalla = { cuenta: "sami", composicion: HTML };
  const GRUPO: PeticionVideoRenderMalla = { cuenta: "otra", grupo: "estudio", composicion: HTML };
  const FUERA: PeticionVideoRenderMalla = { cuenta: "otra", grupo: "teatro", composicion: HTML };
  const PRIVADA: PeticionVideoRenderMalla = { cuenta: "otra", grupo: "estudio", privado: true, composicion: HTML };

  it("la misma cuenta y el grupo prestado pasan", () => {
    expect(admiteVideoRenderMalla(IGUAL, NEURONA).ok).toBe(true);
    expect(admiteVideoRenderMalla(GRUPO, NEURONA).ok).toBe(true);
  });

  it("grupo sin permiso y privado ajeno ⇒ rechazo legible", () => {
    const fuera = admiteVideoRenderMalla(FUERA, NEURONA);
    const privada = admiteVideoRenderMalla(PRIVADA, NEURONA);
    expect([fuera.ok, privada.ok]).toEqual([false, false]);
    expect([fuera.motivo, privada.motivo]).toEqual([expect.stringContaining("cuenta"), expect.stringContaining("privada")]);
  });
});

describe("recursos remotos de la composición", () => {
  const compo = `<img src="${FOTO}">`;

  it("extraerRecursosRemotos: http(s) únicas y en orden", () => {
    expect(extraerRecursosRemotos(`${compo} vistos también en ${FOTO}`)).toEqual([FOTO]);
    expect(extraerRecursosRemotos(HTML)).toEqual([]);
  });

  it("recurso sin declarar o privado ajeno ⇒ rechazo; el público o propio pasa", () => {
    expect(validarRecursosRenderMalla({ cuenta: "sami", composicion: compo }).motivo).toContain("sin declarar");
    expect(validarRecursosRenderMalla({ cuenta: "sami", composicion: compo, recursos: [{ url: FOTO }] }).motivo).toContain("privado");
    const sePermite = (r: RecursoVideoRemoto) => validarRecursosRenderMalla({ cuenta: "sami", composicion: compo, recursos: [r] }).ok;
    for (const r of [{ url: FOTO, dueñoId: "sami" }, { url: FOTO, publico: true }]) expect(sePermite(r)).toBe(true);
  });
});

describe("videoRenderPorMalla (cola inyectada)", () => {
  const encolar = async (p: PeticionVideoRenderMalla): Promise<string> => `t-${p.cuenta}`;

  it("acepta la petición buena, encola y devuelve { aceptado, trabajoId }", async () => {
    const res = await videoRenderPorMalla(peticion(), NEURONA, { encolar });
    expect(res).toMatchObject({ aceptado: true, trabajoId: "t-sami" });
    expect(res.aceptado && res.motivo).toContain("misma cuenta");
  });

  it("sin cola inyectada también da un trabajoId propio del relé", async () => {
    const res = await videoRenderPorMalla(peticion(), NEURONA);
    expect(res).toMatchObject({ aceptado: true });
    expect(res.aceptado && res.trabajoId.length).toBeGreaterThan(8);
  });

  it("OS + GSAP + editar ⇒ rechazo legible y nada encolado (GSAP Standard, §2)", async () => {
    const encoladas: unknown[] = [];
    const res = await videoRenderPorMalla(
      peticion({ composicion: CON_GSAP, editar: true }), NEURONA,
      { encolar: (p) => { encoladas.push(p); return "t"; } },
    );
    expect([res.aceptado, encoladas]).toEqual([false, []]);
    expect(res.motivo).toContain("GSAP");
  });

  it("la composición ajena con GSAP se renderiza (no se edita): aceptado, no editableVisualmente", async () => {
    const res = await videoRenderPorMalla(peticion({ composicion: CON_GSAP, editar: false }), NEURONA, { encolar });
    expect(res).toMatchObject({ aceptado: true, trabajoId: "t-sami", editableVisualmente: false });
  });

  it("cola llena ⇒ rechazo legible, sin lanzar", async () => {
    const llena = async (): Promise<string> => { throw new Error("cola llena"); };
    const res = await videoRenderPorMalla(peticion(), NEURONA, { encolar: llena });
    expect(res.aceptado).toBe(false);
    expect(res.motivo).toContain("cola llena");
  });

  it("petición fuera de la cuenta o con recurso privado ajeno ⇒ rechazo sin encolar", async () => {
    expect((await videoRenderPorMalla(peticion({ cuenta: "otra", grupo: "teatro" }), NEURONA, { encolar })).aceptado).toBe(false);
    const conFoto = { cuenta: "sami", composicion: `<img src="${FOTO}">`, recursos: [{ url: FOTO }] };
    expect((await videoRenderPorMalla(conFoto, NEURONA, { encolar })).aceptado).toBe(false);
  });
});

describe("rol servidor del relé (mesh de mentira)", () => {
  /** Mesh de mentira: registra los envíos por peer y qué `PeerEvents` se suscribió. */
  const meshMentira = (envios: Array<{ peerId: string; data: string }>) => {
    let eventos: PeerEvents | null = null;
    const mesh: MeshRenderServidor = {
      userId: "sami",
      sendToPeer: (peerId, data) => { envios.push({ peerId, data }); return true; },
      onPeer: (e) => { eventos = e; return () => { eventos = null; }; },
    };
    return { mesh, suscrito: () => eventos };
  };

  it("pedir válido ⇒ capacidad.fin con la REFERENCIA (trabajoId), no el vídeo", async () => {
    const envios: Array<{ peerId: string; data: string }> = [];
    const { mesh } = meshMentira(envios);
    await atenderPedidoRenderMalla(mesh, "p1", { id: "q1", cuerpo: peticion() }, { encolar: async () => "t9", cuentaLocal: () => "sami" });
    expect(envios).toHaveLength(1);
    expect(JSON.parse(envios[0].data)).toMatchObject({ t: "capacidad.fin", id: "q1", resultado: { trabajoId: "t9" } });
  });

  it("cuerpo malformado ⇒ 400 legible; fuera de cuenta/grupo ⇒ 403 legible", async () => {
    const envios: Array<{ peerId: string; data: string }> = [];
    const { mesh } = meshMentira(envios);
    await atenderPedidoRenderMalla(mesh, "p1", { id: "q1", cuerpo: { composicion: "" } }, {});
    await atenderPedidoRenderMalla(mesh, "p1", { id: "q2", cuerpo: peticion({ cuenta: "otra" }) }, { cuentaLocal: () => "sami" });
    expect(envios.map((e) => JSON.parse(e.data))).toMatchObject([
      { t: "capacidad.error", id: "q1", estado: 400 },
      { t: "capacidad.error", id: "q2", estado: 403 },
    ]);
  });

  it("adjuntarServidorRenderMalla: filtra por tipo `render` y contesta el 400 sin esperas", async () => {
    const envios: Array<{ peerId: string; data: string }> = [];
    const { mesh, suscrito } = meshMentira(envios);
    const limpiar = adjuntarServidorRenderMalla(mesh, { cuentaLocal: () => "sami" });
    const eventos = suscrito();
    expect(eventos).not.toBeNull();
    eventos?.onMessage?.("p1", JSON.stringify({ t: "capacidad.fin", id: "q0", resultado: 1 }));
    eventos?.onMessage?.("p1", JSON.stringify({ t: "capacidad.pedir", id: "q1", tipo: "palabra", cuerpo: {} }));
    await tick();
    expect(envios).toHaveLength(0);
    eventos?.onMessage?.("p1", JSON.stringify({ t: "capacidad.pedir", id: "q2", tipo: "render", cuerpo: {} }));
    await tick();
    expect(JSON.parse(envios[0].data)).toMatchObject({ t: "capacidad.error", id: "q2", estado: 400 });
    limpiar();
    expect(suscrito()).toBeNull();
  });
});