/**
 * Rescate RTIMN1021I (rama nube/40145158800) de las tarjetas de la Guía de la
 * red, adaptado a la API de hoy (`AreasExplicadas`): cada tarjeta abre su
 * ventana con la explicación del área, un área sin texto propio cae al caso
 * genérico, «Ir a …» lleva a la ruta y «Cerrar» cierra.
 *
 * Descartados del original, contratos que main cambió a propósito:
 * · «Cerebro apunta a /cerebro y /cerebros no está»: la guía usa /cerebros
 *   (label «Cerebros», ruta real del rito).
 * · Prohibir el texto «varios cerebros»: la explicación de /cerebros lo dice
 *   como capacidad real («Puedes tener varios cerebros…», a propósito).
 * · Temas por clave (temaDeRuta, TODOS_LOS_TEMAS, preguntaAurora): la API de
 *   hoy es «Qué es · Cómo funciona · Empieza por».
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Compass, Network } from "lucide-react";

import { AreasExplicadas, type AreaTip } from "../areas-explicadas";
import { AppearanceProvider } from "@/context/appearance-context";

const onIr = vi.fn();
const AREAS: AreaTip[] = [
  { path: "/cerebros", label: "Cerebros", icon: Network, accent: "text-cyan-300", tip: "Conectar: enlaza memorias y skills en un grafo vivo." },
  { path: "/aun-sin-texto", label: "Pendiente", icon: Compass, accent: "text-white/60", tip: "Prueba: área nueva sin texto propio." },
];

const abri = (label: string) => {
  fireEvent.click(screen.getByText(label));
};

afterEach(cleanup);

describe("Guía de la red · ventana de cada tarjeta (rescate RTIMN1021I)", () => {
  it("abrir una tarjeta muestra la explicación del área y «Ir a …» lleva a la ruta", async () => {
    render(<AppearanceProvider><AreasExplicadas areas={AREAS} onIr={onIr} /></AppearanceProvider>);
    abri("Cerebros");
    expect(await screen.findByText(/El grafo vivo de tu conocimiento/)).toBeInTheDocument();
    expect(screen.getByText("Cómo funciona")).toBeInTheDocument();
    expect(screen.getByText("El grafo se recalcula solo cuando añades o quitas piezas.")).toBeInTheDocument();
    expect(screen.getByText("Abre tu cerebro principal y comprueba qué memorias ya tiene enlazadas.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir a Cerebros" }));
    expect(onIr).toHaveBeenCalledWith("/cerebros");
    await waitFor(() => expect(screen.queryByText(/El grafo vivo de tu conocimiento/)).toBeNull());
  });

  it("un área sin texto propio cae al caso genérico y «Cerrar» cierra sin ir a nada", async () => {
    render(<AppearanceProvider><AreasExplicadas areas={AREAS} onIr={onIr} /></AppearanceProvider>);
    abri("Pendiente");
    const dialogo = within(await screen.findByRole("dialog"));
    expect(dialogo.getByText("Entra y explora: la zona se explica sola con sus propias vistas.")).toBeInTheDocument();
    expect(dialogo.getByText("Prueba: área nueva sin texto propio.")).toBeInTheDocument(); // el «Qué es» lo trae el tip
    expect(dialogo.getByText("Abre Pendiente y mira a tu alrededor sin miedo.")).toBeInTheDocument();
    const antes = onIr.mock.calls.length;
    // La ventana trae dos «Cerrar» (la X del diálogo del OS y el botón del pie); con cualquiera se cierra.
    fireEvent.click(dialogo.getAllByRole("button", { name: "Cerrar" })[0]!);
    await waitFor(() => expect(screen.queryByText(/mira a tu alrededor/)).toBeNull());
    expect(onIr.mock.calls.length).toBe(antes);
  });
});
