"use client";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

const reducido = vi.hoisted(() => ({ valor: false }));
vi.mock("@/components/aurora/quantum-orb-avatar", () => ({
  QuantumOrbAvatar: ({ personaId }: { personaId?: string }) => <span data-testid="orbe" data-persona={personaId} />,
}));
vi.mock("@/components/aurora/quantum-orb", () => ({ prefersReducedMotion: () => reducido.valor }));
vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, className, variant }: { children: React.ReactNode; onClick?: () => void; className?: string; variant?: string }) => (
    <button onClick={onClick} className={className} data-variant={variant}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 className={className}>{children}</h3>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

import type { Bot } from "@/lib/astraura-bots/tipos";
import { indicadorVisible } from "@/lib/astraura-bots/bucle";
import { TarjetaPropuesta } from "../tarjeta-propuesta";

const PERFIL = "local";
function crearBot(id: string, nombre: string, activo = true): Bot {
  return {
    id, nombre, origen: "astraura", gobierno: "jerarquico", dueno: { tipo: "perfil", id: PERFIL, cuentaId: PERFIL },
    personalidad: { calidez: 0.5, energia: 0.5, formalidad: 0.5, curiosidad: 0.5, humor: 0.5, concision: 0.5 },
    cuerpo: { forma: "orbe", tono: 200, escala: 1 }, sentidosHabilitados: [], activo,
  };
}

const botPrueba = crearBot("bot:test", "Bot de Prueba");
const propuestaPrueba = {
  accion: "Abrir Biblioteca",
  motivo: "El bot quiere acceder a sus widgets",
  riesgo: "bajo" as const,
  requiere: "nada" as const,
  decision: {
    requiere: "nada",
    motivo: "El bot quiere navegar a la biblioteca",
  },
};
const buclePrueba = {
  botId: "bot:test",
  fase: "esperando" as const,
  sentidosActivos: ["pantalla"],
  pendiente: {
    accion: { tipo: "navegar", args: { ruta: "/library" } },
    decision: { permitido: true, requiere: "nada", motivo: "Permiso concedido", indicador: false },
  },
  registro: [
    { at: Date.now() - 30000, botId: "bot:test", quien: "bot", tipo: "propuesta", accion: "navegar", motivo: "El bot quiere navegar", deshacer: undefined },
  ],
};

describe("TarjetaPropuesta", () => {
  beforeEach(() => {
    reducido.valor = false;
  });
  afterEach(() => cleanup());

  it("muestra la propuesta del bot cuando está en espera", () => {
    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaPrueba}
        bucle={buclePrueba}
        onConfirm={() => {}}
        onReject={() => {}}
        onVote={() => {}}
        onConsent={() => {}}
      />
    );

    expect(screen.getByText("Bot de Prueba está esperando")).toBeTruthy();
    expect(screen.getByText("Abrir Biblioteca")).toBeTruthy();
    expect(screen.getByText("El bot quiere acceder a sus widgets")).toBeTruthy();
    expect(screen.getByText("El bot quiere navegar a la biblioteca")).toBeTruthy();
    expect(screen.getByText("Bajo")).toBeTruthy();
    expect(screen.getByText("Sin requisitos")).toBeTruthy();
  });

  it("llama a onConfirm cuando se confirma sin requisitos", () => {
    const onConfirmMock = vi.fn();
    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaPrueba}
        bucle={buclePrueba}
        onConfirm={onConfirmMock}
        onReject={() => {}}
        onVote={() => {}}
        onConsent={() => {}}
      />
    );

    const boton = screen.getByRole("button", { name: /Confirmar/i });
    fireEvent.click(boton);

    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it("muestra confirmación y rechazo cuando se necesita confirmación", () => {
    const propuestaConConfirmacion = {
      ...propuestaPrueba,
      requiere: "confirmacion" as const,
    };

    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaConConfirmacion}
        bucle={buclePrueba}
        onConfirm={() => {}}
        onReject={() => {}}
        onVote={() => {}}
        onConsent={() => {}}
      />
    );

    expect(screen.getByText("Confirmación necesaria")).toBeTruthy();
    expect(screen.getByText("Rechazar")).toBeTruthy();
    expect(screen.getByText("Confirmar")).toBeTruthy();
  });

  it("llama a onReject cuando se rechaza una propuesta", () => {
    const propuestaConConfirmacion = {
      ...propuestaPrueba,
      requiere: "confirmacion" as const,
    };
    const onRejectMock = vi.fn();

    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaConConfirmacion}
        bucle={buclePrueba}
        onConfirm={() => {}}
        onReject={onRejectMock}
        onVote={() => {}}
        onConsent={() => {}}
      />
    );

    const botonRechazar = screen.getByText("Rechazar");
    fireEvent.click(botonRechazar);

    expect(onRejectMock).toHaveBeenCalledTimes(1);
  });

  it("muestra el indicador de sentidos cuando el bot tiene sentidos activos", () => {
    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaPrueba}
        bucle={buclePrueba}
        onConfirm={() => {}}
        onReject={() => {}}
        onVote={() => {}}
        onConsent={() => {}}
      />
    );

    expect(screen.getByText("pantalla")).toBeTruthy();
  });

  it("llama a onVote cuando se lleva a votación", () => {
    const propuestaConVotacion = {
      ...propuestaPrueba,
      requiere: "votacion" as const,
    };
    const onVoteMock = vi.fn();

    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaConVotacion}
        bucle={buclePrueba}
        onConfirm={() => {}}
        onReject={() => {}}
        onVote={onVoteMock}
        onConsent={() => {}}
      />
    );

    const botonVotacion = screen.getByText("Llevar a votación");
    fireEvent.click(botonVotacion);

    expect(onVoteMock).toHaveBeenCalledTimes(1);
  });

  it("llama a onConsent cuando se abre el diálogo de consentimiento", () => {
    const propuestaConConsentimiento = {
      ...propuestaPrueba,
      requiere: "consentimiento" as const,
      consentimiento: { sentido: "microfono" },
    };
    const onConsentMock = vi.fn();

    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaConConsentimiento}
        bucle={buclePrueba}
        onConfirm={() => {}}
        onReject={() => {}}
        onVote={() => {}}
        onConsent={onConsentMock}
      />
    );

    const botonConsentir = screen.getByText("Abrir diálogo de consentimiento");
    fireEvent.click(botonConsentir);

    expect(onConsentMock).toHaveBeenCalledWith("microfono");
  });

  it("llama a onConsent cuando se da consentimiento expreso", () => {
    const propuestaConExpreso = {
      ...propuestaPrueba,
      requiere: "expreso" as const,
      consentimiento: { sentido: "microfono" },
    };
    const onConsentMock = vi.fn();

    render(
      <TarjetaPropuesta
        bot={botPrueba}
        propuesta={propuestaConExpreso}
        bucle={buclePrueba}
        onConfirm={() => {}}
        onReject={() => {}}
        onVote={() => {}}
        onConsent={onConsentMock}
      />
    );

    const botonExpreso = screen.getByText("Dar consentimiento expreso");
    fireEvent.click(botonExpreso);

    expect(onConsentMock).toHaveBeenCalledWith("microfono");
  });
});