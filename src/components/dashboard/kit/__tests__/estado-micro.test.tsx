import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogIn, Sparkles } from "lucide-react";
import { ContextoMarco, type ContextoMarcoUnificado } from "../contexto-marco";
import { EstadoMicro, accionDe, frase } from "../estado-micro";
import { WidgetEmptyState, WidgetErrorState } from "../primitives";
import { CabeceraMarco, ESPACIADO_MARCO, microEnFila } from "@/components/widgets-libres/marco-unificado";
import { SinDato } from "@/components/widgets-libres/familias/comun";

afterEach(cleanup);

function marco(base: ContextoMarcoUnificado["base"], apaisado = true): ContextoMarcoUnificado {
    return { acento: "#7c5cff", acento2: "#23d5ab", clase: base, base, horizontal: false, espaciado: ESPACIADO_MARCO[base], apaisado };
}

function enMarco(base: ContextoMarcoUnificado["base"], nodo: React.ReactNode) {
    return render(<ContextoMarco.Provider value={marco(base)}>{nodo}</ContextoMarco.Provider>);
}

describe("frase y accionDe", () => {
    it("une título y mensaje en una sola frase, sin puntos dobles", () => {
        expect(frase("Entra en tu cuenta", "Lo tuyo se ve al entrar.")).toBe("Entra en tu cuenta. Lo tuyo se ve al entrar.");
        expect(frase("Leyendo el cielo…")).toBe("Leyendo el cielo…");
        expect(frase(undefined, "", null)).toBe("");
    });

    it("encuentra la primera acción entre los hijos (enlace o botón, también dentro de envoltorios)", () => {
        const pulsar = () => {};
        expect(accionDe(<a href="/login">Entrar</a>)).toEqual({ etiqueta: "Entrar", href: "/login", onClick: undefined });
        const envuelta = accionDe(<div><span>texto</span><>{null}<button type="button" onClick={pulsar} aria-label="Crear">+</button></></div>);
        expect(envuelta?.onClick).toBe(pulsar);
        expect(envuelta?.etiqueta).toBe("+");
        expect(accionDe(<p>sin acción</p>)).toBeNull();
        expect(accionDe(null)).toBeNull();
    });
});

describe("EstadoMicro", () => {
    it("con enlace: el glifo ES la acción y el texto entero va en su nombre y su tooltip", () => {
        render(<EstadoMicro icono={LogIn} color="#7c5cff" etiqueta="Entrar" descripcion="Entra en tu cuenta. Lo tuyo se ve al entrar." href="/login" kit="vacio" />);
        const enlace = screen.getByRole("link", { name: "Entrar: Entra en tu cuenta. Lo tuyo se ve al entrar." });
        expect(enlace.getAttribute("href")).toBe("/login");
        expect(enlace.getAttribute("title")).toBe("Entra en tu cuenta. Lo tuyo se ve al entrar.");
        expect(enlace.className).toMatch(/ss-redondo/);
        expect(enlace.className).toMatch(/cursor-pointer/);
        expect(enlace.closest("[data-kit='vacio']")).not.toBeNull();
    });

    it("sin acción es un estado con nombre (role=status), no un botón", () => {
        render(<EstadoMicro icono={Sparkles} color="#23d5ab" descripcion="Aún no hay nada." />);
        expect(screen.getByRole("status", { name: "Aún no hay nada." })).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
    });
});

describe("WidgetEmptyState y WidgetErrorState en micro", () => {
    it("vacío micro: un glifo-enlace con UNA etiqueta de 10 px; título y mensaje solo en el nombre", () => {
        enMarco("micro", <WidgetEmptyState icon={LogIn} title="Entra en tu cuenta" message="Lo tuyo se ve al entrar." actionLabel="Entrar" actionHref="/login" />);
        const enlace = screen.getByRole("link", { name: /^Entrar: Entra en tu cuenta\. Lo tuyo se ve al entrar\./ });
        expect(enlace.getAttribute("href")).toBe("/login");
        const etiqueta = screen.getByText("Entrar");
        expect(etiqueta.className).toMatch(/text-\[10px\]/);
        expect(etiqueta.className).toMatch(/truncate/);
        expect(screen.queryByText("Entra en tu cuenta")).toBeNull();
        expect(screen.queryByText("Lo tuyo se ve al entrar.")).toBeNull();
    });

    it("vacío micro sin acción: la etiqueta es el título y el estado se anuncia", () => {
        enMarco("micro", <WidgetEmptyState title="Sin cerebros" message="Crea el primero en Astraura." />);
        expect(screen.getByRole("status", { name: "Sin cerebros. Crea el primero en Astraura." })).toBeTruthy();
        expect(screen.getByText("Sin cerebros")).toBeTruthy();
    });

    it("error micro: el glifo reintenta", () => {
        const reintentar = vi.fn();
        enMarco("micro", <WidgetErrorState message="No se pudo leer." onRetry={reintentar} />);
        fireEvent.click(screen.getByRole("button", { name: /^Reintentar: No se pudo leer\. Toca para reintentar/ }));
        expect(reintentar).toHaveBeenCalledTimes(1);
        expect(screen.queryByText("No se pudo leer.")).toBeNull();
    });

    it("fuera de micro siguen enteros (título, mensaje y pastilla)", () => {
        enMarco("m", <WidgetEmptyState title="Entra en tu cuenta" message="Lo tuyo se ve al entrar." actionLabel="Entrar" actionHref="/login" />);
        expect(screen.getByText("Entra en tu cuenta")).toBeTruthy();
        expect(screen.getByText("Lo tuyo se ve al entrar.")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy();
    });
});

describe("Cabecera micro en fila y «sin dato» de las familias", () => {
    it("micro apaisada: la cabecera es una columna con el icono como encabezado con nombre", () => {
        expect(microEnFila(marco("micro", true))).toBe(true);
        expect(microEnFila(marco("micro", false))).toBe(false);
        expect(microEnFila(marco("s", true))).toBe(false);
        const { container } = render(<CabeceraMarco titulo="Cerebros" icono={Sparkles} acento="#7c5cff" base="micro" espaciado={ESPACIADO_MARCO.micro} enFila vivo />);
        const cabecera = container.querySelector("[data-cabecera-marco]")!;
        expect(cabecera.className).toMatch(/flex-col/);
        expect(screen.getByRole("heading", { name: "Cerebros" }).textContent).toBe("");
        expect(screen.getByRole("img", { name: "En vivo" })).toBeTruthy();
        expect(container.querySelector(".sr-only")).toBeNull();
    });

    it("SinDato con micro: glifo y una palabra; la frase entera en el nombre", () => {
        render(<SinDato texto="Entra para ver tus avisos" micro={{ icono: LogIn, etiqueta: "Entrar", href: "/login" }} />);
        expect(screen.getByRole("link", { name: "Entrar: Entra para ver tus avisos" }).getAttribute("href")).toBe("/login");
        expect(screen.queryByText("Entra para ver tus avisos")).toBeNull();
    });
});
