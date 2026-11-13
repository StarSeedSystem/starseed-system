/**
 * GEN1114F · reparaciones de la sección Chat de `/agent` vistas en pantalla el 13-11 (360×640 y 1440×900).
 *  1. la tira de pestañas de Chat ya no se desliza de lado;
 *  2. la cabecera ocupa menos en móvil y no salta cuando llega tarde la tira de presencia;
 *  3. los cuadros de texto, las hojas y las listas dejan libre el carril de los botones flotantes;
 *  4. «Sin conversación activa» con «Abrir navegación» entero y el chip del proveedor desplegable.
 *
 * `page.tsx` no se puede montar en jsdom (la página entera arrastra medio sistema), así que de ella se
 * comprueba la ESTRUCTURA leyendo su código, como ya hace la prueba de GEN1113E; lo que sí se monta
 * (la hoja, la lista y el cálculo de la reserva) se prueba de verdad.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Bot, Dna, Send, Users } from "lucide-react";

import { Hoja } from "../hoja";
import { MenuListaHoja } from "../menu-lista-hoja";
import { flotantesSobre, reservaDerecha } from "../reserva-flotantes";

const RAIZ = path.join(__dirname, "..", "..", "..");
const PAGINA = readFileSync(path.join(RAIZ, "app", "(app)", "agent", "page.tsx"), "utf8");
const SUPERFICIE = readFileSync(path.join(RAIZ, "components", "agent", "chat-surface.tsx"), "utf8");
const ESPACIOS_TG = readFileSync(path.join(RAIZ, "components", "exocortex", "telegram-spaces-panel.tsx"), "utf8");

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

// ── 1 · pestañas de Chat ─────────────────────────────────────────────────────

describe("1 · ninguna pestaña de Chat depende de deslizar de lado", () => {
    it("en la sección Chat la fila de pestañas se parte en líneas (sin ss-hscroll ni flex-nowrap)", () => {
        const lista = PAGINA.slice(PAGINA.indexOf('data-testid="pestanas-seccion"'), PAGINA.indexOf("{currentSection.items.map((it) => {"));
        expect(lista).toMatch(/esSeccionChat \? "flex-wrap" : "ss-hscroll ss-hscroll-fade scroll-px-3 flex-nowrap"/);
        const base = /"w-full max-w-full box-border justify-start bg-transparent border-0 py-0 px-1 lg:px-3 gap-1 h-auto"/.exec(lista)?.[0] ?? "";
        expect(base).not.toMatch(/ss-hscroll|flex-nowrap|overflow-x/);
    });

    it("por debajo de sm, las pestañas de Chat van en una lista completa junto a la sección, y la tira se esconde", () => {
        const fila = PAGINA.slice(PAGINA.indexOf('data-testid="fila-secciones-movil"'), PAGINA.indexOf("{/* ── PANEL DE LA SECCIÓN ACTIVA"));
        expect(fila).toMatch(/<MenuListaHoja\s+titulo="Pestañas de Chat"/);
        expect(fila).toMatch(/className="flex-1 basis-0 sm:hidden"/);
        expect(fila).toMatch(/esSeccionChat && "max-sm:hidden"/); // el botón de configurar repetido sobra en móvil
        expect(PAGINA).toMatch(/data-testid="cabecera-seccion"[^\n]*esSeccionChat && "max-sm:hidden"/);
    });

    it("la lista completa enseña las cuatro pestañas enteras y elige una", () => {
        const onCambiar = vi.fn();
        const opciones = [
            { id: "chat", label: "Chats", icon: Bot },
            { id: "chat-158", label: "Multiagente 1.58", icon: Users },
            { id: "conexiones-chat", label: "Conexiones de chat", icon: Send },
            { id: "chats-genesis", label: "Genesis", icon: Dna },
        ];
        render(<MenuListaHoja titulo="Pestañas de Chat" opciones={opciones} valor="chat" onCambiar={onCambiar} />);
        fireEvent.click(screen.getByRole("button", { name: "Pestañas de Chat: Chats" }));
        const hoja = screen.getByRole("dialog");
        expect(within(hoja).getAllByRole("button").map((b) => b.textContent).filter((t) => opciones.some((o) => o.label === t))).toEqual(opciones.map((o) => o.label));
        for (const el of hoja.querySelectorAll("*")) expect(el.getAttribute("class") ?? "").not.toMatch(/overflow-x-(auto|scroll)|ss-hscroll|flex-nowrap/);
        fireEvent.click(within(hoja).getByText("Genesis"));
        expect(onCambiar).toHaveBeenCalledWith("chats-genesis");
        expect(screen.queryByRole("dialog")).toBeNull();
    });
});

// ── 2 · cabecera en pantallas pequeñas ───────────────────────────────────────

describe("2 · la cabecera deja sitio y no salta", () => {
    // AST1113A (13-11, Alex: «deja los otros … pero que sean los datos reales»): la tira vuelve a pintarse en la
    // sección Chat en todos los tamaños, con su sitio RESERVADO para no empujar la página al llegar. Lo cubre a
    // fondo `src/app/__tests__/agent-presencia-ast1113a.test.ts`; aquí solo que ya no se esconde.
    it("la tira de presencia tiene su sitio reservado y no salta (ya no se esconde bajo lg en Chat)", () => {
        expect(PAGINA).toMatch(/data-testid="presencia-agente" className="shrink-0 min-h-9 sm:min-h-8 w-full max-w-full">\s*<Astraura158PresenceBar \/>/);
        expect(PAGINA).not.toMatch(/esSeccionChat && "max-lg:hidden"/);
    });

    it("título y botones en una fila en móvil; sin chips de proveedor ni de agentes (AST1113A)", () => {
        const cab = PAGINA.slice(PAGINA.indexOf('data-testid="cabecera-agente"'), PAGINA.indexOf('data-testid="presencia-agente"'));
        expect(cab).toMatch(/max-sm:contents/);
        expect(cab).toMatch(/text-base sm:text-2xl/);
        expect(cab).not.toMatch(/data-testid="chip-proveedor"|agents\.length\} agentes/);
    });

    it("las pestañas de Chat caben a 360×640 sin desplazar la página (24rem, no 30rem) y menos huecos", () => {
        expect(PAGINA).toMatch(/const TAB_FILL_CHAT = `mt-0 flex-1 min-h-0 max-lg:min-h-\[24rem\]/);
        expect(PAGINA).toMatch(/<TabsContent value="chat" className=\{TAB_FILL_CHAT\}>/);
        expect(PAGINA).toMatch(/<TabsContent value="chats-genesis" className=\{TAB_FILL_CHAT\}><PestanaGenesis \/><\/TabsContent>/);
        expect(PAGINA).toMatch(/className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-3 lg:gap-4/);
    });
});

// ── 3 · botones flotantes ────────────────────────────────────────────────────

describe("3 · el carril de los botones flotantes", () => {
    const zona = { left: 0, top: 300, right: 360, bottom: 640 };

    it("reservaDerecha: una orbe sobre el borde derecho reserva hasta su izquierda + 8 px", () => {
        expect(reservaDerecha(zona, [{ left: 300, top: 477, right: 348, bottom: 525 }])).toBe(68);
        expect(reservaDerecha(zona, [])).toBe(0);
        // Fuera de la zona, en la mitad izquierda o enorme (una hoja, el dock): no cuenta.
        expect(reservaDerecha(zona, [{ left: 300, top: 100, right: 348, bottom: 148 }])).toBe(0);
        expect(reservaDerecha(zona, [{ left: 20, top: 500, right: 68, bottom: 548 }])).toBe(0);
        expect(reservaDerecha(zona, [{ left: 0, top: 560, right: 360, bottom: 640 }])).toBe(0);
        // Dos flotantes: manda el que más se mete.
        expect(reservaDerecha(zona, [{ left: 300, top: 477, right: 348, bottom: 525 }, { left: 296, top: 580, right: 352, bottom: 636 }])).toBe(72);
    });

    function conFlotante(caja: { left: number; top: number; right: number; bottom: number }) {
        const orbe = document.createElement("div");
        orbe.style.position = "fixed";
        orbe.setAttribute("data-prueba", "orbe");
        document.body.appendChild(orbe);
        const rect = (r: { left: number; top: number; right: number; bottom: number }) => ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r }) as DOMRect;
        vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
            if (this === orbe) return rect(caja);
            return rect({ left: 0, top: 160, right: 360, bottom: 640 });
        });
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
        Object.defineProperty(window, "innerHeight", { configurable: true, value: 640 });
        (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x: number, y: number) => {
            const dentro = x >= caja.left && x < caja.right && y >= caja.top && y < caja.bottom;
            return dentro ? [orbe, document.body] : [document.body];
        };
        return () => {
            orbe.remove();
            delete (document as unknown as { elementsFromPoint?: unknown }).elementsFromPoint;
        };
    }

    it("flotantesSobre encuentra la orbe fija que tapa la zona y no lo que no tapa", () => {
        const quitar = conFlotante({ left: 300, top: 477, right: 348, bottom: 525 });
        const z = document.createElement("div");
        document.body.appendChild(z);
        expect(flotantesSobre(z)).toEqual([{ left: 300, top: 477, right: 348, bottom: 525 }]);
        quitar();
        z.remove();
        expect(flotantesSobre(document.body)).toEqual([]); // sin elementsFromPoint (jsdom): nada
    });

    it("una hoja abierta deja libre a la derecha lo que tapa la orbe (lista y pie)", async () => {
        const quitar = conFlotante({ left: 300, top: 200, right: 348, bottom: 248 });
        render(<Hoja titulo="Chats de Genesis" abierta onCerrar={() => {}} pie={<button type="button">Listo</button>}><ul><li>Primera fila</li></ul></Hoja>);
        await waitFor(() => expect(screen.getByTestId("hoja-cuerpo").style.paddingRight).toBe("68px"));
        quitar();
    });

    it("sin flotantes, la hoja no reserva nada", async () => {
        render(<Hoja titulo="X" abierta onCerrar={() => {}}><p>hola</p></Hoja>);
        await act(async () => { await Promise.resolve(); });
        expect(screen.getByTestId("hoja-cuerpo").style.paddingRight).toBe("");
    });

    it("las cuatro pestañas de Chat dejan libre el carril que mide el panel; la orbe no se toca", () => {
        expect(PAGINA).toMatch(/const LIBRE_FLOTANTES = "pr-\[var\(--reserva-flotantes,0px\)\]";/);
        expect(PAGINA).toMatch(/useReservaFlotantes\(panelSeccionRef, esSeccionChat\)/);
        expect(PAGINA).toMatch(/"--reserva-flotantes": `\$\{reservaFlotantes\}px`/);
        expect(PAGINA).toMatch(/<TabsContent value="conexiones-chat" className=\{TAB_SCROLL_CHAT\}>/);
        expect(PAGINA).toMatch(/<TabsContent value="chat-158" className=\{TAB_SCROLL_CHAT\}>/);
        expect(PAGINA).toMatch(/const TAB_SCROLL_CHAT = `\$\{TAB_SCROLL\} \$\{LIBRE_FLOTANTES\}`;/);
    });
});

// ── 4 · Chats sin conversación y el chip del proveedor ──────────────────────

describe("4 · «Sin conversación activa» y el chip del proveedor", () => {
    it("el vacío es compacto en móvil, tiene aire debajo y «Abrir navegación» mide 44 px", () => {
        const vacio = SUPERFICIE.slice(SUPERFICIE.indexOf('data-testid="chat-sin-conversacion"'), SUPERFICIE.indexOf("Abrir navegación\n"));
        expect(vacio).toMatch(/pt-2 pb-6 sm:py-14/);
        expect(vacio).not.toMatch(/justify-center/);
        expect(vacio).toMatch(/h-11 w-11 sm:h-14 sm:w-14/);
        expect(vacio).toMatch(/<Button variant="outline" className="min-h-11 shrink-0/);
        expect(vacio).toContain("Sin conversación activa");
    });

    // AST1113A: el chip se mudó de la cabecera de /agent al propio chat (`ChatSurface`) y conserva lo de GEN1114F.
    it("el chip del motor (proveedor · modelo) está junto al chat y se despliega entero (y lo dice)", () => {
        const i = SUPERFICIE.indexOf('data-testid="chip-motor-chat"');
        const chip = SUPERFICIE.slice(i, SUPERFICIE.indexOf("</span>\n          </span>", i));
        expect(chip).toMatch(/aria-expanded=\{chipMotorAbierto\}/);
        expect(chip).toMatch(/onClick=\{\(\) => setChipMotorAbierto\(\(v\) => !v\)\}/);
        expect(chip).toMatch(/Toca para verlo entero/);
        expect(chip).toMatch(/chipMotorAbierto \? "min-w-0 break-words \[overflow-wrap:anywhere\]" : "truncate"/);
        expect(chip).toMatch(/title=\{`\$\{activeProviderConfig\.label\} · \$\{activeProviderConfig\.defaultModel\}`\}/);
        expect(PAGINA).not.toContain('data-testid="chip-proveedor"');
    });
});

describe("7 · español", () => {
    it("el botón del bot de Telegram ya no dice «Chatbot»", () => {
        expect(ESPACIOS_TG).toContain("<Bot className=\"w-4 h-4\" /> Chat con el bot");
        expect(ESPACIOS_TG).not.toMatch(/>\s*Chatbot\s*</);
        expect(ESPACIOS_TG).not.toMatch(/\/> Chatbot\b/);
    });
});
