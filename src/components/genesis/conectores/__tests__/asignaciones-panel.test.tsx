import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AsignacionesPanel, etiquetaPeldaño, motivoPeldaño, mover, nombreDe, opcionesParaFila, type FilaPanel,
} from "../asignaciones-panel";
import type { OpcionCatalogo } from "@/lib/genesis/conectores/catalogo-opciones";

const op = (id: string, parcial: Partial<OpcionCatalogo> = {}): OpcionCatalogo => ({
  id, nombre: id, tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null,
  variables: [], privacidad: "nube-con-retencion", licencia: null, verificado: null, fuente: "prueba", ...parcial,
});

describe("etiquetaPeldaño", () => {
  const malla = new Set(["b1"]);
  it("prioriza contenedor y malla sobre local", () => {
    expect(etiquetaPeldaño(op("c1", { tipo: "contenedor", privacidad: "local" }), malla)).toBe("contenedor");
    expect(etiquetaPeldaño(op("b1", { privacidad: "local" }), malla)).toBe("malla"); expect(etiquetaPeldaño(op("x1", { privacidad: "local" }), malla)).toBe("local");
  });
  it("sin límite gratis es pago, y sin opción también", () => {
    expect(etiquetaPeldaño(op("y", { gratis: { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 por minuto" } }), malla)).toBe("gratis");
    expect(etiquetaPeldaño(op("z"), malla)).toBe("pago"); expect(etiquetaPeldaño(null, malla)).toBe("pago");
  });
});

describe("motivoPeldaño", () => {
  it("explica cada peldaño con el nombre", () => {
    expect(motivoPeldaño("BitNet", "local")).toContain("no sale de la cuenta");
    expect(motivoPeldaño("Vecino", "malla")).toContain("nunca para lo privado"); expect(motivoPeldaño("Box", "contenedor")).toContain("procesos de los agentes");
    expect(motivoPeldaño("Gratis", "gratis")).toContain("no se inventa"); expect(motivoPeldaño("Cobrador", "pago")).toContain("permiso y el tope");
  });
});

describe("opcionesParaFila y nombreDe", () => {
  const catalogo = [
    op("a1", { nombre: "Ara local", papeles: ["escritor"], privacidad: "local" }), op("p1", { nombre: "Pola", papeles: ["chat"] }),
    op("q1", { nombre: "Otra" }),
  ];
  it("filtra por papel, deja fuera la cadena y respeta al director", () => {
    expect(opcionesParaFila({ clave: "escritor", clase: "papel", cadena: [] }, catalogo).map((o) => o.id)).toEqual(["a1"]);
    expect(opcionesParaFila({ clave: "escritor", clase: "papel", cadena: ["a1"] }, catalogo).map((o) => o.id)).toEqual(["p1", "q1"]);
    expect(opcionesParaFila({ clave: "chat", clase: "papel", cadena: [] }, catalogo).map((o) => o.id)).toEqual(["p1"]);
    expect(opcionesParaFila({ clave: "diseno", clase: "director", cadena: ["p1"] }, catalogo).map((o) => o.id)).toEqual(["a1", "q1"]);
  });
  it("nombreDe usa el nombre o cae al id", () => {
    expect(nombreDe("a1", catalogo)).toBe("Ara local"); expect(nombreDe("falta", catalogo)).toBe("falta");
  });
});

describe("mover", () => {
  it("reordena y respeta lo fuera de rango", () => {
    expect(mover(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(mover(["a", "b"], 0, 7)).toEqual(["a", "b"]); expect(mover(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

// Render del panel
const catalogo = [
  op("loc", { nombre: "BitNet local", papeles: ["escritor"], privacidad: "local", gratis: { rpm: 5, porDia: null, horasMes: null, almacenamientoGb: null, nota: "5 por minuto" } }),
  op("libre", { nombre: "LLM7 gratis", papeles: ["escritor", "chat"], gratis: { rpm: 30, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 por minuto" } }), op("pago", { nombre: "Cobrador", papeles: ["escritor"] }),
];
const filas: FilaPanel[] = [
  { clave: "escritor", clase: "papel", cadena: ["loc", "libre"] }, { clave: "diseno", clase: "director", cadena: ["pago"] },
];
let guardadas: FilaPanel[] | undefined;
const chipDe = (t: string): HTMLElement => screen.getAllByText(t).filter((el) => el.tagName === "SPAN")[0];
const notas: Record<string, string[]> = { escritor: ["loc", "libre"], diseno: ["loc", "libre"] };
const renderPanel = (parcial: Partial<Parameters<typeof AsignacionesPanel>[0]> = {}) =>
  render(<AsignacionesPanel filas={filas} catalogo={catalogo} enMalla={new Set()} sugeridasPorClave={notas}
    modo="aplicar" onGuardar={(f) => { guardadas = f; }} {...parcial} />);

afterEach(cleanup);

describe("AsignacionesPanel", () => {
  it("pinta filas de papel y de director con etiqueta y motivo en tooltip", () => {
    renderPanel();
    expect(screen.getByText("Director · diseno")).not.toBeNull();
    expect(chipDe("BitNet local").closest("li")?.getAttribute("title") ?? "").toContain("no sale de la cuenta");
    for (const e of ["local", "gratis", "pago"]) expect(screen.getAllByText(e, { exact: true }).length).toBeGreaterThan(0);
  });
  it("quita y añade candidatos del catálogo", async () => {
    const u = userEvent.setup();
    renderPanel();
    const cadena = () => screen.getAllByText("LLM7 gratis").filter((el) => el.tagName === "SPAN").length;
    expect(cadena()).toBe(1);
    await u.click(screen.getByLabelText("Quitar LLM7 gratis de esta cadena"));
    expect(cadena()).toBe(0);
    await u.selectOptions(screen.getByLabelText("Añadir del catálogo a escritor"), "libre");
    expect(cadena()).toBe(1);
  });
  it("ordena arrastrando y con subir", async () => {
    const u = userEvent.setup();
    renderPanel();
    const chips = chipDe("BitNet local").closest("ul") as HTMLElement;
    const pos = (t: string) => (chips.textContent ?? "").indexOf(t);
    await u.click(screen.getByLabelText("Subir LLM7 gratis"));
    expect(pos("LLM7 gratis")).toBeLessThan(pos("BitNet local"));
    fireEvent.dragStart(chipDe("BitNet local").closest("li") as HTMLElement);
    fireEvent.drop(chipDe("LLM7 gratis").closest("li") as HTMLElement);
    expect(pos("BitNet local")).toBeLessThan(pos("LLM7 gratis"));
  });
  it("restaura las cadenas sugeridas", async () => {
    const u = userEvent.setup();
    renderPanel();
    await u.selectOptions(screen.getByLabelText("Añadir del catálogo a escritor"), "pago");
    expect(chipDe("Cobrador")).toBeDefined();
    await u.click(screen.getByText("Restaurar sugeridas"));
    expect(screen.getAllByText("Cobrador").filter((el) => el.tagName === "SPAN").length).toBe(0);
    expect(screen.getAllByText("LLM7 gratis").filter((el) => el.tagName === "SPAN").length).toBe(2);
  });
  it("en modo democrático guarda como propuesta y en aplicar entrega el borrador", () => {
    renderPanel({ modo: "proponer" });
    expect(screen.getByText(/propuesta para votar/)).not.toBeNull();
    fireEvent.click(screen.getByText("Proponer a votación"));
    expect(guardadas).toEqual(filas); cleanup(); renderPanel();
    expect(screen.queryByText(/propuesta para votar/)).toBeNull();
    fireEvent.click(screen.getByText("Guardar asignaciones"));
    expect(guardadas).toEqual(filas);
  });
});
