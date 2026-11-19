import { describe, it, expect } from "vitest";
import { MEDIOS, PERMISOS, celdaDe, mediosDe, soporta, queHacer, planDe, alInstalar, alAbrir, textoDecision, type Medio, type Permiso } from "../matriz";

type Estados = Partial<Record<Permiso, "concedido" | "falta" | "denegado-mano" | "no-disponible">>;
const plan = (medio: Medio, estados: Estados = {}, ya: Permiso[] = []) => planDe(medio, estados, ya);

describe("matriz de permisos por medio", () => {
  it("cubre los siete medios y los doce permisos del contrato", () => {
    expect(MEDIOS).toEqual(["macos", "windows", "linux", "android", "ios", "navegador", "terminal"]);
    expect(PERMISOS).toHaveLength(12);
  });

  it("cada permiso existe al menos en un medio y cada medio tiene filas", () => {
    for (const p of PERMISOS) expect(mediosDe(p).length, p).toBeGreaterThan(0);
    for (const m of MEDIOS) expect(PERMISOS.filter((p) => soporta(m, p)).length, m).toBeGreaterThan(0);
  });

  it("cada medio declara exactamente las filas de su contrato", () => {
    expect(MEDIOS.map((m) => PERMISOS.filter((p) => soporta(m, p)).length)).toEqual([12, 12, 12, 12, 11, 10, 10]);
  });

  it("lee la forma de pedir real de cada medio", () => {
    expect(celdaDe("macos", "microfono")?.como).toBe("aviso");
    expect(celdaDe("android", "accesibilidad")?.como).toBe("panel");
    expect(celdaDe("linux", "pantalla")?.como).toBe("por-uso");
    expect(celdaDe("ios", "entrada-virtual")).toBeNull();
    expect(celdaDe("navegador", "accesibilidad")).toBeNull();
  });

  it("distingue la lectura del estado y el enlace a ajustes", () => {
    expect(celdaDe("macos", "microfono")?.deteccion).toBe("si");
    expect(celdaDe("macos", "red-local")?.deteccion).toBe("parcial");
    expect(celdaDe("macos", "red-local")?.distingue).toBe(false);
    expect(celdaDe("windows", "microfono")?.deteccion).toBe("no");
    expect(celdaDe("android", "ubicacion")?.enlace).toBe("ficha");
    expect(celdaDe("windows", "red-local")?.enlace).toBe("sin-enlace");
  });
});

describe("queHacer: la regla de pedir sin insistir", () => {
  it("pide lo que falta, saluda lo concedido y no pide lo que no aplica", () => {
    expect(queHacer("macos", "microfono", "falta")).toBe("pedir");
    expect(queHacer("macos", "microfono", "concedido")).toBe("listo");
    expect(queHacer("ios", "entrada-virtual", "falta")).toBe("no-disponible");
    expect(queHacer("macos", "microfono", "no-disponible")).toBe("no-disponible");
    expect(queHacer("windows", "pantalla", "falta")).toBe("no-hace-falta");
  });

  it("un permiso denegado a mano nunca se vuelve a pedir solo", () => {
    for (const m of MEDIOS) {
      for (const p of PERMISOS) {
        if (!soporta(m, p)) continue;
        expect(queHacer(m, p, "denegado-mano"), `${m}/${p}`).not.toBe("pedir");
      }
    }
  });

  it("lo que solo se da en un panel abre ajustes; lo de uso se pide al usarlo", () => {
    expect(queHacer("android", "accesibilidad", "falta")).toBe("abrir-ajustes");
    expect(queHacer("android", "pantalla", "falta")).toBe("por-uso");
  });

  it("lo que ya salió como aviso-y-panel pasa a abrir ajustes", () => {
    expect(queHacer("macos", "pantalla", "falta", false)).toBe("pedir");
    expect(queHacer("macos", "pantalla", "falta", true)).toBe("abrir-ajustes");
    expect(queHacer("macos", "microfono", "falta", true)).toBe("pedir");
  });
});

describe("planDe: qué se pide al instalar y al abrir", () => {
  it("separa pedir, abrir ajustes, por uso, listo y lo que no aplica", () => {
    const p = alInstalar("macos");
    expect(p.pedir).toEqual(expect.arrayContaining(["microfono", "camara", "pantalla", "accesibilidad"]));
    expect(p.abrirAjustes).toContain("segundo-plano");
    expect(p.porUso).toEqual(expect.arrayContaining(["ubicacion", "archivos"]));
    expect(p.noAplica).toContain("energia");
    expect(p.listo).toEqual([]);
  });

  it("no pide solo lo denegado a mano, pero lo deja en la lista con Abrir ajustes", () => {
    const p = plan("macos", { microfono: "denegado-mano", camara: "concedido" });
    expect(p.pedir).not.toContain("microfono");
    expect(p.abrirAjustes).toContain("microfono");
    expect(p.listo).toContain("camara");
  });

  it("al abrir, lo avisado antes se ofrece en ajustes y no se vuelve a lanzar", () => {
    const p = alAbrir("macos", {}, ["pantalla"]);
    expect(p.pedir).not.toContain("pantalla");
    expect(p.abrirAjustes).toContain("pantalla");
  });

  it("en Android e iOS un permiso denegado a mano sale con Abrir ajustes", () => {
    const p = plan("ios", { notificaciones: "denegado-mano", camara: "falta" });
    expect(p.pedir).toContain("camara");
    expect(p.pedir).not.toContain("notificaciones");
    expect(p.abrirAjustes).toContain("notificaciones");
  });

  it("no inventa pedidos en medios donde no existe el permiso", () => {
    const p = plan("navegador", { accesibilidad: "falta" });
    expect(p.noAplica).toContain("accesibilidad");
    expect(p.pedir).not.toContain("accesibilidad");
  });
});

describe("textoDecision", () => {
  it("explica cada decisión en español", () => {
    expect(textoDecision("pedir")).toBe("Pedir ahora");
    expect(textoDecision("abrir-ajustes")).toBe("Abrir ajustes");
    expect(textoDecision("por-uso")).toBe("Se pide al usarlo");
    expect(textoDecision("no-hace-falta")).toBe("Este medio no lo pide");
    expect(textoDecision("no-disponible")).toBe("No disponible en este medio");
    expect(textoDecision("listo")).toBe("Concedido");
  });
});
