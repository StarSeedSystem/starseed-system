import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { AppearanceProvider } from "@/context/appearance-context";
import { AJUSTES_POR_DEFECTO, APLICACION, type AjustesObjetivo } from "@/lib/cerebros/ajustes";
import { AjustesSeguridad } from "../ajustes-seguridad";
import { AjustesSync } from "../ajustes-sync";
expect.extend(matchers);
afterEach(cleanup);

const montar = (el: ReactElement) => render(<AppearanceProvider>{el}</AppearanceProvider>);
const base: AjustesObjetivo = { ...AJUSTES_POR_DEFECTO, acceso: [] };
const textoMarca = (e: "se-aplica" | "solo-se-guarda") => (e === "se-aplica" ? "Se aplica ya" : "Solo se guarda por ahora");
const vinculo = {
  id: "v1", destino: { tipo: "grupo", id: "huerto" }, alcance: { completo: false, memorias: ["a.md"], carpetas: [], configuraciones: [] },
  direccion: "ambas", acceso: "leer", auto: true, estado: "activo", creadoEn: "2026-10-13T10:00:00Z", ultimaSync: null,
};

describe("AjustesSeguridad", () => {
  it("cerebro: privacidad, nota de Públicos y marcas sacadas de APLICACION", () => {
    const onCambio = vi.fn();
    montar(<AjustesSeguridad valor={base} onCambio={onCambio} nivel="cerebro" />);
    for (const t of ["Privado", "Perfil", "Grupo", "Público"]) expect(screen.getByRole("button", { name: t })).toBeInTheDocument();
    expect(screen.getByText(/pestaña Públicos/)).toBeInTheDocument();
    expect(screen.getByText(/Con Compartir o Telepatía lo leen quienes tengan permiso; escribir sigue siendo solo tuyo/)).toBeInTheDocument();
    const marcas = [APLICACION.privacidad, APLICACION.cifradoLocal, APLICACION.acceso].map(textoMarca);
    expect(screen.getAllByText(/Se aplica ya|Solo se guarda por ahora/).map((n) => n.textContent)).toEqual(marcas);
    fireEvent.click(screen.getByRole("button", { name: "Grupo" }));
    expect(onCambio).toHaveBeenCalledWith({ privacidad: "grupo" });
    // Controlado: sin que el padre cambie `valor`, sigue marcado «Privado».
    expect(screen.getByRole("button", { name: "Privado" })).toHaveAttribute("aria-pressed", "true");
  });

  it("memoria: todo «solo se guarda por ahora» y sin la nota de Públicos", () => {
    montar(<AjustesSeguridad valor={base} onCambio={vi.fn()} nivel="memoria" />);
    expect(screen.getAllByText("Solo se guarda por ahora")).toHaveLength(3);
    expect(screen.queryByText(/pestaña Públicos/)).toBeNull();
    expect(screen.getByText(/la lectura compartida es por cerebro entero/i)).toBeInTheDocument();
  });

  it("cifrado local y lista de acceso emiten solo lo que cambia", () => {
    const onCambio = vi.fn();
    const valor = { ...base, acceso: [{ quien: "account:ana", nivel: "leer" as const }] };
    montar(<AjustesSeguridad valor={valor} onCambio={onCambio} nivel="carpeta" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onCambio).toHaveBeenLastCalledWith({ cifradoLocal: true });
    expect(screen.getByText("Cuenta · ana")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nivel de Cuenta · ana"), { target: { value: "admin" } });
    expect(onCambio).toHaveBeenLastCalledWith({ acceso: [{ quien: "account:ana", nivel: "admin" }] });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Cuenta · ana" }));
    expect(onCambio).toHaveBeenLastCalledWith({ acceso: [] });
    expect(screen.getByRole("button", { name: /Añadir/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tipo de quien entra"), { target: { value: "group" } });
    fireEvent.change(screen.getByLabelText("Id o nombre"), { target: { value: " huerto " } });
    fireEvent.change(screen.getByLabelText("Nivel nuevo"), { target: { value: "escribir" } });
    fireEvent.click(screen.getByRole("button", { name: /Añadir/ }));
    expect(onCambio).toHaveBeenLastCalledWith({ acceso: [{ quien: "account:ana", nivel: "leer" }, { quien: "group:huerto", nivel: "escribir" }] });
  });
});

describe("AjustesSync", () => {
  const config = {
    memoryDestinations: { starseed: { enabled: false }, external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }] },
    telepatia: [vinculo, { id: "roto" }],
  };

  it("dirección, sincronizar solo y destinos de memory-destinations", () => {
    const onCambio = vi.fn();
    const sync = { direccion: "ambas" as const, auto: true, destinos: ["local"] };
    montar(<AjustesSync valor={{ sync }} onCambio={onCambio} cerebro={{ config }} />);
    // Dirección y «Sincronizar solo» aún no los lee nadie; los destinos sí se aplican (memoryDestinations).
    const marcas = ["Solo se guarda por ahora", "Solo se guarda por ahora", "Solo se guarda por ahora"];
    expect(screen.getAllByText(/Se aplica ya|Solo se guarda por ahora/).map((n) => n.textContent)).toEqual(marcas);
    fireEvent.click(screen.getByRole("button", { name: /Enviar/ }));
    expect(onCambio).toHaveBeenLastCalledWith({ sync: { ...sync, direccion: "enviar" } });
    fireEvent.click(screen.getByRole("switch"));
    expect(onCambio).toHaveBeenLastCalledWith({ sync: { ...sync, auto: false } });
    expect(screen.getByRole("button", { name: "Este aparato" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /StarSeed · apagado/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Syncthing \(P2P\) · apagado/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Mi servidor" }));
    expect(onCambio).toHaveBeenLastCalledWith({ sync: { ...sync, destinos: ["local", "ext1"] } });
    fireEvent.click(screen.getByRole("button", { name: "Este aparato" }));
    expect(onCambio).toHaveBeenLastCalledWith({ sync: { ...sync, destinos: [] } });
  });

  it("resume los vínculos válidos de Telepatía y abre el diálogo", () => {
    const onAbrir = vi.fn();
    montar(<AjustesSync valor={{ sync: AJUSTES_POR_DEFECTO.sync }} onCambio={vi.fn()} cerebro={{ config }} onAbrirTelepatia={onAbrir} />);
    expect(screen.getByText("1 vínculo")).toBeInTheDocument();
    expect(screen.getByText("Grupo · huerto")).toBeInTheDocument();
    expect(screen.getByText(/solo lectura · activo · 1 memorias, 0 carpetas, 0 configuraciones · última sincronización: sin medida/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Telepatía" }));
    expect(onAbrir).toHaveBeenCalledTimes(1);
  });

  it("sin vínculos ni callback: lo dice y no enseña el botón", () => {
    montar(<AjustesSync valor={{ sync: AJUSTES_POR_DEFECTO.sync }} onCambio={vi.fn()} cerebro={{ config: {} }} />);
    expect(screen.getByText("0 vínculos")).toBeInTheDocument();
    expect(screen.getByText("Este cerebro no tiene vínculos de Telepatía.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir Telepatía" })).toBeNull();
    expect(screen.getByText("Ninguno elegido.")).toBeInTheDocument();
  });
});
