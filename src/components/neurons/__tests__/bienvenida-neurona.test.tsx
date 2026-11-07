/**
 * (NEU1107B) La ventana «Esta neurona»: fusión sugerida preseleccionada (un toque la aplica, nunca sin él),
 * elegir qué id y qué nombre se quedan, ajustes básicos, resumen y «Ahora no».
 *   NODE_ENV=test npx vitest run src/components/neurons/__tests__/bienvenida-neurona.test.tsx
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BorradorAjustes } from "@/lib/neurons/neurona-bienvenida";
import type { DatosBienvenida } from "@/lib/neurons/neurona-bienvenida-acciones";

const UID = "1f0c2d3e-aaaa-4bbb-8ccc-000000000001";
const YO = "9370fd33-0000-4000-8000-000000000004";
const VIEJA = "659d5e03-0000-4000-8000-000000000003";
const WEB = "d3abf6fa-0000-4000-8000-000000000006";

const est = vi.hoisted(() => ({
  fusiones: [] as unknown[],
  ajustes: [] as unknown[],
  vistas: [] as unknown[],
  pospuestas: [] as unknown[],
  fusionCambiaId: false,
  fusionFalla: false,
}));

function borrador(nombre: string): BorradorAjustes {
  return {
    nombre,
    funcion: "ambos",
    capas: { local: true, mesh: true, nube: true, colectiva: true },
    motorLocal: true,
    mediosPropios: false,
    medios: { modo: "auto", elegidos: [], siNinguno: "esperar" },
    escuchaFondo: true,
    compartirComputo: true,
    compartirAlmacen: true,
    solicitudesArchivos: true,
    nas: null,
    actualizaPrimero: false,
    icono: "mobile",
  };
}

vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { themeStore: { activeMode: "secondary" } } }) }));
vi.mock("@/lib/onboarding/primer-arranque", () => ({ posponerNeuronaEnCuenta: (id: string) => est.pospuestas.push(id) }));
vi.mock("@/lib/neurons/neurona-bienvenida-acciones", () => ({
  reunirDatosBienvenida: async () => {
    throw new Error("las pruebas pasan los datos");
  },
  leerNasNativo: async () => null,
  borradorInicial: (_id: string, nombre: string) => borrador(nombre),
  marcarBienvenidaVista: (...a: unknown[]) => est.vistas.push(a),
  aplicarFusionBienvenida: async (plan: unknown) => {
    est.fusiones.push(plan);
    if (est.fusionFalla) return { ok: false, motivo: "sin red", cambioDeId: false };
    return { ok: true, respaldo: 99, cambioDeId: est.fusionCambiaId };
  },
  aplicarAjustesBienvenida: async (...a: unknown[]) => {
    est.ajustes.push(a);
    return { ok: true, avisos: [] };
  },
}));

import { BienvenidaNeurona } from "../bienvenida-neurona";

const AHORA = Date.parse("2026-11-07T18:00:00Z");

function datos(conCandidatas = true): DatosBienvenida {
  const yo = { id: YO, name: "Maggadroid phone", kind: "mobile", capabilities: { platform: "Android" }, created_at: "2026-06-11T10:05:00Z" };
  const vieja = { id: VIEJA, name: "Maggadroid", kind: "mobile", capabilities: { platform: "Android" }, last_seen_at: "2026-06-11T09:30:00Z" };
  const web = { id: WEB, name: "📱 Android · Chrome 154", kind: "mobile", capabilities: { platform: "Android" }, last_seen_at: "2026-10-10T21:00:00Z" };
  const candidatas = conCandidatas
    ? [
        {
          id: VIEJA,
          nombre: "Maggadroid",
          confianza: "media" as const,
          puntos: 50,
          motivos: ["nombre parecido («Maggadroid» y «Maggadroid phone»)", "dejó de usarse justo cuando nació esta"],
          razon: "Nombre parecido («Maggadroid» y «Maggadroid phone») y dejó de usarse justo cuando nació esta.",
          enLineaAhora: false,
          ultimaVez: vieja.last_seen_at,
          creada: null,
        },
        {
          id: WEB,
          nombre: web.name,
          confianza: "baja" as const,
          puntos: 18,
          motivos: ["mismo sistema (Android)"],
          razon: "Mismo sistema (Android).",
          enLineaAhora: false,
          ultimaVez: web.last_seen_at,
          creada: null,
        },
      ]
    : [];
  return {
    uid: UID,
    yo,
    todas: [yo, vieja, web],
    presentes: [],
    idAnteriorMigracion: null,
    medio: "android",
    configurada: false,
    resultado: { candidatas, descartadas: [{ id: "e0b9", nombre: "Maggaboard", motivo: "otro equipo" }] },
    sugerencia: { seleccionadas: conCandidatas ? [VIEJA] : [], principal: YO, nombre: "Maggadroid phone" },
    ahora: AHORA,
  };
}

function montar(d: DatosBienvenida = datos(), extra: { manual?: boolean } = {}) {
  const onClose = vi.fn();
  const recargar = vi.fn();
  render(<BienvenidaNeurona datos={d} onClose={onClose} recargar={recargar} manual={extra.manual} />);
  return { onClose, recargar };
}

beforeEach(() => {
  est.fusiones = [];
  est.ajustes = [];
  est.vistas = [];
  est.pospuestas = [];
  est.fusionCambiaId = false;
  est.fusionFalla = false;
  window.localStorage.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (q: string) => ({
      matches: q.includes("reduced-motion"),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
});
afterEach(() => cleanup());

describe("paso 1 · «Este aparato ya tenía neuronas»", () => {
  it("enseña las candidatas con su confianza y su razón; la sugerida viene marcada y la poco probable no", () => {
    montar();
    expect(screen.getByRole("heading", { name: "Este aparato ya tenía neuronas" })).toBeTruthy();
    expect(screen.getByLabelText(/Paso 1 de 3: Fusión/)).toBeTruthy();
    const vieja = within(screen.getByTestId(`candidata-${VIEJA}`));
    expect(vieja.getByText("Probable")).toBeTruthy();
    expect(vieja.getByText(/dejó de usarse justo cuando nació esta/)).toBeTruthy();
    expect((vieja.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    const web = within(screen.getByTestId(`candidata-${WEB}`));
    expect(web.getByText("Poco probable")).toBeTruthy();
    expect((web.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByTestId("boton-fusionar").textContent).toContain("Fusionar (2)");
    expect(screen.getByText(/Nada se borra/)).toBeTruthy();
    // Nada se fusiona sin el toque.
    expect(est.fusiones).toEqual([]);
  });

  it("un toque en «Fusionar» aplica la sugerida (se queda esta, sin recargar) y pasa a los ajustes", async () => {
    const { onClose, recargar } = montar();
    await act(async () => {
      fireEvent.click(screen.getByTestId("boton-fusionar"));
    });
    expect(est.fusiones).toEqual([{ principal: YO, absorbidas: [VIEJA], nombre: "Maggadroid phone", esteMedioCambiaDeId: false }]);
    expect(await screen.findByRole("heading", { name: "Ajustes básicos de esta neurona" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(await screen.findByTestId("resumen-fusion")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("boton-terminar"));
    });
    expect(est.vistas).toEqual([[UID, YO, "completada"]]);
    expect(onClose).toHaveBeenCalled();
    expect(recargar).not.toHaveBeenCalled();
  });

  it("elegir que se quede la neurona vieja y su nombre: este medio cambia de id y al terminar recarga", async () => {
    est.fusionCambiaId = true;
    const { onClose, recargar } = montar();
    fireEvent.click(screen.getByLabelText(/^Maggadroid/, { selector: "input[type=radio]" }));
    fireEvent.click(screen.getByRole("button", { name: "Maggadroid", pressed: false }));
    expect(screen.getByText(/la app se recarga/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("boton-fusionar"));
    });
    expect(est.fusiones).toEqual([{ principal: VIEJA, absorbidas: [YO], nombre: "Maggadroid", esteMedioCambiaDeId: true }]);
    fireEvent.click(await screen.findByRole("button", { name: /Siguiente/ }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("boton-terminar"));
    });
    // Los ajustes van a la neurona que se quedó.
    expect((est.ajustes[0] as unknown[])[0]).toBe(VIEJA);
    expect(recargar).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("desmarcar todo deja «Fusionar» desactivado; si la fusión falla, se dice y no se avanza", async () => {
    est.fusionFalla = true;
    montar();
    const check = within(screen.getByTestId(`candidata-${VIEJA}`)).getByRole("checkbox");
    fireEvent.click(check);
    expect((screen.getByTestId("boton-fusionar") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(check);
    await act(async () => {
      fireEvent.click(screen.getByTestId("boton-fusionar"));
    });
    expect((await screen.findByRole("alert")).textContent).toContain("sin red");
    expect(screen.getByRole("heading", { name: "Este aparato ya tenía neuronas" })).toBeTruthy();
  });
});

describe("paso 2 y 3 · ajustes básicos y resumen", () => {
  it("«No fusionar» → ajustes: nombre, función, capas, medios y «más»; el resumen dice lo que cambia y se aplica", async () => {
    const { onClose } = montar();
    fireEvent.click(screen.getByRole("button", { name: "No fusionar" }));
    expect(await screen.findByRole("heading", { name: "Ajustes básicos de esta neurona" })).toBeTruthy();
    expect(est.fusiones).toEqual([]);
    fireEvent.change(await screen.findByLabelText("Nombre de esta neurona"), { target: { value: "Móvil de Alex" } });
    fireEvent.click(screen.getByLabelText(/^Servidor/, { selector: "input[type=radio]" }));
    fireEvent.click(screen.getByRole("switch", { name: "Capa Nube" }));
    // Medios propios de esta neurona, con la lista de siempre de Mensajería.
    fireEvent.click(screen.getByRole("switch", { name: "Usar los generales de Mensajería" }));
    expect(screen.getByRole("radiogroup", { name: "Medio de transmisión" })).toBeTruthy();
    // «Más» se despliega con el teclado/ratón y dice su estado.
    const mas = screen.getByRole("button", { name: /Más: fondo, recursos/ });
    expect(mas.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(mas);
    expect(mas.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByLabelText("Tableta"));
    // Sin NAS que leer (web o app anterior): no se ofrece.
    expect(screen.queryByText(/Compartir carpetas \(NAS\)/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    const resumen = within(await screen.findByTestId("resumen-ajustes"));
    expect(resumen.getByText("Nombre: «Móvil de Alex»")).toBeTruthy();
    expect(resumen.getByText("Función principal: Servidor")).toBeTruthy();
    expect(resumen.getByText("Capas de conciencia: Nube apagada")).toBeTruthy();
    expect(resumen.getByText("Icono: Tableta")).toBeTruthy();
    expect(screen.getByText(/Sin fusionar/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId("boton-terminar"));
    });
    const [id, antes, despues] = est.ajustes[0] as [string, BorradorAjustes, BorradorAjustes];
    expect(id).toBe(YO);
    expect(antes.nombre).toBe("Maggadroid phone");
    expect(despues).toMatchObject({ nombre: "Móvil de Alex", funcion: "servidor", icono: "tablet", mediosPropios: true });
    expect(despues.capas.nube).toBe(false);
    expect(est.vistas).toEqual([[UID, YO, "completada"]]);
    expect(onClose).toHaveBeenCalled();
  });

  it("sin candidatas empieza en los ajustes (2 pasos)", async () => {
    montar(datos(false));
    expect(screen.getByRole("heading", { name: "Ajustes básicos de esta neurona" })).toBeTruthy();
    expect(screen.getByLabelText(/Paso 1 de 2: Ajustes/)).toBeTruthy();
    expect(screen.queryByTestId("lista-candidatas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(await screen.findByText(/Sin cambios: esta neurona se queda como estaba/)).toBeTruthy();
  });
});

describe("«Ahora no»", () => {
  it("se apunta como vista (una vez por cuenta × aparato), pospone «Neurona nueva» y cierra sin tocar nada", () => {
    const { onClose } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(est.vistas).toEqual([[UID, YO, "omitida"]]);
    expect(est.pospuestas).toEqual([YO]);
    expect(est.fusiones).toEqual([]);
    expect(est.ajustes).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });

  it("abierta a mano no pospone nada más", async () => {
    const { onClose } = montar(datos(), { manual: true });
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(est.pospuestas).toEqual([]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
