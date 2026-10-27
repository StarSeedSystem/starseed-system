/**
 * Pruebas del widget «estudio-video» (HFR1018K). Sin red, sin disco, sin procesos:
 * el fetch de la neurona se inyecta y las órdenes del SDK se observan por callback.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EstudioVideoVentana, capasDeComposicion } from "../estudio-video-ventana";
import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";
import type { FetchLocal } from "@/lib/protomolecula/servicio-local";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";

/** Composición en el formato de plantilla.ts (CSS, sin GSAP) y otra con GSAP. */
const COMP = `<div data-composition-id="main" data-start="0" data-duration="4"><style>@keyframes k { from { opacity: 0 } to { opacity: 1 } }</style>` +
  `<div id="fondo" class="clip sf-fondo" data-start="0" data-duration="4" data-track-index="0"></div>` +
  `<div id="titulo" class="clip sf-titulo" data-start="0.5" data-duration="2" data-track-index="1">Hola</div></div>`;
const COMP_GSAP = `<div id="a" class="clip" data-start="0" data-duration="1"></div><script>gsap.to("#a", { x: 10 });</script>`;

/** fetch de mentira: la neurona responde /health; la otra tira un fallo de red. */
const neuronaViva: FetchLocal = async () => ({ ok: true, status: 200, headers: { get: () => "2" }, body: null, text: async () => '{"servicio":"hyperframes"}' });
const neuronaCaida: FetchLocal = async () => { throw new TypeError("red apagada en pruebas"); };

/** Widget de registro con ajustes (mismo patrón que UniversalRegistryWidget). */
function widget(settings: Record<string, unknown>): DashboardWidget {
  return { id: "w1", dashboard_id: "d1", widget_type: "estudio-video" as unknown as WidgetType,
    layout: { x: 0, y: 0, w: 3, h: 3 }, settings, created_at: "2026-10-27T00:00:00Z" };
}

/** Con `globals: false` Testing Library no limpia solo: cada prueba suelta su render. */
afterEach(() => cleanup());

describe("capasDeComposicion (puro)", () => {
  it("lee id, pista, inicio y duración de los atributos data-*", () => {
    expect(capasDeComposicion(COMP)).toEqual([
      { id: "fondo", pista: 0, inicio: 0, duracion: 4, texto: "" },
      { id: "titulo", pista: 1, inicio: 0.5, duracion: 2, texto: "Hola" },
    ]);
  });
  it("ignora lo que no lleva la clase clip", () => {
    expect(capasDeComposicion(`<div data-start="0" data-duration="1"></div>`)).toEqual([]);
  });
});

describe("Estudio de vídeo (widget)", () => {
  it("con la neurona viva lista las capas y monta el reproductor servido por ella", async () => {
    const { container } = render(
      <EstudioVideoVentana pedir={neuronaViva} widget={widget({ composicion: COMP, idComposicion: "v1" })} />,
    );
    await waitFor(() => expect(container.querySelector("hyperframes-player")).not.toBeNull());
    expect(container.querySelector("hyperframes-player")?.getAttribute("src")).toBe("http://127.0.0.1:4490/vista/v1");
    expect(screen.getByRole("button", { name: "titulo · pista 1 · 0.5s + 2s" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Línea de tiempo" })).toBeTruthy();
  });

  it("sin servicio avisa con claridad y ofrece abrir en otra neurona", async () => {
    const abrir = vi.fn();
    render(<EstudioVideoVentana pedir={neuronaCaida} onAbrirOtraNeurona={abrir} widget={widget({ composicion: COMP })} />);
    await screen.findByText(/no responde/);
    await userEvent.setup().click(screen.getByRole("button", { name: "Abrir en otra neurona" }));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("avisa cuando la composición trae GSAP (licencia, §2)", () => {
    render(<EstudioVideoVentana pedir={neuronaViva} widget={widget({ composicion: COMP_GSAP })} />);
    expect(screen.getByRole("alert").textContent).toContain("GSAP");
  });

  it("el panel de propiedades emite órdenes del SDK por callback", async () => {
    const recibidas: SdkOrder[][] = [];
    const usuario = userEvent.setup();
    render(
      <EstudioVideoVentana
        pedir={neuronaViva}
        widget={widget({ composicion: COMP })}
        onOrdenes={(o) => recibidas.push(o)}
      />,
    );
    await usuario.click(await screen.findByRole("button", { name: /titulo/ }));
    await usuario.type(screen.getByLabelText("Texto"), "Nuevo");
    await usuario.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(recibidas).toEqual([[{ type: "setText", target: "titulo", value: "HolaNuevo" }]]);
  });
});

