/**
 * Pruebas de rescate de la rama de la nube nube/41190364956 (tarea FSH1018G): la PILA
 * (`BackgroundLayerStack`) pinta las capas de difusión en su ORDEN, posición y mezcla.
 * Solo cubren comportamiento de la pila que main no tenía probado: lo puro de difusión
 * ya está en `src/lib/appearance/__tests__/difusion.test.ts` y el saneado en
 * `background-layers-shader.test.ts`. Montaje con el proveedor real y config sembrada,
 * como el panel de fondos (`fondos-shaders-panel.test.tsx`); sin red ni GPU.
 *
 * Hallazgo aparte (fallo real, se informa): una capa `shader` de la pila NO se pinta —
 * `LayerBody` no tiene el caso «shader» y devuelve null, aunque `CapaShader` existe y su
 * cabecera dice «pinta UNA capa shader de la pila de fondos».
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { BackgroundLayerStack } from "../background-layer-stack";
import { AppearanceProvider } from "@/context/appearance-context";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";

const capa = (extra: Partial<BackgroundLayer>): BackgroundLayer => ({
    id: "c1", kind: "color", visible: true, opacity: 1, blend: "normal", value: "#0a0118", ...extra,
});

const sembrar = (capas: BackgroundLayer[]): void => {
    localStorage.setItem("appearance-config-v2", JSON.stringify({ background: { type: "spline", layers: capas } }));
};

const cuerpoDe = (envoltura: Element): string => envoltura.firstElementChild?.outerHTML ?? "";

/** Siembra y monta la pila; la escritura de vuelta del proveedor delata que ya completó su montaje. */
const pintar = async (capas: BackgroundLayer[]): Promise<HTMLElement> => {
    sembrar(capas);
    const { container } = render(
      <AppearanceProvider>
        <BackgroundLayerStack />
      </AppearanceProvider>,
    );
    await waitFor(() => expect(localStorage.getItem("appearance-config-v2")).toContain("typography"));
    return container;
};

describe("BackgroundLayerStack · capas nuevas de la pila (rescate FSH1018G)", () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it("respetan el ORDEN configurado y el z-index va subiendo por capa", async () => {
    const pila = await pintar([
      capa({ id: "c1" }),
      capa({ id: "d1", kind: "difusion", opacity: 0.42, value: undefined,
        difusion: { modo: "desenfoque", desenfoquePx: 8, opacidad: 1, textura: "ninguna" } }),
    ]);
    const envolturas = Array.from(pila.children) as HTMLElement[];
    expect(envolturas).toHaveLength(2);
    expect(envolturas.map((e) => e.style.zIndex)).toEqual(["-9", "-8"]);
    expect(cuerpoDe(envolturas[0])).toMatch(/background:\s*#0a0118/); // la de color, abajo
    expect(cuerpoDe(envolturas[1])).toContain("blur(8px)"); // la de difusión, encima: desenfoca lo de abajo
    expect(envolturas[1].style.opacity).toBe("0.42");
    expect(envolturas[1].style.mixBlendMode).toBe("normal");
  });

  it("la opacidad y la mezcla van UNA vez: el cuerpo de difusión las recibe neutras", async () => {
    const pila = await pintar([
      capa({ id: "d2", kind: "difusion", opacity: 0.42, blend: "screen",
        difusion: { modo: "desenfoque", desenfoquePx: 8, opacidad: 1, textura: "ninguna" } }),
    ]);
    const envoltura = pila.children[0] as HTMLElement;
    expect(envoltura.style.opacity).toBe("0.42");
    expect(envoltura.style.mixBlendMode).toBe("screen");
    const cuerpo = cuerpoDe(envoltura);
    expect(cuerpo).toContain("blur(8px)");
    expect(cuerpo).toMatch(/opacity:\s*1(?!\.?\d)/); // CapaDifusion pide neutras para no aplicarlas dos veces
    expect(cuerpo).not.toContain("0.42");
  });

  it("una capa invisible no se pinta y sin capas la pila no pinta NADA", async () => {
    const pila = await pintar([
      capa({ id: "x1", visible: false }),
      capa({ id: "x2", kind: "difusion", visible: false,
        difusion: { modo: "desenfoque", desenfoquePx: 8, opacidad: 1, textura: "ninguna" } }),
    ]);
    expect(pila.children).toHaveLength(0);
    const vacia = await pintar([]);
    expect(vacia.children).toHaveLength(0);
  });
});
