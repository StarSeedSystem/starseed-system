/**
 * Selector y gestor de escenarios · Ola 1025U · U1: escenarios sin tope (crear, renombrar, duplicar, borrar con
 * confirmación), visibilidad con su camino de sincronía, zonas y guardado en este aparato. Con el hook real
 * (`useEscenarios`) y el componente real: lo que se prueba es lo que la persona toca.
 */
import * as React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SelectorEscenario } from "../mundo/selector-escenario";
import { useEscenarios } from "../mundo/use-escenarios";
import { CLAVE_ESCENARIOS, MAX_ZONAS } from "@/lib/avatares/mundo/escenarios";
import { cargarMundo, guardarMundo, mundoInicial } from "@/lib/avatares/mundo/simulacion";
import type { EntidadMundo } from "@/lib/avatares/mundo/habitantes-cuenta";
import type { Alcanzabilidad } from "@/lib/salas/sala";

const CON_INTERNET: Alcanzabilidad = { internet: true, servidorPrivado: false, malla: false };
const GRUPOS: EntidadMundo[] = [
  { tipo: "grupo", id: "g1", nombre: "Círculo de la Aurora" },
  { tipo: "pagina", id: "pg2", nombre: "Radio libre" },
];

function Arnes({ entidades = [], alcance = CON_INTERNET }: { entidades?: EntidadMundo[]; alcance?: Alcanzabilidad }) {
  const uso = useEscenarios();
  return (
    <>
      <SelectorEscenario uso={uso} entidades={entidades} alcance={alcance} />
      <output data-testid="activo-id">{uso.activo.id}</output>
      <output data-testid="guardado">{String(uso.guardado)}</output>
    </>
  );
}

const abrir = () => fireEvent.click(screen.getByTestId("selector-escenario"));
const nombreActivo = () => screen.getByTestId("nombre-escenario-activo").textContent;
const opciones = () => screen.getAllByTestId("opcion-escenario").map((o) => o.textContent ?? "");

function crear(nombre: string) {
  fireEvent.change(screen.getByLabelText("Nombre del escenario nuevo"), { target: { value: nombre } });
  fireEvent.click(screen.getByRole("button", { name: /Crear/ }));
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("abrir y cerrar", () => {
  it("el botón muestra el escenario activo y abre la lista; Escape y pulsar fuera la cierran", () => {
    render(<Arnes />);
    expect(nombreActivo()).toBe("Mi mundo");
    const boton = screen.getByTestId("selector-escenario");
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    abrir();
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("panel-escenarios").getAttribute("role")).toBe("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("panel-escenarios")).toBeNull();
    abrir();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("panel-escenarios")).toBeNull();
  });

  it("los objetivos táctiles miden al menos 44 px", () => {
    render(<Arnes />);
    expect(screen.getByTestId("selector-escenario").className).toMatch(/min-h-11/);
    abrir();
    for (const nombre of [/Renombrar/, /Duplicar/, /Borrar/, /Crear/]) expect(screen.getByRole("button", { name: nombre }).className).toMatch(/min-h-11/);
    for (const o of screen.getAllByTestId("opcion-escenario")) expect(o.className).toMatch(/min-h-11/);
  });
});

describe("crear, renombrar y duplicar", () => {
  it("crear deja activo el nuevo y se guarda en este aparato", () => {
    render(<Arnes />);
    abrir();
    crear("Taller de ideas");
    expect(nombreActivo()).toBe("Taller de ideas");
    expect(opciones()).toHaveLength(2);
    expect(localStorage.getItem(CLAVE_ESCENARIOS)).toContain("Taller de ideas");
  });

  it("no hay tope: quince escenarios seguidos y el contador los cuenta", () => {
    render(<Arnes />);
    abrir();
    for (let i = 0; i < 15; i++) crear(`Mundo ${i}`);
    expect(opciones()).toHaveLength(16);
    expect(screen.getByText(/Tus escenarios · 16/)).toBeTruthy();
  });

  it("sin nombre no se crea y se dice por qué", () => {
    render(<Arnes />);
    abrir();
    // El botón «Crear» va desactivado sin nombre; un nombre de solo espacios lo rechaza la operación y avisa.
    expect((screen.getByRole("button", { name: /Crear/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nombre del escenario nuevo"), { target: { value: "   " } });
    fireEvent.submit(screen.getByLabelText("Nombre del escenario nuevo").closest("form") as HTMLFormElement);
    expect(opciones()).toHaveLength(1);
    expect(screen.getByTestId("aviso-escenarios").textContent).toMatch(/nombre/i);
  });

  it("renombrar cambia el nombre; vacío no lo cambia", () => {
    render(<Arnes />);
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Renombrar/ }));
    const campo = screen.getByLabelText("Nombre del escenario");
    fireEvent.change(campo, { target: { value: "Mi taller" } });
    fireEvent.submit(campo.closest("form") as HTMLFormElement);
    expect(nombreActivo()).toBe("Mi taller");

    fireEvent.click(screen.getByRole("button", { name: /Renombrar/ }));
    const otro = screen.getByLabelText("Nombre del escenario");
    fireEvent.change(otro, { target: { value: "  " } });
    fireEvent.submit(otro.closest("form") as HTMLFormElement);
    expect(nombreActivo()).toBe("Mi taller");
    expect(screen.getByTestId("aviso-escenarios")).toBeTruthy();
  });

  it("duplicar añade una copia privada y la deja activa", () => {
    render(<Arnes />);
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: /Público/ }));
    fireEvent.click(screen.getByRole("button", { name: /Duplicar/ }));
    expect(opciones()).toHaveLength(2);
    expect(nombreActivo()).toMatch(/copia/);
    expect(screen.getByRole("radio", { name: /Privado/ }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("borrar con confirmación", () => {
  it("pide confirmación; cancelar no borra y confirmar borra y olvida su mundo guardado", () => {
    render(<Arnes />);
    abrir();
    crear("Para borrar");
    const id = screen.getByTestId("activo-id").textContent as string;
    guardarMundo(mundoInicial([{ id: "a", nombre: "A" }]), id);
    expect(cargarMundo(id, { recuperarAusencia: false })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Borrar/ }));
    const aviso = screen.getByTestId("confirmar-borrado");
    expect(aviso.textContent).toMatch(/Para borrar/);
    fireEvent.click(within(aviso).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByTestId("confirmar-borrado")).toBeNull();
    expect(opciones()).toHaveLength(2);
    expect(cargarMundo(id, { recuperarAusencia: false })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Borrar/ }));
    fireEvent.click(within(screen.getByTestId("confirmar-borrado")).getByRole("button", { name: /Sí, borrar/ }));
    expect(opciones()).toHaveLength(1);
    expect(nombreActivo()).toBe("Mi mundo");
    expect(cargarMundo(id)).toBeNull();
  });

  it("el último escenario no se puede borrar", () => {
    render(<Arnes />);
    abrir();
    expect((screen.getByRole("button", { name: /Borrar/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("visibilidad y camino", () => {
  it("cambia entre privado y público, y lo dice con honestidad: hoy no se comparte con nadie", () => {
    render(<Arnes />);
    abrir();
    expect(screen.getByRole("radio", { name: /Privado/ }).getAttribute("aria-checked")).toBe("true");
    const camino = () => screen.getByTestId("camino-escenario").textContent ?? "";
    expect(camino()).toMatch(/Ahora mismo no se comparte con nadie/);
    fireEvent.click(screen.getByRole("radio", { name: /Público/ }));
    expect(screen.getByRole("radio", { name: /Público/ }).getAttribute("aria-checked")).toBe("true");
    expect(camino()).toMatch(/un servidor público/);
    expect(screen.getByText(/personalidades personales nunca salen de tu cuenta/)).toBeTruthy();
  });

  it("sin internet, ni servidor ni malla, el camino es «solo este aparato» (lo decide elegirTransporte)", () => {
    render(<Arnes alcance={{ internet: false, servidorPrivado: false, malla: false }} />);
    abrir();
    expect(screen.getByTestId("camino-escenario").textContent).toMatch(/solo este aparato/);
  });

  it("«De un grupo» sin grupos que elegir no se activa y lo explica", () => {
    render(<Arnes entidades={[]} />);
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: /De un grupo/ }));
    expect(screen.getByRole("radio", { name: /Privado/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("sin-grupos")).toBeTruthy();
  });

  it("«De un grupo» con grupos deja elegir con cuál se comparte", () => {
    render(<Arnes entidades={GRUPOS} />);
    abrir();
    fireEvent.click(screen.getByRole("radio", { name: /De un grupo/ }));
    const lista = screen.getByLabelText("Se comparte con") as HTMLSelectElement;
    expect(lista.value).toBe("g1");
    fireEvent.change(lista, { target: { value: "pg2" } });
    expect((screen.getByLabelText("Se comparte con") as HTMLSelectElement).value).toBe("pg2");
    expect(screen.getByText(/Página · Radio libre/)).toBeTruthy();
  });

  it("un escenario nuevo de grupo lleva el grupo elegido", () => {
    render(<Arnes entidades={GRUPOS} />);
    abrir();
    fireEvent.change(screen.getByLabelText("Visibilidad del escenario nuevo"), { target: { value: "grupo" } });
    fireEvent.change(screen.getByLabelText("Grupo del escenario nuevo"), { target: { value: "pg2" } });
    crear("De la radio");
    expect(screen.getByRole("radio", { name: /De un grupo/ }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Se comparte con") as HTMLSelectElement).value).toBe("pg2");
  });
});

describe("zonas", () => {
  it("arranca con ágora, taller, biblioteca y sueños; se puede añadir una y quitarla", () => {
    render(<Arnes />);
    abrir();
    const nombres = () => screen.getAllByTestId("zona-escenario").map((z) => z.textContent ?? "");
    expect(nombres().join("|")).toMatch(/Ágora.*Taller.*Biblioteca.*Sueños/);
    fireEvent.change(screen.getByLabelText("Nombre de la zona nueva"), { target: { value: "Observatorio" } });
    fireEvent.change(screen.getByLabelText("Qué atrae a la zona"), { target: { value: "explorar" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir la zona" }));
    expect(nombres()).toHaveLength(5);
    expect(nombres().at(-1)).toMatch(/Observatorio/);
    fireEvent.click(screen.getByRole("button", { name: "Quitar la zona Observatorio" }));
    expect(nombres()).toHaveLength(4);
  });

  it("al llegar al tope de zonas el formulario se cierra y lo dice", () => {
    render(<Arnes />);
    abrir();
    for (let i = 0; i < MAX_ZONAS; i++) {
      const campo = screen.getByLabelText("Nombre de la zona nueva") as HTMLInputElement;
      if (campo.disabled) break;
      fireEvent.change(campo, { target: { value: `Zona ${i}` } });
      fireEvent.click(screen.getByRole("button", { name: "Añadir la zona" }));
    }
    expect(screen.getAllByTestId("zona-escenario")).toHaveLength(MAX_ZONAS);
    expect((screen.getByLabelText("Nombre de la zona nueva") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(new RegExp(`hasta ${MAX_ZONAS} zonas`))).toBeTruthy();
  });

  it("no deja quitar la última zona", () => {
    render(<Arnes />);
    abrir();
    for (const n of ["Ágora", "Taller", "Biblioteca"]) fireEvent.click(screen.getByRole("button", { name: `Quitar la zona ${n}` }));
    expect((screen.getByRole("button", { name: "Quitar la zona Sueños" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
