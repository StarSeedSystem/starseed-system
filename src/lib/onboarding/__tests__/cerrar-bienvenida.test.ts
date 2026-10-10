/**
 * DSB1010 (2026-10-10) · «La ventana Bienvenida · Guía de StarSeed con Astraura no cierra con el
 * botón de cerrar». Reproducido en localhost:9002: la X común del OS estaba visible dentro del
 * rito (`[data-boton-cerrar]`, display grid) y al pulsarla el diálogo seguía abierto, porque el
 * rito la escondía con una clase que la X nueva ya no lleva y su `onOpenChange` no hacía nada.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cambioAlCerrar, cerrarBienvenida, debeAbrirseSola } from "../cerrar-bienvenida";

const RAIZ = join(__dirname, "..", "..", "..", "..");
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf-8");

describe("cerrarBienvenida", () => {
  it("oculta primero, abandona el rito de la pestaña y la deja POSPUESTA en la cuenta", async () => {
    const orden: string[] = [];
    const guardar = vi.fn(async () => { orden.push("guardar"); return { skipped: true }; });
    const ok = await cerrarBienvenida({
      callarVoz: () => orden.push("callar"),
      ocultar: () => orden.push("ocultar"),
      abandonarRito: () => orden.push("abandonar"),
      guardar,
      ahora: () => new Date("2026-10-10T14:00:00Z"),
    });
    expect(ok).toBe(true);
    expect(orden).toEqual(["callar", "ocultar", "abandonar", "guardar"]);
    expect(guardar).toHaveBeenCalledWith({ completed: false, skipped: true, skippedAt: "2026-10-10T14:00:00.000Z" });
  });

  it("un fallo de voz, de storage o de red NUNCA deja la ventana abierta", async () => {
    const ocultar = vi.fn();
    const ok = await cerrarBienvenida({
      callarVoz: () => { throw new Error("sin voz"); },
      ocultar,
      abandonarRito: () => { throw new Error("sin storage"); },
      guardar: async () => { throw new Error("red caída"); },
    });
    expect(ocultar).toHaveBeenCalledTimes(1);
    expect(ok).toBe(false); // se avisa de que no quedó guardado en la cuenta
    const nulo = await cerrarBienvenida({ callarVoz: () => {}, ocultar, abandonarRito: () => {}, guardar: async () => null });
    expect(nulo).toBe(false);
  });

  it("cerrar es «pospuesto», nunca «completado»: se puede retomar a mano", () => {
    const c = cambioAlCerrar(new Date("2026-10-10T00:00:00Z"));
    expect(c.completed).toBe(false);
    expect(c.skipped).toBe(true);
  });
});

describe("debeAbrirseSola (portero global, todos los medios)", () => {
  it("lo pospuesto o completado EN LA CUENTA manda, con o sin perfil", () => {
    for (const tienePerfil of [true, false]) {
      expect(debeAbrirseSola({ tienePerfil, estado: { completed: false, skipped: true }, ritoEnBienvenida: true })).toBe(false);
      expect(debeAbrirseSola({ tienePerfil, estado: { completed: true, skipped: false }, ritoEnBienvenida: true })).toBe(false);
    }
  });

  it("una cuenta recién nacida (sin perfil ni estado) la ve sola; con perfil, solo dentro del rito", () => {
    expect(debeAbrirseSola({ tienePerfil: false, estado: null, ritoEnBienvenida: false })).toBe(true);
    expect(debeAbrirseSola({ tienePerfil: true, estado: { completed: false, skipped: false }, ritoEnBienvenida: false })).toBe(false);
    expect(debeAbrirseSola({ tienePerfil: true, estado: { completed: false, skipped: false }, ritoEnBienvenida: true })).toBe(true);
  });
});

describe("guardia: ningún diálogo del rito vuelve a tener una X muerta", () => {
  for (const ruta of ["src/components/onboarding/onboarding-wizard.tsx", "src/components/onboarding/ventana-perfil-inicial.tsx"]) {
    it(ruta, () => {
      const src = leer(ruta);
      // La X común (BotonCerrar) no es un `button.absolute`: esa regla ya no la esconde.
      expect(src).not.toMatch(/\[&>button\.absolute\]:hidden/);
      // Un `onOpenChange` vacío convierte la X visible en un botón que no hace nada.
      expect(src).not.toMatch(/onOpenChange=\{\(\)\s*=>\s*\{\s*(\/\*[^*]*\*\/)?\s*\}\}/);
      expect(src).toMatch(/onOpenChange=\{\(\w+\) => \{ if \(!\w+\)/);
    });
  }

  it("la bienvenida cierra con la X y Esc, pero no con un clic fuera", () => {
    const src = leer("src/components/onboarding/onboarding-wizard.tsx");
    expect(src).toMatch(/onInteractOutside=\{\(e\) => e\.preventDefault\(\)\}/);
    expect(src).not.toMatch(/onEscapeKeyDown=\{\(e\) => e\.preventDefault\(\)\}/);
    expect(src).toMatch(/cerrarBienvenida\(/);
  });
});
