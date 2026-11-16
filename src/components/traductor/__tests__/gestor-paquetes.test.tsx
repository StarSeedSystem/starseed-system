import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GestorPaquetes } from "../gestor-paquetes";

describe("GestorPaquetes", () => {
  it("llama a onDescargar al hacer clic en Descargar", () => {
    const onDescargar = vi.fn();
    const paquetes = [{ id: "en", nombre: "Inglés", tamanoMB: 20, descargado: false, verificado: true }];
    render(
      <GestorPaquetes
        paquetes={paquetes}
        espacioUsadoMB={0}
        capacidadTotalMB={100}
        esPersistente={true}
        onDescargar={onDescargar}
        onQuitar={() => {}}
        onCancelar={() => {}}
      />
    );
    fireEvent.click(screen.getByText("Descargar"));
    expect(onDescargar).toHaveBeenCalledWith("en");
  });

  it("pide confirmación al quitar un paquete", () => {
    const onQuitar = vi.fn();
    const paquetes = [{ id: "es", nombre: "Español", tamanoMB: 10, descargado: true, verificado: true }];
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    
    render(
      <GestorPaquetes
        paquetes={paquetes}
        espacioUsadoMB={10}
        capacidadTotalMB={100}
        esPersistente={true}
        onDescargar={() => {}}
        onQuitar={onQuitar}
        onCancelar={() => {}}
      />
    );
    
    fireEvent.click(screen.getByText("Quitar"));
    expect(spy).toHaveBeenCalled();
    expect(onQuitar).toHaveBeenCalledWith("es");
  });

  it("pide confirmación al descargar paquete sin verificar", () => {
    const onDescargar = vi.fn();
    const paquetes = [{ id: "fr", nombre: "Francés", tamanoMB: 15, descargado: false, verificado: false }];
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    
    render(
      <GestorPaquetes
        paquetes={paquetes}
        espacioUsadoMB={0}
        capacidadTotalMB={100}
        esPersistente={true}
        onDescargar={onDescargar}
        onQuitar={() => {}}
        onCancelar={() => {}}
      />
    );
    
    fireEvent.click(screen.getByText("Descargar"));
    expect(spy).toHaveBeenCalled();
    expect(onDescargar).toHaveBeenCalledWith("fr");
  });
});
