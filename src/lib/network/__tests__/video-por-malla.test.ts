/*
 * HFR1018I · video-por-malla.test.ts — manejador PURO del relé `capacidad.video.render`
 * (video-por-malla.ts). Del rescate nube/40126871156 (RLB1020N) se retiran los casos de
 * rutas.mjs: nunca se importa una implementación de rutas desde una prueba (eso lo cubre
 * src/lib/__tests__/hyperframes-rutas.test.ts). Aquí, sin red ni navegador: admisión por
 * cuenta/grupo, GSAP prohibido al editar, recursos privados ajenos y { aceptado,
 * trabajoId } o rechazo legible con cola inyectada.
 */
import { describe, it, expect } from "vitest";
import {
  VIDEO_MALLA_MAX_COMPOSICION, validarPeticionVideoRender, admiteVideoRenderMalla,
  extraerRecursosRemotos, validarRecursosRenderMalla, videoRenderPorMalla,
  type PeticionVideoRenderMalla, type RecursoVideoRemoto, type ContextoServidaVideo,
} from "@/lib/network/video-por-malla";

const HTML = `<div data-composition-id="a"></div>`;
const CON_GSAP = `<div><script>gsap.to('.a', { x: 1 });</script></div>`;
const FOTO = "http://cinta.local/piezas/foto.png";
const NEURONA: ContextoServidaVideo = { cuentaLocal: "sami", gruposPresta: ["estudio"] };
const peticion = (sobre: Record<string, unknown> = {}): Record<string, unknown> => ({ cuenta: "sami", composicion: HTML, ...sobre });
/** Motivo de rechazo, o cadena vacía si la petición pasa (así se acota el sindicato). */
const motivoDeValidar = (x: unknown): string => { const r = validarPeticionVideoRender(x); return r.ok ? "" : r.motivo; };

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
