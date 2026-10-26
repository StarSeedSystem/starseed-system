// @vitest-environment jsdom
/**
 * «Cambia el fondo» de la petición a la Protomolécula: el proveedor de apariencia real atiende el aviso cancelable,
 * aplica las capas por el mismo camino que el panel de fondos y dice «atendido» con preventDefault().
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceProvider, useAppearance } from "@/context/appearance-context";
import { createLayer } from "@/lib/appearance/background-layers";
import { EVENTO_APLICAR_FONDO, type DetalleAplicarFondo } from "../fondo-evento";
import { PREFIJO_CAPA_FONDO, capasConFondo } from "../fondo";

let nombres: () => string[] = () => [];
function Sonda() {
  const { config } = useAppearance();
  nombres = () => (config.background.layers ?? []).map((c) => String((c as { name?: string }).name ?? c.kind));
  return <p data-testid="capas">{nombres().join("|")}</p>;
}

const capaDeAstraura = (nombre: string) => ({ ...createLayer("shader"), name: `${PREFIJO_CAPA_FONDO}${nombre}` });
const avisar = (nueva: ReturnType<typeof capaDeAstraura>): boolean => {
  const detalle: DetalleAplicarFondo = { aplicar: (capas) => capasConFondo(capas, nueva as unknown as Record<string, unknown>) };
  // dispatchEvent devuelve false cuando alguien llamó a preventDefault(): «atendido».
  return !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { detail: detalle, cancelable: true }));
};

afterEach(cleanup);

describe("AppearanceProvider · aviso de fondo de la petición", () => {
  it("lo atiende (preventDefault) y la capa de Astraura queda puesta; una segunda petición reemplaza la primera", () => {
    render(<AppearanceProvider><Sonda /></AppearanceProvider>);
    act(() => { expect(avisar(capaDeAstraura("Cosmos violeta"))).toBe(true); });
    expect(nombres().filter((n) => n.startsWith(PREFIJO_CAPA_FONDO))).toEqual([`${PREFIJO_CAPA_FONDO}Cosmos violeta`]);
    act(() => { expect(avisar(capaDeAstraura("Semilla dorada"))).toBe(true); });
    expect(nombres().filter((n) => n.startsWith(PREFIJO_CAPA_FONDO))).toEqual([`${PREFIJO_CAPA_FONDO}Semilla dorada`]);
  });

  it("un aviso mal formado (sin función, no cancelable) no lo atiende ni cambia nada", () => {
    render(<AppearanceProvider><Sonda /></AppearanceProvider>);
    const antes = nombres().join("|");
    const sinFuncion = !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { detail: { aplicar: "rm -rf /" }, cancelable: true }));
    const sinDetalle = !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { cancelable: true }));
    const noCancelable = !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { detail: { aplicar: (c: unknown[]) => c } }));
    expect([sinFuncion, sinDetalle, noCancelable]).toEqual([false, false, false]);
    expect(nombres().join("|")).toBe(antes);
  });

  it("al desmontar el proveedor deja de atender (nadie finge haberlo hecho)", () => {
    const { unmount } = render(<AppearanceProvider><Sonda /></AppearanceProvider>);
    unmount();
    expect(avisar(capaDeAstraura("Cosmos violeta"))).toBe(false);
  });
});
