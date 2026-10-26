/**
 * El panel de los sueños y su botón · Ola 1025U · U4. Testing Library sobre el hook REAL (`useSuenos`) con una IA de
 * mentira, más un recorrido con el ENRUTADOR simulado para comprobar que, sin pasarle nada, el panel usa el económico.
 */
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const r = vi.hoisted(() => ({
  astrauraChat: vi.fn(),
}));
vi.mock("@/ai/astraura/router", () => ({
  astrauraChat: r.astrauraChat,
  getIntelligenceSettings: () => ({ mode: "auto", allowConfiguredPaid: false }),
  classifyTask: () => ({ kind: "creative" }),
  rankCandidates: () => [],
}));

import { leerRecuerdosAgente } from "@/lib/avatares/agente/almacen-agente";
import { crearAgenteMundoRef, type AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import type { CreacionMundo } from "@/lib/avatares/mundo/simulacion";
import { guardarUso, leerSuenos } from "@/lib/avatares/suenos/almacen-suenos";
import type { GeneradorIA, PeticionIA, RespuestaIA } from "@/lib/avatares/suenos/ejecutor";
import { TOPES_SUENO, registrarInicio, usoVacio } from "@/lib/avatares/suenos/sueno";
import { BotonSonar } from "../boton-sonar";
import { PanelSuenos } from "../panel-suenos";
import { useSuenos } from "../use-suenos";

const luna = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "luna", nombre: "Luna", dueno: { tipo: "perfil", id: "p1" } });
const sol = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "sol", nombre: "Sol", dueno: { tipo: "perfil", id: "p1" } });
const pagina = crearAgenteMundoRef({ origen: "bot", idOrigen: "pg1", nombre: "Voz de la Página", dueno: { tipo: "pagina", id: "pagina-1" } });

interface ArnesProps {
  agentes?: AgenteMundoRef[];
  generar?: GeneradorIA;
  descansando?: string[];
  alCrearObras?: (crear: (tick: number) => CreacionMundo[]) => void;
  escenarioId?: string;
}

function Arnes({ agentes = [luna, sol, pagina], generar, descansando = [], alCrearObras, escenarioId = "esc-1" }: ArnesProps) {
  const uso = useSuenos({ escenarioId, agentes, estado: null, activo: true, alCrearObras, generar });
  const [abierto, setAbierto] = React.useState(true);
  return (
    <div>
      <BotonSonar abierto={abierto} alAlternar={() => setAbierto((a) => !a)} sonando={uso.enCurso !== null} />
      {abierto && <PanelSuenos uso={uso} agentes={agentes} descansando={descansando} zonaNombre="Sueños" />}
    </div>
  );
}

const iaQueResponde: GeneradorIA = (() => {
  let n = 0;
  return async (p: PeticionIA): Promise<RespuestaIA> => ({ ok: true, texto: `Imagino la escena ${++n} para ${p.agenteId}`, fuente: "BitNet 1.58 local", gratis: true });
})();

/** Una IA que no contesta hasta que se la deje, para ver el sueño «en curso». */
function iaConPuerta() {
  const pendientes: Array<(x: RespuestaIA) => void> = [];
  const generar: GeneradorIA = (p) =>
    new Promise<RespuestaIA>((resolver) => {
      pendientes.push(resolver);
      p.signal.addEventListener("abort", () => resolver({ ok: false, motivo: "Cancelado." }));
    });
  return { generar, soltar: (texto: string) => pendientes.shift()?.({ ok: true, texto, gratis: true }), cuantas: () => pendientes.length };
}

const marcar = (nombre: string) => fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(`^${nombre}`) }));
const escribirTema = (t: string) => fireEvent.change(screen.getByLabelText("Tema del sueño"), { target: { value: t } });
const empezar = () => fireEvent.click(screen.getByRole("button", { name: /Empezar a soñar/ }));
const tarjetas = () => screen.queryAllByTestId("tarjeta-sueno");

beforeEach(() => {
  window.localStorage.clear();
  r.astrauraChat.mockReset();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("el botón «Soñar juntos»", () => {
  it("abre y cierra el panel, lo dice con aria-pressed y mide al menos 44 px", () => {
    render(<Arnes />);
    const b = screen.getByRole("button", { name: /Soñar juntos/ });
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.className).toMatch(/min-h-11/);
    expect(b.className).toMatch(/cursor-pointer/);
    fireEvent.click(b);
    expect(screen.queryByTestId("panel-suenos")).toBeNull();
    expect(b.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("el formulario", () => {
  it("al principio no se puede empezar y no hay sueños", () => {
    render(<Arnes />);
    expect((screen.getByRole("button", { name: /Empezar a soñar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Aún no hay sueños guardados aquí/)).toBeTruthy();
    expect(screen.getByTestId("resumen-sueno").textContent).toMatch(/Elige a quien quieras/);
  });

  it("cada agente sale con su chapa «Bot de IA» y su origen", () => {
    render(<Arnes />);
    const lista = screen.getByRole("list", { name: "Agentes de este escenario" });
    expect(within(lista).getAllByTestId("etiqueta-bot-ia")).toHaveLength(3);
    expect(within(lista).getByText("Bot de una entidad")).toBeTruthy();
  });

  it("el resumen dice si el sueño será individual o compartido y cuántos turnos lleva", () => {
    render(<Arnes />);
    escribirTema("el mar");
    marcar("Luna");
    expect(screen.getByTestId("resumen-sueno").textContent).toMatch(/Sueño individual: Luna sueña solo, 3 turnos/);
    marcar("Sol");
    expect(screen.getByTestId("resumen-sueno").textContent).toMatch(/Sueño compartido de 2: 4 turnos/);
    expect((screen.getByRole("button", { name: /Empezar a soñar/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("no deja pasar de seis agentes", () => {
    const siete = Array.from({ length: 7 }, (_, i) => crearAgenteMundoRef({ origen: "personalidad", idOrigen: `p${i}`, nombre: `Agente ${i}`, dueno: { tipo: "perfil", id: "p1" } }));
    render(<Arnes agentes={siete} />);
    for (let i = 0; i < TOPES_SUENO.participantesMax; i++) marcar(`Agente ${i}`);
    expect((screen.getByRole("checkbox", { name: /^Agente 6/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(`${TOPES_SUENO.participantesMax} de ${TOPES_SUENO.participantesMax}`)).toBeTruthy();
  });

  it("los que descansan en la zona de sueños se eligen de golpe", () => {
    render(<Arnes descansando={[luna.id, pagina.id]} />);
    expect(screen.getAllByText(/descansa en Sueños/, { selector: "span" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Elegir a quien descansa en «Sueños» \(2\)/ }));
    expect((screen.getByRole("checkbox", { name: /^Luna/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /^Voz de la Página/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /^Sol/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("sin nadie en el escenario lo dice y no hay a quién elegir", () => {
    render(<Arnes agentes={[]} />);
    expect(screen.getByText(/no hay quien sueñe/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Empezar a soñar/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("un sueño de punta a punta", () => {
  it("se ve soñar turno a turno, cada autor con su chapa, y al acabar queda en la lista, en la crónica y en la memoria", async () => {
    const puerta = iaConPuerta();
    const alCrearObras = vi.fn();
    render(<Arnes generar={puerta.generar} alCrearObras={alCrearObras} />);
    marcar("Luna");
    marcar("Voz de la Página");
    escribirTema("un río de luz");
    empezar();

    // En curso: el botón lo dice, el formulario no deja empezar otro y se espera el primer turno.
    const enCurso = await screen.findByTestId("sueno-en-curso");
    expect(within(screen.getByTestId("boton-sonar")).getByText("Soñando")).toBeTruthy();
    expect(within(enCurso).getByText(/Esperando el primer turno de la IA/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Ya hay un sueño en curso/ }) as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => expect(puerta.cuantas()).toBe(1));
    puerta.soltar("Veo un río que sube al cielo");
    await waitFor(() => expect(within(screen.getByTestId("sueno-en-curso")).getAllByTestId("turno-sueno")).toHaveLength(1));
    const turno = within(screen.getByTestId("sueno-en-curso")).getByTestId("turno-sueno");
    expect(within(turno).getByText("Luna")).toBeTruthy();
    expect(within(turno).getByTestId("etiqueta-bot-ia")).toBeTruthy();
    expect(within(turno).getByText(/turno 1 de 4/)).toBeTruthy();

    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(puerta.cuantas()).toBe(1));
      puerta.soltar(`Sigo el río, parte ${i + 2}`);
    }
    await waitFor(() => expect(screen.queryByTestId("sueno-en-curso")).toBeNull());

    const [tarjeta] = tarjetas();
    expect(tarjeta.getAttribute("data-estado")).toBe("completo");
    expect(within(tarjeta).getByText("un río de luz")).toBeTruthy();
    expect(within(tarjeta).getByText("Completo")).toBeTruthy();

    fireEvent.click(within(tarjeta).getByRole("button", { name: /un río de luz/ }));
    const turnos = within(tarjeta).getAllByTestId("turno-sueno");
    expect(turnos).toHaveLength(4);
    for (const t of turnos) expect(within(t).getByTestId("etiqueta-bot-ia")).toBeTruthy();
    expect(within(tarjeta).getByTestId("consolidacion-sueno").textContent).toMatch(/2 recuerdos guardados/);
    expect(within(tarjeta).getByText(/Imaginación de una IA, no hechos/)).toBeTruthy();

    // Para la crónica: una creación por autor, de tipo «sueño».
    expect(alCrearObras).toHaveBeenCalledTimes(1);
    const creaciones = alCrearObras.mock.calls[0][0](7) as CreacionMundo[];
    expect(creaciones.map((c) => c.autor).sort()).toEqual([luna.id, pagina.id].sort());
    expect(creaciones.every((c) => c.tipo === "sueño" && c.tick === 7)).toBe(true);

    // En la memoria de cada uno: Luna en lo personal, la página en lo público.
    expect(leerRecuerdosAgente(luna)[0]).toMatchObject({ alcance: "personal", origen: "sueño" });
    expect(leerRecuerdosAgente(pagina)[0]).toMatchObject({ alcance: "publica", origen: "sueño" });
    // Y el sueño quedó guardado en este aparato.
    expect(leerSuenos("esc-1").suenos.map((s) => s.estado)).toEqual(["completo"]);
  });

  it("cada tarjeta se abre y se cierra (aria-expanded) y se puede olvidar", async () => {
    render(<Arnes generar={iaQueResponde} />);
    marcar("Sol");
    escribirTema("el viento");
    empezar();
    await waitFor(() => expect(tarjetas()).toHaveLength(1));
    const boton = within(tarjetas()[0]).getByRole("button", { name: /el viento/ });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(boton);
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    expect(within(tarjetas()[0]).getAllByTestId("turno-sueno")).toHaveLength(3);
    fireEvent.click(boton);
    expect(within(tarjetas()[0]).queryByTestId("transcripcion-sueno")).toBeNull();
    fireEvent.click(boton);
    fireEvent.click(within(tarjetas()[0]).getByRole("button", { name: /Olvidar este sueño/ }));
    expect(tarjetas()).toHaveLength(0);
    expect(leerSuenos("esc-1").suenos).toEqual([]);
  });

  it("sin IA el sueño se detiene, lo dice con su motivo y no inventa ningún turno", async () => {
    const alCrearObras = vi.fn();
    render(<Arnes generar={async () => ({ ok: false, motivo: "No hay una IA gratuita disponible ahora mismo." })} alCrearObras={alCrearObras} />);
    marcar("Luna");
    marcar("Sol");
    escribirTema("la lluvia");
    empezar();
    await waitFor(() => expect(tarjetas()).toHaveLength(1));
    const tarjeta = tarjetas()[0];
    expect(tarjeta.getAttribute("data-estado")).toBe("sin-ia");
    expect(within(tarjeta).getByText("Sin IA disponible")).toBeTruthy();
    fireEvent.click(within(tarjeta).getByRole("button", { name: /la lluvia/ }));
    expect(within(tarjeta).queryAllByTestId("turno-sueno")).toHaveLength(0);
    expect(within(tarjeta).getByText(/No se escribió ningún turno/)).toBeTruthy();
    expect(within(tarjeta).getByTestId("motivo-sueno").textContent).toMatch(/No hay una IA gratuita/);
    expect(alCrearObras).not.toHaveBeenCalled();
    expect(leerRecuerdosAgente(luna)).toEqual([]);
  });

  it("se puede cancelar mientras sueña; queda como cancelado, sin recuerdos", async () => {
    const puerta = iaConPuerta();
    render(<Arnes generar={puerta.generar} />);
    marcar("Luna");
    escribirTema("el desierto");
    empezar();
    await screen.findByTestId("sueno-en-curso");
    await waitFor(() => expect(puerta.cuantas()).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByTestId("sueno-en-curso")).toBeNull());
    expect(tarjetas()[0].getAttribute("data-estado")).toBe("cancelado");
    expect(within(tarjetas()[0]).getByText("Cancelado")).toBeTruthy();
    expect(leerRecuerdosAgente(luna)).toEqual([]);
  });

  it("un tope alcanzado se dice y no se llama a la IA", () => {
    const generar = vi.fn(iaQueResponde);
    const ahora = Date.now();
    let uso = usoVacio();
    for (let i = 0; i < TOPES_SUENO.suenosPorHora; i++) uso = registrarInicio(uso, [pagina], false, ahora - 1000 * (i + 1));
    guardarUso(uso, ahora);
    render(<Arnes generar={generar} />);
    marcar("Luna");
    escribirTema("la montaña");
    empezar();
    expect(screen.getByRole("alert").textContent).toMatch(/Ya hubo 6 sueños esta hora/);
    expect(generar).not.toHaveBeenCalled();
    expect(tarjetas()).toHaveLength(0);
  });
});

describe("los sueños automáticos", () => {
  it("están APAGADOS de fábrica, con el tope a la vista", () => {
    render(<Arnes />);
    const interruptor = screen.getByRole("switch", { name: "Sueños automáticos" });
    expect(interruptor.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Apagados: los agentes solo sueñan cuando tú lo pides/)).toBeTruthy();
    expect(screen.getByText(/0 de 2 automáticos y 0 de 6 sueños en total esta hora/)).toBeTruthy();
    expect(screen.getByText(/nunca de pago/)).toBeTruthy();
  });

  it("se encienden, se guardan en este aparato y siguen encendidos al volver", () => {
    render(<Arnes />);
    fireEvent.click(screen.getByRole("switch", { name: "Sueños automáticos" }));
    expect(screen.getByRole("switch", { name: "Sueños automáticos" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/Encendidos: cuando dos agentes que ya se conocen/)).toBeTruthy();
    expect(leerSuenos("esc-1").automaticos).toBe(true);
    cleanup();
    render(<Arnes />);
    expect(screen.getByRole("switch", { name: "Sueños automáticos" }).getAttribute("aria-checked")).toBe("true");
    // Otro escenario no hereda el ajuste.
    cleanup();
    render(<Arnes escenarioId="esc-2" />);
    expect(screen.getByRole("switch", { name: "Sueños automáticos" }).getAttribute("aria-checked")).toBe("false");
  });
});

describe("con el enrutador económico simulado (sin pasarle IA al panel)", () => {
  it("un sueño individual pasa por astrauraChat con el id del agente, solo-agente y sin pago, y acaba completo", async () => {
    r.astrauraChat.mockImplementation(async () => ({
      text: "Soy el eco de una montaña.",
      route: { ok: true, local: false, free: true, sourceLabel: "BitNet 1.58 local" },
    }));
    render(<Arnes />);
    marcar("Luna");
    escribirTema("una montaña");
    empezar();
    await waitFor(() => expect(tarjetas()).toHaveLength(1), { timeout: 5000 });
    expect(tarjetas()[0].getAttribute("data-estado")).toBe("completo");
    expect(r.astrauraChat).toHaveBeenCalledTimes(3);
    expect(r.astrauraChat.mock.calls[0][0]).toMatchObject({ agentId: luna.id, soloAgente: true, taskHint: "creative" });
    expect(r.astrauraChat.mock.calls[0][0]).not.toHaveProperty("forceSource");
  });

  it("si el enrutador solo tiene su plantilla local, el sueño dice «Sin IA disponible» y no escribe esa plantilla como turno", async () => {
    r.astrauraChat.mockImplementation(async () => ({
      text: "Aurora (respuesta local): ahora mismo no puedo pensar.",
      route: { ok: true, local: true, free: true, sourceLabel: "plantilla" },
    }));
    render(<Arnes />);
    marcar("Sol");
    escribirTema("el fuego");
    empezar();
    await waitFor(() => expect(tarjetas()).toHaveLength(1), { timeout: 5000 });
    const tarjeta = tarjetas()[0];
    expect(tarjeta.getAttribute("data-estado")).toBe("sin-ia");
    fireEvent.click(within(tarjeta).getByRole("button", { name: /el fuego/ }));
    expect(within(tarjeta).queryAllByTestId("turno-sueno")).toHaveLength(0);
    expect(screen.queryByText(/respuesta local/)).toBeNull();
  });
});
