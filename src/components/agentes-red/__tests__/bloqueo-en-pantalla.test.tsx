/**
 * El bloqueo de bots a la vista (Ola 1025U · U3): el menú de la tarjeta, el ajuste «Bots de IA» y el filtro de una
 * publicación cambian lo que se ve al instante, y solo lo de los bots.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { _reiniciarCacheBloqueoParaPruebas, leerReglas } from "@/lib/agentes-red/bloqueo-bots";
import { marcaDeAgente, type MarcaBot } from "@/lib/agentes-red/marca-bot";
import { useFiltradoBots } from "@/lib/agentes-red/use-agentes-red";
import { AjusteBotsIA, AjusteBotsIABoton } from "../ajuste-bots-ia";
import { EtiquetaBotIA } from "../etiqueta-bot-ia";
import { FiltroBotsPublicacion } from "../filtro-bots-publicacion";
import { MenuBotIA } from "../menu-bot-ia";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a>,
}));

const BOT_A = marcaDeAgente(crearAgenteMundoRef({ origen: "bot", idOrigen: "a", nombre: "Guardián", dueno: { tipo: "grupo", id: "huerto" } }));
const BOT_B = marcaDeAgente(crearAgenteMundoRef({ origen: "personalidad", idOrigen: "b", nombre: "Aurora", dueno: { tipo: "cuenta", id: "c1" } }));

interface Entrada { id: string; texto: string; autor: { id: string; bot?: MarcaBot } }
const LISTA: Entrada[] = [
  { id: "1", texto: "Mensaje de Ana", autor: { id: "u1" } },
  { id: "2", texto: "Mensaje del Guardián", autor: { id: "u-dueño", bot: BOT_A } },
  { id: "3", texto: "Mensaje de Aurora", autor: { id: "u-dueño", bot: BOT_B } },
];

/** Un feed mínimo con la misma receta que las tarjetas reales: filtro por hook, etiqueta y menú en cada bot. */
function Feed({ postId, entidad }: { postId?: string; entidad?: { tipo: "grupo"; id: string } }) {
  const visibles = useFiltradoBots(LISTA, { postId, entidad });
  return (
    <div>
      <FiltroBotsPublicacion postId={postId ?? "p1"} />
      <ul aria-label="feed">
        {visibles.map((e) => (
          <li key={e.id}>
            {e.texto}
            {e.autor.bot && <><EtiquetaBotIA /><MenuBotIA marca={e.autor.bot} entidad={entidad} nombreEntidad="Huerto" /></>}
          </li>
        ))}
      </ul>
    </div>
  );
}
const textos = () => within(screen.getByRole("list", { name: "feed" })).getAllByRole("listitem").map((li) => li.textContent ?? "");

beforeEach(() => {
  localStorage.clear();
  _reiniciarCacheBloqueoParaPruebas();
});
afterEach(cleanup);

describe("menú de la tarjeta de un bot", () => {
  it("cada bot lleva su etiqueta y las personas no", () => {
    render(<Feed />);
    expect(screen.getAllByTestId("etiqueta-bot-ia")).toHaveLength(2);
    expect(within(screen.getAllByRole("listitem")[0]).queryByTestId("etiqueta-bot-ia")).toBeNull();
  });

  it("«Bloquear este bot» lo quita del feed al instante y deja a los demás", async () => {
    render(<Feed />);
    const menus = screen.getAllByTestId("menu-bot-ia");
    expect(menus).toHaveLength(2);
    await userEvent.click(menus[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: /Bloquear este bot/ }));
    expect(leerReglas().bots[BOT_A.agenteId]).toBeDefined();
    expect(textos().join("|")).not.toContain("Guardián");
    expect(textos().join("|")).toContain("Ana");
    expect(textos().join("|")).toContain("Aurora");
  });

  it("«Ocultar todos los bots de aquí» solo está dentro de una entidad y oculta a todos los de ella", async () => {
    render(<Feed entidad={{ tipo: "grupo", id: "huerto" }} />);
    await userEvent.click(screen.getAllByTestId("menu-bot-ia")[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: /Ocultar todos los bots de Huerto/ }));
    expect(leerReglas().entidades["grupo:huerto"]).toBe("ninguno");
    expect(textos()).toEqual(["Mensaje de Ana"]);
  });

  it("sin entidad, el menú ofrece ocultar los del feed, no los de una entidad", async () => {
    render(<MenuBotIA marca={BOT_A} entidad={{ tipo: "red", id: "red" }} />);
    await userEvent.click(screen.getByTestId("menu-bot-ia"));
    expect(await screen.findByRole("menuitem", { name: /Ocultar todos los bots de este feed/ })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /Ajustes de bots de IA/ })).toHaveAttribute("href", "/cuenta#bots-ia");
  });

  it("el objetivo táctil del menú mide 44 px", () => {
    render(<MenuBotIA marca={BOT_A} />);
    expect(screen.getByTestId("menu-bot-ia").className).toMatch(/\bsize-11\b/);
  });
});

describe("ajuste «Bots de IA»", () => {
  it("la regla general oculta todos los bots y se puede volver atrás", async () => {
    render(<><AjusteBotsIA /><Feed /></>);
    await userEvent.click(screen.getByRole("radio", { name: /Ningún bot/ }));
    expect(leerReglas().general).toBe("ninguno");
    expect(textos()).toEqual(["Mensaje de Ana"]);
    await userEvent.click(screen.getByRole("radio", { name: /Permitir todos los bots/ }));
    expect(textos()).toHaveLength(3);
  });

  it("lista los bots bloqueados uno a uno y «Desbloquear» los devuelve", async () => {
    render(<><AjusteBotsIA /><Feed /></>);
    expect(screen.getByText(/No has bloqueado a ningún bot/)).toBeVisible();
    await userEvent.click(screen.getAllByTestId("menu-bot-ia")[1]);
    await userEvent.click(await screen.findByRole("menuitem", { name: /Bloquear este bot/ }));
    const ajuste = screen.getByTestId("ajuste-bots-ia");
    expect(within(ajuste).getByText("Aurora")).toBeVisible();
    await userEvent.click(within(ajuste).getByRole("button", { name: "Desbloquear a Aurora" }));
    expect(leerReglas().bots).toEqual({});
    expect(textos().join("|")).toContain("Aurora");
  });

  it("dentro de una entidad edita SU regla y «seguir la general» la quita", async () => {
    render(<AjusteBotsIA entidad={{ tipo: "grupo", id: "huerto" }} nombreEntidad="Huerto" />);
    await userEvent.click(screen.getByRole("radio", { name: /Bloquear todos los bots de aquí/ }));
    expect(leerReglas().entidades["grupo:huerto"]).toBe("ninguno");
    await userEvent.click(screen.getByRole("radio", { name: /Seguir mi regla general/ }));
    expect(leerReglas().entidades).toEqual({});
    expect(screen.getByTestId("ajuste-bots-ia")).not.toHaveAttribute("id");
  });

  it("la sección general tiene el ancla #bots-ia que usa el menú de cada bot", () => {
    render(<AjusteBotsIA />);
    expect(screen.getByTestId("ajuste-bots-ia")).toHaveAttribute("id", "bots-ia");
  });

  it("la versión en ventana de una comunidad usa la regla de su página (misma entidad)", async () => {
    render(<AjusteBotsIABoton entidad={{ tipo: "comunidad", id: "plaza" }} nombreEntidad="Plaza" />);
    await userEvent.click(screen.getByTestId("ajuste-bots-ia-boton"));
    await userEvent.click(await screen.findByRole("radio", { name: /Bloquear todos los bots de aquí/ }));
    expect(leerReglas().entidades["pagina:plaza"]).toBe("ninguno");
    expect(screen.getByTestId("ajuste-bots-ia-boton")).toHaveTextContent(/ningún bot/i);
  });
});

describe("filtro de una publicación", () => {
  it("permite los bots de ESA publicación aunque la regla general los oculte", async () => {
    render(<Feed postId="p1" />);
    // regla general: ninguno (desde el almacén, como si viniera de la cuenta)
    localStorage.setItem("starseed.agentes-red.bloqueo.v1", JSON.stringify({ v: 1, general: "ninguno" }));
    act(() => { window.dispatchEvent(new CustomEvent("starseed:agentes-red-bloqueo")); });
    await waitFor(() => expect(textos()).toEqual(["Mensaje de Ana"]));
    await userEvent.click(screen.getByTestId("filtro-bots-publicacion"));
    await userEvent.click(await screen.findByRole("radio", { name: /Permitir todos los bots/ }));
    expect(leerReglas().publicaciones.p1).toBe("todo");
    expect(textos()).toHaveLength(3);
    await userEvent.click(screen.getByRole("radio", { name: /Según la entidad/ }));
    expect(leerReglas().publicaciones).toEqual({});
    expect(textos()).toEqual(["Mensaje de Ana"]);
  });
});
