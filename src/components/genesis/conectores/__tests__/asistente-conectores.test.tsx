/** Asistente «Conectar Genesis» · pruebas con Testing Library y API simulada (sin red real). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import type { OpcionCatalogo, Papel, Privacidad } from "@/lib/genesis/conectores/catalogo-opciones";
import type { VistaOpciones } from "@/lib/genesis/conectores/opciones-ambito";
import type { Sugerencia } from "@/lib/genesis/conectores/sugerir";
import { AsistenteConectores, resumenPorPapel } from "../asistente-conectores";

const BASE = { tipo: "proveedor", requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], licencia: null, verificado: null, fuente: "prueba" } as const;
const opcion = (id: string, extra: Partial<OpcionCatalogo>): OpcionCatalogo => ({ ...BASE, id, nombre: id, papeles: [], gratis: null, privacidad: "local", ...extra });
const GRATIS = { rpm: null, porDia: null, horasMes: null, almacenamientoGb: null, nota: "30 peticiones/día" };
const LOCAL = opcion("astraura-158-local", { nombre: "Astraura 1.58 local", tipo: "modelo", papeles: ["chat"], gratis: { ...GRATIS, nota: "corre en tu neurona" } });
const NUBE = opcion("groq", { nombre: "Groq", papeles: ["escritor", "chat"], requiereCuenta: true, gratis: GRATIS, privacidad: "nube-sin-retencion", enlaceAlta: "https://console.groq.com/", enlaceClave: "https://console.groq.com/keys" });

const sug = (o: OpcionCatalogo, motivo: string): Sugerencia => ({ id: o.id, nombre: o.nombre, tipo: o.tipo, papeles: [...o.papeles], enlaceAlta: o.enlaceAlta, enlaceClave: o.enlaceClave, limite: o.gratis, verificado: null, privacidad: o.privacidad, variables: [], motivo });
const ASIGN: Asignacion<Papel>[] = [{ clave: "escritor", cadena: ["groq"], respaldo: [], preferencias: { localPrimero: true, privacidad: "nube-sin-retencion", presupuesto: null } }];
const VISTA: VistaOpciones = { ambito: "cuenta-1", catalogo: [LOCAL, NUBE], asignaciones: ASIGN, sugerencias: [
  { clave: "local-por-activar", titulo: "Local por activar", opciones: [sug(LOCAL, "Capacidad local sin usar: añádela a la cadena.")] },
  { clave: "gratis-por-vincular", titulo: "Gratis por vincular", opciones: [sug(NUBE, "Gratis: crea tu cuenta en el enlace oficial y vincula la clave.")] },
  { clave: "sin-opcion", titulo: "Sin opción", papeles: [] } ] };

type Pedido = { url: string; cuerpo?: Record<string, unknown> };
const pedidos: Pedido[] = [];
const apiSimulada = vi.fn(async (url: string, init?: RequestInit) => {
  if (!init) return new Response(JSON.stringify(VISTA), { status: 200 });
  const cuerpo = JSON.parse(String(init.body)) as Record<string, unknown>;
  pedidos.push({ url, cuerpo });
  return new Response(JSON.stringify(cuerpo.accion === "vincular" ? { huella: "6deb4a92c81f0a2b7d3e" } : { ok: true }), { status: 201 });
});
const montado = () => render(<AsistenteConectores ambito="cuenta-1" red={apiSimulada} />);

afterEach(() => { cleanup(); pedidos.length = 0; vi.clearAllMocks(); });

describe("AsistenteConectores · tres pasos de la conexión", () => {
  it("presenta lo local, lo gratis con el enlace oficial y el resumen por papel", async () => {
    await montado() !== undefined && screen.findByTestId;
    expect(await screen.findByTestId("local-astraura-158-local")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Activar Astraura 1.58 local" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("paso-2"));
    const vinculo = screen.getByTestId("vincular-groq");
    expect(vinculo).toHaveAttribute("href", "https://console.groq.com/");
    expect(vinculo).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByTestId("paso-3"));
    const fila = screen.getByTestId("resumen-escritor");
    expect(fila).toHaveTextContent("Groq");
    expect(fila).toHaveTextContent("Primero lo gratis");
    expect(pedidos).toHaveLength(0);
  });

  it("el interruptor de lo local manda la asignación de la cadena del papel", async () => {
    montado();
    expect(await screen.findByTestId("local-astraura-158-local")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: /Astraura 1.58 local/ }));
    await vi.waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].cuerpo).toEqual({ accion: "asignar", clave: "chat", cadena: "astraura-158-local" });
    expect(pedidos[0].url).toContain("ambito=cuenta-1");
    expect(screen.getByRole("switch", { name: /Astraura 1.58 local/ })).toHaveAttribute("aria-checked", "true");
  });

  it("la clave viaja a la API, se borra del campo y solo queda la huella", async () => {
    montado();
    await screen.findByTestId("local-astraura-158-local");
    fireEvent.click(screen.getByTestId("paso-2"));
    fireEvent.change(screen.getByTestId("clave-groq"), { target: { value: "sk-secreta-123" } });
    fireEvent.click(screen.getByTestId("guardar-groq"));
    await vi.waitFor(() => expect(screen.getByTestId("boveda-groq")).toHaveTextContent("huella 6deb4a92"));
    expect(pedidos.at(-1)?.cuerpo).toEqual({ accion: "vincular", proveedor: "groq", valor: "sk-secreta-123" });
    expect(screen.getByTestId("clave-groq")).toHaveValue("");
    expect(document.body.textContent).not.toContain("sk-secreta-123");
  });

  it("un fallo de la API queda en un aviso honesto, sin bloqueos", async () => {
    const roja = vi.fn(async () => new Response(JSON.stringify({ error: "cupos" }), { status: 500 }));
    render(<AsistenteConectores ambito="cuenta-2" red={roja} />);
    expect(await screen.findByTestId("aviso")).toHaveTextContent("No se pudo leer el catálogo del ámbito.");
    expect(screen.queryByTestId("local-astraura-158-local")).toBeNull();
  });
});

describe("resumenPorPapel · el motivo se ajusta al origen de la cadena", () => {
  const fila = (priv: Privacidad, cadena: string[], catalogo: OpcionCatalogo[]) => resumenPorPapel(
    [{ clave: "escritor", cadena, respaldo: [], preferencias: { localPrimero: true, privacidad: priv, presupuesto: 2 } }], catalogo)[0];
  it("local primero, gratis después y vacío con su aviso", () => {
    const local = fila("local", ["astraura-158-local"], [LOCAL, NUBE]);
    expect(local.motivo).toContain("Primero lo local");
    expect(local.elegidos).toEqual(["Astraura 1.58 local"]);
    expect(fila("nube-sin-retencion", ["groq"], [LOCAL, NUBE]).motivo).toContain("lo gratis");
    const vacio = fila("local", [], []);
    expect(vacio.motivo).toContain("Lo privado no sale de la cuenta");
    expect(vacio.elegidos).toEqual([]);
  });
});
