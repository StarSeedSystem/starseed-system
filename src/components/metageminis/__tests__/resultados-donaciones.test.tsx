import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderSolo, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AppearanceProvider } from "@/context/appearance-context";
import { ResultadosRamas } from "../resultados-ramas";
import { DonacionesEstado } from "../donaciones-estado";
import { borrador } from "@/lib/metageminis/datos-de-prueba";
import type { AgenteMeta, Donacion, EnlacePago, Resultado } from "@/lib/metageminis/tipos";

afterEach(cleanup);
const render = (ui: React.ReactElement) => renderSolo(<AppearanceProvider>{ui}</AppearanceProvider>);

const agente: AgenteMeta = { id: "a1", rama_id: "investigadora", nombre: "Lupa-1", medio: "oracle_a1", estado: "activo", modelo: "kimi", ultimo_latido: "2026-10-10T08:00:00Z", creado_en: "2026-10-09T00:00:00Z" };

describe("ResultadosRamas", () => {
  const base = { sinTablaBorradores: false, sinTablaResultados: false, sinTablaAgentes: false };

  it("una fila por rama y las cifras salen de datos reales", () => {
    const resultados: Resultado[] = [
      { id: "r", rama_id: "fondos", agente_id: null, borrador_id: null, tipo: "financiacion", valor_minor: 150000, moneda: "eur", nota: null, creado_en: "2026-10-10T08:00:00Z" },
    ];
    render(<ResultadosRamas {...base} borradores={[borrador({ rama_id: "fondos", estado: "enviado" }), borrador({ id: "b2", rama_id: "fondos", estado: "respondido" })]} resultados={resultados} agentes={[agente]} />);
    expect(screen.getAllByRole("row")).toHaveLength(1 + 7);
    const fondos = screen.getByTestId("rama-fondos");
    expect(within(fondos).getByText("50 %")).toBeInTheDocument();
    expect(fondos).toHaveTextContent(/1\.?500,00\s?€/);
    expect(screen.getByTestId("rama-estudio")).toHaveTextContent("—");
    expect(screen.getByTestId("agente")).toHaveTextContent(/Lupa-1/);
    expect(screen.getByTestId("agente")).toHaveTextContent(/Oracle A1/);
  });

  it("si faltan las tablas, lo dice en vez de enseñar ceros como si fueran datos", () => {
    render(<ResultadosRamas borradores={[]} resultados={[]} agentes={[]} sinTablaBorradores sinTablaResultados sinTablaAgentes />);
    expect(screen.getAllByTestId("aviso-sin-tabla")).toHaveLength(3);
  });

  it("lista los hallazgos recientes con enlace seguro, o avisa si falta la tabla", () => {
    const h = { id: "h1", rama_id: "investigadora" as const, agente_id: null, sitio_id: null, tipo: "convocatoria" as const, url: "https://fondo.example/convocatoria", titulo: "Convocatoria de bienes comunes", resumen: null, plazo: "2026-12-01", prioridad: 1 as const, estado: "nuevo" as const, huella: null, creado_en: "2026-10-10T08:00:00Z" };
    const mala = { ...h, id: "h2", titulo: "Enlace peligroso", url: "javascript:alert(1)" };
    render(<ResultadosRamas {...base} borradores={[]} resultados={[]} agentes={[]} hallazgos={[h, mala]} />);
    const items = screen.getAllByTestId("hallazgo");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByRole("link", { name: /Abrir Convocatoria/ })).toHaveAttribute("href", "https://fondo.example/convocatoria");
    expect(within(items[0]).getByText("plazo 2026-12-01")).toBeInTheDocument();
    expect(within(items[1]).queryByRole("link")).toBeNull();
    cleanup();
    render(<ResultadosRamas {...base} borradores={[]} resultados={[]} agentes={[]} hallazgos={[]} sinTablaHallazgos />);
    expect(screen.getByTestId("aviso-sin-tabla")).toHaveTextContent(/metageminis_hallazgos/);
  });

  it("sin agentes registrados lo explica", () => {
    render(<ResultadosRamas {...base} borradores={[]} resultados={[]} agentes={[]} />);
    expect(screen.getByText(/Ningún agente se ha registrado todavía/)).toBeInTheDocument();
  });
});

describe("DonacionesEstado", () => {
  const enlace = (extra: Partial<EnlacePago> = {}): EnlacePago => ({
    id: "e1", nombre: "Donar a StarSeed", url: "https://donate.stripe.com/abc123", moneda: "eur", minimo_minor: 500, confirmado_por: null,
    confirmado_en: null, activo: false, creado_en: "2026-10-10T08:00:00Z", ...extra,
  });
  const donacion = (id: string, importe: number, estado: Donacion["estado"] = "confirmada"): Donacion => ({
    id, stripe_id: `cs_${id}`, enlace_id: "e1", importe_minor: importe, moneda: "eur", estado, rama_id: null, campana_id: null,
    confirmada_en: "2026-10-10T08:00:00Z", creado_en: "2026-10-10T08:00:00Z",
  });
  const base = { sinTablaDonaciones: false, sinTablaEnlaces: false, esDueno: true, confirmar: vi.fn(async () => ({ ok: true })) };

  it("suma solo lo confirmado por Stripe y descuenta lo reembolsado", () => {
    render(<DonacionesEstado {...base} donaciones={[donacion("a", 2000), donacion("b", 500), donacion("c", 9999, "reembolsada")]} enlaces={[]} />);
    expect(screen.getByTestId("donaciones-total")).toHaveTextContent(/25,00\s?€/);
    expect(screen.getByTestId("donaciones-total")).toHaveTextContent(/2 donaciones confirmadas, 1 reembolsada/);
  });

  it("sin donaciones no inventa nada", () => {
    render(<DonacionesEstado {...base} donaciones={[]} enlaces={[]} />);
    expect(screen.getByTestId("donaciones-total")).toHaveTextContent("Aún no hay donaciones confirmadas por Stripe.");
    expect(screen.getByText(/Todavía no hay enlaces/)).toBeInTheDocument();
  });

  it("si faltan las tablas, lo dice", () => {
    render(<DonacionesEstado {...base} sinTablaDonaciones sinTablaEnlaces donaciones={[]} enlaces={[]} />);
    expect(screen.getAllByTestId("aviso-sin-tabla")).toHaveLength(2);
  });

  it("un enlace sin confirmar no se comparte y un dueño puede confirmarlo", async () => {
    const confirmar = vi.fn(async () => ({ ok: true }));
    const alCambiar = vi.fn();
    render(<DonacionesEstado {...base} confirmar={confirmar} alCambiar={alCambiar} donaciones={[]} enlaces={[enlace()]} />);
    expect(screen.getByText("Sin confirmar: no se comparte")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://donate.stripe.com/abc123" })).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(screen.getByRole("button", { name: /Confirmar enlace/ }));
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith("e1", true));
    await waitFor(() => expect(alCambiar).toHaveBeenCalled());
  });

  it("un enlace confirmado se puede retirar; quien no es dueño no ve el botón", async () => {
    const confirmar = vi.fn(async () => ({ ok: true }));
    const activo = enlace({ activo: true, confirmado_por: "u1", confirmado_en: "2026-10-10T09:00:00Z" });
    const { rerender } = render(<DonacionesEstado {...base} confirmar={confirmar} donaciones={[]} enlaces={[activo]} />);
    expect(screen.getByText("Confirmado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retirar/ }));
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith("e1", false));
    rerender(
      <AppearanceProvider>
        <DonacionesEstado {...base} esDueno={false} confirmar={confirmar} donaciones={[]} enlaces={[activo]} />
      </AppearanceProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("nunca enlaza una dirección que no sea https", () => {
    render(<DonacionesEstado {...base} donaciones={[]} enlaces={[enlace({ url: "javascript:alert(1)" })]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
