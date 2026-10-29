import { describe, it, expect, beforeEach } from "vitest";
import {
  aceptar, diff, escanear, haySecretos, limpiarCandidatos, listarCandidatos, obtenerCandidato,
  proponer, rechazarCandidato, revisar, type Candidato, type Capa, type Propuesta,
} from "../candidatos-codigo";
import type { Autor, Molecula, Rol, Origen } from "../tipos";

const aut: Autor = { tipo: "agente", id: "astraura" };
const p = (extra: Partial<Propuesta> = {}): Propuesta => ({
  capaId: "capa-1", lenguajeOrigen: "js", propuesto: "const x = 1;", original: "const x = 2;", autor: aut, ...extra,
});
const capa = (extra: Partial<Capa> = {}): Capa => ({
  id: "capa-1", tipo: "codigo", titulo: "Guión", formato: "js", referencia: null, orden: 0, visible: true, bloqueada: false, ...extra,
});
const ctx = (capas: Capa[], rol: Rol = "dueno", origen: Origen = "mano") => ({
  molecula: { id: "m-1", titulo: "Prueba", ambito: "personal", capas, atomos: [], valores: {}, version: 0, creadaEn: 0, actualizadaEn: 0 } as Molecula,
  rol, origen, ambito: "personal" as const,
});
const conCapa = (extra: Partial<Capa> = {}, rol: Rol = "dueno", origen: Origen = "mano") => ctx([capa(extra)], rol, origen);
const proponerLimpio = (): Candidato => proponer(p());

describe("candidatos de código · escáner y revisión", () => {
  beforeEach(() => limpiarCandidatos());

  it("ejecución de código ajeno: eval, new Function, import( y node: saltan en la revisión", () => {
    const c = proponer(p({ propuesto: "eval(cadena);\nconst f = new Function(\"a\");\nawait import(\"algo\");\nimport os from \"node:os\";" }));
    expect(c.avisos.join(" | ")).toMatch(/eval\(.*new Function\(.*import\(.*node:/s);
  });

  it("ruta del disco y núcleo del OS: avisos, sin bloquear por sí mismos", () => {
    const c = proponer(p({ propuesto: "const clave = \" en /home/juan/.perfil\"; // lee el paquete-sistema" }));
    expect(haySecretos(c)).toBe(false);
    expect(c.avisos.join(" | ")).toMatch(/ruta del disco/);
    expect(c.avisos.join(" | ")).toMatch(/núcleo del OS/);
  });

  it("los secretos con forma real bloquean la aceptación: clave sk-", () => {
    const clave = "sk-" + "ax7".repeat(6);
    const c = proponer(p({ propuesto: `const api = "${clave}";` }));
    expect(escanear(clave).secreto).toBe(true);
    expect(haySecretos(c)).toBe(true);
    expect(c.avisos.join(" ")).toMatch(/secreto/);
    expect(aceptar(c, conCapa()).ok).toBe(false);
  });
});

describe("candidatos de código · cola", () => {
  it("proponer guarda el candidato sin ejecutar nada y queda propuesto y revisado", () => {
    const c = proponerLimpio();
    expect(c).toMatchObject({ capaId: "capa-1", estado: "propuesto", avisos: [] });
    expect(obtenerCandidato(c.id)?.id).toBe(c.id);
    expect(escanear(c.propuesto).avisos).toHaveLength(0);
  });
  it("listar filtra por capa y por estado", () => {
    const a = proponer(p({ capaId: "capa-2" }));
    proponerLimpio();
    expect(listarCandidatos({ capaId: "capa-2" })).toHaveLength(1);
    expect(listarCandidatos({ estado: "rechazado" })).toHaveLength(0);
    rechazarCandidato(a.id);
    expect(listarCandidatos({ estado: "rechazado" })[0]?.id).toBe(a.id);
  });
  it("rechazar marca «rechazado» y ya no se puede aceptar", () => {
    const c = proponerLimpio();
    expect(rechazarCandidato("no-esta")).toBeNull();
    expect(rechazarCandidato(c.id)?.estado).toBe("rechazado");
    expect(aceptar(c, conCapa()).ok).toBe(false);
  });
});

describe("candidatos de código · aceptar (solo la mano, solo capa «codigo»)", () => {
  it("una IA no puede aceptar: el código solo lo acepta una persona con la mano", () => {
    const c = proponerLimpio();
    expect(aceptar(c, conCapa({}, "dueno", "ia")).ok).toBe(false);
    const b = proponerLimpio();
    expect(aceptar(b, conCapa({}, "dueno", "agente")).ok).toBe(false);
    const d = proponerLimpio();
    const r = aceptar(d, conCapa({}, "editor", "mano"));
    expect(r.ok).toBe(true);
  });

  it("revisar marca avisos en el original también", () => {
    const c = proponer(p({ original: "por fuera escribo eval(aqui);", propuesto: "const x = 1;" }));
    expect(revisar(c)).toEqual(c.avisos);
    expect(c.avisos.join(" ")).toMatch(/eval\(/);
  });
  it("secretos con otras formas reales también bloquean: gsk_ y Bearer", () => {
    for (const [clave, forma] of [["groq", "gsk_" + "q3z".repeat(6)], ["token", "Bearer " + "tk".repeat(7)]] as const) {
      const c = proponer(p({ propuesto: `${forma}: revisar(candidato, clave);` }));
      expect(haySecretos(c)).toBe(true);
      expect(c.avisos.join(" ")).toMatch(forma.startsWith("g") ? /Groq|secreto/ : /token|secreto/i);
      expect(aceptar(c, conCapa()).ok).toBe(false);
    }
  });
  it("capa que no es de código: no acepta", () => {
    const c = proponerLimpio();
    const r = aceptar(c, conCapa({ tipo: "datos", formato: "csv" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/solo una capa «codigo»/);
  });
  it("candidato sobre una capa bloqueada: no acepta", () => {
    const c = proponerLimpio();
    const r = aceptar(c, conCapa({ bloqueada: true }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/bloqueada/);
  });
  it("capa que cita una Entidad: para editarla una rama, no se pisa", () => {
    const c = proponerLimpio();
    const r = aceptar(c, conCapa({ referencia: { tipo: "codigo", id: "ent-1" } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/RAMA/);
  });
  it("capa que ya no está en la molécula: no acepta", () => {
    const c = proponerLimpio();
    const r = aceptar(c, conCapa({ id: "otra-capa" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/ya no está/);
  });
  it("un archivo o el núcleo del OS jamás: capaId con ruta", () => {
    const c = proponer(p({ capaId: "src/lib/nucleo/invariantes.ts" }));
    const r = aceptar(c, conCapa());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/núcleo intocable|archivo/);
  });
  it("aceptado marca el estado y no se repite", () => {
    const c = proponerLimpio();
    const r = aceptar(c, conCapa());
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.contenido).toBe("const x = 1;"); expect(c.estado).toBe("aceptado"); }
    expect(aceptar(c, conCapa()).ok).toBe(false);
  });
  it("el diff del candidato se ve antes de aceptar (legible, sin librerías)", () => {
    const d = diff(proponerLimpio().original, proponerLimpio().propuesto);
    expect(d).toContain("- const x = 2;");
    expect(d).toContain("+ const x = 1;");
  });
});

describe("candidatos de código · diff", () => {
  it("cambios, adiciones y borrados línea a línea", () => {
    expect(diff("const a = 1;\nconst b = 2;", "const a = 1;\nconst b = 3;")).toBe("  const a = 1;\n- const b = 2;\n+ const b = 3;");
    expect(diff("uno", "uno\ndos\ntres")).toBe("  uno\n+ dos\n+ tres");
    expect(diff("uno\ndos\ntres", "uno")).toBe("  uno\n- dos\n- tres");
  });
  it("sin diferencias: «sin cambios»", () => { expect(diff("a", "a")).toBe("sin cambios"); expect(diff("", "")).toBe("sin cambios"); });
});
