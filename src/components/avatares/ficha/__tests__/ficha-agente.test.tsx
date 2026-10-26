import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { claveConfigAgente, claveRecuerdosAgente } from "@/lib/avatares/agente/almacen-agente";
import { configPorDefecto } from "@/lib/avatares/agente/config-agente";
import { LINEA_HONESTA } from "@/lib/avatares/agente/percepcion";
import { ajustesCapasEntidadGuardados } from "@/lib/astraura/use-capas-entidad";
import { getPrimaryChoice } from "@/lib/astraura/primary-system";
import { ASTRAURA_BONSAI_LOCAL_SOURCE_ID } from "@/ai/astraura/free-catalog";

const cerebrosFalsos = vi.hoisted(() => ({
  lista: [] as Array<Record<string, unknown>>,
  ok: true,
}));

vi.mock("@/lib/brains/brains", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/brains/brains")>();
  return { ...real, listarCerebros: vi.fn(async () => ({ ok: cerebrosFalsos.ok, brains: cerebrosFalsos.ok ? cerebrosFalsos.lista : [] })) };
});

vi.mock("@/components/agentes-red/perfil-agente-red", () => ({
  PerfilAgenteRed: ({ agente }: { agente: { nombre: string } }) => <div data-testid="perfil-agente-red">Perfil de {agente.nombre}</div>,
}));

vi.mock("@/components/cerebro/telepatia-dialog", () => ({
  default: ({ cerebro }: { cerebro: { name: string } }) => <div data-testid="dialogo-telepatia">Telepatía de {cerebro.name}</div>,
}));

import { FichaAgente } from "../ficha-agente";

const personalidad = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "aurora", nombre: "Aurora", dueno: { tipo: "perfil", id: "p1" } });
const botPagina = crearAgenteMundoRef({ origen: "bot", idOrigen: "pg1", nombre: "Voz de la página", dueno: { tipo: "pagina", id: "pag-3" } });

const cerebro = (id: string, name: string, scope: string, scope_ref: string | null) => ({
  id, name, scope, scope_ref, description: "", config: {}, includes: {}, servers: [],
});

const guardada = (a = personalidad) => JSON.parse(window.localStorage.getItem(claveConfigAgente(a.id)) ?? "null");

const irA = async (nombre: string) => {
  fireEvent.click(screen.getByRole("tab", { name: nombre }));
};

beforeEach(() => {
  window.localStorage.clear();
  cerebrosFalsos.ok = true;
  cerebrosFalsos.lista = [
    cerebro("c-cuenta", "Mi cerebro", "account", null),
    cerebro("c-perfil", "Cerebro del perfil", "profile", "p1"),
    cerebro("c-pagina", "Cerebro de la página", "page", "pag-3"),
    cerebro("c-otro", "Otro perfil", "profile", "p9"),
  ];
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("FichaAgente · estructura", () => {
  it("mantiene el contrato: sección con el aria-label y data-testid del esqueleto, nombre y chapa «Bot de IA»", () => {
    render(<FichaAgente agente={personalidad} />);
    const ficha = screen.getByTestId("ficha-agente");
    expect(ficha).toHaveAttribute("aria-label", "Ficha de Aurora");
    expect(within(ficha).getByRole("heading", { name: "Aurora" })).toBeInTheDocument();
    const cabecera = ficha.querySelector("header") as HTMLElement;
    expect(within(cabecera).getByTestId("insignia-bot-ia")).toHaveTextContent("Bot de IA");
  });

  it("tiene las siete pestañas, en orden", () => {
    render(<FichaAgente agente={personalidad} />);
    const nombres = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(nombres).toEqual(["Identidad", "Cerebro", "Capas", "Percepción", "Motores", "Herramientas", "Perfil y red"]);
    expect(screen.getByRole("tab", { name: "Identidad" })).toHaveAttribute("aria-selected", "true");
  });

  it("la chapa «Bot de IA» se ve en todas las pestañas", async () => {
    render(<FichaAgente agente={botPagina} />);
    for (const nombre of ["Identidad", "Cerebro", "Capas", "Percepción", "Motores", "Herramientas", "Perfil y red"]) {
      await irA(nombre);
      const cabecera = screen.getByTestId("ficha-agente").querySelector("header") as HTMLElement;
      expect(within(cabecera).getByTestId("insignia-bot-ia")).toBeVisible();
    }
  });

  it("el botón de cerrar solo existe si hay alCerrar, y lo llama", () => {
    const { unmount } = render(<FichaAgente agente={personalidad} />);
    expect(screen.queryByRole("button", { name: "Cerrar la ficha" })).toBeNull();
    unmount();
    const alCerrar = vi.fn();
    render(<FichaAgente agente={personalidad} alCerrar={alCerrar} />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar la ficha" }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("la pestaña «Perfil y red» monta PerfilAgenteRed con el agente", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Perfil y red");
    expect(screen.getByTestId("perfil-agente-red")).toHaveTextContent("Perfil de Aurora");
  });

  it("los objetivos táctiles de cada pestaña miden al menos 44 px (clase min-h)", async () => {
    render(<FichaAgente agente={personalidad} />);
    for (const nombre of ["Identidad", "Cerebro", "Capas", "Percepción", "Motores", "Herramientas"]) {
      await irA(nombre);
      await waitFor(() => expect(screen.queryByText(/Cargando/)).toBeNull());
      const pequenos = screen.getAllByRole("button").filter((b) => b.getAttribute("role") !== "switch" && !/min-h-\[(44px|2\.75rem)\]/.test(b.className));
      expect(pequenos.map((b) => b.textContent)).toEqual([]);
    }
  });

  it("el contenedor no puede desbordar horizontalmente (min-w-0 y overflow-x oculto)", () => {
    render(<FichaAgente agente={personalidad} />);
    const clases = screen.getByTestId("ficha-agente").className;
    expect(clases).toContain("min-w-0");
    expect(clases).toContain("overflow-x-hidden");
    expect(clases).toContain("w-full");
  });
});

describe("FichaAgente · Identidad y Desarrollo (solo lectura)", () => {
  it("sin datos lo dice y no inventa actividad", () => {
    render(<FichaAgente agente={personalidad} />);
    expect(screen.getByTestId("desarrollo-sin-datos")).toHaveTextContent("Sin datos todavía");
    expect(screen.getByTestId("desarrollo-sin-memorias")).toBeInTheDocument();
    expect(screen.getByTestId("desarrollo-sin-evolucion")).toHaveTextContent("0,05");
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
  });

  it("muestra solo las memorias que el agente puede ver: un agente público no ve las personales", async () => {
    const at = Date.now() - 5 * 60_000;
    window.localStorage.setItem(
      claveRecuerdosAgente(botPagina.id),
      JSON.stringify([
        { id: "r1", texto: "dato íntimo del creador", alcance: "personal", at, origen: "chat" },
        { id: "r2", texto: "la página abre los sábados", alcance: "publica", at, origen: "publicación" },
      ]),
    );
    render(<FichaAgente agente={botPagina} />);
    expect(await screen.findByText("la página abre los sábados")).toBeInTheDocument();
    expect(screen.queryByText("dato íntimo del creador")).toBeNull();
    expect(screen.getByText(/hace 5 min/)).toBeInTheDocument();
    expect(screen.queryByTestId("desarrollo-sin-datos")).toBeNull();
  });

  it("muestra la evolución con su tope diario y deja deshacer un paso", async () => {
    const base = configPorDefecto(personalidad);
    const ahora = Date.now();
    window.localStorage.setItem(
      claveConfigAgente(personalidad.id),
      JSON.stringify({
        ...base,
        desarrollo: { deriva: { humor: 0.03 }, historial: [{ id: "ev-1", at: ahora - 1000, rasgo: "humor", delta: 0.03, motivo: "chiste compartido" }] },
      }),
    );
    render(<FichaAgente agente={personalidad} />);
    expect(await screen.findByText(/chiste compartido/)).toBeInTheDocument();
    expect(screen.getByText(/Hoy se ha movido 0,03 de 0,05; le quedan 0,02/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Deshacer Humor/ }));
    await waitFor(() => expect(screen.getByText(/· deshecho/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Deshacer Humor/ })).toBeNull();
    const c = guardada();
    expect(c.desarrollo.deriva.humor).toBeUndefined();
    expect(c.desarrollo.historial[0].deshecha).toBe(true);
    // el cupo del día sigue gastado
    expect(screen.getByText(/Hoy se ha movido 0,03 de 0,05; le quedan 0,02/)).toBeInTheDocument();
  });
});

describe("FichaAgente · Cerebro", () => {
  it("por defecto es propio, con nombre editable, y no crea ningún cerebro en la cuenta", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Cerebro");
    expect(screen.getByRole("radio", { name: /Cerebro propio/ })).toHaveAttribute("aria-checked", "true");
    const nombre = screen.getByLabelText("Nombre de su cerebro");
    expect(nombre).toHaveValue("Cerebro de Aurora");
    fireEvent.change(nombre, { target: { value: "Mi memoria viva" } });
    await waitFor(() => expect(guardada().cerebro.nombre).toBe("Mi memoria viva"));
  });

  it("vincula un cerebro de la cuenta y lo guarda; las opciones no permitidas salen deshabilitadas", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Cerebro");
    fireEvent.click(screen.getByRole("radio", { name: /Cerebro de mi cuenta/ }));
    const selector = await screen.findByLabelText("Cerebro vinculado");
    await waitFor(() => expect(within(selector).getAllByRole("option").length).toBeGreaterThan(2));
    const otro = within(selector).getByRole("option", { name: /Otro perfil/ }) as HTMLOptionElement;
    expect(otro.disabled).toBe(true);
    expect(otro.textContent).toMatch(/no permitido/);
    fireEvent.change(selector, { target: { value: "c-perfil" } });
    await waitFor(() => expect(guardada().cerebro.vinculado).toMatchObject({ brainId: "c-perfil", ambito: "perfil", ambitoRef: "p1" }));
    expect(guardada().cerebro.tipo).toBe("vinculado");
    // vuelve al propio
    fireEvent.click(screen.getByRole("radio", { name: /Cerebro propio/ }));
    await waitFor(() => expect(guardada().cerebro.tipo).toBe("propio"));
  });

  it("un agente público no puede vincular un cerebro personal o de otra entidad", async () => {
    render(<FichaAgente agente={botPagina} />);
    await irA("Cerebro");
    fireEvent.click(screen.getByRole("radio", { name: /Cerebro de mi cuenta/ }));
    const selector = await screen.findByLabelText("Cerebro vinculado");
    await waitFor(() => expect(within(selector).getAllByRole("option").length).toBeGreaterThan(2));
    const permitidos = within(selector).getAllByRole("option").filter((o) => !(o as HTMLOptionElement).disabled).map((o) => o.textContent);
    expect(permitidos.some((t) => /Cerebro de la página/.test(t ?? ""))).toBe(true);
    expect(permitidos.some((t) => /Mi cerebro|Cerebro del perfil|Otro perfil/.test(t ?? ""))).toBe(false);
  });

  it("si no se pueden cargar los cerebros lo dice y ofrece reintentar", async () => {
    cerebrosFalsos.ok = false;
    render(<FichaAgente agente={personalidad} />);
    await irA("Cerebro");
    fireEvent.click(screen.getByRole("radio", { name: /Cerebro de mi cuenta/ }));
    expect(await screen.findByText(/No se pudieron cargar tus cerebros/)).toBeInTheDocument();
    cerebrosFalsos.ok = true;
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByLabelText("Cerebro vinculado")).toBeInTheDocument();
  });

  it("modo telepático: vincula con otro cerebro de la cuenta, lo lista con su estado y lo quita", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Cerebro");
    expect(screen.queryByRole("region", { name: "Telepatía" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Telepática/ }));
    await waitFor(() => expect(guardada().cerebro.memoria).toBe("telepatica"));
    expect(await screen.findByTestId("telepatia-sin-vinculos")).toBeInTheDocument();
    const destino = await screen.findByLabelText("Vincular con otro cerebro");
    await waitFor(() => expect(within(destino).getAllByRole("option").length).toBeGreaterThan(2));
    fireEvent.change(destino, { target: { value: "c-perfil" } });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    await waitFor(() => expect(guardada().cerebro.vinculos).toHaveLength(1));
    expect(guardada().cerebro.vinculos[0]).toMatchObject({ destino: { tipo: "cerebro", id: "c-perfil" }, estado: "activo" });
    const lista = await screen.findByRole("list", { name: "Vínculos telepáticos" });
    expect(within(lista).getByText("Cerebro del perfil")).toBeInTheDocument();
    expect(within(lista).getByText(/todavía no se ha sincronizado/)).toBeInTheDocument();
    expect(within(lista).getByText(/Todavía no tiene recuerdos que sincronizar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Quitar el vínculo con Cerebro del perfil/ }));
    await waitFor(() => expect(guardada().cerebro.vinculos).toHaveLength(0));
  });

  it("con un cerebro vinculado, la telepatía se gestiona en ese cerebro (abre el diálogo del cerebro)", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Cerebro");
    fireEvent.click(screen.getByRole("radio", { name: /Cerebro de mi cuenta/ }));
    const selector = await screen.findByLabelText("Cerebro vinculado");
    await waitFor(() => expect(within(selector).getAllByRole("option").length).toBeGreaterThan(2));
    fireEvent.change(selector, { target: { value: "c-cuenta" } });
    fireEvent.click(screen.getByRole("radio", { name: /Telepática/ }));
    const abrir = await screen.findByRole("button", { name: /Abrir la telepatía de este cerebro/ });
    await waitFor(() => expect(abrir).not.toBeDisabled());
    fireEvent.click(abrir);
    expect(await screen.findByTestId("dialogo-telepatia")).toHaveTextContent("Telepatía de Mi cerebro");
  });

  it("los interruptores de sincronía se guardan", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Cerebro");
    fireEvent.click(screen.getByRole("switch", { name: "Sincronizar solo" }));
    await waitFor(() => expect(guardada().cerebro.sincronizacionAuto).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Transferir recuerdos entre mis neuronas" }));
    await waitFor(() => expect(guardada().cerebro.transferenciaAuto).toBe(false));
  });
});

describe("FichaAgente · Capas", () => {
  it("lista las capas integradas con «Todo StarSeed OS» sin conectar y dice qué se aplica", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Capas");
    const lista = screen.getByRole("list", { name: "Capas del agente" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);
    const red = lista.querySelector('[data-capa="todo-starseed-os"]') as HTMLElement;
    expect(within(red).getByText("Todo StarSeed OS")).toBeInTheDocument();
    expect(within(red).getByRole("switch", { name: "Conectar Todo StarSeed OS" })).toHaveAttribute("aria-checked", "false");
    expect(red.querySelector('[data-estado="ficha"]')).not.toBeNull();
    const nube = lista.querySelector('[data-capa="nube"]') as HTMLElement;
    expect(nube.querySelector('[data-estado="aplicado"]')).not.toBeNull();
  });

  it("desconectar una capa de conciencia la APLICA en capas-entidad (ámbito agente)", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Capas");
    fireEvent.click(screen.getByRole("switch", { name: "Conectar Nube" }));
    await waitFor(() => expect(ajustesCapasEntidadGuardados().agentes[personalidad.id]).toMatchObject({ nube: false }));
    expect(guardada().capas.find((c: { id: string }) => c.id === "nube").conectada).toBe(false);
  });

  it("conectar «Todo StarSeed OS» enciende también la colectiva aplicada", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Capas");
    fireEvent.click(screen.getByRole("switch", { name: "Conectar Colectiva" })); // la apaga
    await waitFor(() => expect(ajustesCapasEntidadGuardados().agentes[personalidad.id]).toMatchObject({ colectiva: false }));
    fireEvent.click(screen.getByRole("switch", { name: "Conectar Todo StarSeed OS" }));
    await waitFor(() => expect(ajustesCapasEntidadGuardados().agentes[personalidad.id]?.colectiva).toBe(true));
  });

  it("ajusta el peso, reordena, quita y vuelve a añadir una capa", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Capas");
    fireEvent.change(screen.getByLabelText("Peso de Mesh"), { target: { value: "0.2" } });
    await waitFor(() => expect(guardada().capas.find((c: { id: string }) => c.id === "mesh").peso).toBe(0.2));
    fireEvent.click(screen.getByRole("button", { name: "Subir Nube" }));
    await waitFor(() => expect(guardada().capas.map((c: { id: string }) => c.id).slice(0, 3)).toEqual(["local", "nube", "mesh"]));
    expect(screen.getByRole("button", { name: "Subir Local" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Quitar Mesh" }));
    await waitFor(() => expect(guardada().capas.some((c: { id: string }) => c.id === "mesh")).toBe(false));
    expect(ajustesCapasEntidadGuardados().agentes[personalidad.id]?.mesh).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Mesh" }));
    await waitFor(() => expect(guardada().capas.some((c: { id: string }) => c.id === "mesh")).toBe(true));
  });

  it("añade una capa propia, rechaza un nombre vacío y un nombre repetido", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Capas");
    fireEvent.click(screen.getByRole("button", { name: "Añadir capa propia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nombre");
    fireEvent.change(screen.getByLabelText("Capa propia"), { target: { value: "Huerto vecinal" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir capa propia" }));
    await waitFor(() => expect(guardada().capas.some((c: { nombre: string }) => c.nombre === "Huerto vecinal")).toBe(true));
    fireEvent.change(screen.getByLabelText("Capa propia"), { target: { value: "huerto vecinal" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir capa propia" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una capa");
  });
});

describe("FichaAgente · Percepción", () => {
  it("los deslizadores guardan el valor base y la vista previa es el filtro real, que acaba con la línea honesta", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Percepción");
    fireEvent.change(screen.getByLabelText("Humor"), { target: { value: "0.9" } });
    await waitFor(() => expect(guardada().percepcion.rasgos.humor).toBe(0.9));
    const vista = screen.getByTestId("vista-previa-filtro");
    expect(vista.textContent).toContain("Humor alto");
    expect(vista.textContent?.endsWith(LINEA_HONESTA)).toBe(true);
  });

  it("un preset coloca los cinco deslizadores", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Percepción");
    fireEvent.click(screen.getByRole("button", { name: "Analítica" }));
    await waitFor(() => expect(guardada().percepcion.rasgos).toEqual({ curiosidad: 0.7, empatia: 0.3, escepticismo: 0.9, humor: 0.2, foco: 0.7 }));
  });

  it("añade y quita temas, sin repetir y con tope", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Percepción");
    const campo = screen.getByLabelText("Nuevo tema");
    fireEvent.change(campo, { target: { value: "huertos" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(guardada().percepcion.temas).toEqual(["huertos"]));
    expect(screen.getByTestId("vista-previa-filtro").textContent).toContain("«huertos»");
    fireEvent.change(campo, { target: { value: "Huertos" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ya está");
    fireEvent.click(screen.getByRole("button", { name: "Quitar el tema huertos" }));
    await waitFor(() => expect(guardada().percepcion.temas).toEqual([]));
  });

  it("no ofrece sentidos íntimos y guarda los que se activan", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Percepción");
    for (const intimo of ["Micrófono", "Cámara", "Correo", "Ubicación", "Terminal", "Sensores", "Captura de pantalla"]) {
      expect(screen.queryByRole("switch", { name: intimo })).toBeNull();
    }
    fireEvent.click(screen.getByRole("switch", { name: "Archivos" }));
    await waitFor(() => expect(guardada().percepcion.sentidos).toContain("archivos"));
    fireEvent.click(screen.getByRole("switch", { name: "Pantalla" }));
    await waitFor(() => expect(guardada().percepcion.sentidos).not.toContain("pantalla"));
  });
});

describe("FichaAgente · Motores", () => {
  it("BitNet 1.58 y Bonsai aparecen siempre como opciones de la palabra; Needle y Jev como reflejo y juicio", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Motores");
    const palabra = screen.getByLabelText("Palabra") as HTMLSelectElement;
    const textos = Array.from(palabra.options).map((o) => o.textContent);
    expect(textos).toEqual(expect.arrayContaining(["BitNet 1.58 (Astraura)", "Bonsai (ternario)", "Enrutador económico", "Heredar"]));
    expect(Array.from((screen.getByLabelText("Reflejo") as HTMLSelectElement).options).map((o) => o.textContent)).toContain("Cactus Needle");
    expect(Array.from((screen.getByLabelText("Juicio") as HTMLSelectElement).options).map((o) => o.textContent)).toContain("Jev");
    const profundo = screen.getByLabelText("Profundo") as HTMLSelectElement;
    expect(profundo.value).toBe("__apagado__");
  });

  it("elegir el motor de la palabra lo APLICA al sistema primario del ámbito agente", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Motores");
    fireEvent.change(screen.getByLabelText("Palabra"), { target: { value: "bonsai" } });
    await waitFor(() => expect(getPrimaryChoice("agente", personalidad.id)).toEqual({ modo: "fuente", fuente: ASTRAURA_BONSAI_LOCAL_SOURCE_ID }));
    fireEvent.change(screen.getByLabelText("Palabra"), { target: { value: "heredar" } });
    await waitFor(() => expect(getPrimaryChoice("agente", personalidad.id)).toBeNull());
  });

  it("los papeles que no son la palabra se guardan sin tocar el sistema primario, y se pueden apagar", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Motores");
    fireEvent.change(screen.getByLabelText("Reflejo"), { target: { value: "__apagado__" } });
    await waitFor(() => expect(guardada().motores.roles.reflejo).toBeNull());
    expect(getPrimaryChoice("agente", personalidad.id)).toBeNull();
  });

  it("lo de pago está apagado: sus opciones salen deshabilitadas hasta permitirlo, y al quitarlo se apagan los papeles", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Motores");
    expect(screen.getByRole("switch", { name: "Permitir fuentes de pago" })).toHaveAttribute("aria-checked", "false");
    fireEvent.change(screen.getByLabelText("Profundo"), { target: { value: "externo" } });
    const fuente = await screen.findByLabelText("Fuente");
    const pago = Array.from((fuente as HTMLSelectElement).options).filter((o) => /de pago|Claude|OpenAI/i.test(o.textContent ?? "") && o.parentElement?.getAttribute("label")?.startsWith("De pago"));
    expect(pago.length).toBeGreaterThan(0);
    expect(pago.every((o) => o.disabled)).toBe(true);
    fireEvent.click(screen.getByRole("switch", { name: "Permitir fuentes de pago" }));
    await waitFor(() => expect(guardada().motores.permitirPago).toBe(true));
    fireEvent.change(screen.getByLabelText("Fuente"), { target: { value: "anthropic-paid" } });
    await waitFor(() => expect(guardada().motores.roles.profundo.fuente).toBe("anthropic-paid"));
    fireEvent.click(screen.getByRole("switch", { name: "Permitir fuentes de pago" }));
    await waitFor(() => expect(guardada().motores.permitirPago).toBe(false));
    expect(guardada().motores.roles.profundo).toBeNull();
  });

  it("el tope de llamadas por hora se guarda y se acota", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Motores");
    const tope = screen.getByLabelText("Llamadas por hora");
    expect(tope).toHaveValue("20");
    fireEvent.change(tope, { target: { value: "35" } });
    await waitFor(() => expect(guardada().motores.topePorHora).toBe(35));
    expect(screen.getByText("35 por hora")).toBeInTheDocument();
  });
});

describe("FichaAgente · Herramientas", () => {
  it("solo ofrece lo que existe, con «Todas» por defecto, y guarda la selección", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Herramientas");
    const todas = await screen.findAllByRole("switch", { name: "Todas" });
    expect(todas).toHaveLength(2); // familias y habilidades
    expect(todas.every((t) => t.getAttribute("aria-checked") === "true")).toBe(true);
    const web = await screen.findByRole("switch", { name: "Web" });
    expect(web).toHaveAttribute("aria-checked", "true");
    fireEvent.click(web);
    await waitFor(() => expect(guardada().herramientas.familias).not.toBeNull());
    expect(guardada().herramientas.familias).not.toContain("web");
    expect(guardada().herramientas.familias).toContain("voice");
    expect(screen.getByRole("switch", { name: "Web" })).toHaveAttribute("aria-checked", "false");
    // volver a marcarla restablece «todas»
    fireEvent.click(screen.getByRole("switch", { name: "Web" }));
    await waitFor(() => expect(guardada().herramientas.familias).toBeNull());
  });

  it("quita de lo guardado lo que ya no existe en la Biblioteca", async () => {
    const base = configPorDefecto(personalidad);
    window.localStorage.setItem(claveConfigAgente(personalidad.id), JSON.stringify({ ...base, herramientas: { familias: ["web", "fantasma"], habilidades: ["no-existe"] } }));
    render(<FichaAgente agente={personalidad} />);
    await irA("Herramientas");
    await waitFor(() => expect(guardada().herramientas).toEqual({ familias: ["web"], habilidades: [] }));
  });

  it("enlaza a la Biblioteca (ruta que existe)", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Herramientas");
    const enlace = await screen.findByRole("link", { name: "Biblioteca" });
    expect(enlace).toHaveAttribute("href", "/library");
  });
});

describe("FichaAgente · restablecer", () => {
  it("pide confirmación, borra la ficha guardada y lo que aplicó", async () => {
    render(<FichaAgente agente={personalidad} />);
    await irA("Motores");
    fireEvent.change(screen.getByLabelText("Palabra"), { target: { value: "bitnet-158" } });
    await waitFor(() => expect(getPrimaryChoice("agente", personalidad.id)).toEqual({ modo: "astraura-158" }));
    fireEvent.click(screen.getByRole("button", { name: "Restablecer la ficha" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(guardada()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restablecer la ficha" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, restablecer" }));
    await waitFor(() => expect(guardada()).toBeNull());
    expect(getPrimaryChoice("agente", personalidad.id)).toBeNull();
    expect((screen.getByLabelText("Palabra") as HTMLSelectElement).value).toBe("heredar");
  });
});

describe("FichaAgente · nombres prohibidos", () => {
  it("ninguna pestaña usa el nombre antiguo del producto (guardia de nombre)", async () => {
    render(<FichaAgente agente={personalidad} />);
    for (const nombre of ["Identidad", "Cerebro", "Capas", "Percepción", "Motores", "Herramientas", "Perfil y red"]) {
      await irA(nombre);
      await waitFor(() => expect(screen.queryByText(/Cargando/)).toBeNull());
      expect(document.body.textContent).not.toMatch(new RegExp(`\\b${["Man", "do"].join("")}\\b`, "i"));
    }
  });
});
