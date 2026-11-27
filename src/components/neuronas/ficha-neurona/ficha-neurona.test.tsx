/**
 * FichaNeurona: montaje con una neurona de un aparato y otra de dos.
 * Tests de comportamiento por la interfaz pública.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FichaNeurona } from "./ficha-neurona";
import { AppearanceProvider } from "@/context/appearance-context";

const NEURONA_UN_APARATO = {
  id: "neurona-1",
  name: "Mi Neurona",
  kind: "mobile" as const,
  capabilities: {
    platform: "Android",
    browser: "Chrome 131",
    aparatos: {
      "sync-1": { n: "Móvil de Alex", medio: "android", so: "Android", equipo: "Pixel 8", ts: Date.now() - 5 * 60_000 },
    },
  },
  permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
  last_seen_at: new Date().toISOString(),
  isThisDevice: true,
  online: true,
};

const NEURONA_DOS_APARATOS = {
  id: "neurona-2",
  name: "Neurona Compartida",
  kind: "tablet" as const,
  capabilities: {
    platform: "iPadOS",
    browser: "Safari 18",
    aparatos: {
      "sync-2": { n: "iPad Pro", medio: "web", so: "iPadOS", equipo: "iPad Pro 12.9", ts: Date.now() - 10 * 60_000 },
      "sync-3": { n: "iPad Mini", medio: "app", so: "iPadOS", equipo: "iPad Mini", ts: Date.now() - 2 * 60 * 60_000 },
    },
  },
  permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
  last_seen_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  isThisDevice: false,
  online: false,
};

function pintar(neurona = NEURONA_UN_APARATO) {
  return render(
    <AppearanceProvider>
      <FichaNeurona neurona={neurona} modo="completo" />
    </AppearanceProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-27T12:00:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FichaNeurona", () => {
  it("monta con una neurona de un aparato", async () => {
    pintar(NEURONA_UN_APARATO);
    expect(await screen.findByText("Mi Neurona")).toBeInTheDocument();
    expect(await screen.findByText("Móvil de Alex")).toBeInTheDocument();
    expect(await screen.findByText(/Identidad/i)).toBeInTheDocument();
    expect(await screen.findByText(/Aparatos/i)).toBeInTheDocument();
    expect(await screen.findByText(/Permisos/i)).toBeInTheDocument();
    expect(await screen.findByText(/Papel en la red/i)).toBeInTheDocument();
    expect(await screen.findByText(/Salud/i)).toBeInTheDocument();
  });

  it("monta con una neurona de dos aparatos", async () => {
    pintar(NEURONA_DOS_APARATOS);
    expect(await screen.findByText("Neurona Compartida")).toBeInTheDocument();
    expect(await screen.findByText("iPad Pro")).toBeInTheDocument();
    expect(await screen.findByText("iPad Mini")).toBeInTheDocument();
  });

  it("las secciones son plegables", async () => {
    pintar(NEURONA_UN_APARATO);
    const identidad = await screen.findByText(/Identidad/i);
    const botonIdentidad = identidad.closest("button");
    expect(botonIdentidad).toBeInTheDocument();
    await userEvent.click(botonIdentidad!);
    // La sección se pliega/despliega
    expect(screen.queryByText("Nombre de la neurona")).not.toBeInTheDocument();
  });

  it("buscador filtra secciones", async () => {
    pintar(NEURONA_UN_APARATO);
    const input = await screen.findByPlaceholderText(/buscar/i);
    await userEvent.type(input, "color");
    expect(await screen.findByText("Color público")).toBeInTheDocument();
    expect(screen.queryByText("Nombre de la neurona")).not.toBeInTheDocument();
  });

  it("modo compacto solo muestra identificación básica", async () => {
    render(
      <AppearanceProvider>
        <FichaNeurona neurona={NEURONA_UN_APARATO} modo="compacto" />
      </AppearanceProvider>
    );
    expect(await screen.findByText("Mi Neurona")).toBeInTheDocument();
    expect(screen.queryByText(/Aparatos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Permisos/i)).not.toBeInTheDocument();
  });

  it("textos no se cortan en botones (cursor-pointer)", async () => {
    pintar(NEURONA_UN_APARATO);
    const botones = screen.getAllByRole("button");
    for (const btn of botones) {
      expect(btn).toHaveClass("cursor-pointer");
      // Verificar que no tiene truncate/line-clamp/whitespace-nowrap en className
      const className = btn.getAttribute("class") || "";
      expect(className).not.toMatch(/truncate/);
      expect(className).not.toMatch(/line-clamp/);
      expect(className).not.toMatch(/whitespace-nowrap/);
    }
  });
});