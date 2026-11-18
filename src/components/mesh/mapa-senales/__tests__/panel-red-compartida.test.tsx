import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PanelRedCompartida } from "../panel-red-compartida";
import type { PreferenciasRedAparato } from "@/lib/malla/preferencias-red-compartida";
import type { DecisionComparticion } from "@/lib/malla/auto-compartir";
import type { PuertaInternet } from "@/lib/malla/cristal/puertas-internet";
import { COMPARTIR } from "@/lib/malla/cristal/puertas-internet";

const PREFERENCIAS_BASE: PreferenciasRedAparato = {
  compartir: false,
  maximoCon: "nadie",
  soloWifi: true,
  kbpsSubidaMax: 1024,
  reservaBateriaPct: 30,
  automatico: false,
  compartirMedidas: false,
};

const PUERTAS_BASE: PuertaInternet[] = [
  {
    id: "puerta-1",
    neurona: "neurona-1",
    cuenta: "cuenta-1",
    tipo: "movil-4g",
    bajadaKbps: 10000,
    subidaKbps: 2000,
    latenciaMs: 50,
    medida: true,
    topeMensualMb: 1000,
    usadoMesMb: 100,
    reservaDuenoPct: 20,
    compartir: "publico",
  },
  {
    id: "puerta-2",
    neurona: "neurona-2",
    cuenta: "cuenta-1",
    tipo: "wifi-externa",
    bajadaKbps: 50000,
    subidaKbps: 10000,
    latenciaMs: 20,
    medida: false,
    compartir: "publico",
  },
];

const DECISIONES_BASE: DecisionComparticion[] = [
  {
    puertaId: "puerta-1",
    con: "publico",
    accion: "retirar",
    motivo: "Batería al 22% (mínimo 30%) y no está cargando",
  },
  {
    puertaId: "puerta-2",
    con: "publico",
    accion: "ofrecer",
    motivo: "Cumple todas las condiciones: interruptor encendido, nivel dentro del máximo, Wi-Fi/batería/subida/medida dentro de topes",
  },
];

function renderPanel(props: Partial<{
  preferencias: PreferenciasRedAparato;
  puertas: PuertaInternet[];
  decisiones: DecisionComparticion[];
  onCambiar: (patch: Partial<PreferenciasRedAparato>) => void;
}> = {}) {
  const onCambiar = vi.fn();
  return render(
    <PanelRedCompartida
      preferencias={props.preferencias ?? PREFERENCIAS_BASE}
      puertas={props.puertas ?? PUERTAS_BASE}
      decisiones={props.decisiones ?? DECISIONES_BASE}
      onCambiar={props.onCambiar ?? onCambiar}
    />
  );
}

afterEach(() => cleanup());

describe("PanelRedCompartida", () => {
  describe("renderizado básico", () => {
    it("renderiza el interruptor principal apagado por defecto", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, compartir: false } });
      const switchPrincipal = screen.getByRole("switch", { name: /Compartir mi internet por la malla/i });
      expect(switchPrincipal).toBeInTheDocument();
      expect(switchPrincipal).not.toBeChecked();
    });

    it("renderiza el interruptor principal encendido cuando preferencias.compartir es true", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, compartir: true } });
      const switchPrincipal = screen.getByRole("switch", { name: /Compartir mi internet por la malla/i });
      expect(switchPrincipal).toBeChecked();
    });

    it("muestra las cinco opciones de «¿Con quién?» en orden: nadie, mi-cuenta, vinculos, grupo, publico", () => {
      renderPanel();
      const opciones = screen.getAllByRole("radio", { name: /nadie|mi cuenta|mis vínculos|un grupo|cualquiera/i });
      expect(opciones).toHaveLength(5);
      expect(opciones[0]).toHaveAttribute("aria-checked", "true");
      expect(opciones[1]).toHaveAttribute("aria-checked", "false");
      expect(opciones[2]).toHaveAttribute("aria-checked", "false");
      expect(opciones[3]).toHaveAttribute("aria-checked", "false");
      expect(opciones[4]).toHaveAttribute("aria-checked", "false");
    });

    it("muestra la opción seleccionada según preferencias.maximoCon", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, maximoCon: "vinculos" } });
      const vinculos = screen.getByRole("radio", { name: /mis vínculos/i });
      expect(vinculos).toHaveAttribute("aria-checked", "true");
      const nadie = screen.getByRole("radio", { name: /nadie/i });
      expect(nadie).toHaveAttribute("aria-checked", "false");
    });

    it("renderiza los topes: solo Wi-Fi, subida máxima, reserva de batería, permitir medidas", () => {
      renderPanel();
      expect(screen.getByRole("switch", { name: /Solo Wi-Fi/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Subida máxima compartible/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Reserva de batería/i)).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: /Permitir en conexiones medidas/i })).toBeInTheDocument();
    });

    it("renderiza el interruptor de modo automático apagado por defecto", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: false } });
      const switchAuto = screen.getByRole("switch", { name: /Modo automático/i });
      expect(switchAuto).toBeInTheDocument();
      expect(switchAuto).not.toBeChecked();
    });

    it("el texto de ayuda del modo automático dice que nunca enciende lo que tú no encendiste", () => {
      renderPanel();
      expect(screen.getByText(/Nunca enciende lo que tú no encendiste/i)).toBeInTheDocument();
    });
  });

  describe("interacción: interruptor principal", () => {
    it("llama a onCambiar con compartir=true al encender", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, compartir: false }, onCambiar });
      const switchPrincipal = screen.getByRole("switch", { name: /Compartir mi internet por la malla/i });
      fireEvent.click(switchPrincipal);
      expect(onCambiar).toHaveBeenCalledWith({ compartir: true });
    });

    it("llama a onCambiar con compartir=false al apagar", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, compartir: true }, onCambiar });
      const switchPrincipal = screen.getByRole("switch", { name: /Compartir mi internet por la malla/i });
      fireEvent.click(switchPrincipal);
      expect(onCambiar).toHaveBeenCalledWith({ compartir: false });
    });
  });

  describe("interacción: cambiar maximoCon", () => {
    it("llama a onCambiar directamente al bajar o mantener el nivel (nadie → nadie)", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, maximoCon: "nadie" }, onCambiar });
      const nadie = screen.getByRole("radio", { name: /nadie/i });
      fireEvent.click(nadie);
      expect(onCambiar).toHaveBeenCalledWith({ maximoCon: "nadie" });
    });

    it("llama a onCambiar directamente al bajar el nivel (publico → grupo)", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, maximoCon: "publico" }, onCambiar });
      const grupo = screen.getByRole("radio", { name: /un grupo/i });
      fireEvent.click(grupo);
      expect(onCambiar).toHaveBeenCalledWith({ maximoCon: "grupo" });
    });

    it("pide confirmación al subir la apertura (nadie → mi-cuenta)", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, maximoCon: "nadie" }, onCambiar });
      const miCuenta = screen.getByRole("radio", { name: /mi cuenta/i });
      fireEvent.click(miCuenta);
      expect(onCambiar).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByText(/¿Confirmas aumentar la apertura a «Mi cuenta»?/i)).toBeInTheDocument();
    });

    it("pide confirmación al subir la apertura (mi-cuenta → publico)", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, maximoCon: "mi-cuenta" }, onCambiar });
      const publico = screen.getByRole("radio", { name: /cualquiera/i });
      fireEvent.click(publico);
      expect(onCambiar).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByText(/¿Confirmas aumentar la apertura a «Cualquiera»?/i)).toBeInTheDocument();
    });

    it("aplica el cambio tras confirmar en el diálogo", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, maximoCon: "nadie" }, onCambiar });
      const miCuenta = screen.getByRole("radio", { name: /mi cuenta/i });
      fireEvent.click(miCuenta);
      const botonConfirmar = screen.getByRole("button", { name: /Confirmar/i });
      fireEvent.click(botonConfirmar);
      expect(onCambiar).toHaveBeenCalledWith({ maximoCon: "mi-cuenta" });
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("cancela el cambio tras pulsar Cancelar en el diálogo", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, maximoCon: "nadie" }, onCambiar });
      const miCuenta = screen.getByRole("radio", { name: /mi cuenta/i });
      fireEvent.click(miCuenta);
      const botonCancelar = screen.getByRole("button", { name: /Cancelar/i });
      fireEvent.click(botonCancelar);
      expect(onCambiar).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  describe("interacción: topes numéricos", () => {
    it("llama a onCambiar con soloWifi al cambiar el switch", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, soloWifi: true }, onCambiar });
      const switchSoloWifi = screen.getByRole("switch", { name: /Solo Wi-Fi/i });
      fireEvent.click(switchSoloWifi);
      expect(onCambiar).toHaveBeenCalledWith({ soloWifi: false });
    });

    it("llama a onCambiar con kbpsSubidaMax al cambiar el input", () => {
      const onCambiar = vi.fn();
      renderPanel({ onCambiar });
      const input = screen.getByLabelText(/Subida máxima compartible/i);
      fireEvent.change(input, { target: { value: "2048" } });
      expect(onCambiar).toHaveBeenCalledWith({ kbpsSubidaMax: 2048 });
    });

    it("acota kbpsSubidaMax al mínimo 64", () => {
      const onCambiar = vi.fn();
      renderPanel({ onCambiar });
      const input = screen.getByLabelText(/Subida máxima compartible/i);
      fireEvent.change(input, { target: { value: "10" } });
      expect(onCambiar).toHaveBeenCalledWith({ kbpsSubidaMax: 64 });
    });

    it("acota kbpsSubidaMax al máximo 102400", () => {
      const onCambiar = vi.fn();
      renderPanel({ onCambiar });
      const input = screen.getByLabelText(/Subida máxima compartible/i);
      fireEvent.change(input, { target: { value: "200000" } });
      expect(onCambiar).toHaveBeenCalledWith({ kbpsSubidaMax: 102400 });
    });

    it("llama a onCambiar con reservaBateriaPct al cambiar el input", () => {
      const onCambiar = vi.fn();
      renderPanel({ onCambiar });
      const input = screen.getByLabelText(/Reserva de batería/i);
      fireEvent.change(input, { target: { value: "50" } });
      expect(onCambiar).toHaveBeenCalledWith({ reservaBateriaPct: 50 });
    });

    it("acota reservaBateriaPct al mínimo 0", () => {
      const onCambiar = vi.fn();
      renderPanel({ onCambiar });
      const input = screen.getByLabelText(/Reserva de batería/i);
      fireEvent.change(input, { target: { value: "-10" } });
      expect(onCambiar).toHaveBeenCalledWith({ reservaBateriaPct: 0 });
    });

    it("acota reservaBateriaPct al máximo 90", () => {
      const onCambiar = vi.fn();
      renderPanel({ onCambiar });
      const input = screen.getByLabelText(/Reserva de batería/i);
      fireEvent.change(input, { target: { value: "100" } });
      expect(onCambiar).toHaveBeenCalledWith({ reservaBateriaPct: 90 });
    });

    it("llama a onCambiar con compartirMedidas al cambiar el switch", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, compartirMedidas: false }, onCambiar });
      const switchMedidas = screen.getByRole("switch", { name: /Permitir en conexiones medidas/i });
      fireEvent.click(switchMedidas);
      expect(onCambiar).toHaveBeenCalledWith({ compartirMedidas: true });
    });
  });

  describe("interacción: modo automático", () => {
    it("llama a onCambiar con automatico=true al encender", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: false }, onCambiar });
      const switchAuto = screen.getByRole("switch", { name: /Modo automático/i });
      fireEvent.click(switchAuto);
      expect(onCambiar).toHaveBeenCalledWith({ automatico: true });
    });

    it("llama a onCambiar con automatico=false al apagar", () => {
      const onCambiar = vi.fn();
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: true }, onCambiar });
      const switchAuto = screen.getByRole("switch", { name: /Modo automático/i });
      fireEvent.click(switchAuto);
      expect(onCambiar).toHaveBeenCalledWith({ automatico: false });
    });

    it("NO muestra la lista de decisiones cuando automatico=false", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: false } });
      expect(screen.queryByText(/Decisiones automáticas/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Batería al 22%/i)).not.toBeInTheDocument();
    });

    it("MUESTRA la lista de decisiones cuando automatico=true", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: true } });
      expect(screen.getByText(/Decisiones automáticas/i)).toBeInTheDocument();
      expect(screen.getByText(/Batería al 22%/i)).toBeInTheDocument();
      expect(screen.getByText(/Cumple todas las condiciones/i)).toBeInTheDocument();
    });

    it("muestra el motivo de cada decisión en la lista", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: true } });
      expect(screen.getByText(/Batería al 22% \(mínimo 30%\) y no está cargando/i)).toBeInTheDocument();
      expect(screen.getByText(/Cumple todas las condiciones: interruptor encendido, nivel dentro del máximo, Wi-Fi\/batería\/subida\/medida dentro de topes/i)).toBeInTheDocument();
    });

    it("muestra badge 'retirar' en rojo para decisiones de retirada", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: true } });
      const badgeRetirar = screen.getByText(/retirar/i).closest("span")!;
      expect(badgeRetirar).toHaveClass("bg-rose-500/20");
      expect(badgeRetirar).toHaveClass("text-rose-300");
    });

    it("muestra badge 'ofrecer' en verde para decisiones de oferta", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: true } });
      const badgeOfrecer = screen.getByText(/ofrecer/i).closest("span")!;
      expect(badgeOfrecer).toHaveClass("bg-emerald-500/20");
      expect(badgeOfrecer).toHaveClass("text-emerald-300");
    });

    it("muestra el ID de la puerta y el nivel en cada decisión", () => {
      renderPanel({ preferencias: { ...PREFERENCIAS_BASE, automatico: true } });
      expect(screen.getByText(/Puerta: puerta-1 · Nivel: Cualquiera/i)).toBeInTheDocument();
      expect(screen.getByText(/Puerta: puerta-2 · Nivel: Cualquiera/i)).toBeInTheDocument();
    });
  });

  describe("accesibilidad y estilo", () => {
    it("el label del interruptor principal tiene padding para objetivo táctil ≥ 44px", () => {
      renderPanel();
      const labelEl = screen.getByText(/Compartir mi internet por la malla/i).closest("label")!;
      expect(labelEl).toHaveClass("py-2");
      const switchEl = screen.getByRole("switch", { name: /Compartir mi internet por la malla/i });
      expect(switchEl).toHaveClass("h-6");
    });

    it("los switches tienen foco visible", () => {
      renderPanel();
      const switchPrincipal = screen.getByRole("switch", { name: /Compartir mi internet por la malla/i });
      expect(switchPrincipal).toHaveClass("focus-visible:ring-2");
    });

    it("los radio buttons tienen foco visible", () => {
      renderPanel();
      const radio = screen.getByRole("radio", { name: /nadie/i });
      expect(radio).toHaveClass("focus-visible:ring-2");
    });

    it("no usa color como único indicador en switches (tienen thumb visible)", () => {
      renderPanel();
      const switchPrincipal = screen.getByRole("switch", { name: /Compartir mi internet por la malla/i });
      const thumb = switchPrincipal.querySelector('[data-state]');
      expect(thumb).toBeInTheDocument();
    });
  });
});