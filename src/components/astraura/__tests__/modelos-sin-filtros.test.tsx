// Componentes de MOD1110B: interruptor con confirmación, sección aparte de la Biblioteca y «Instalar Ollama» que pregunta primero.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leerCatalogo } from "@/lib/astraura/capas/catalogo";
import { ajustesPredeterminados } from "@/lib/astraura/modelos/almacen";
import { catalogoCompleto } from "@/lib/astraura/modelos/catalogo";
import { catalogoSemilla } from "@/lib/astraura/modelos/catalogo-datos";
import { planInstalar } from "@/lib/astraura/modelos/instalar";
import { FICHAS_OLLAMA, preguntaOllama, type SistemaOllama } from "@/lib/astraura/modelos/instalar-ollama";
import { construirPerfilNeurona, type PerfilNeurona } from "@/lib/astraura/modelos/perfil-neurona";
import { aplicarEleccionManual, recomendarTodos } from "@/lib/astraura/modelos/recomendar";
import { CASOS, type CasoUso } from "@/lib/astraura/modelos/tipos";
import type { AccionesModelos, EstadoModelos } from "@/lib/astraura/modelos/use-modelos";
import { ModelosIaVista } from "@/components/library/modelos-ia-panel";
import { ModelosRecomendadosVista } from "../modelos-recomendados";

const capas = leerCatalogo(JSON.parse(readFileSync(join(process.cwd(), "config/capas-astraura.json"), "utf8")));
const catalogo = catalogoSemilla();
const modelos = catalogoCompleto(catalogo, capas);
const base = { plataforma: "tauri" as const, ramReal: true, discoLibreGb: 300, enchufada: true, ollama: true, backend158: true, webgpu: true };
const mac32 = construirPerfilNeurona({ ...base, id: "mac32", nombre: "MaggaBook", gpuRenderer: "Apple M2 Max", ramGb: 32, iaMalla: true });
const macSinOllama = construirPerfilNeurona({ ...base, ollama: false, id: "macsin", nombre: "Esta", gpuRenderer: "Apple M2 Max", ramGb: 32 });
const Q9 = "huihui_ai/qwen3.5-abliterated:9b";

function estado(perfil: PerfilNeurona, extra: Partial<EstadoModelos & AccionesModelos> = {}, o: { activado?: boolean; manual?: Partial<Record<CasoUso, string>>; sistema?: SistemaOllama } = {}): EstadoModelos & AccionesModelos {
  const instalados = new Set<string>();
  const sistema = o.sistema ?? "macos";
  const recomendaciones = recomendarTodos({ catalogo: modelos, perfil, entorno: { pares: [] } });
  const ajustes = { ...ajustesPredeterminados(), ...(o.manual ? { modo: "manual" as const, porCaso: o.manual } : {}), variantesSinFiltros: !!o.activado, variantesConfirmadoEl: o.activado ? "2026-11-10" : null };
  const usos = {} as NonNullable<EstadoModelos["usos"]>;
  for (const c of CASOS) {
    usos[c] = aplicarEleccionManual({
      catalogo: modelos, perfil, caso: c, rec: recomendaciones[c], idManual: ajustes.modo === "manual" ? ajustes.porCaso[c] : null,
      sinFiltros: { activado: !!o.activado, disponible: true }, contexto: "privado-propio", instalados,
    });
  }
  return {
    cargando: false, catalogo, modelos, perfil, pares: [], ajustes, recomendaciones, usos, instalados, aviso: null, revisando: false, estadoRevision: "",
    sinFiltros: { activado: !!o.activado, disponible: true, motivo: null },
    ollama: { sistema, ficha: FICHAS_OLLAMA[sistema], pregunta: preguntaOllama(FICHAS_OLLAMA[sistema]), presente: perfil.runtimes.includes("ollama") },
    continuar: null,
    setModo: vi.fn(), elegirManual: vi.fn(), setPrivacidad: vi.fn(), setRamDeclarada: vi.fn(),
    revisarAhora: vi.fn(async () => {}), descartarAviso: vi.fn(),
    planDe: (m) => planInstalar(m, perfil, instalados.has(m.id)),
    instalar: vi.fn(async () => ({ ok: true, mensaje: "Listo.", comando: null, sinHacerNada: false })),
    recomendarEn: vi.fn(() => null),
    activarVariantes: vi.fn(), desactivarVariantes: vi.fn(), usarVariante: vi.fn(), dejarVariante: vi.fn(),
    instalarOllama: vi.fn(async () => ({ estado: "abierto" as const, mensaje: "Se abrió Ollama.dmg. Completa la instalación en la ventana que apareció.", ruta: "/Users/x/Downloads/Ollama.dmg" })),
    cancelarOllama: vi.fn(async () => true), vigilarOllama: vi.fn(() => () => {}), comprobarOllama: vi.fn(async () => false), descartarContinuar: vi.fn(),
    ...extra,
  };
}

afterEach(cleanup);

describe("interruptor «Mostrar variantes sin filtros» en el bloque de ajustes", () => {
  it("viene apagado y NO muestra ninguna variante en el bloque", () => {
    render(<ModelosRecomendadosVista e={estado(mac32)} />);
    const sw = screen.getByRole("switch", { name: "Mostrar variantes sin filtros" }) as HTMLInputElement;
    expect(sw.checked).toBe(false);
    expect(document.querySelector("[data-insignia=sin-filtros]")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("encenderlo abre UNA explicación y pide confirmación; no enciende nada hasta aceptar", () => {
    const e = estado(mac32);
    render(<ModelosRecomendadosVista e={e} />);
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar variantes sin filtros" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Mostrar variantes sin filtros" });
    expect(dialogo.textContent).toMatch(/quitó los rechazos/);
    expect(dialogo.textContent).toMatch(/no está medida/);
    expect(dialogo.textContent).toMatch(/pierden el uso de herramientas/);
    expect(dialogo.textContent).toMatch(/responsabilidad tuya/);
    expect(e.activarVariantes).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(e.activarVariantes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar variantes sin filtros" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Entiendo, mostrarlas" }));
    expect(e.activarVariantes).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("encendido se puede apagar, sin preguntar", () => {
    const e = estado(mac32, {}, { activado: true });
    render(<ModelosRecomendadosVista e={e} />);
    const sw = screen.getByRole("switch", { name: "Mostrar variantes sin filtros" }) as HTMLInputElement;
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    expect(e.desactivarVariantes).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("en un perfil donde no está disponible (menor) el interruptor está desactivado y dice por qué", () => {
    const e = estado(mac32, { sinFiltros: { activado: false, disponible: false, motivo: "Las variantes sin filtros no están disponibles en perfiles de menores de edad." } });
    render(<ModelosRecomendadosVista e={e} />);
    expect((screen.getByRole("switch", { name: "Mostrar variantes sin filtros" }) as HTMLInputElement).disabled).toBe(true);
    expect(document.querySelector("[data-campo=variantes-motivo]")?.textContent).toMatch(/menores de edad/);
  });
  it("con una variante elegida a mano y todo en regla, el caso lo rotula; en otro caso, dice por qué se volvió a la normal", () => {
    const e = estado(mac32, {}, { activado: true, manual: { conversacion: Q9, "bots-dots": Q9 } });
    render(<ModelosRecomendadosVista e={e} />);
    const conv = document.querySelector("[data-caso=conversacion]") as HTMLElement;
    expect(conv.querySelector("[data-insignia=sin-filtros]")).toBeTruthy();
    expect(within(conv).getByText(Q9)).toBeTruthy();
    expect(conv.querySelector("[data-campo=puntuacion-base]")?.textContent).toMatch(/puntuación de la base, no de esta variante/);
    expect(conv.querySelector("[data-campo=equivalencia]")?.textContent).toMatch(/sin medir/);
    const bots = document.querySelector("[data-caso=bots-dots]") as HTMLElement;
    expect(bots.querySelector("[data-insignia=sin-filtros]")).toBeNull();
    expect(bots.querySelector("[data-campo=aviso-variante]")?.textContent).toMatch(/^No se usa «huihui_ai\/qwen3\.5-abliterated:9b» para bots y dots/);
  });
  it("apagado, una elección guardada sobre una variante no se rotula ni se usa", () => {
    render(<ModelosRecomendadosVista e={estado(mac32, {}, { activado: false, manual: { conversacion: Q9 } })} />);
    const conv = document.querySelector("[data-caso=conversacion]") as HTMLElement;
    expect(conv.querySelector("[data-insignia=sin-filtros]")).toBeNull();
    expect(within(conv).queryByText(Q9)).toBeNull();
    expect(conv.querySelector("[data-campo=aviso-variante]")?.textContent).toMatch(/apagado/);
  });
});

describe("Biblioteca · Modelos de IA: la sección aparte", () => {
  it("con el interruptor apagado no hay sección ni tarjetas sin filtros", () => {
    render(<ModelosIaVista e={estado(mac32)} />);
    expect(document.querySelector("[data-seccion=sin-filtros]")).toBeNull();
    expect(document.querySelector(`[data-modelo="${Q9}"]`)).toBeNull();
    expect(document.querySelector("[data-insignia=sin-filtros]")).toBeNull();
  });
  it("encendido: sección propia con insignia, calidad «sin medir», puntuación de la base rotulada y aviso de herramientas", () => {
    const e = estado(mac32, {}, { activado: true });
    render(<ModelosIaVista e={e} />);
    const sec = document.querySelector("[data-seccion=sin-filtros]") as HTMLElement;
    expect(sec).toBeTruthy();
    expect(sec.querySelectorAll("[data-modelo]")).toHaveLength(8);
    const tarjeta = sec.querySelector(`[data-modelo="${Q9}"]`) as HTMLElement;
    expect(tarjeta.querySelector("[data-insignia=sin-filtros]")).toBeTruthy();
    expect(tarjeta.querySelector("[data-campo=equivalencia]")?.textContent).toMatch(/Calidad: sin sin medir|Calidad: sin medir/);
    expect(tarjeta.querySelector("[data-campo=puntuacion-base]")?.textContent).toMatch(/ECI 139,[34].*puntuación de la base/);
    const ds = sec.querySelector('[data-modelo="huihui_ai/deepseek-r1-abliterated:8b"]') as HTMLElement;
    expect(ds.querySelector("[data-campo=pierde-herramientas]")?.textContent).toMatch(/no se ofrece para código y agentes ni para bots/);
    expect(ds.textContent).not.toMatch(/Sirve para:[^.]*(código|bots)/);
    // los normales siguen en su lista, sin la insignia
    expect(document.querySelector('[data-modelo="gemma4:26b"] [data-insignia=sin-filtros]')).toBeNull();
  });
  it("elegir a mano: el botón llama a usarVariante; una ya elegida ofrece «Dejar de usarla»", () => {
    const e = estado(mac32, {}, { activado: true });
    render(<ModelosIaVista e={e} />);
    const t = document.querySelector(`[data-modelo="${Q9}"]`) as HTMLElement;
    fireEvent.click(within(t).getByRole("button", { name: "Usar en mis conversaciones privadas" }));
    expect(e.usarVariante).toHaveBeenCalledWith(Q9);
    cleanup();
    const e2 = estado(mac32, {}, { activado: true, manual: { conversacion: Q9 } });
    render(<ModelosIaVista e={e2} />);
    fireEvent.click(within(document.querySelector(`[data-modelo="${Q9}"]`) as HTMLElement).getByRole("button", { name: "Dejar de usarla" }));
    expect(e2.dejarVariante).toHaveBeenCalledWith(Q9);
  });
  it("una variante cuya etiqueta desapareció (sin-comprobar) ya no se muestra, ni encendido", () => {
    const retirada = modelos.map((m) => (m.id === Q9 ? { ...m, estado: "sin-comprobar" as const } : m));
    render(<ModelosIaVista e={estado(mac32, { modelos: retirada }, { activado: true })} />);
    expect(document.querySelector(`[data-modelo="${Q9}"]`)).toBeNull();
    expect(document.querySelectorAll("[data-seccion=sin-filtros] [data-modelo]")).toHaveLength(7);
    expect(document.querySelector("details")?.textContent ?? "").not.toContain(Q9); // ni en «sin comprobar»
  });
  it("instalar una variante también pregunta primero, con el tamaño y el aviso de comunidad", async () => {
    const e = estado(mac32, {}, { activado: true });
    render(<ModelosIaVista e={e} />);
    const t = document.querySelector(`[data-modelo="${Q9}"]`) as HTMLElement;
    fireEvent.click(within(t).getByRole("button", { name: /Instalar \(6,6 GB\)/ }));
    const p = await screen.findByRole("alertdialog");
    expect(p.textContent).toMatch(/6,6 GB de descarga/);
    expect(p.textContent).toMatch(/variante sin filtros publicada por la comunidad/);
    expect(e.instalar).not.toHaveBeenCalled();
  });
});

describe("«Instalar Ollama» donde falta el motor", () => {
  it("no hay botón si Ollama ya está", () => {
    render(<ModelosRecomendadosVista e={estado(mac32)} />);
    expect(screen.queryByRole("button", { name: "Instalar Ollama" })).toBeNull();
  });
  it("macOS: el botón abre la pregunta con tamaño, editor y dónde se instala; NO descarga hasta aceptar", async () => {
    const e = estado(macSinOllama);
    render(<ModelosRecomendadosVista e={e} />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar Ollama" }));
    const d = screen.getByRole("alertdialog", { name: "¿Instalar Ollama?" });
    expect(d.textContent).toMatch(/230 MB \(comprobado el 2026-11-10/);
    expect(d.textContent).toMatch(/proyecto Ollama \(ollama\.com\)/);
    expect(d.textContent).toMatch(/Aplicaciones/);
    expect(d.textContent).toMatch(/NO ejecuta el instalador por su cuenta/);
    expect(e.instalarOllama).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole("button", { name: "Ahora no" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(e.instalarOllama).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Instalar Ollama" }));
    fireEvent.click(screen.getByRole("button", { name: "Descargar el instalador (230 MB)" }));
    await waitFor(() => expect(e.instalarOllama).toHaveBeenCalledTimes(1));
    expect((e.instalarOllama as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(true);
    expect(await screen.findByText(/Se abrió Ollama\.dmg/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ya lo instalé" }));
    expect(e.comprobarOllama).toHaveBeenCalled();
  });
  it("Windows enseña 1,86 GB; la descarga muestra progreso y se puede cancelar", async () => {
    let soltar: (v: { estado: "cancelada"; mensaje: string; ruta: null }) => void = () => {};
    const e = estado(macSinOllama, {
      instalarOllama: vi.fn((_ok: boolean, op?: { onProgreso?: (p: never) => void }) => new Promise<never>((res) => { op?.onProgreso?.({ fase: "descargando", descargado: 5, total: 10, porcentaje: 42 } as never); soltar = res as never; })) as never,
    }, { sistema: "windows" });
    render(<ModelosRecomendadosVista e={e} />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar Ollama" }));
    fireEvent.click(screen.getByRole("button", { name: "Descargar el instalador (1,86 GB)" }));
    expect(await screen.findByText(/Descargando… 42%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar descarga" }));
    expect(e.cancelarOllama).toHaveBeenCalledTimes(1);
    soltar({ estado: "cancelada", mensaje: "Descarga cancelada: no se guardó nada y no se instaló nada.", ruta: null });
    expect(await screen.findByText(/no se guardó nada y no se instaló nada/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Volver a intentarlo" })).toBeTruthy();
  });
  it("fallo: lo dice y deja reintentar", async () => {
    const e = estado(macSinOllama, { instalarOllama: vi.fn(async () => ({ estado: "fallo" as const, mensaje: "No se pudo descargar el instalador (sin red). No quedó nada a medias.", ruta: null })) });
    render(<ModelosRecomendadosVista e={e} />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar Ollama" }));
    fireEvent.click(screen.getByRole("button", { name: /Descargar el instalador/ }));
    expect(await screen.findByText(/No quedó nada a medias/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ya lo instalé" })).toBeNull();
    expect(screen.getByRole("button", { name: "Volver a intentarlo" })).toBeTruthy();
  });
  it("Linux: instrucciones oficiales y copiar el comando; sin botón de descargar", () => {
    const e = estado(macSinOllama, {}, { sistema: "linux" });
    render(<ModelosRecomendadosVista e={e} />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar Ollama" }));
    expect(document.querySelector("[data-campo=comando-ollama]")?.textContent).toBe("curl -fsSL https://ollama.com/install.sh | sh");
    expect(screen.getByRole("button", { name: /Copiar comando/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Descargar el instalador/ })).toBeNull();
    expect(e.vigilarOllama).toHaveBeenCalled(); // mientras el cuadro está abierto, mira con suavidad
  });
  it("Android y web: dicen que Ollama no corre y qué sí; sin botón de instalar", () => {
    for (const sistema of ["android", "web"] as const) {
      cleanup();
      render(<ModelosRecomendadosVista e={estado(macSinOllama, {}, { sistema })} />);
      expect(screen.queryByRole("button", { name: "Instalar Ollama" })).toBeNull();
      expect(document.querySelector("[data-campo=ollama]")?.textContent).toMatch(/Ollama no corre aquí/);
      expect(document.querySelector("[data-campo=ollama]")?.textContent).toMatch(/capas ligeras de Astraura/);
    }
  });
  it("no mira Ollama antes de pedir nada (cuadro de pregunta) y para al cerrar", () => {
    const parar = vi.fn();
    const e = estado(macSinOllama, { vigilarOllama: vi.fn(() => parar) });
    render(<ModelosRecomendadosVista e={e} />);
    fireEvent.click(screen.getByRole("button", { name: "Instalar Ollama" }));
    expect(e.vigilarOllama).not.toHaveBeenCalled();
  });
  it("cuando Ollama ya está y había un modelo pendiente, sigue con ese modelo y vuelve a preguntar con el tamaño", async () => {
    const modelo = modelos.find((m) => m.id === "gemma4:26b")!;
    const e = estado(mac32, { continuar: planInstalar(modelo, mac32) });
    render(<ModelosRecomendadosVista e={e} />);
    expect(screen.getByText(/Ollama ya está listo\. Sigamos con «gemma4:26b»/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver tamaño y descargar" }));
    const p = await screen.findByRole("alertdialog", { name: /Descargar gemma4:26b/ });
    expect(p.textContent).toMatch(/16,0 GB de descarga/);
    expect(p.textContent).toMatch(/No se descarga nada hasta que aceptes/);
    expect(e.instalar).not.toHaveBeenCalled();
  });
});
