/**
 * video-por-malla (Ola 1018H · tarea I) — pruebas SIN RED ni disco del manejador
 * del relé `capacidad.video.render`: admisión, GSAP del OS, recursos privados y
 * encolado con reloj, ids y cola inyectados.
 */
import { describe, it, expect } from "vitest";
import {
  VIDEO_MALLA_NS, VIDEO_MALLA_MAX_DURACION_S,
  admiteVideoMalla, validarPeticionVideoMalla, manejarPeticionVideoMalla,
  type PeticionVideoMalla, type TrabajoVideoMalla,
} from "@/lib/network/video-por-malla";

const HTML = `<div class="clip" data-start="0" data-duration="3">Hola</div>`;
const CON_GSAP = `<div><script>gsap.to(".box", { x: 100 });</script></div>`;

function peticion(extra: Partial<PeticionVideoMalla> = {}): PeticionVideoMalla {
  return { cuentaId: "acct-alex", composicion: { html: HTML, origen: "os" }, ...extra };
}

describe("admisión del render", () => {
  it("la misma cuenta siempre entra", () => {
    expect(admiteVideoMalla({}, { mismaCuenta: true }).aceptado).toBe(true);
  });
  it("otro grupo solo si está en la lista con permiso", () => {
    const r = { mismaCuenta: false, gruposConPermiso: ["grupo-arte"] };
    expect(admiteVideoMalla({ grupoId: "grupo-arte" }, r).aceptado).toBe(true);
    const no = admiteVideoMalla({ grupoId: "grupo-otro" }, r);
    expect(no.aceptado).toBe(false);
    expect(no.motivo).toContain("grupo con permiso");
    expect(admiteVideoMalla({}, { mismaCuenta: false }).aceptado).toBe(false);
  });
});

describe("validación de la composición", () => {
  it("acepta una petición íntegra", () => {
    const r = validarPeticionVideoMalla(peticion());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.peticion.cuentaId).toBe("acct-alex");
  });
  it("rechaza basura, cuenta ausente, html vacío, origen y formato inválidos", () => {
    expect(validarPeticionVideoMalla(null).ok).toBe(false);
    expect(validarPeticionVideoMalla({ composicion: { html: HTML, origen: "os" } }).ok).toBe(false);
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: " ", origen: "os" } }).ok).toBe(false);
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: HTML, origen: "otra" } }).ok).toBe(false);
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: HTML, origen: "os", formato: "avi" } }).ok).toBe(false);
  });
  it("acota la duración al tope del contrato", () => {
    const cero = validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: HTML, origen: "os", duracionS: 0 } });
    const largo = validarPeticionVideoMalla({
      cuentaId: "a", composicion: { html: HTML, origen: "os", duracionS: VIDEO_MALLA_MAX_DURACION_S + 1 },
    });
    expect(cero.ok).toBe(false);
    expect(largo.ok).toBe(false);
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: HTML, origen: "os", duracionS: 3 } }).ok).toBe(true);
  });
});

describe("GSAP y licencia §2", () => {
  it("rechaza GSAP si la composición la editó el OS", () => {
    const r = validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: CON_GSAP, origen: "os" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("GSAP");
  });
  it("una composición ajena con GSAP se puede renderizar (solo no se edita)", () => {
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: CON_GSAP, origen: "ajena" } }).ok).toBe(true);
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: { html: HTML, origen: "os" } }).ok).toBe(true);
  });
});

describe("recursos privados", () => {
  it("lo privado de otra cuenta no sale de sus neuronas", () => {
    const ajeno = { html: HTML, origen: "os" as const, recursos: [{ url: "https://x/y.png", privado: true, cuentaId: "otra" }] };
    const r = validarPeticionVideoMalla({ cuentaId: "a", composicion: ajeno });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("privados de otra cuenta");
  });
  it("acepta lo privado propio y lo público ajeno, y exige URL", () => {
    const propio = { html: HTML, origen: "os" as const, recursos: [{ url: "https://x/y.png", privado: true, cuentaId: "a" }] };
    const publico = { html: HTML, origen: "os" as const, recursos: [{ url: "https://x/y.png", privado: false }] };
    const sinUrl = { html: HTML, origen: "os" as const, recursos: [{ privado: true, cuentaId: "a" }] };
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: propio }).ok).toBe(true);
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: publico }).ok).toBe(true);
    expect(validarPeticionVideoMalla({ cuentaId: "a", composicion: sinUrl }).ok).toBe(false);
  });
});

describe("manejador: valida, admite y encola", () => {
  const reglas = { mismaCuenta: true };
  it("devuelve { aceptado, trabajoId } y encola con reloj e id inyectados", () => {
    const encolados: TrabajoVideoMalla[] = [];
    const r = manejarPeticionVideoMalla(peticion(), reglas, {
      nuevoId: () => "trabajo-1", ahora: () => 1234,
      encolar: (t) => { encolados.push(t); return true; },
    });
    expect(r).toEqual({ aceptado: true, trabajoId: "trabajo-1" });
    expect(encolados).toHaveLength(1);
    expect(encolados[0]).toMatchObject({ id: "trabajo-1", cuentaId: "acct-alex", creadoEn: 1234 });
  });
  it("cola llena ⇒ rechazo legible y sin lanzar", () => {
    const r = manejarPeticionVideoMalla(peticion(), reglas, { encolar: () => false });
    expect(r.aceptado).toBe(false);
    if (!r.aceptado) expect(r.motivo).toContain("cola de render");
  });
  it("si la admisión o la validación fallan, no se encola nada", () => {
    let llamadas = 0;
    const encolar = () => { llamadas++; return true; };
    const admision = manejarPeticionVideoMalla(peticion(), { mismaCuenta: false }, { encolar });
    const invalida = manejarPeticionVideoMalla({ cuentaId: "a", composicion: { html: CON_GSAP, origen: "os" } }, reglas, { encolar });
    expect(admision.aceptado).toBe(false);
    expect(invalida.aceptado).toBe(false);
    expect(llamadas).toBe(0);
  });
  it("el namespace y el id por defecto son estables", () => {
    expect(VIDEO_MALLA_NS).toBe("capacidad.video.render.");
    const r = manejarPeticionVideoMalla(peticion(), reglas);
    expect(r.aceptado).toBe(true);
    if (r.aceptado) expect(r.trabajoId.length).toBeGreaterThan(0);
  });
});
