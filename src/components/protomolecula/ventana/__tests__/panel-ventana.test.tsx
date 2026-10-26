import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENTO_CONTEXTO_PROTO, type ContextoProto, type PlanPeticion, type VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";

// ── simulaciones: la planificación, la ejecución y el gobierno son de otros agentes; aquí se simulan ──────────
const m = vi.hoisted(() => ({
  planificarPeticion: vi.fn(),
  ejecutarPlan: vi.fn(),
  decidirCambio: vi.fn(),
  leerContexto: vi.fn((ruta?: string): ContextoProto => ({ ruta: ruta ?? "/", ambito: "personal" })),
}));
vi.mock("@/lib/protomolecula/peticion", () => ({ leerContexto: m.leerContexto, planificarPeticion: m.planificarPeticion, ejecutarPlan: m.ejecutarPlan, actorDeLaSesion: async () => null }));
vi.mock("@/lib/protomolecula/gobierno", () => ({ decidirCambio: m.decidirCambio }));
vi.mock("@/components/protomolecula/panel-protomolecula", () => ({ PanelProtomoleculaAutonomo: () => <p>panel completo simulado</p> }));
vi.mock("../pestana-vinculos", () => ({ default: () => <p>mandos simulados</p> }));
vi.mock("@/components/protomolecula/gobierno", () => ({ GobiernoProtoResumen: (p: { contexto: ContextoProto }) => <div data-testid="resumen-gobierno-p2">{p.contexto.entidad?.nombre}</div> }));
vi.mock("@/components/governance/proposal-composer", () => ({
  default: (p: { scope: string; scopeRef?: string; initial?: { title?: string; description?: string } }) => (
    <div data-testid="compositor">Compositor simulado · {p.scope} · {p.scopeRef} · {p.initial?.title} · {p.initial?.description}</div>
  ),
}));
vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: (cargar: () => Promise<unknown>) => {
      function Perezoso(props: Record<string, unknown>) {
        const [C, setC] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null);
        React.useEffect(() => {
          let vivo = true;
          void cargar().then((mod) => { if (vivo) setC(() => ((mod as { default?: unknown }).default ?? mod) as React.ComponentType<Record<string, unknown>>); });
          return () => { vivo = false; };
        }, []);
        return C ? React.createElement(C, props) : null;
      }
      return Perezoso;
    },
  };
});

import { PanelOrbe, type PanelOrbeProps } from "../../panel-orbe";
import { olvidarAnuncio } from "../contexto-anunciado";
import { CLAVE_HISTORIAL } from "../historial";

const v = (decision: VeredictoGobierno["decision"], extra: Partial<VeredictoGobierno> = {}): VeredictoGobierno => ({ decision, motivo: `motivo ${decision}`, confirmar: true, ...extra });
const plan = (extra: Partial<PlanPeticion> = {}): PlanPeticion => ({
  resumen: "Cambiar el diseño del grupo", tipoCambio: "diseno", motor: "Needle (local)", fuera: [],
  pasos: [{ tipo: "editar-entidad", objetivo: { tipo: "grupo", id: "g1", nombre: "Semilla" }, cambio: "tema oscuro", modo: "directo" }], ...extra,
});

function props(extra: Partial<PanelOrbeProps> = {}): PanelOrbeProps {
  return {
    forma: "merkaba", fijada: null, estilo: "sobria",
    alElegirForma: vi.fn(), alElegirEstilo: vi.fn(), alAbrirLienzo: vi.fn(), alApagar: vi.fn(), alCerrar: vi.fn(),
    lado: { horizontal: "derecha", vertical: "abajo" }, ...extra,
  };
}
const montar = (extra: Partial<PanelOrbeProps> = {}) => { const p = props(extra); return { p, ...render(<PanelOrbe {...p} />) }; };
const anunciar = (detalle: Record<string, unknown>) => act(() => { window.dispatchEvent(new CustomEvent(EVENTO_CONTEXTO_PROTO, { detail: detalle })); });
const grupo = { entidad: { tipo: "grupo", id: "g1", nombre: "Semilla" }, ambito: "grupo" };
const barra = () => screen.getByRole("textbox", { name: "Petición a Astraura" }) as HTMLTextAreaElement;
const escribir = (t: string) => fireEvent.change(barra(), { target: { value: t } });
const enviar = async (t: string) => { escribir(t); fireEvent.keyDown(barra(), { key: "Enter" }); };
const tab = (n: string) => screen.getByRole("tab", { name: n });
const herramienta = (nombre: string) => screen.getByRole("button", { name: nombre });

beforeEach(() => {
  vi.clearAllMocks();
  olvidarAnuncio();
  window.localStorage.clear();
  m.decidirCambio.mockImplementation(() => v("aplicar"));
  m.planificarPeticion.mockImplementation(async () => plan());
  m.ejecutarPlan.mockImplementation(async () => ({ ok: true, hechos: ["Diseño cambiado"], pendientes: [] }));
});
afterEach(() => { cleanup(); olvidarAnuncio(); });

describe("ventana de la Protomolécula · estructura", () => {
  it("abre en «Crear», con la barra de petición y las herramientas", () => {
    montar();
    expect(tab("Crear").getAttribute("aria-selected")).toBe("true");
    expect(barra()).toBeTruthy();
    expect(screen.getByTestId("rejilla-herramientas")).toBeTruthy();
    expect(screen.getByTestId("chip-contexto")).toBeTruthy();
  });

  it("las pestañas son Crear, Controles y Vínculos (y Gobierno solo con gobierno); la geometría y el estilo NO están a la vista", () => {
    montar();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Crear", "Controles", "Vínculos"]);
    expect(screen.queryByText("Geometría")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Estilo de la orbe" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apagar orbe" })).toBeNull();
  });

  it("«Apariencia» está oculta tras el menú «⋯»: geometría, estilo y apagar la orbe siguen ahí", () => {
    const { p } = montar({ fijada: "merkaba", estilo: "sobria" });
    const mas = screen.getByRole("button", { name: "Más opciones" });
    expect(mas.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(mas);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Apariencia", "Abrir lienzo"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Apariencia" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Geometría")).toBeTruthy();
    expect(screen.getByText("Estilo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Automática" }));
    expect(p.alElegirForma).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole("radio", { name: "Experimental" }));
    expect(p.alElegirEstilo).toHaveBeenCalledWith("experimental");
    fireEvent.click(screen.getByRole("button", { name: "Apagar orbe" }));
    expect(p.alApagar).toHaveBeenCalledTimes(1);
    // «Volver» regresa a Crear.
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(tab("Crear").getAttribute("aria-selected")).toBe("true");
  });

  it("«Abrir lienzo» sigue disponible desde el menú «⋯»", () => {
    const { p } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Abrir lienzo" }));
    expect(p.alAbrirLienzo).toHaveBeenCalledTimes(1);
  });

  it("con una molécula pedida abre en «Controles»", async () => {
    montar({ completoInicial: true, moleculaId: "m1" });
    await waitFor(() => expect(tab("Controles").getAttribute("aria-selected")).toBe("true"));
    expect(await screen.findByText("panel completo simulado")).toBeTruthy();
  });

  it("«Vínculos» monta los mandos", async () => {
    montar();
    fireEvent.click(tab("Vínculos"));
    expect(await screen.findByText("mandos simulados")).toBeTruthy();
  });
});

describe("ventana de la Protomolécula · se adapta al contexto", () => {
  it("las herramientas cambian con lo que anuncia la pantalla, y el chip dice qué hay delante", () => {
    montar();
    expect(herramienta("Rediseñar esta pantalla")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar en una rama" })).toBeNull();
    anunciar({ entidad: { tipo: "publicacion", id: "p1", nombre: "Mi post" }, ambito: "perfil" });
    expect(screen.getByTestId("chip-contexto").textContent).toContain("Publicación · Mi post");
    expect(screen.getByTestId("chip-contexto").textContent).toContain("Perfil");
    expect(herramienta("Editar en una rama")).toBeTruthy();
    expect(herramienta("Insertar molécula")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Rediseñar esta pantalla" })).toBeNull();
    anunciar({ entidad: { tipo: "archivo", id: "a1", nombre: "notas.md" } });
    expect(herramienta("Convertir archivo")).toBeTruthy();
  });

  it("lo que anuncia una pantalla se valida: un tipo inventado no cambia nada", () => {
    montar();
    anunciar({ entidad: { tipo: "hackeo", id: "x" }, ambito: "secreto" });
    expect(screen.getByTestId("chip-contexto").textContent).toContain("Esta pantalla");
  });

  it("el chip dice qué gobierno aplica a un cambio de diseño aquí", () => {
    m.decidirCambio.mockImplementation(() => v("proponer", { motivo: "Lo decide quien gestiona." }));
    montar();
    anunciar(grupo);
    expect(screen.getByTestId("chip-contexto").textContent).toContain("Un cambio de diseño aquí se propone");
    expect(m.decidirCambio).toHaveBeenCalledWith(expect.objectContaining({ ambito: "grupo" }), expect.objectContaining({ origen: "humano" }), "diseno");
  });

  it("«Gobierno» solo aparece cuando lo de delante es (o cuelga de) un grupo, comunidad o página", () => {
    montar();
    expect(screen.queryByRole("tab", { name: "Gobierno" })).toBeNull();
    anunciar({ entidad: { tipo: "publicacion", id: "p1" } });
    expect(screen.queryByRole("tab", { name: "Gobierno" })).toBeNull();
    anunciar(grupo);
    fireEvent.click(tab("Gobierno"));
    expect(screen.getByTestId("pestana-gobierno").textContent).toContain("Protomolécula de Grupo · Semilla");
    expect(screen.getByTestId("resumen-gobierno-local")).toBeTruthy();
    anunciar({ entidad: { tipo: "publicacion", id: "p2" }, gobernadaPor: { tipo: "comunidad", id: "c1", nombre: "Raíz" } });
    expect(tab("Gobierno")).toBeTruthy();
  });

  it("si lo de delante deja de tener gobierno, la pestaña «Gobierno» se va y no te deja en el vacío", () => {
    montar();
    anunciar(grupo);
    fireEvent.click(tab("Gobierno"));
    anunciar({ entidad: { tipo: "perfil", id: "u1" } });
    expect(screen.queryByRole("tab", { name: "Gobierno" })).toBeNull();
    expect(tab("Crear").getAttribute("aria-selected")).toBe("true");
  });

  it("«Gobierno» de las herramientas de un grupo lleva a esa pestaña", () => {
    montar();
    anunciar(grupo);
    fireEvent.click(herramienta("Reglas y privacidad"));
    expect(tab("Gobierno").getAttribute("aria-selected")).toBe("true");
  });
});

describe("ventana de la Protomolécula · la petición", () => {
  it("Enter envía (Mayús+Enter no), con el modo elegido y el contexto", async () => {
    montar();
    escribir("pon el tema oscuro");
    fireEvent.keyDown(barra(), { key: "Enter", shiftKey: true });
    expect(m.planificarPeticion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "En una rama" }));
    fireEvent.keyDown(barra(), { key: "Enter" });
    await waitFor(() => expect(m.planificarPeticion).toHaveBeenCalledTimes(1));
    expect(m.planificarPeticion).toHaveBeenCalledWith({ texto: "pon el tema oscuro", contexto: expect.objectContaining({ ruta: "/" }), modo: "rama" });
    expect(await screen.findByTestId("vista-plan")).toBeTruthy();
  });

  it("mientras Astraura piensa se ve y se puede cancelar sin aplicar nada", async () => {
    m.planificarPeticion.mockImplementation(() => new Promise(() => {}));
    montar();
    await enviar("algo largo");
    expect(await screen.findByText("Astraura está pensando el plan…")).toBeTruthy();
    expect(barra().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Astraura está pensando el plan…")).toBeNull();
    expect(barra().value).toBe("algo largo"); // lo escrito no se pierde
    expect(m.ejecutarPlan).not.toHaveBeenCalled();
  });

  it("plan con «aplicar»: pasos, quién decide y confirmar ejecuta", async () => {
    m.planificarPeticion.mockImplementation(async () => plan({ fuera: ["Enviar un correo"] }));
    montar();
    anunciar(grupo);
    await enviar("pon el tema oscuro");
    const vista = await screen.findByTestId("vista-plan");
    expect(vista.textContent).toContain("Cambiar el diseño del grupo");
    expect(vista.textContent).toContain("Editar grupo «Semilla» directamente");
    expect(vista.textContent).toContain("Enviar un correo"); // lo que queda fuera
    expect(vista.textContent).toContain("Planificado por: Needle (local)");
    expect(screen.getByTestId("veredicto").dataset.decision).toBe("aplicar");
    expect(m.ejecutarPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    await waitFor(() => expect(m.ejecutarPlan).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("resultado-plan")).toBeTruthy();
    expect(screen.getByText("Diseño cambiado")).toBeTruthy();
  });

  it("plan con «proponer»: el botón es «Revisar y proponer», NO ejecuta y abre el compositor aquí mismo", async () => {
    const propuesta = { command: { type: "set_config", payload: { k: "v" } }, title: "Ajustar el diseño", description: "Propuesta de diseño.", payload: { scope: "group", scope_ref: "g1" } };
    m.decidirCambio.mockImplementation(() => v("proponer", { propuesta }));
    montar();
    anunciar(grupo);
    await enviar("cambia el diseño");
    await screen.findByTestId("vista-plan");
    expect(screen.getByTestId("veredicto").dataset.decision).toBe("proponer");
    fireEvent.click(screen.getByRole("button", { name: "Revisar y proponer" }));
    const comp = await screen.findByTestId("compositor");
    expect(comp.textContent).toContain("group · g1 · Ajustar el diseño");
    expect(comp.textContent).toContain("Cambiar el diseño del grupo"); // la petición viaja en la descripción
    expect(m.ejecutarPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Volver al plan" }));
    expect(screen.getByTestId("vista-plan")).toBeTruthy();
  });

  it("plan con «votar»: el botón dice «a votación»", async () => {
    m.decidirCambio.mockImplementation(() => v("votar"));
    montar();
    anunciar(grupo);
    await enviar("cambia las reglas");
    await screen.findByTestId("vista-plan");
    expect(screen.getByRole("button", { name: "Revisar y proponer a votación" })).toBeTruthy();
  });

  it("si el gobierno deniega, no se puede confirmar", async () => {
    m.decidirCambio.mockImplementation(() => v("denegar", { motivo: "Solo la persona dueña lo cambia." }));
    montar();
    await enviar("borra todo");
    await screen.findByTestId("vista-plan");
    const boton = screen.getByRole("button", { name: "No permitido" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(screen.getByText("Solo la persona dueña lo cambia.")).toBeTruthy();
  });

  it("cancelar el plan devuelve el texto a la barra y no ejecuta", async () => {
    montar();
    await enviar("pon el tema oscuro");
    await screen.findByTestId("vista-plan");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByTestId("vista-plan")).toBeNull();
    expect(barra().value).toBe("pon el tema oscuro");
    expect(m.ejecutarPlan).not.toHaveBeenCalled();
  });

  it("«Deshacer» solo aparece si quien ejecutó lo ofrece", async () => {
    const deshacer = vi.fn();
    m.ejecutarPlan.mockImplementation(async () => ({ ok: true, hechos: ["hecho"], pendientes: [], deshacer }));
    montar();
    await enviar("algo");
    await screen.findByTestId("vista-plan");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Deshacer" }));
    await waitFor(() => expect(deshacer).toHaveBeenCalledTimes(1));
  });

  it("una ejecución fallida se cuenta como no aplicada, con su motivo", async () => {
    m.ejecutarPlan.mockImplementation(async () => ({ ok: false, hechos: [], pendientes: [], motivo: "La ejecución de planes aún no está conectada." }));
    montar();
    await enviar("algo");
    await screen.findByTestId("vista-plan");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    const r = await screen.findByTestId("resultado-plan");
    expect(r.textContent).toContain("No se pudo aplicar");
    expect(r.textContent).toContain("aún no está conectada");
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });
});

describe("ventana de la Protomolécula · errores honestos", () => {
  it("sin IA: lo dice, y ofrece las reglas locales, que pasan por el mismo plan y confirmación", async () => {
    m.planificarPeticion.mockImplementation(async () => ({ error: "sin-ia", motivo: "No hay IA conectada." }));
    montar();
    await enviar("sube la mezcla un 10 %");
    const err = await screen.findByTestId("error-peticion");
    expect(err.dataset.tipo).toBe("sin-ia");
    expect(err.textContent).toContain("Sin IA disponible: puedo hacerlo con las reglas locales");
    fireEvent.click(screen.getByRole("button", { name: "Probar con las reglas locales" }));
    const vista = await screen.findByTestId("vista-plan");
    expect(vista.textContent).toContain("Dar una orden a la molécula");
    expect(vista.textContent).toContain("sube la mezcla un 10 %");
    expect(vista.textContent).toContain("reglas locales (sin IA)");
    expect(m.ejecutarPlan).not.toHaveBeenCalled();
  });

  it("fuera de vocabulario y tope: se dice qué sí se puede, sin reintento ciego", async () => {
    m.planificarPeticion.mockImplementation(async () => ({ error: "fuera-de-vocabulario", motivo: "Enviar correos no está en mi lista." }));
    montar();
    await enviar("manda un correo");
    const err = await screen.findByTestId("error-peticion");
    expect(err.textContent).toContain("Enviar correos no está en mi lista.");
    expect(err.textContent).toContain("objetos 3D animados");
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
    cleanup();
    m.planificarPeticion.mockImplementation(async () => ({ error: "tope", motivo: "20 por hora." }));
    montar();
    await enviar("otra");
    expect((await screen.findByTestId("error-peticion")).textContent).toContain("20 por hora.");
  });

  it("una excepción no deja la ventana colgada y se puede reintentar", async () => {
    m.planificarPeticion.mockImplementationOnce(async () => { throw new Error("red caída"); });
    montar();
    await enviar("algo");
    const err = await screen.findByTestId("error-peticion");
    expect(err.textContent).toContain("red caída");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByTestId("vista-plan")).toBeTruthy();
  });
});

describe("ventana de la Protomolécula · herramientas", () => {
  it("las que rellenan ponen la frase y el modo en la barra y enfocan", async () => {
    montar();
    anunciar({ entidad: { tipo: "publicacion", id: "p1", nombre: "Mi post" } });
    fireEvent.click(herramienta("Editar en una rama"));
    expect(barra().value).toBe("Edita esta publicación: ");
    expect(screen.getByRole("radio", { name: "En una rama" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(barra()));
  });

  it("las que lanzan un plan que solo abre algo lo ejecutan directo (sin IA)", async () => {
    montar();
    fireEvent.click(herramienta("Abrir en XR"));
    await waitFor(() => expect(m.ejecutarPlan).toHaveBeenCalledTimes(1));
    expect(m.ejecutarPlan.mock.calls[0][0]).toMatchObject({ pasos: [{ tipo: "abrir-en", donde: "xr" }] });
    expect(m.planificarPeticion).not.toHaveBeenCalled();
    expect(m.decidirCambio.mock.calls.filter((c) => c[2] !== "diseno")).toHaveLength(0);
  });

  it("las que cambian algo (insertar molécula) enseñan el plan y respetan al gobierno", async () => {
    m.decidirCambio.mockImplementation(() => v("proponer"));
    montar();
    anunciar({ entidad: { tipo: "publicacion", id: "p1", nombre: "Mi post" }, gobernadaPor: { tipo: "grupo", id: "g1", nombre: "Semilla" }, ambito: "grupo" });
    fireEvent.click(herramienta("Insertar molécula"));
    const vista = await screen.findByTestId("vista-plan");
    expect(vista.textContent).toContain("Insertar en publicación «Mi post»");
    expect(vista.textContent).toContain("herramienta de la ventana (sin IA)");
    expect(m.ejecutarPlan).not.toHaveBeenCalled();
    expect(screen.getByTestId("veredicto").dataset.decision).toBe("proponer");
    expect(m.planificarPeticion).not.toHaveBeenCalled();
  });

  it("«Abrir el lienzo» llama al lienzo", () => {
    const { p } = montar();
    fireEvent.click(herramienta("Abrir el lienzo"));
    expect(p.alAbrirLienzo).toHaveBeenCalledTimes(1);
  });
});

describe("ventana de la Protomolécula · historial", () => {
  it("recuerda lo pedido (local), lo devuelve a la barra al tocarlo y se puede borrar", async () => {
    montar();
    await enviar("pon el tema oscuro");
    await screen.findByTestId("vista-plan");
    const hist = screen.getByTestId("historial");
    expect(hist.textContent).toContain("Peticiones recientes (1)");
    expect(JSON.parse(window.localStorage.getItem(CLAVE_HISTORIAL) ?? "[]")[0].texto).toBe("pon el tema oscuro");
    fireEvent.click(screen.getByRole("button", { name: /pon el tema oscuro/ }));
    expect(barra().value).toBe("pon el tema oscuro");
    fireEvent.click(screen.getByRole("button", { name: "Borrar el historial" }));
    expect(screen.queryByTestId("historial")).toBeNull();
    expect(window.localStorage.getItem(CLAVE_HISTORIAL)).toBeNull();
  });
});

describe("ventana de la Protomolécula · teclado y pantallas", () => {
  it("las flechas mueven entre pestañas", () => {
    montar();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(tab("Controles").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(tab("Vínculos").getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(tab("Crear").getAttribute("aria-selected")).toBe("true");
  });

  it("Esc cierra la ventana; con el menú «⋯» abierto, cierra solo el menú", () => {
    const { p } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Apariencia" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(p.alCerrar).not.toHaveBeenCalled();
    fireEvent.keyDown(barra(), { key: "Escape" });
    expect(p.alCerrar).toHaveBeenCalledTimes(1);
  });

  it("el menú «⋯» abre con foco en su primera opción y las flechas lo recorren", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("360 px: hoja inferior fija dentro de la pantalla y con su desplazamiento", () => {
    montar();
    const panel = screen.getByRole("dialog", { name: "Protomolécula" });
    for (const c of ["max-sm:fixed", "max-sm:inset-x-3", "max-sm:w-auto", "max-sm:overflow-y-auto", "max-sm:max-h-[72dvh]", "motion-reduce:animate-none"]) expect(panel.className).toContain(c);
  });

  it("todo lo clicable tiene cursor-pointer y objetivo táctil de 44 px; las pestañas inactivas conservan su nombre accesible en móvil", () => {
    montar();
    anunciar(grupo);
    const panel = screen.getByRole("dialog", { name: "Protomolécula" });
    for (const b of within(panel).getAllByRole("button")) {
      if ((b as HTMLButtonElement).disabled) continue;
      expect(b.className, b.textContent ?? b.getAttribute("aria-label") ?? "").toContain("cursor-pointer");
    }
    for (const t of screen.getAllByRole("tab")) expect(t.className).toContain("min-h-[44px]");
    expect(tab("Controles").textContent).toBe("Controles");
    expect(within(tab("Controles")).getByText("Controles").className).toContain("max-sm:sr-only");
  });

  it("la pestaña «Gobierno» enseña el resumen completo de la entidad en cuanto carga (antes, el local)", async () => {
    montar();
    anunciar(grupo);
    fireEvent.click(tab("Gobierno"));
    expect(await screen.findByTestId("resumen-gobierno-p2")).toBeTruthy();
    expect(screen.getByTestId("resumen-gobierno-p2").textContent).toBe("Semilla");
    expect(screen.queryByTestId("resumen-gobierno-local")).toBeNull();
  });
});
