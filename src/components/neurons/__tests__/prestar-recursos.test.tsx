import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrestarRecursos } from "../prestar-recursos";

describe("PrestarRecursos", () => {
  const onChangeMock = vi.fn();

  const defaultPrefs = {
    computacion: true,
    almacenamiento: true,
    apps: [],
    ancho: 0,
    aQuien: {
      cuenta: true,
      grupos: false,
      publico: false,
    },
    topes: {
      cpu: 50,
      ram: 1024,
      disco: 2048,
      soloCargando: false,
    },
  };

  it("renders the panel with default prefs", () => {
    render(<PrestarRecursos prefs={defaultPrefs} onChange={onChangeMock} />);

    // Check title - getByText throws if not found
    screen.getByText(/prestar recursos/i);

    // Check switches are checked by default
    expect(
      screen.getByLabelText(/dejar que mis otras neuronas usen esta para calcular/i)
      .checked
    ).toBe(true);
    expect(
      screen.getByLabelText(/prestar espacio/i)
      .checked
    ).toBe(true);
    expect(
      screen.getByLabelText(/solo cuando esté cargando/i)
      .checked
    ).toBe(false);
    expect(
      screen.getByLabelText(/mi cuenta/i)
      .checked
    ).toBe(true);
    expect(
      screen.getByLabelText(/mis grupos/i)
      .checked
    ).toBe(false);
    expect(
      screen.getByLabelText(/público/i)
      .checked
    ).toBe(false);

    // Check input values
    expect(screen.getByLabelText(/ancho \(mbps\)/i)).toHaveValue("0");
    expect(screen.getByLabelText(/cpu \(%\)/i)).toHaveValue("50");
    expect(screen.getByLabelText(/ram \(mb\)/i)).toHaveValue("1024");
    expect(screen.getByLabelText(/disco \(mb\)/i)).toHaveValue("2048");
    expect(screen.getByPlaceholderText(/app1, app2, app3/i)).toHaveValue("");

    // Check warning text - getByText throws if not found
    screen.getByText(/aviso: lo privado nunca sale de la cuenta ni va a la nube compartida/i);
  });

  it("updates prefs when switches are toggled", () => {
    render(<PrestarRecursos prefs={defaultPrefs} onChange={onChangeMock} />);

    // Toggle computacion switch
    const compSwitch = screen.getByLabelText(/dejar que mis otras neuronas usen esta para calcular/i);
    fireEvent.click(compSwitch);
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ computacion: false })
    );

    // Toggle almacenamiento switch
    const storageSwitch = screen.getByLabelText(/prestar espacio/i);
    fireEvent.click(storageSwitch);
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ almacenamiento: false })
    );

    // Toggle soloCargando switch
    const chargingSwitch = screen.getByLabelText(/solo cuando esté cargando/i);
    fireEvent.click(chargingSwitch);
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topes: expect.objectContaining({ soloCargando: true }),
      })
    );

    // Toggle cuenta switch
    const cuentaSwitch = screen.getByLabelText(/mi cuenta/i);
    fireEvent.click(cuentaSwitch);
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aQuien: expect.objectContaining({ cuenta: false }),
      })
    );

    // Toggle grupos switch
    const gruposSwitch = screen.getByLabelText(/mis grupos/i);
    fireEvent.click(gruposSwitch);
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aQuien: expect.objectContaining({ grupos: true }),
      })
    );

    // Toggle público switch
    const publicoSwitch = screen.getByLabelText(/público/i);
    fireEvent.click(publicoSwitch);
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        aQuien: expect.objectContaining({ publico: true }),
      })
    );
  });

  it("updates prefs when inputs are changed", () => {
    render(<PrestarRecursos prefs={defaultPrefs} onChange={onChangeMock} />);

    // Change ancho input
    const anchoInput = screen.getByLabelText(/ancho \(mbps\)/i);
    fireEvent.change(anchoInput, { target: { value: "10" } });
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ ancho: 10 })
    );

    // Change CPU input
    const cpuInput = screen.getByLabelText(/cpu \(%\)/i);
    fireEvent.change(cpuInput, { target: { value: "80" } });
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topes: expect.objectContaining({ cpu: 80 }),
      })
    );

    // Change RAM input
    const ramInput = screen.getByLabelText(/ram \(mb\)/i);
    fireEvent.change(ramInput, { target: { value: "2048" } });
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topes: expect.objectContaining({ ram: 2048 }),
      })
    );

    // Change Disco input
    const discoInput = screen.getByLabelText(/disco \(mb\)/i);
    fireEvent.change(discoInput, { target: { value: "4096" } });
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        topes: expect.objectContaining({ disco: 4096 }),
      })
    );

    // Change apps input
    const appsInput = screen.getByPlaceholderText(/app1, app2, app3/i);
    fireEvent.change(appsInput, { target: { value: "app1, app2, app3" } });
    expect(onChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ apps: ["app1", "app2", "app3"] })
    );
  });
});