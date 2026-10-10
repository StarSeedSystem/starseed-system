/**
 * El Mapa 3D de señales reales como lo usa la persona: «Tú», aparatos con su estado, enlace y medios
 * abiertos, filtros por antena y por cuenta, selección compartida entre lienzo y lista, fichas con la
 * fuente de cada valor, modo compacto, prefers-reduced-motion, preferencias y la caída al plano.
 * El lienzo WebGL se sustituye por un doble que enseña sus props (la geometría y los datos ya se
 * prueban en `lib/senales/__tests__`); el hook `useMapaVivo` corre de verdad sobre fuentes simuladas.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { AHORA, aparato, enlaceLocal, fila, medioPresencia, senal, SENALES_MEDIO } from "@/lib/senales/__fixtures__/vivo";

const h = vi.hoisted(() => ({
  escena: null as null | Record<string, any>,
  senales: [] as unknown[],
  filas: [] as unknown[],
  presencia: { conectado: true, medios: [] as unknown[] },
  locales: [] as unknown[],
  mesh: {} as Record<string, unknown>,
  webgl: true,
  reducido: false,
  ble: { support: "scan", adapter: true, scanning: false, detections: [], detail: "ok" } as Record<string, unknown>,
  refresh: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () => function EscenaDoble(props: Record<string, any>) {
    h.escena = props;
    return (
      <div data-testid="escena" aria-label={props.descripcion}>
        {props.marcadores.map((m: { id: string; y: number }) => (
          <button key={m.id} data-testid={`marcador-${m.id}`} data-y={m.y.toFixed(2)} onClick={() => props.onSeleccionar(m.id)} />
        ))}
        {props.medios.map((m: { id: string }) => (
          <button key={m.id} data-testid={`medio-${m.id}`} onClick={() => props.onSeleccionar(m.id)} />
        ))}
        <button data-testid="clic-yo" onClick={() => props.onSeleccionar("yo")} />
        <button data-testid="perder-contexto" onClick={() => props.onPerdido?.()} />
        <button data-testid="clic-vacio" onClick={() => props.onSeleccionar(null)} />
      </div>
    );
  },
}));
vi.mock("framer-motion", () => ({ useReducedMotion: () => h.reducido }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/senales/webgl", () => ({ webglDisponible: () => h.webgl, olvidarWebgl: () => undefined }));
vi.mock("@/ai/astraura/mesh", () => ({
  useMeshState: () => h.mesh,
  detectSignals: async () => [
    { kind: "mesh", label: "Malla P2P (LoRa)", status: "active", detail: "", controllable: true, actions: [] },
    { kind: "nfc", label: "NFC", status: "unsupported", detail: "", controllable: false, actions: [] },
  ],
  subscribeConnectivity: () => () => undefined,
}));
vi.mock("@/ai/astraura/mesh/signals", async (orig) => ({
  ...(await orig<typeof import("@/ai/astraura/mesh/signals")>()),
  startBleScan: vi.fn(async () => ({ scanning: true, detections: [], detail: "" })),
  stopBleScan: vi.fn(),
}));
vi.mock("../../use-detected-signals", () => ({
  useDetectedSignals: () => ({ signals: h.senales, ble: h.ble, loadingNeurons: false, unavailable: [], refresh: h.refresh }),
  ordenarSenalesPorCalidad: (s: DetectedSignal[]) =>
    [...s].sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1) || a.id.localeCompare(b.id)),
}));
vi.mock("@/lib/network/malla-neuronas", () => ({
  useMallaNeuronasEstado: () => ({ misDispositivos: h.filas, cercanas: [], loading: false }),
}));
vi.mock("@/lib/neurons/presencia", () => ({ usePresenciaNeuronas: () => h.presencia }));
vi.mock("@/lib/malla/registro-enlaces-locales", () => ({ useEnlacesLocales: () => h.locales }));
vi.mock("@/lib/neurons/medio", () => ({
  describirMedio: () => ({ id: "m-yo", tipo: "navegador", etiqueta: "Chrome · localhost" }),
}));
vi.mock("@/lib/neurons/senales-medio", async () => {
  const f = await import("@/lib/senales/__fixtures__/vivo");
  return { medirSenales: async () => f.SENALES_MEDIO };
});
vi.mock("@/lib/consumo/usuario", () => ({ uidActual: async () => "uid-yo" }));
// La ficha real pide el proveedor de confirmaciones; el doble enseña cada dato con su estado.
vi.mock("../../signal-detail", () => ({
  SignalDetailCard: ({ signal, ficha, onClose }: { signal: DetectedSignal; ficha?: { secciones: { datos: { etiqueta: string; valor: string; estado: string }[] }[] }; onClose: () => void }) => (
    <div data-testid="ficha">
      <span>{`Ficha de ${signal.label}`}</span>
      {ficha?.secciones.flatMap((s) => s.datos).map((d) => (
        <span key={d.etiqueta} data-testid="dato">{`${d.etiqueta}: ${d.valor} [${d.estado}]`}</span>
      ))}
      <button onClick={onClose}>cerrar ficha</button>
    </div>
  ),
}));

import { MapaSenales } from "../mapa-senales";
import { CLAVE_PREFERENCIAS_MAPA } from "@/lib/senales/preferencias-mapa";

const grupo = (nombre: string) => screen.getByRole("group", { name: nombre });
const vista = (cual: RegExp) => fireEvent.click(within(grupo("Tipo de vista")).getByRole("button", { name: cual }));

const DUENA = { via: "neuron-registry" as const, sourceId: "n1", name: "Mac", ownAccount: true, capabilities: [] };
const RUTA = { clase: "misma-red-local" as const, tipoLocal: "host", tipoRemoto: "host", protocolo: "udp", rttMs: 12, bytesEnviados: 1, bytesRecibidos: 2, medidoEn: AHORA };

function base(): DetectedSignal[] {
  return [
    senal("lora:7", { label: "Nodo Norte", quality: 0.9 }),
    senal("lora:9", {
      label: "Nodo Sur", quality: 0.6,
      placement: { angleRad: 1.2, radiusFrac: 0.6, accuracyFrac: 0.03, mode: "gps", distanceM: 900, accuracyM: 35, detail: "p" },
    }),
    senal("ble:1", {
      antenna: "ble", label: "Auriculares", quality: null, color: "#60a5fa",
      placement: { angleRad: 0, radiusFrac: 0.5, accuracyFrac: 0.3, mode: "sector", distanceM: null, accuracyM: null, detail: "p" },
    }),
    aparato("n1", {
      label: "Mi Mac", quality: 1, color: "#c084fc", starseed: { ...DUENA, name: "Mi Mac" },
    }),
  ];
}

beforeEach(() => {
  h.escena = null;
  h.webgl = true;
  h.reducido = false;
  h.refresh.mockClear();
  h.mesh = {
    status: "ready", transport: "serial", region: "EU_868", edges: [], remoteTopologies: [],
    self: { num: 1, isSelf: true, lat: 40, lon: -3, presence: "online", lastHeard: AHORA },
    nodes: [
      { num: 1, isSelf: true, presence: "online", lastHeard: AHORA },
      { num: 7, presence: "online", lastHeard: AHORA },
      { num: 8, presence: "offline", lastHeard: AHORA },
    ],
  };
  h.senales = base();
  h.filas = [
    fila("yo", { esEsteDispositivo: true, syncDeviceId: "sync-yo" }),
    fila("n1", { enlace: { estado: "conectado", latenciaMs: 12, ruta: RUTA } }),
  ];
  h.presencia = { conectado: true, medios: [medioPresencia("n1", "m-n1a"), medioPresencia("n1", "m-n1b", { visible: false, etiqueta: "App nativa" })] };
  h.locales = [];
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("Mapa 3D de señales reales · lo que cuenta", () => {
  test("cuenta de verdad lo que oye, con aparatos, enlaces medidos y medios abiertos", () => {
    render(<MapaSenales compacto={false} />);
    expect(screen.getByText("4 señales")).toBeInTheDocument();
    expect(screen.getByText("1 aparato · 1 activo ahora")).toBeInTheDocument();
    expect(screen.getByText("1 con enlace medido")).toBeInTheDocument();
    expect(screen.getByText("2 medios abiertos")).toBeInTheDocument();
    expect(screen.getByText("1 con GPS real")).toBeInTheDocument();
    expect(screen.getByText("1 por radiofrecuencia")).toBeInTheDocument();
    expect(screen.getByText("2 sin posición")).toBeInTheDocument();
    expect(screen.getByText(/Radio LoRa por USB · 1 nodo al alcance/)).toBeInTheDocument();
    expect(screen.getByTestId("escena")).toHaveAttribute("aria-label", expect.stringContaining("4 señales"));
  });

  test("el lienzo recibe los medios (orbitando a su aparato), el enlace real y un anillo solo con GPS", async () => {
    render(<MapaSenales compacto={false} />);
    await act(async () => { await Promise.resolve(); });
    expect(h.escena!.medios.map((m: { id: string }) => m.id).sort()).toEqual(["medio:m-n1a", "medio:m-n1b"]);
    const mac = h.escena!.marcadores.find((m: { id: string }) => m.id === "neuron:n1");
    expect(mac.enlaceMapa).toMatchObject({ clase: "p2p-red-local", latenciaMs: 12 });
    expect(mac.estado).toBe("activa");
    // Hay un nodo LoRa con GPS de ambos extremos (900 m): círculos reales en la regla larga.
    // El BLE sin posición y el LoRa por RF no inventan anillos propios.
    const anillos = h.escena!.anillos as { real: boolean; escala: string; metros: number }[];
    expect(anillos.length).toBeGreaterThan(0);
    expect(anillos.every((a) => a.real && a.escala === "largo")).toBe(true);
    expect(anillos.map((a) => a.metros)).toEqual([100, 1000]);
  });

  test("sin GPS de nadie, no hay anillos de distancia exactos: solo arcos «≈» o ninguno", async () => {
    h.senales = base().filter((s) => s.id !== "lora:9");
    render(<MapaSenales compacto={false} />);
    await act(async () => { await Promise.resolve(); });
    expect(h.escena!.anillos.some((a: { real: boolean }) => a.real)).toBe(false);
    expect(h.escena!.anillos.every((a: { etiqueta: string }) => a.etiqueta.startsWith("≈"))).toBe(true);
  });

  test("las antenas propias que no existen (NFC sin soporte) no llegan al lienzo", async () => {
    render(<MapaSenales compacto={false} />);
    await screen.findByTestId("escena");
    await act(async () => { await Promise.resolve(); });
    expect(h.escena!.antenas.map((a: { kind: string }) => a.kind)).toEqual(["mesh"]);
  });

  test("sin presencia en vivo lo dice: el estado sale del último latido, no de verlos abiertos", () => {
    h.presencia = { conectado: false, medios: [] };
    render(<MapaSenales compacto={false} />);
    expect(screen.getByText(/La presencia en vivo no está conectada/)).toBeInTheDocument();
    expect(screen.queryByText(/medios? abiertos?/)).not.toBeInTheDocument();
  });

  test("un enlace directo sin internet aparece como aparato aunque no esté en el registro", () => {
    h.locales = [enlaceLocal("x1", { nombre: "Móvil sin internet" })];
    render(<MapaSenales compacto={false} />);
    expect(screen.getByText("5 señales")).toBeInTheDocument();
    expect(screen.getByTestId("marcador-local:x1")).toBeInTheDocument();
    expect(h.escena!.marcadores.find((m: { id: string }) => m.id === "local:x1").enlaceMapa.clase).toBe("directo-sin-internet");
  });
});

describe("Mapa 3D de señales reales · filtros", () => {
  test("ocultar una familia la quita del lienzo y de la lista, y «Todas» la devuelve", () => {
    render(<MapaSenales compacto={false} />);
    expect(screen.getByTestId("marcador-ble:1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /BLE\s*1/ }));
    expect(screen.queryByTestId("marcador-ble:1")).not.toBeInTheDocument();
    expect(screen.queryByText("Auriculares")).not.toBeInTheDocument();
    expect(screen.getByText("3 de 4 señales con estos filtros")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Todas \(4\)/ }));
    expect(screen.getByTestId("marcador-ble:1")).toBeInTheDocument();
  });

  test("filtro por cuenta: «Mi cuenta» deja solo lo tuyo y «Sin cuenta StarSeed» lo demás", () => {
    render(<MapaSenales compacto={false} />);
    const grupo = screen.getByRole("group", { name: "Filtrar por cuenta" });
    fireEvent.click(within(grupo).getByRole("button", { name: /Mi cuenta/ }));
    expect(screen.getAllByTestId(/^marcador-/).map((b) => b.dataset.testid)).toEqual(["marcador-neuron:n1"]);
    fireEvent.click(within(grupo).getByRole("button", { name: /Sin cuenta StarSeed/ }));
    expect(screen.getAllByTestId(/^marcador-/).map((b) => b.dataset.testid).sort()).toEqual(["marcador-ble:1", "marcador-lora:7", "marcador-lora:9"]);
  });

  test("las cuentas ajenas salen anónimas: ni nombre ni id en pantalla", () => {
    h.senales = [
      ...base(),
      senal("beacon:abc-secreto", {
        antenna: "relay", label: "Casa de Marta", color: "#fb923c",
        starseed: { via: "relay-beacon", sourceId: "abc-secreto", name: "Marta Pérez", ownAccount: false, capabilities: [], neuronId: "neu-privada" },
      }),
    ];
    const { container } = render(<MapaSenales compacto={false} />);
    expect(screen.getAllByText("Neurona de otra cuenta").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/Marta|Casa de Marta|abc-secreto|neu-privada/);
    fireEvent.click(screen.getByTestId("marcador-beacon:abc-secreto"));
    expect(screen.getByTestId("ficha")).toHaveTextContent("Ficha de Neurona de otra cuenta");
    expect(screen.getByTestId("ficha").textContent).not.toMatch(/Marta|abc-secreto|neu-privada/);
  });

  test("«Ocultar desconectados» solo aparece si hay alguno y quita ese aparato", () => {
    render(<MapaSenales compacto={false} />);
    expect(screen.queryByRole("button", { name: /Ocultar desconectados/ })).not.toBeInTheDocument();
    cleanup();
    h.filas = [fila("yo", { esEsteDispositivo: true }), fila("n1", { online: false, ultimoVisto: undefined })];
    h.presencia = { conectado: true, medios: [] };
    render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Ocultar desconectados/ }));
    expect(screen.queryByTestId("marcador-neuron:n1")).not.toBeInTheDocument();
    expect(screen.getByTestId("marcador-lora:7")).toBeInTheDocument();
  });

  test("la altura cambia con el eje elegido y lo sin dato se queda en el suelo", () => {
    render(<MapaSenales compacto={false} />);
    const y = (id: string) => Number(screen.getByTestId(`marcador-${id}`).dataset.y);
    expect(y("lora:7")).toBeGreaterThan(2);
    expect(y("ble:1")).toBe(0);
    const altura = grupo("Qué significa la altura");
    fireEvent.click(within(altura).getByRole("button", { name: "Plano" }));
    expect(y("lora:7")).toBe(0);
    fireEvent.click(within(altura).getByRole("button", { name: "Saltos" }));
    expect(y("lora:7")).toBe(0); // la señal no informa saltos: no se inventa altura
  });
});

describe("Mapa 3D de señales reales · selección y fichas", () => {
  test("pulsar un marcador abre su ficha con cada valor y su estado; «Todas las señales» vuelve", () => {
    render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByTestId("marcador-lora:7"));
    expect(h.escena!.seleccionId).toBe("lora:7");
    expect(screen.getByTestId("ficha")).toHaveTextContent("Ficha de Nodo Norte");
    expect(screen.getAllByTestId("dato").some((d) => /\[(medido|declarado|estimado|no-medido)\]/.test(d.textContent ?? ""))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Todas las señales/ }));
    expect(screen.queryByTestId("ficha")).not.toBeInTheDocument();
    expect(h.escena!.seleccionId).toBeNull();
  });

  test("«Tú» es clicable y su ficha dice qué se midió y qué no", () => {
    render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByTestId("clic-yo"));
    const panel = screen.getByTestId("ficha-panel");
    expect(panel).toHaveTextContent("Tú");
    expect(within(panel).getAllByText(/medido|declarado|estimado|no medido/i).length).toBeGreaterThan(0);
    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar la ficha" }));
    expect(screen.queryByTestId("ficha-panel")).not.toBeInTheDocument();
  });

  test("un medio abierto tiene su propia ficha y vuelve a su aparato", () => {
    render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByTestId("medio-medio:m-n1b"));
    const panel = screen.getByTestId("ficha-panel");
    expect(panel).toHaveTextContent("App nativa");
    fireEvent.click(within(panel).getByRole("button", { name: /Ver el aparato/ }));
    expect(h.escena!.seleccionId).toBe("neuron:n1");
    expect(screen.getByTestId("ficha")).toHaveTextContent("Ficha de Mi Mac");
  });

  test("elegir en la lista selecciona en el lienzo (misma selección) y la ficha de un aparato trae su enlace", () => {
    render(<MapaSenales compacto={false} />);
    const lista = screen.getByRole("list", { name: "Señales detectadas" });
    fireEvent.click(within(lista).getByRole("button", { name: /Mi Mac/ }));
    expect(h.escena!.seleccionId).toBe("neuron:n1");
    expect(screen.getAllByTestId("dato").map((d) => d.textContent).join("\n")).toMatch(/P2P · misma red local.*\[medido\]/);
  });

  test("sin ninguna señal, la lista dice que no se oye nada (no que haya filtros)", () => {
    h.senales = [];
    h.filas = [];
    h.presencia = { conectado: true, medios: [] };
    render(<MapaSenales compacto={false} />);
    expect(screen.getByText("Sin señales detectadas")).toBeInTheDocument();
    expect(screen.getByText(/Todavía no se oye ninguna señal/)).toBeInTheDocument();
    expect(screen.queryByText(/con estos filtros/)).not.toBeInTheDocument();
  });

  test("pulsar el vacío del lienzo suelta la selección, y si lo elegido desaparece también", () => {
    const { rerender } = render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByTestId("marcador-lora:7"));
    fireEvent.click(screen.getByTestId("clic-vacio"));
    expect(screen.queryByTestId("ficha")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("marcador-lora:7"));
    h.senales = (h.senales as DetectedSignal[]).filter((s) => s.id !== "lora:7");
    rerender(<MapaSenales compacto={false} />);
    expect(screen.queryByTestId("ficha")).not.toBeInTheDocument();
  });
});

describe("Mapa 3D de señales reales · avisos, compacto y movimiento", () => {
  test("el simulador se declara inequívocamente", () => {
    h.mesh = { ...h.mesh, transport: "simulator" };
    render(<MapaSenales compacto={false} />);
    expect(screen.getByText(/Simulador activo/)).toBeInTheDocument();
    expect(screen.getByText(/Radio LoRa por SIMULADOR/)).toBeInTheDocument();
  });

  test("sin radio ni señales lo dice en vez de fingir actividad", () => {
    h.senales = [];
    h.filas = [];
    h.mesh = { ...h.mesh, status: "idle", transport: null, nodes: [], self: undefined };
    render(<MapaSenales compacto={false} />);
    expect(screen.getByText("Sin radio LoRa conectado")).toBeInTheDocument();
    expect(screen.getByText(/Sin radio LoRa · se muestran las antenas de esta neurona/)).toBeInTheDocument();
    expect(screen.getByText("0 señales")).toBeInTheDocument();
  });

  test("«Sondear» vuelve a leer todas las fuentes", () => {
    render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Volver a sondear/ }));
    expect(h.refresh).toHaveBeenCalled();
  });

  test("modo compacto (móvil): lienzo ligero, filtros plegados y sin chips de posición", () => {
    render(<MapaSenales compacto />);
    expect(h.escena!.ligero).toBe(true);
    expect(screen.queryByText("1 con GPS real")).not.toBeInTheDocument();
    const filtros = screen.getByText("Filtros").closest("details")!;
    expect(filtros).not.toHaveAttribute("open");
    expect(within(filtros).getByRole("group", { name: "Filtrar por cuenta" })).toBeInTheDocument();
    expect(screen.getByText("4 señales")).toBeInTheDocument();
  });

  test("en pantalla completa el lienzo no es ligero", () => {
    render(<MapaSenales compacto={false} />);
    expect(h.escena!.ligero).toBe(false);
  });

  test("prefers-reduced-motion llega al lienzo y apaga los pulsos del plano", () => {
    h.reducido = true;
    const { container } = render(<MapaSenales compacto={false} />);
    expect(h.escena!.reducido).toBe(true);
    vista(/Plano/);
    expect(container.querySelector(".ss-signal-ping")).toBeNull();
  });

  test("con movimiento permitido, el plano solo pulsa lo oído hace menos de 30 s", () => {
    h.senales = [senal("lora:7", { quality: 0.9, lastHeard: Date.now() }), senal("lora:8", { quality: 0.5, lastHeard: Date.now() - 10 * 60_000 })];
    const { container } = render(<MapaSenales compacto={false} />);
    vista(/Plano/);
    expect(container.querySelectorAll(".ss-signal-ping").length).toBe(1);
  });
});

describe("Mapa 3D de señales reales · preferencias y plano", () => {
  test("las preferencias se recuerdan en el dispositivo y se restauran al volver", () => {
    const { unmount } = render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Frescura" }));
    fireEvent.click(screen.getByRole("button", { name: /BLE\s*1/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Filtrar por cuenta" })).getByRole("button", { name: /Mi cuenta/ }));
    expect(JSON.parse(window.localStorage.getItem(CLAVE_PREFERENCIAS_MAPA)!)).toMatchObject({ altura: "frescura", ocultas: ["ble"], cuenta: "propia" });
    unmount();
    render(<MapaSenales compacto={false} />);
    expect(screen.getByRole("button", { name: "Frescura" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("marcador-ble:1")).not.toBeInTheDocument();
  });

  test("«Plano» enseña el MISMO mapa en SVG, con la selección intacta, y «Mapa 3D» vuelve al lienzo", () => {
    render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByTestId("marcador-neuron:n1"));
    vista(/Plano/);
    expect(screen.queryByTestId("escena")).not.toBeInTheDocument();
    const svg = screen.getByRole("group", { name: /Mapa 3D de señales: 4 señales/ });
    expect(within(svg).getByRole("button", { name: /Mi Mac.*calidad 100 de 100.*activa ahora/ })).toBeInTheDocument();
    expect(screen.getByTestId("ficha")).toHaveTextContent("Ficha de Mi Mac");
    fireEvent.click(within(svg).getByRole("button", { name: /Tú, esta neurona/ }));
    expect(screen.getByTestId("ficha-panel")).toBeInTheDocument();
    vista(/Mapa 3D/);
    expect(screen.getByTestId("escena")).toBeInTheDocument();
  });

  test("sin WebGL el navegador recibe el plano y se le explica por qué", () => {
    h.webgl = false;
    render(<MapaSenales compacto={false} />);
    expect(screen.queryByTestId("escena")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Mapa 3D de señales/ })).toBeInTheDocument();
    expect(screen.getByText(/no puede abrir WebGL/)).toBeInTheDocument();
  });

  test("si el lienzo pierde el contexto WebGL, cae al plano con el motivo y se puede reintentar", () => {
    render(<MapaSenales compacto={false} />);
    fireEvent.click(screen.getByTestId("perder-contexto"));
    expect(screen.queryByTestId("escena")).not.toBeInTheDocument();
    expect(screen.getByText(/perdió el contexto WebGL/)).toBeInTheDocument();
    vista(/Mapa 3D/);
    expect(screen.getByTestId("escena")).toBeInTheDocument();
  });

  test("«soloPlano» (superficies ligeras) no ofrece 3D ni toca WebGL", () => {
    render(<MapaSenales compacto soloPlano />);
    expect(screen.queryByRole("button", { name: /Mapa 3D$/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("escena")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Mapa 3D de señales/ })).toBeInTheDocument();
  });
});
