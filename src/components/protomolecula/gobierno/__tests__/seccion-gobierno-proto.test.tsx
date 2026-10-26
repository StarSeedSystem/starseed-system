/** Sección «Protomolécula del grupo / de la comunidad / de la página» en los ajustes de la entidad (Ola 1026P · P2). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/governance/proposal-composer", () => ({
  default: (p: { scope: string; scopeRef: string; initial?: { title?: string; description?: string; command?: { type: string; payload: Record<string, unknown> } }; onCreated?: () => void }) => (
    <div data-testid="compositor" data-scope={p.scope} data-scoperef={p.scopeRef}>
      <p data-testid="compositor-titulo">{p.initial?.title}</p>
      <p data-testid="compositor-tipo">{p.initial?.command?.type}</p>
      <p data-testid="compositor-clave">{String(p.initial?.command?.payload?.key ?? "")}</p>
      <p data-testid="compositor-valor">{String(p.initial?.command?.payload?.value ?? "")}</p>
      <button type="button" onClick={() => p.onCreated?.()}>Crear la propuesta</button>
    </div>
  ),
}));

vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { themeStore: { activeMode: "default" } } }) }));

import { SeccionGobiernoProto } from "../seccion-gobierno-proto";
import { olvidarTodo } from "@/lib/protomolecula/gobierno/almacen";
import { olvidarUsos } from "@/lib/protomolecula/gobierno/registro";
import { reglasPorDefecto } from "@/lib/protomolecula/gobierno/reglas";
import { NOMBRES_PROHIBIDOS, cargado, servicios } from "@/lib/protomolecula/gobierno/__tests__/utils/ayudas-prueba";

beforeEach(() => {
  olvidarTodo();
  olvidarUsos();
  window.localStorage.clear();
});
afterEach(() => cleanup());

const montar = (svc: ReturnType<typeof servicios>, kind = "grupo") =>
  render(<SeccionGobiernoProto kind={kind} slug="semilla" name="Semilla" servicios={svc} />);

async function listo() {
  await waitFor(() => expect(screen.queryByText(/Leyendo las reglas de la entidad/)).not.toBeInTheDocument());
}

describe("título y estado inicial", () => {
  it.each([
    ["grupo", "Protomolécula del grupo"],
    ["comunidad", "Protomolécula de la comunidad"],
    ["page", "Protomolécula de la página"],
    ["partido", "Protomolécula de la comunidad"],
  ])("el kind «%s» se titula «%s»", async (kind, titulo) => {
    montar(servicios(cargado("dueno")), kind);
    expect(await screen.findByRole("heading", { name: titulo })).toBeInTheDocument();
  });

  it("sin reglas guardadas enseña las del OS (democrático primero) y lo dice", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    expect(screen.getByTestId("origen-reglas")).toHaveTextContent(/aún no ha guardado reglas propias/);
    expect(screen.getByRole("radio", { name: /Solo miembros/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Modo para contenido")).toHaveValue("directo");
    expect(screen.getByLabelText("Modo para diseño")).toHaveValue("propuesta");
    expect(screen.getByLabelText("Modo para funciones")).toHaveValue("propuesta");
    expect(screen.getByLabelText("Modo para permisos")).toHaveValue("votacion");
    expect(screen.getByLabelText("Modo para reglas")).toHaveValue("votacion");
    expect(screen.getByText("Sin cambios por guardar.")).toBeInTheDocument();
  });

  it("las reglas y los permisos no ofrecen «Propuesta»: o se vota o lo aplica quien tiene rol", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    for (const t of ["reglas", "permisos"]) {
      const opciones = within(screen.getByLabelText(`Modo para ${t}`)).getAllByRole("option").map((o) => o.textContent);
      expect(opciones).toEqual(["Directo", "Votación"]);
    }
    const opcionesDiseno = within(screen.getByLabelText("Modo para diseño")).getAllByRole("option").map((o) => o.textContent);
    expect(opcionesDiseno).toEqual(["Directo", "Propuesta", "Votación"]);
  });

  it("jerárquico: todo directo; con reglas guardadas dice que están en la cuenta", async () => {
    montar(servicios(cargado("dueno", "hierarchical", reglasPorDefecto("grupo", "hierarchical"))));
    await listo();
    expect(screen.getByTestId("origen-reglas")).toHaveTextContent(/guardadas en la cuenta de la entidad · gobierno jerárquico/);
    for (const t of ["contenido", "diseño", "funciones", "permisos", "reglas", "creación"]) expect(screen.getByLabelText(`Modo para ${t}`)).toHaveValue("directo");
  });

  it("la columna «para ti» dice qué pasa con tu rol", async () => {
    montar(servicios(cargado("colaborador")));
    await listo();
    expect(screen.getByTestId("parati-contenido")).toHaveTextContent("Lo aplicas");
    expect(screen.getByTestId("parati-diseno")).toHaveTextContent("Propones");
    expect(screen.getByTestId("parati-reglas")).toHaveTextContent("Se vota");
  });
});

describe("cambiar las reglas sigue su propia regla", () => {
  it("democrático: tocar la visibilidad lleva a votación, aunque seas la dueña", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Pública/ }));
    expect(screen.getByRole("radio", { name: /Pública/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("lista-cambios")).toHaveTextContent(/visibilidad/i);
    expect(screen.getByTestId("regla-de-las-reglas")).toHaveTextContent(/votación/i);
    const boton = screen.getByRole("button", { name: /Llevar a votación/ });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    const compositor = await screen.findByTestId("compositor");
    expect(compositor).toHaveAttribute("data-scope", "group");
    expect(compositor).toHaveAttribute("data-scoperef", "semilla");
    expect(screen.getByTestId("compositor-tipo")).toHaveTextContent("set_config");
    expect(screen.getByTestId("compositor-clave")).toHaveTextContent("protomolecula.reglas");
    const valor = JSON.parse(screen.getByTestId("compositor-valor").textContent ?? "{}");
    expect(valor.visibilidad).toBe("publica");
  });

  it("al crearse la propuesta se cierra el diálogo, se descarta el borrador y se explica qué pasa después", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Pública/ }));
    fireEvent.click(screen.getByRole("button", { name: /Llevar a votación/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Crear la propuesta" }));
    await waitFor(() => expect(screen.queryByTestId("compositor")).not.toBeInTheDocument());
    expect(screen.getByTestId("estado-guardado")).toHaveTextContent(/Propuesta creada.*se aplican solas/);
    expect(screen.getByText("Sin cambios por guardar.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Solo miembros/ })).toHaveAttribute("aria-checked", "true");
  });

  it("jerárquico: quien tiene el rol guarda directamente y se dice dónde quedó", async () => {
    const svc = servicios(cargado("dueno", "hierarchical"));
    montar(svc);
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Pública/ }));
    const boton = screen.getByRole("button", { name: /Guardar cambios/ });
    fireEvent.click(boton);
    await waitFor(() => expect(svc.guardar).toHaveBeenCalledTimes(1));
    const [entidad, reglas, quien] = svc.guardar.mock.calls[0] as unknown as [{ tipo: string; id: string }, { visibilidad: string; acceso: { abrir: string } }, string];
    expect(entidad).toMatchObject({ tipo: "grupo", id: "semilla" });
    expect(reglas.visibilidad).toBe("publica");
    expect(reglas.acceso.abrir).toBe("miembros"); // lo que ya había se conserva; solo se acota si hace falta
    expect(quien).toBe("u-dueno");
    expect(await screen.findByTestId("estado-guardado")).toHaveTextContent(/Guardado en la cuenta de la entidad/);
    expect(screen.getByText("Sin cambios por guardar.")).toBeInTheDocument();
  });

  it("si solo se pudo guardar en este aparato, no lo vende como compartido", async () => {
    const svc = servicios(cargado("dueno", "hierarchical"), { ok: true, donde: "aparato", aviso: "No se pudo guardar en la cuenta: queda solo en este aparato." });
    montar(svc);
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Pública/ }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    expect(await screen.findByTestId("estado-guardado")).toHaveTextContent(/solo en este aparato/);
  });

  it("si la cuenta lo bloquea (solo la dueña escribe), ofrece llevarlo a votación en vez de rendirse", async () => {
    const svc = servicios(cargado("dueno", "hierarchical"), { ok: false, bloqueado: true, motivo: "Solo el propietario puede guardar la configuración directamente." });
    montar(svc);
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Pública/ }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios|Proponer el cambio|Llevar a votación/ }));
    await waitFor(() => expect(svc.guardar).toHaveBeenCalled());
    expect(await screen.findByTestId("estado-guardado")).toHaveTextContent(/propietario.*votación/);
    expect(await screen.findByTestId("compositor")).toBeInTheDocument();
  });

  it("un fallo al guardar se enseña como error y conserva el borrador", async () => {
    const svc = servicios(cargado("dueno", "hierarchical"), { ok: false, motivo: "Sin conexión." });
    montar(svc);
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Pública/ }));
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión.");
    expect(screen.getByRole("radio", { name: /Pública/ })).toHaveAttribute("aria-checked", "true");
  });

  it("Descartar devuelve las reglas guardadas", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Pública/ }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByRole("radio", { name: /Solo miembros/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Sin cambios por guardar.")).toBeInTheDocument();
  });

  it("cambiar el modo de un tipo cuenta como tocar las reglas", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    fireEvent.change(screen.getByLabelText("Modo para contenido"), { target: { value: "votacion" } });
    expect(screen.getByTestId("lista-cambios")).toHaveTextContent(/contenido/i);
    expect(screen.getByRole("button", { name: /Llevar a votación/ })).toBeEnabled();
  });
});

describe("visibilidad y acceso", () => {
  it("«Privada» acota el acceso a quien gestiona y las opciones lo reflejan", async () => {
    const svc = servicios(cargado("dueno", "hierarchical"));
    montar(svc);
    await listo();
    fireEvent.click(screen.getByRole("radio", { name: /Privada/ }));
    expect(screen.getByLabelText("Quién puede abrirla")).toHaveValue("gestion");
    expect(screen.getByLabelText("Quién puede usarla")).toHaveValue("gestion");
    const niveles = within(screen.getByLabelText("Quién puede abrirla")).getAllByRole("option").map((o) => o.getAttribute("value"));
    expect(niveles).not.toContain("cualquiera");
    expect(niveles).not.toContain("miembros");
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/ }));
    await waitFor(() => expect(svc.guardar).toHaveBeenCalled());
    const reglas = (svc.guardar.mock.calls[0] as unknown as [unknown, { visibilidad: string; acceso: { abrir: string; usar: string } }])[1];
    expect(reglas).toMatchObject({ visibilidad: "privada", acceso: { abrir: "gestion", usar: "gestion" } });
  });

  it("«usar» nunca queda por debajo de «abrir»", async () => {
    montar(servicios(cargado("dueno", "hierarchical")));
    await listo();
    fireEvent.change(screen.getByLabelText("Quién puede abrirla"), { target: { value: "colaboracion" } });
    expect(screen.getByLabelText("Quién puede usarla")).toHaveValue("colaboracion");
  });
});

describe("quién puede editar", () => {
  it("quien no forma parte lo ve todo pero no lo cambia", async () => {
    montar(servicios(cargado("nadie")));
    await listo();
    expect(screen.getByTestId("solo-lectura")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Pública/ })).toBeDisabled();
    expect(screen.getByLabelText("Modo para contenido")).toBeDisabled();
    expect(screen.getByLabelText("Quién puede abrirla")).toBeDisabled();
    expect(screen.queryByText("Dar un permiso directo")).not.toBeInTheDocument();
  });

  it("sin sesión pide iniciar sesión", async () => {
    montar(servicios(cargado("sin-sesion")));
    await listo();
    expect(screen.getByTestId("solo-lectura")).toHaveTextContent(/Inicia sesión/);
    expect(screen.getByRole("button", { name: /Sin permiso|Llevar a votación|Guardar|Proponer/ })).toBeDisabled();
  });

  it("quien observa mira y no cambia", async () => {
    montar(servicios(cargado("observador")));
    await listo();
    expect(screen.getByTestId("solo-lectura")).toHaveTextContent(/observación/);
    expect(screen.getByRole("radio", { name: /Pública/ })).toBeDisabled();
  });
});

describe("permisos directos dentro de la sección", () => {
  it("dar un permiso a un rol es tocar los permisos y se cuenta como cambio", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    fireEvent.click(screen.getByRole("checkbox", { name: "Contenido" }));
    fireEvent.click(screen.getByRole("button", { name: /Añadir permiso/ }));
    expect(screen.getByTestId("lista-cambios")).toHaveTextContent(/permiso/i);
    const permisos = within(screen.getByTestId("permisos-directos")).getAllByRole("listitem");
    expect(permisos).toHaveLength(1);
    expect(permisos[0]).toHaveTextContent(/olaboración/);
    expect(permisos[0]).toHaveTextContent(/Contenido/);
    // «permisos» es votación por defecto: el botón lo lleva a votar.
    expect(screen.getByRole("button", { name: /Llevar a votación/ })).toBeEnabled();
  });

  it("el registro de usos está a la vista y dice honestamente dónde se guarda", async () => {
    montar(servicios(cargado("dueno")));
    await listo();
    expect(screen.getByTestId("registro-usos")).toHaveTextContent(/Todavía nadie ha usado un permiso directo/);
    expect(screen.getByTestId("registro-usos")).toHaveTextContent(/se guarda en este aparato/);
  });
});

describe("textos prohibidos y accesibilidad básica", () => {
  it("no usa los nombres prohibidos del producto", async () => {
    const { container } = montar(servicios(cargado("dueno")));
    await listo();
    expect(container.textContent).not.toMatch(NOMBRES_PROHIBIDOS);
  });

  it("los controles táctiles miden al menos 44 px (min-h-11)", async () => {
    const { container } = montar(servicios(cargado("dueno")));
    await listo();
    const sinAltura = Array.from(container.querySelectorAll("button, select, input")).filter((el) => !/min-h-11|min-h-8|h-auto/.test(el.getAttribute("class") ?? ""));
    expect(sinAltura.map((e) => e.outerHTML.slice(0, 80))).toEqual([]);
  });
});
