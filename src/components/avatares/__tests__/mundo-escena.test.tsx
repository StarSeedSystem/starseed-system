/**
 * La escena 3D y el habitante · Ola 1025U · U1. Sin WebGL: `@react-three/fiber` y `@react-three/drei` se sustituyen por
 * piezas de DOM, y los elementos de three (`mesh`, `group`…) caen como etiquetas desconocidas de React DOM, que basta para
 * comprobar QUÉ se monta y DÓNDE.
 *
 * El defecto central: `AvatarVivo` es DOM (un `<div>`) y estaba dentro del `<Canvas>` sin `<Html>`; R3F lo rechaza. Aquí se
 * prueba que la tarjeta DOM del habitante vive SIEMPRE dentro de `Html`, y que en un visor (VR/AR), donde el DOM no se ve,
 * el habitante es un cuerpo 3D sin DOM.
 */
import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-three/fiber", () => ({ useFrame: vi.fn(), useThree: vi.fn() }));
vi.mock("@react-three/drei", () => ({
  Html: (p: { children?: React.ReactNode }) => <div data-testid="html-drei">{p.children}</div>,
  Line: (p: { points: unknown[]; color: string }) => <i data-testid="linea-vinculo" data-color={p.color} data-puntos={p.points.length} />,
  OrbitControls: () => <i data-testid="orbit" />,
  Sparkles: (p: { speed?: number }) => <i data-testid="sparkles" data-speed={p.speed} />,
  Stars: (p: { speed?: number }) => <i data-testid="stars" data-speed={p.speed} />,
}));
vi.mock("../avatar-vivo", () => ({
  AvatarVivo: (p: { gesto?: { prompt: string } | null }) => <div data-testid="avatar-vivo">{p.gesto?.prompt}</div>,
}));

import { EscenaMundo } from "../mundo/escena-mundo";
import { Habitante3D, TarjetaHabitante } from "../mundo/habitante-3d";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { avanzar, mundoInicial, type HabitanteMundo } from "@/lib/avatares/mundo/simulacion";
import { disponerZonas, ocupantesPorZona, radioDelSuelo, SUELO_Y } from "@/lib/avatares/mundo/zonas";
import { ZONAS_POR_DEFECTO } from "@/lib/avatares/mundo/escenarios";
import { gestoParaOcupacion } from "@/lib/avatares/mundo/gestos";

const fuente = { tipo: "procedural" as const, svg: "data:image/svg+xml;utf8,<svg/>" };
const gesto = gestoParaOcupacion({ energia: 0.8, humor: "feliz", ocupacion: "conversar" });
const habitante = (extra: Partial<HabitanteMundo> = {}): HabitanteMundo => ({
  id: "bot:b1",
  personalidadId: "b1",
  nombre: "Guía del círculo",
  posicion: [2, 0.3, -1],
  energia: 0.8,
  humor: "feliz",
  ocupacion: "conversar",
  obras: 0,
  vinculos: {},
  zonaId: null,
  ...extra,
});

beforeEach(() => {
  // React DOM protesta de `<group position=[…]>`: es esperado en este entorno, no el defecto que se prueba.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TarjetaHabitante · nombre y chapa «Bot de IA»", () => {
  it("lleva el nombre, la chapa y una etiqueta accesible con el origen", () => {
    render(<TarjetaHabitante nombre="Aurora" fuente={fuente} gesto={gesto} resaltado={false} atenuado={false} origen="Personalidad de tu cuenta" onElegir={() => undefined} />);
    expect(screen.getByTestId("nombre-habitante").textContent).toBe("Aurora");
    expect(screen.getByTestId("chapa-bot-ia").textContent).toBe("Bot de IA");
    const tarjeta = screen.getByRole("button", { name: /Aurora\. Bot de IA\. Personalidad de tu cuenta/ });
    expect(tarjeta.getAttribute("tabindex")).toBe("0");
    // Objetivo táctil de 44 px como mínimo.
    expect(tarjeta.className).toMatch(/min-h-11/);
    expect(tarjeta.className).toMatch(/min-w-11/);
  });

  it("se elige con clic, con Intro y con Espacio (teclado y lector de pantalla)", () => {
    const onElegir = vi.fn();
    render(<TarjetaHabitante nombre="Aurora" fuente={fuente} gesto={gesto} resaltado={false} atenuado={false} origen="x" onElegir={onElegir} />);
    const tarjeta = screen.getByTestId("habitante-mundo");
    fireEvent.click(tarjeta);
    fireEvent.keyDown(tarjeta, { key: "Enter" });
    fireEvent.keyDown(tarjeta, { key: " " });
    fireEvent.keyDown(tarjeta, { key: "a" });
    expect(onElegir).toHaveBeenCalledTimes(3);
  });
});

describe("Habitante3D · el DOM va dentro de <Html>", () => {
  it("la tarjeta (AvatarVivo, nombre, chapa) vive dentro de Html, nunca suelta en el lienzo", () => {
    render(<Habitante3D habitante={habitante()} fuente={fuente} gesto={gesto} origen="Bot de una entidad" resaltado={false} atenuado={false} enXR={false} onElegir={() => undefined} />);
    const html = screen.getByTestId("html-drei");
    expect(within(html).getByTestId("habitante-mundo")).toBeTruthy();
    expect(within(html).getByTestId("avatar-vivo")).toBeTruthy();
    expect(within(html).getByTestId("chapa-bot-ia")).toBeTruthy();
    // Y no hay ninguna tarjeta fuera de Html.
    expect(screen.getAllByTestId("habitante-mundo")).toHaveLength(1);
  });

  it("elegirlo devuelve el id del habitante", () => {
    const onElegir = vi.fn();
    render(<Habitante3D habitante={habitante()} fuente={fuente} gesto={gesto} origen="x" resaltado={false} atenuado={false} enXR={false} onElegir={onElegir} />);
    fireEvent.click(screen.getByTestId("habitante-mundo"));
    expect(onElegir).toHaveBeenCalledWith("bot:b1");
  });

  it("dentro de un visor el habitante es un cuerpo 3D: sin Html y sin DOM", () => {
    render(<Habitante3D habitante={habitante()} fuente={fuente} gesto={gesto} origen="x" resaltado={false} atenuado={false} enXR={true} onElegir={() => undefined} />);
    expect(screen.queryByTestId("html-drei")).toBeNull();
    expect(screen.queryByTestId("habitante-mundo")).toBeNull();
  });

  it("se posa sobre el suelo: caminar no lo saca de él ni lo hunde", () => {
    const { container } = render(
      <Habitante3D habitante={habitante({ posicion: [1, -8, 2] })} fuente={fuente} gesto={gesto} origen="x" resaltado={false} atenuado={false} enXR={false} onElegir={() => undefined} />,
    );
    const [x, y, z] = (container.querySelector("group")?.getAttribute("position") ?? "").split(",").map(Number);
    expect(x).toBe(1);
    expect(z).toBe(2);
    expect(y).toBeGreaterThan(SUELO_Y);
  });
});

describe("EscenaMundo", () => {
  const refs = (estado: ReturnType<typeof mundoInicial>) =>
    new Map<string, AgenteMundoRef>(
      estado.habitantes.map((h) => [h.id, crearAgenteMundoRef({ origen: "bot", idOrigen: h.personalidadId, nombre: h.nombre, dueno: { tipo: "grupo", id: "g1" } })] as const),
    );

  function escena(over: Partial<React.ComponentProps<typeof EscenaMundo>> = {}, n = 4, pasos = 0) {
    let estado = mundoInicial(Array.from({ length: n }, (_, i) => ({ id: `b${i}`, nombre: `Bot ${i}`, agenteId: `bot:b${i}` })));
    if (pasos > 0) estado = avanzar(estado, pasos);
    const disposicion = disponerZonas(ZONAS_POR_DEFECTO, ocupantesPorZona(estado.habitantes));
    const props: React.ComponentProps<typeof EscenaMundo> = {
      estado,
      disposicion,
      radioSuelo: radioDelSuelo(disposicion),
      refs: refs(estado),
      fuentes: new Map(),
      fuenteSinAvatar: fuente,
      reducido: false,
      enXR: false,
      centradoId: null,
      onElegir: () => undefined,
      controlsRef: { current: null },
      ...over,
    };
    return { props, ...render(<EscenaMundo {...props} />) };
  }

  it("monta un habitante por cada uno del estado, cada uno con su tarjeta dentro de Html", () => {
    escena({}, 5);
    expect(screen.getAllByTestId("habitante-mundo")).toHaveLength(5);
    expect(screen.getAllByTestId("chapa-bot-ia")).toHaveLength(5);
    for (const t of screen.getAllByTestId("habitante-mundo")) expect(t.closest('[data-testid="html-drei"]')).not.toBeNull();
  });

  it("pinta las cuatro zonas del escenario con su nombre y cuánta gente tienen", () => {
    escena({}, 4, 30);
    const etiquetas = screen.getAllByTestId("etiqueta-zona").map((e) => e.textContent ?? "");
    expect(etiquetas).toHaveLength(4);
    for (const nombre of ["Ágora", "Taller", "Biblioteca", "Sueños"]) expect(etiquetas.some((t) => t.startsWith(nombre))).toBe(true);
    const total = etiquetas.reduce((suma, t) => suma + Number(t.split("·")[1]), 0);
    expect(total).toBeLessThanOrEqual(4);
  });

  it("en un visor no hay etiquetas DOM de zona ni tarjetas", () => {
    escena({ enXR: true });
    expect(screen.queryAllByTestId("etiqueta-zona")).toHaveLength(0);
    expect(screen.queryAllByTestId("habitante-mundo")).toHaveLength(0);
  });

  it("solo dibuja líneas entre quienes tienen un vínculo fuerte (≥ 0,6), una por pareja", () => {
    const base = mundoInicial([
      { id: "a", nombre: "A", agenteId: "bot:a" },
      { id: "b", nombre: "B", agenteId: "bot:b" },
      { id: "c", nombre: "C", agenteId: "bot:c" },
    ]);
    const [a, b, c] = base.habitantes;
    a.vinculos = { [b.id]: 0.9, [c.id]: 0.3 };
    b.vinculos = { [a.id]: 0.9 };
    const disposicion = disponerZonas(ZONAS_POR_DEFECTO, new Map());
    render(
      <EscenaMundo
        estado={base}
        disposicion={disposicion}
        radioSuelo={radioDelSuelo(disposicion)}
        refs={refs(base)}
        fuentes={new Map()}
        fuenteSinAvatar={fuente}
        reducido={false}
        enXR={false}
        centradoId={null}
        onElegir={() => undefined}
        controlsRef={{ current: null }}
      />,
    );
    // Los bordes de las zonas también son líneas, pero con muchos puntos; un vínculo tiene exactamente dos.
    const lineas = screen.getAllByTestId("linea-vinculo").filter((l) => l.getAttribute("data-puntos") === "2");
    expect(lineas).toHaveLength(1);
    expect(lineas[0].getAttribute("data-color")).toBe("#fbbf24"); // > 0,85: ámbar
  });

  it("el centrado resalta a uno y atenúa a los demás", () => {
    const { props } = escena({}, 3);
    cleanup();
    render(<EscenaMundo {...props} centradoId={props.estado.habitantes[1].id} />);
    const tarjetas = screen.getAllByTestId("habitante-mundo");
    expect(tarjetas.map((t) => t.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(tarjetas[0].style.opacity).toBe("0.5");
    expect(tarjetas[1].style.opacity).toBe("1");
  });

  it("con movimiento reducido las estrellas y las chispas quedan quietas", () => {
    escena({ reducido: true });
    expect(screen.getByTestId("stars").getAttribute("data-speed")).toBe("0");
    expect(screen.getByTestId("sparkles").getAttribute("data-speed")).toBe("0");
    cleanup();
    escena({ reducido: false });
    expect(Number(screen.getByTestId("stars").getAttribute("data-speed"))).toBeGreaterThan(0);
    expect(Number(screen.getByTestId("sparkles").getAttribute("data-speed"))).toBeGreaterThan(0);
  });
});
