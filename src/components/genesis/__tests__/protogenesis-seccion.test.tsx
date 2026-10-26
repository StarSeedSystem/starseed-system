// Pruebas de la sección ProtoGenesis que comparten Mi Genesis y PoliGenesis (PG1013I).
// jsdom: solo interfaz; las decisiones y el panel entran como props o con almacén inyectable.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RegistroEncargo } from "@/lib/protogenesis/almacen-encargos";
import type { Encargo, Plan } from "@/lib/protogenesis/encargo";
import type { Ambito } from "@/lib/protomolecula/tipos";

import { SeccionProtoGenesis, type DecisionEncargo, type SeccionProtoGenesisProps } from "../mi-genesis";

const PLAN_DOS_PASOS: Plan = {
  encargoId: "e1",
  pasos: [
    { id: "p1", atomo: "atomo-fondo", titulo: "Fondo", entradas: [], salida: { formato: "png" }, depende: [], criterios: [] },
    { id: "p2", atomo: "atomo-musica", titulo: "Música", entradas: [], salida: { formato: "mp3" }, depende: [], criterios: [] },
  ],
};

function registro(id: string, ambito: Ambito, plan: Plan | null): RegistroEncargo {
  const encargo: Encargo = {
    id, moleculaId: `mol-${id}`, ambito, intencion: `Intención ${id}`,
    criterios: [{ tipo: "formato", texto: "glb" }], autor: { tipo: "persona", id: "yo" }, origen: "texto", creadoEn: 0,
  };
  return { encargo, plan, estados: {}, asignaciones: [], actualizadoEn: 0 };
}

function decisionFalsa(): DecisionEncargo {
  return { modo: "aceptar", motivo: "motivo de prueba", borrador: null };
}

function panelBase(r: RegistroEncargo): SeccionProtoGenesisProps["panelProps"] {
  return () => {
    void r;
    return { moleculaId: r.encargo.moleculaId, ambito: r.encargo.ambito, esDueno: true, plan: null, almacen: null };
  };
}

afterEach(cleanup);

describe("SeccionProtoGenesis (PG1013I)", () => {
  it("las dos secciones aparecen con su explicación en una línea", () => {
    const base: SeccionProtoGenesisProps = { titulo: "", encargos: [], decisionPara: decisionFalsa, panelProps: panelBase(registro("a", "personal", null)), testid: "" };
    render(<SeccionProtoGenesis {...base} titulo="ProtoGenesis de mis moléculas" testid="protogenesis-mi-genesis" />);
    render(<SeccionProtoGenesis {...base} titulo="ProtoGenesis de esta entidad" testid="protogenesis-poligenesis" />);
    expect(screen.getByTestId("protogenesis-mi-genesis")).not.toBeNull();
    expect(screen.getByTestId("protogenesis-poligenesis")).not.toBeNull();
    expect(screen.getAllByText("La génesis de cada creación: un director, varios agentes a la vez y tu decisión al final.")).toHaveLength(2);
    expect(screen.getAllByText("Aún no hay encargos: se encargan desde un panel ProtoGenesis.")).toHaveLength(2);
  });

  it("lista los encargos guardados con su plan", () => {
    render(
      <SeccionProtoGenesis
        titulo="ProtoGenesis de mis moléculas"
        encargos={[registro("e1", "personal", PLAN_DOS_PASOS), registro("e2", "perfil", null)]}
        decisionPara={decisionFalsa}
        panelProps={panelBase(registro("e1", "personal", PLAN_DOS_PASOS))}
        testid="protogenesis-mi-genesis"
      />,
    );
    expect(screen.getByText("Intención e1")).not.toBeNull();
    expect(screen.getByText("Con plan: 2 pasos")).not.toBeNull();
    expect(screen.getByText("Intención e2")).not.toBeNull();
    expect(screen.getByText("Sin plan")).not.toBeNull();
  });

  it("al tocar un encargo de Mi Genesis abre su panel: ámbito personal, manda la persona", () => {
    const r = registro("e1", "personal", null);
    render(
      <SeccionProtoGenesis
        titulo="ProtoGenesis de mis moléculas"
        encargos={[r]}
        decisionPara={decisionFalsa}
        panelProps={() => ({ moleculaId: r.encargo.moleculaId, ambito: "personal", esDueno: true, plan: null, almacen: null })}
        testid="protogenesis-mi-genesis"
      />,
    );
    expect(screen.queryByText("Panel ProtoGenesis")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Intención e1/ }));
    expect(screen.getByText("Panel ProtoGenesis")).not.toBeNull();
    expect(screen.getByText("personal")).not.toBeNull();
    // esDueno true en ámbito personal → la decisión es aceptar y la persona manda.
    expect(screen.getByRole("button", { name: "Aceptar en mi molécula" })).not.toBeNull();
  });

  it("en PoliGenesis el gobierno de la entidad entra al panel: rol y modo de gobierno", () => {
    const r = registro("e9", "grupo", null);
    render(
      <SeccionProtoGenesis
        titulo="ProtoGenesis de esta entidad"
        encargos={[r]}
        decisionPara={decisionFalsa}
        panelProps={() => ({ moleculaId: r.encargo.moleculaId, ambito: "grupo", esDueno: false, rol: "Editor", democratico: true, plan: null, almacen: null })}
        tono="cyan"
        extra={<span>Reglas, permisos y decisiones en marcha: Gobernanza de la entidad</span>}
        testid="protogenesis-poligenesis"
      />,
    );
    expect(screen.getByText("Reglas, permisos y decisiones en marcha: Gobernanza de la entidad")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Intención e9/ }));
    expect(screen.getByText("Panel ProtoGenesis")).not.toBeNull();
    expect(screen.getByText("grupo")).not.toBeNull();
    // En democrático, rango de «Editor» (2) → el resultado se propone a voto (§2.7).
    expect(screen.getByRole("button", { name: "Proponer al grupo" })).not.toBeNull();
  });
});
