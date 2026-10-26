/** Permisos directos y registro de usos: la parte de la interfaz que da y enseña el poder sin votación (Ola 1026P · P2). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PermisosDirectos } from "../permisos-directos";
import { RegistroUsos } from "../registro-usos";
import { decidirCambioConReglas } from "@/lib/protomolecula/gobierno/decision";
import { olvidarUsos, registrarUsoPermiso } from "@/lib/protomolecula/gobierno/registro";
import { MS_DIA, conPermiso, crearPermiso, reglasPorDefecto, type PermisoDirecto, type ReglasProtomolecula } from "@/lib/protomolecula/gobierno/reglas";
import type { ActorProto, ContextoProto } from "@/lib/protomolecula/peticion/contrato";

const AHORA = 1_800_000_000_000;
const base = (): ReglasProtomolecula => reglasPorDefecto("grupo");

beforeEach(() => {
  olvidarUsos();
  window.localStorage.clear();
});
afterEach(() => cleanup());

function montar(reglas = base(), extra: Partial<React.ComponentProps<typeof PermisosDirectos>> = {}) {
  const onCambiar = vi.fn();
  const cargarPersonas = vi.fn(async () => [{ id: "u-ana", nombre: "Ana" }, { id: "u-leo", nombre: "Leo" }]);
  render(<PermisosDirectos reglas={reglas} onCambiar={onCambiar} concedidoPor="u-dueno" cargarPersonas={cargarPersonas} editable ahora={AHORA} {...extra} />);
  return { onCambiar, cargarPersonas };
}

describe("PermisosDirectos", () => {
  it("sin permisos lo dice, y nunca ofrece reglas ni permisos como tipos delegables", () => {
    montar();
    expect(screen.getByTestId("permisos-vacio")).toHaveTextContent(/nadie tiene un permiso directo/);
    const tipos = within(screen.getByRole("group", { name: "Para qué tipos de cambio" })).getAllByRole("checkbox").map((c) => c.textContent);
    expect(tipos).toEqual(["Contenido", "Diseño", "Funciones", "Creación"]);
  });

  it("pide elegir al menos un tipo antes de añadir", () => {
    const { onCambiar } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Añadir permiso/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/para qué tipos/i);
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it("da un permiso a un rol con caducidad: lo anota quién lo concede y hasta cuándo vale", () => {
    const { onCambiar } = montar();
    fireEvent.change(screen.getByLabelText("Desde el rol"), { target: { value: "gestion" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Diseño" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Funciones" }));
    fireEvent.change(screen.getByLabelText("Vigencia"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Motivo (opcional)"), { target: { value: "Semana de montaje" } });
    fireEvent.click(screen.getByRole("button", { name: /Añadir permiso/ }));
    expect(onCambiar).toHaveBeenCalledTimes(1);
    const nuevas = onCambiar.mock.calls[0][0] as ReglasProtomolecula;
    expect(nuevas.permisosDirectos).toHaveLength(1);
    expect(nuevas.permisosDirectos[0]).toMatchObject({
      sujeto: { tipo: "rol", desde: "gestion" }, tipos: ["diseno", "funciones"], concedidoPor: "u-dueno", motivo: "Semana de montaje", caduca: AHORA + 7 * MS_DIA,
    });
  });

  it("sin caducidad, no pone fecha", () => {
    const { onCambiar } = montar();
    fireEvent.click(screen.getByRole("checkbox", { name: "Contenido" }));
    fireEvent.change(screen.getByLabelText("Vigencia"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Añadir permiso/ }));
    expect((onCambiar.mock.calls[0][0] as ReglasProtomolecula).permisosDirectos[0].caduca).toBeUndefined();
  });

  it("a una persona: la elige de la lista de la entidad", async () => {
    const { onCambiar, cargarPersonas } = montar();
    fireEvent.change(screen.getByLabelText("A quién"), { target: { value: "persona" } });
    const lista = await screen.findByLabelText("Persona");
    expect(cargarPersonas).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Creación" }));
    fireEvent.click(screen.getByRole("button", { name: /Añadir permiso/ }));
    expect(screen.getByRole("alert")).toHaveTextContent(/qué persona/i);
    fireEvent.change(lista, { target: { value: "u-leo" } });
    fireEvent.click(screen.getByRole("button", { name: /Añadir permiso/ }));
    const p = (onCambiar.mock.calls[0][0] as ReglasProtomolecula).permisosDirectos[0];
    expect(p.sujeto).toMatchObject({ tipo: "persona", usuarioId: "u-leo", nombre: "Leo" });
    expect(p.tipos).toEqual(["creacion"]);
  });

  it("si no se pueden leer las personas, deja escribir el identificador y lo dice", async () => {
    const { onCambiar } = montar(base(), { cargarPersonas: async () => [] });
    fireEvent.change(screen.getByLabelText("A quién"), { target: { value: "persona" } });
    expect(await screen.findByText(/No pude leer las personas/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Identificador de la cuenta"), { target: { value: "u-nueva" } });
    fireEvent.change(screen.getByLabelText(/Su nombre/), { target: { value: "Nora" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Contenido" }));
    fireEvent.click(screen.getByRole("button", { name: /Añadir permiso/ }));
    expect((onCambiar.mock.calls[0][0] as ReglasProtomolecula).permisosDirectos[0].sujeto).toMatchObject({ usuarioId: "u-nueva", nombre: "Nora" });
  });

  it("enseña cada permiso con su vigencia, y el caducado como caducado; se puede quitar", () => {
    const vivo = crearPermiso({ sujeto: { tipo: "rol", desde: "colaboracion" }, tipos: ["contenido"], concedidoPor: "u-dueno", dias: 30 }, AHORA) as PermisoDirecto;
    const caducado = crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u-ana", nombre: "Ana" }, tipos: ["diseno"], concedidoPor: "u-dueno", dias: 1 }, AHORA - 5 * MS_DIA) as PermisoDirecto;
    const reglas = conPermiso(conPermiso(base(), vivo), caducado);
    const { onCambiar } = montar(reglas);
    expect(screen.getByTestId(`permiso-${vivo.id}`)).toHaveTextContent(/hasta el/);
    expect(screen.getByTestId(`permiso-${caducado.id}`)).toHaveTextContent(/caducó el/);
    fireEvent.click(screen.getByRole("button", { name: /Quitar el permiso de Ana/ }));
    const nuevas = onCambiar.mock.calls[0][0] as ReglasProtomolecula;
    expect(nuevas.permisosDirectos.map((p) => p.id)).toEqual([vivo.id]);
  });

  it("sin permiso para editar solo se mira: ni formulario ni botón de quitar", () => {
    const p = crearPermiso({ sujeto: { tipo: "rol", desde: "miembros" }, tipos: ["contenido"], concedidoPor: null }, AHORA) as PermisoDirecto;
    montar(conPermiso(base(), p), { editable: false });
    expect(screen.queryByText("Dar un permiso directo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar/ })).not.toBeInTheDocument();
    expect(screen.getByTestId(`permiso-${p.id}`)).toBeInTheDocument();
  });
});

describe("RegistroUsos", () => {
  const E = { tipo: "grupo" as const, id: "semilla" };
  const ctx: ContextoProto = { ruta: "", ambito: "grupo", gobernadaPor: E };
  const ana: ActorProto = { usuarioId: "u-ana", rol: "observador", esDueno: false, origen: "humano" };
  const permiso = crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u-ana", nombre: "Ana" }, tipos: ["contenido"], concedidoPor: "u-dueno" }, AHORA) as PermisoDirecto;
  const reglas = conPermiso(base(), permiso);

  it("vacío dice que nadie ha usado un permiso y dónde se guarda el registro", () => {
    render(<RegistroUsos entidad={E} />);
    expect(screen.getByTestId("registro-usos")).toHaveTextContent(/Todavía nadie ha usado un permiso directo/);
    expect(screen.getByTestId("registro-usos")).toHaveTextContent(/se guarda en este aparato/);
  });

  it("enseña quién, qué tipo, cuándo y con qué origen, lo más reciente primero", async () => {
    const v = decidirCambioConReglas(ctx, ana, "contenido", { reglas, ahora: AHORA });
    expect(v.via).toBe("permiso-directo");
    registrarUsoPermiso(E, ana, "contenido", v, "Cambió el texto de bienvenida", "Ana", AHORA);
    const ia = decidirCambioConReglas(ctx, { ...ana, origen: "ia" }, "contenido", { reglas, ahora: AHORA });
    registrarUsoPermiso(E, { ...ana, origen: "ia" }, "contenido", ia, "Aurora retocó un título", "Ana", AHORA + 60_000);
    render(<RegistroUsos entidad={E} />);
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/Aurora retocó un título.*una IA, confirmada por la persona/);
    expect(items[1]).toHaveTextContent(/Ana.*contenido.*Cambió el texto de bienvenida.*una persona/);
  });

  it("se refresca cuando cambia la versión (un uso nuevo)", async () => {
    const { rerender } = render(<RegistroUsos entidad={E} version={0} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    const v = decidirCambioConReglas(ctx, ana, "contenido", { reglas, ahora: AHORA });
    registrarUsoPermiso(E, ana, "contenido", v, "Otro cambio", undefined, AHORA);
    rerender(<RegistroUsos entidad={E} version={1} />);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByRole("listitem")).toHaveTextContent(/Cuenta u-ana/);
  });

  it("no mezcla los usos de otra entidad", () => {
    const v = decidirCambioConReglas(ctx, ana, "contenido", { reglas, ahora: AHORA });
    registrarUsoPermiso({ tipo: "grupo", id: "otro" }, ana, "contenido", v, "De otro grupo", undefined, AHORA);
    render(<RegistroUsos entidad={E} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
