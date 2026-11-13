/**
 * GEN1114F · nombres reales, información del chat y emparejar (contrato GEN1114 §3.8, §3.9, §8.5 y §9).
 * Las pruebas que pide la sección GEN1114F, con los componentes reales y la biblioteca real de E
 * (`canon`, `alias-gen1113`, `riesgoDeEntrada`). Solo se simulan la clave del aparato (IndexedDB),
 * la sesión de Supabase y la puerta.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import type { AparatoLocal } from "@/lib/chats-genesis/firma-aparato";
import { MODELO_PRESIDENTE } from "@/lib/mando/chat-director-tipos";

const sim = vi.hoisted(() => ({
    aparato: null as AparatoLocal | null,
    perdida: null as null | { huella: string; nombre: string; estado: string; vistoPorUltima: string | null },
    soporte: { ok: true } as { ok: true } | { ok: false; motivo: string },
    sinSesion: false,
    pedir: vi.fn(),
    consultar: vi.fn(),
}));

vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        auth: {
            // JWT de mentira con sub = la cuenta 1 de los vectores de §3.3 (sin firma: nadie lo verifica aquí).
            getSession: async () => (sim.sinSesion
                ? { data: { session: null } }
                : { data: { session: { access_token: `e30.${btoa(JSON.stringify({ sub: "00000000-0000-4000-8000-000000000001" })).replace(/=+$/, "")}.x` } } }),
        },
    }),
}));
vi.mock("@/lib/chats-genesis/firma-aparato", async (original) => {
    const real = await original<typeof import("@/lib/chats-genesis/firma-aparato")>();
    return {
        ...real,
        soporteFirma: vi.fn(async () => sim.soporte),
        aparatoLocal: vi.fn(async () => sim.aparato),
        claveAparatoPerdida: vi.fn(async () => sim.perdida),
    };
});
vi.mock("@/lib/chats-genesis/emparejar", async (original) => {
    const real = await original<typeof import("@/lib/chats-genesis/emparejar")>();
    return {
        ...real,
        pedirEmparejar: (...a: unknown[]) => sim.pedir(...a),
        consultarEmparejamiento: (...a: unknown[]) => sim.consultar(...a),
        crearClienteAparatos: () => ({ solicitar: vi.fn(), estado: vi.fn(async () => null) }),
    };
});

import { HiloDireccion } from "../hilo-direccion";
import { HiloPuente } from "../hilo-puente";
import { InfoChat } from "../info-chat";
import { EmparejarAparato } from "../emparejar-aparato";
import { ListaChatsGenesis } from "../lista-chats-genesis";
import { textoEnvio, type EnvioLocal } from "../cabecera-espejo";
import { nombreDeVinculo } from "@/components/agent/chat-neural-sidebar";
import { chatDeFuente } from "@/lib/chats-genesis/canon";
import { DESTINO_DE_FUENTE } from "@/lib/chats-genesis/alias-gen1113";
import type { RegistroEspejo, VinculoChat } from "@/lib/chats-genesis/tipos";

import { APARATO_COMPLETO, APARATO_TEXTO, ETIQUETAS_GEN1113, catalogoDeEjemplo, clienteFalso, haceMin, ponerAncho, respuestaFeed } from "./ayudas";

const ACCESO_DUENO = { miembro: true, dueno: true };

beforeEach(() => {
    sim.aparato = null;
    sim.perdida = null;
    sim.soporte = { ok: true };
    sim.sinSesion = false;
    sim.pedir.mockReset();
    sim.consultar.mockReset();
});
afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
});

describe("nombres reales (§2.3, §2.4)", () => {
    it("con catálogo, ninguna de las tres etiquetas de GEN1113 aparece en la lista, los hilos ni la barra de Chats", async () => {
        ponerAncho(1440);
        const cat = catalogoDeEjemplo();
        const { container } = render(
            <ListaChatsGenesis acceso={ACCESO_DUENO} comprobandoAcceso={false} entidades={[]} vinculos={[]} valor="direccion" onElegir={() => {}} catalogo={cat} />,
        );
        for (const n of ["GENESIS · StarSeed OS", "Hermes StarSeed", "Síntesis StarSeed", "Avisos StarSeed"]) expect(screen.getByText(n)).toBeInTheDocument();
        for (const e of ETIQUETAS_GEN1113) expect(container.textContent).not.toContain(e);
        expect(screen.queryByText(/nombre provisional/)).toBeNull();
        cleanup();

        const { cliente } = clienteFalso();
        for (const puente of ["hermes-avisos", "peticiones", "avisos-directores"] as const) {
            const r = render(<HiloPuente cliente={cliente} puente={puente} esDueno aparato={APARATO_COMPLETO} catalogo={cat} />);
            for (const e of ETIQUETAS_GEN1113) expect(r.container.textContent).not.toContain(e);
            cleanup();
        }
        const vinculo = (p: "hermes-avisos" | "peticiones"): VinculoChat => ({ v: 1, id: `puente:${p}`, fuente: { tipo: "puente", puente: p }, nivel: "metagenesis", en: ["chats", "genesis"], creado: "", actualizado: "" });
        expect(nombreDeVinculo(vinculo("hermes-avisos"), cat)).toEqual({ nombre: "Hermes StarSeed", nota: null, provisional: false });
        expect(nombreDeVinculo({ ...vinculo("peticiones"), titulo: "Mis peticiones" }, cat).nota).toBe("Nombre puesto por ti; el del chat es «Síntesis StarSeed»");
    });

    it("sin catálogo, aparece la marca «nombre provisional» (lista, cabecera y barra de Chats)", async () => {
        ponerAncho(1440);
        render(<ListaChatsGenesis acceso={ACCESO_DUENO} comprobandoAcceso={false} entidades={[]} vinculos={[]} valor="direccion" onElegir={() => {}} catalogo={null} avisoCatalogo="Sin catálogo de la Mac desde las 02:10 (la puerta no responde): los nombres son provisionales." />);
        expect(screen.getAllByText("nombre provisional")).toHaveLength(4);
        expect(screen.getByText(/Sin catálogo de la Mac desde las 02:10/)).toBeInTheDocument();
        cleanup();
        const { cliente } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno aparato={APARATO_COMPLETO} catalogo={null} />);
        expect(screen.getByTestId("nombre-chat")).toHaveTextContent("Hermes y avisos");
        expect(screen.getByTestId("marca-provisional")).toHaveTextContent("nombre provisional: la Mac aún no ha publicado el nombre real");
        // GEN1114INT · un solo esquema: sin catálogo se firma el id provisional y el nombre que se ve (la Mac lo acepta
        // sin registro y, tras descubrir el puente, como alias del mismo chat).
        expect(screen.queryByTestId("sin-chat-firmable")).toBeNull();
        expect(screen.getByRole("textbox")).toBeInTheDocument();
        const v: VinculoChat = { v: 1, id: "puente:hermes-avisos", fuente: { tipo: "puente", puente: "hermes-avisos" }, nivel: "metagenesis", en: ["chats"], creado: "", actualizado: "" };
        expect(nombreDeVinculo(v, null)).toMatchObject({ nombre: "Hermes y avisos", provisional: true });
    });

    it("un nombre de 80 caracteres pasa a dos líneas y la información lo enseña entero", () => {
        ponerAncho(360);
        const cat = catalogoDeEjemplo();
        const largo = "Hermes StarSeed — canal de órdenes y avisos de la dirección completa de producción y más".slice(0, 80);
        expect(largo.length).toBe(80);
        cat.chats[2]!.nombre = largo;
        const { cliente } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno aparato={APARATO_COMPLETO} catalogo={cat} />);
        const h = screen.getByTestId("nombre-chat");
        expect(h).toHaveTextContent(largo);
        expect(h.className).toMatch(/line-clamp-2/);
        expect(h.className).not.toMatch(/truncate|whitespace-nowrap/);
        fireEvent.click(screen.getByRole("button", { name: "Información del chat" }));
        const hoja = screen.getByTestId("hoja");
        expect(hoja).toHaveAttribute("data-completa", "si");
        expect(hoja.className).toMatch(/max-sm:h-\[100dvh\]/);
        expect(within(hoja).getByTestId("info-chat")).toHaveTextContent(largo);
    });
});

describe("Información del chat", () => {
    it("enseña el id de StarSeed, el destino fijo y el nombre distinto en un medio, sin botones muertos", () => {
        const cat = catalogoDeEjemplo();
        render(<InfoChat chat={chatDeFuente(cat, "puente:hermes-avisos")} claveGen1113="puente:hermes-avisos" esDueno />);
        expect(screen.getByTestId("id-chat")).toHaveTextContent("telegram.hermes_starseed_bot");
        expect(screen.getByTestId("destino-fijo")).toHaveTextContent(DESTINO_DE_FUENTE["puente:hermes-avisos"]);
        expect(screen.getByText(/En Telegram se llama «Hermes del grupo»; aquí, «Hermes StarSeed»\. Elegir cuál se queda llega en la fase 2\./)).toBeInTheDocument();
        expect(screen.getByText("hermes_starseed_bot")).toBeInTheDocument();
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        cleanup();
        // Un desarrollador no ve el @usuario del bot (la puerta tampoco se lo da, §2.4).
        render(<InfoChat chat={chatDeFuente(cat, "puente:hermes-avisos")} claveGen1113="puente:hermes-avisos" esDueno={false} />);
        expect(screen.queryByText("hermes_starseed_bot")).toBeNull();
        cleanup();
        render(<InfoChat chat={null} claveGen1113="direccion" esDueno />);
        expect(screen.getByTestId("id-chat")).toHaveTextContent("genesis");
        expect(screen.getByText(/nombre provisional/)).toBeInTheDocument();
    });
});

describe("emparejar (§3.3, §3.8, §3.9)", () => {
    it("sin emparejar no hay cuadro de texto y sí la tarjeta", async () => {
        ponerAncho(360);
        const { cliente, enviar } = clienteFalso({ feeds: { direccion: respuestaFeed([], 10) } });
        render(<HiloDireccion cliente={cliente} esDueno aparato={null} catalogo={catalogoDeEjemplo()} />);
        expect(await screen.findByTestId("tarjeta-sin-emparejar")).toHaveTextContent("Este aparato puede leer, pero aún no escribir. Para escribir, emparéjalo en tu Mac");
        expect(screen.queryByTestId("compositor-genesis")).toBeNull();
        expect(screen.queryByRole("textbox", { name: "Mensaje a la dirección" })).toBeNull();
        expect(screen.getByRole("button", { name: /Emparejar este aparato/ })).toBeInTheDocument();
        expect(enviar).not.toHaveBeenCalled();
    });

    it("el estado pendiente muestra el código en tres grupos, la cuenta y las horas de espera y caducidad", async () => {
        const desde = new Date(Date.now() - 2 * 60_000);
        sim.aparato = { ...APARATO_COMPLETO, estado: "pendiente", nivel: "texto", desde: desde.toISOString() };
        sim.consultar.mockResolvedValue(sim.aparato);
        render(<EmparejarAparato />);
        const tarjeta = await screen.findByTestId("tarjeta-pendiente");
        const codigo = within(tarjeta).getByTestId("codigo-aparato");
        expect(codigo.textContent).toBe("7ETY-DGGK-DY2F");
        expect(codigo.querySelectorAll(".whitespace-nowrap")).toHaveLength(3);
        expect(tarjeta).toHaveTextContent("cuenta 00000000");
        expect(tarjeta).toHaveTextContent("Emparejar aparato");
        const hora = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        expect(screen.getByTestId("espera-emparejar")).toHaveTextContent(`Esperando desde las ${hora(desde)} (caduca a las ${hora(new Date(desde.getTime() + 15 * 60_000))}).`);
    });

    it("pulsar «Emparejar este aparato» pide la solicitud con el nombre y la cuenta de la sesión", async () => {
        sim.pedir.mockImplementation(async (_c: unknown, a: { nombre: string; cuenta: string }) => ({
            ok: true, aparato: { ...APARATO_COMPLETO, estado: "pendiente", nivel: "texto", nombre: a.nombre, desde: new Date().toISOString() }, caduca: new Date(Date.now() + 900_000).toISOString(),
        }));
        const alCambiar = vi.fn();
        render(<EmparejarAparato alCambiar={alCambiar} />);
        fireEvent.change(await screen.findByLabelText("Nombre de este aparato"), { target: { value: "iPhone de Alex" } });
        fireEvent.click(screen.getByRole("button", { name: /Emparejar este aparato/ }));
        await screen.findByTestId("tarjeta-pendiente");
        expect(sim.pedir).toHaveBeenCalledWith(expect.anything(), { nombre: "iPhone de Alex", cuenta: "00000000-0000-4000-8000-000000000001" });
        expect(alCambiar).toHaveBeenCalledWith(expect.objectContaining({ estado: "pendiente" }));
    });

    it("sin sesión, pulsar «Emparejar» enseña el aviso común de sesión con la guía (GUI1021N) y no pide nada a la puerta", async () => {
        sim.sinSesion = true;
        sim.aparato = { ...APARATO_COMPLETO, estado: "sin-emparejar" };
        render(<EmparejarAparato />);
        fireEvent.change(await screen.findByLabelText("Nombre de este aparato"), { target: { value: "iPhone de Alex" } });
        fireEvent.click(screen.getByRole("button", { name: /Emparejar este aparato/ }));
        const aviso = await screen.findByTestId("aviso-sesion");
        expect(aviso).toHaveTextContent("Inicia sesión para emparejar este aparato");
        expect(within(aviso).getByRole("link", { name: /Iniciar sesión/ })).toHaveAttribute("href", "/bienvenida");
        expect(within(aviso).getByRole("button", { name: /Conoce StarSeed/ })).toBeInTheDocument();
        expect(screen.queryByTestId("error-emparejar")).toBeNull();
        expect(sim.pedir).not.toHaveBeenCalled();
    });

    it("una solicitud caducada, un aparato retirado, la clave perdida y un navegador sin soporte lo dicen", async () => {
        sim.aparato = { ...APARATO_COMPLETO, estado: "pendiente", desde: new Date(Date.now() - 20 * 60_000).toISOString() };
        render(<EmparejarAparato />);
        expect(await screen.findByTestId("tarjeta-caducada")).toHaveTextContent(/La solicitud caducó a las \d{2}:\d{2} sin confirmarse en la Mac\. Pide otra\./);
        cleanup();
        sim.aparato = { ...APARATO_COMPLETO, estado: "revocado", desde: haceMin(30) };
        render(<EmparejarAparato />);
        expect(await screen.findByTestId("tarjeta-retirado")).toHaveTextContent(/Este aparato fue retirado en la Mac a las \d{2}:\d{2}\. Para volver a escribir, emparéjalo de nuevo\./);
        cleanup();
        sim.aparato = null;
        sim.perdida = { huella: "x", nombre: "iPhone", estado: "emparejado", vistoPorUltima: haceMin(60 * 30) };
        render(<EmparejarAparato />);
        expect(await screen.findByText(/La clave de este aparato ya no está \(se borraron los datos del sitio; se vio por última vez el \d{2}-\d{2} a las \d{2}:\d{2}\)/)).toBeInTheDocument();
        cleanup();
        sim.soporte = { ok: false, motivo: "sin-indexeddb" };
        render(<EmparejarAparato />);
        expect(await screen.findByText(/Este navegador no puede guardar una clave propia \(¿ventana privada\?\)/)).toBeInTheDocument();
    });
});

describe("lo que se envía y lo que vuelve (§3.4, §3.9)", () => {
    function envio(p: Partial<EnvioLocal>): EnvioLocal {
        return { clave: "k", id: 9, texto: "x", iniciado: Date.now(), estado: "rechazado", entrada: { fuente: "direccion", accion: "decir", texto: "x" }, ...p };
    }

    it("el rechazo «firma-mala» se ve con su texto", () => {
        expect(textoEnvio(envio({ detalle: "firma-mala" }), Date.now(), "mac")).toBe("La Mac lo rechazó: La firma no cuadra: la entrada se cambió por el camino; no se ejecutó nada");
        expect(textoEnvio(envio({ detalle: "nombre-distinto" }), Date.now(), "mac")).toContain("puede que la puerta mostrara uno falso");
        expect(textoEnvio(envio({ detalle: "algo nuevo de la Mac" }), Date.now(), "mac")).toBe("La Mac lo rechazó: algo nuevo de la Mac");
    });

    it("un registro del feed con <img onerror> se pinta como texto, no como HTML", async () => {
        ponerAncho(1440);
        const malo = "<img src=x onerror=alert(1)>";
        const reg = (fuente: string): RegistroEspejo => ({ id: `md-1763000000999-ab${fuente.length}c`, t: haceMin(1), de: "hermes", rol: "director", tipo: "mensaje", texto: malo, canal: "mando", fuente } as RegistroEspejo);
        const { cliente } = clienteFalso({ feeds: { direccion: respuestaFeed([reg("direccion")], 5), "puente:hermes-avisos": respuestaFeed([reg("puente:hermes-avisos")], 5) } });
        const a = render(<HiloDireccion cliente={cliente} esDueno aparato={APARATO_COMPLETO} catalogo={catalogoDeEjemplo()} />);
        expect(await screen.findByText(malo)).toBeInTheDocument();
        expect(a.container.querySelector("img")).toBeNull();
        cleanup();
        const b = render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno aparato={APARATO_COMPLETO} catalogo={catalogoDeEjemplo()} />);
        expect(await screen.findByText(malo)).toBeInTheDocument();
        expect(b.container.querySelector("img")).toBeNull();
    });

    it("con un aparato «texto», el puente A no ofrece escribir a Hermes ni órdenes que cambian, y sí /estado", async () => {
        ponerAncho(360);
        const { cliente, enviar } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno aparato={APARATO_TEXTO} catalogo={catalogoDeEjemplo()} />);
        const comp = screen.getByTestId("compositor-puente");
        expect(comp).toHaveAttribute("data-nivel", "texto");
        expect(within(comp).queryByRole("textbox")).toBeNull();
        expect(screen.getByTestId("aviso-nivel")).toHaveTextContent("Para hablar con Hermes, aprobar tareas o pedir trabajo, emparéjalo como completo en la Mac");
        const ofrecidas = within(comp).getAllByRole("button").map((b) => b.textContent?.trim());
        expect(ofrecidas).toContain("/estado");
        for (const n of ["/aprobar", "/rechazar", "/soltar", "/reasignar", "/decir", "/a"]) expect(ofrecidas).not.toContain(n);
        fireEvent.click(within(comp).getByRole("button", { name: "/estado" }));
        await waitFor(() => expect(enviar).toHaveBeenCalledWith(
            { fuente: "puente:hermes-avisos", accion: "orden", orden: { nombre: "estado", args: [] } },
            { id: "telegram.hermes_starseed_bot", nombre: "Hermes StarSeed" },
        ));
        cleanup();
        // En la dirección, un aparato «texto» escribe solo al hilo: sin selector de motores.
        const d = clienteFalso({ feeds: { direccion: respuestaFeed([], 5) } });
        render(<HiloDireccion cliente={d.cliente} esDueno aparato={APARATO_TEXTO} catalogo={catalogoDeEjemplo()} />);
        expect(screen.queryByTestId("selector-motor")).toBeNull();
        expect(screen.getByTestId("aviso-nivel")).toHaveTextContent("Desde este aparato solo escribes al hilo");
    });

    it("antes de enviar algo «alto» se ve «Va a …» de DESTINO_DE_FUENTE, aunque el catálogo diga otro nombre", async () => {
        ponerAncho(1440);
        const cat = catalogoDeEjemplo();
        cat.chats[2]!.nombre = "Avisos del huerto"; // un catálogo que pone un nombre engañoso al puente de Hermes
        const { cliente } = clienteFalso();
        render(<HiloPuente cliente={cliente} puente="hermes-avisos" esDueno aparato={APARATO_COMPLETO} catalogo={cat} />);
        const area = screen.getByRole("textbox", { name: "Mensaje u orden para el puente" });
        fireEvent.change(area, { target: { value: "/estado" } });
        expect(screen.queryByTestId("linea-va-a")).toBeNull(); // /estado es «bajo»: no despierta a nadie
        fireEvent.change(area, { target: { value: "revisa la cola, por favor" } });
        expect(screen.getByTestId("linea-va-a")).toHaveTextContent(`Va a ${DESTINO_DE_FUENTE["puente:hermes-avisos"]} · chat «Avisos del huerto»`);
        expect(screen.getByTestId("linea-va-a")).toHaveTextContent("Hermes, que puede usar herramientas en tu Mac");
    });

    it("`enviar` recibe {id, nombre} del chat que muestra la cabecera (el mismo texto que se ve)", async () => {
        ponerAncho(1440);
        const { cliente, enviar } = clienteFalso({ feeds: { direccion: respuestaFeed([], 5) } });
        render(<HiloDireccion cliente={cliente} esDueno aparato={APARATO_COMPLETO} catalogo={catalogoDeEjemplo()} />);
        const visto = screen.getByTestId("nombre-chat").textContent;
        expect(visto).toBe("GENESIS · StarSeed OS");
        // Al hilo, sin motor: el chat de la cabecera.
        fireEvent.change(screen.getByTestId("selector-motor"), { target: { value: "" } });
        const area = screen.getByRole("textbox", { name: "Mensaje a la dirección" });
        fireEvent.change(area, { target: { value: "Prueba GEN1114 firmada" } });
        expect(screen.queryByTestId("linea-va-a")).toBeNull();
        fireEvent.keyDown(area, { key: "Enter" });
        await waitFor(() => expect(enviar).toHaveBeenCalledTimes(1));
        expect(enviar.mock.calls[0]![1]).toEqual({ id: "genesis", nombre: visto });
        // Con el Director presidente: «Va a …» con el chat de su canal, y ese es el que se firma.
        fireEvent.change(screen.getByTestId("selector-motor"), { target: { value: MODELO_PRESIDENTE } });
        expect(screen.getByTestId("linea-va-a")).toHaveTextContent(`Va a ${DESTINO_DE_FUENTE.direccion} · chat «Director presidente»`);
        fireEvent.change(area, { target: { value: "¿Cómo va la ola?" } });
        fireEvent.keyDown(area, { key: "Enter" });
        await waitFor(() => expect(enviar).toHaveBeenCalledTimes(2));
        expect(enviar.mock.calls[1]![1]).toEqual({ id: "genesis.canal.director-presidente", nombre: "Director presidente" });
    });

    it("GEN1114INT · `enviar` se llama DENTRO del toque (sin esperas antes: `userActivation` sigue viva) y con el nombre que se ve", () => {
        // La biblioteca (E) se niega a firmar sin un gesto reciente de la persona; Safari solo lo da ~1 s. Si un
        // componente esperara algo antes de llamar a `enviar`, este `expect` síncrono fallaría.
        ponerAncho(1440);
        const d = clienteFalso({ feeds: { direccion: respuestaFeed([], 5) } });
        render(<HiloDireccion cliente={d.cliente} esDueno aparato={APARATO_COMPLETO} catalogo={catalogoDeEjemplo()} />);
        const area = screen.getByRole("textbox", { name: "Mensaje a la dirección" });
        fireEvent.change(area, { target: { value: "en el mismo toque" } });
        fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
        expect(d.enviar).toHaveBeenCalledTimes(1);
        cleanup();
        // Puente sin catálogo (un solo esquema): se firma el id provisional y la etiqueta que enseña la cabecera.
        const p = clienteFalso();
        render(<HiloPuente cliente={p.cliente} puente="hermes-avisos" esDueno aparato={APARATO_COMPLETO} catalogo={null} />);
        const visto = screen.getByTestId("nombre-chat").textContent;
        const caja = screen.getByRole("textbox", { name: "Mensaje u orden para el puente" });
        fireEvent.change(caja, { target: { value: "Hermes, hola" } });
        fireEvent.keyDown(caja, { key: "Enter" });
        expect(p.enviar).toHaveBeenCalledTimes(1);
        expect(p.enviar.mock.calls[0]![1]).toEqual({ id: "telegram.hermes-avisos", nombre: visto });
        expect(visto).toBe("Hermes y avisos");
        cleanup();
        // Aparato «texto»: la orden de lectura también sale en el mismo toque.
        const t = clienteFalso();
        render(<HiloPuente cliente={t.cliente} puente="hermes-avisos" esDueno aparato={APARATO_TEXTO} catalogo={catalogoDeEjemplo()} />);
        fireEvent.click(within(screen.getByTestId("compositor-puente")).getByRole("button", { name: "/estado" }));
        expect(t.enviar).toHaveBeenCalledTimes(1);
    });

    it("lo enviado firmado lleva «firmado · <código>»", async () => {
        ponerAncho(1440);
        const { cliente } = clienteFalso({ feeds: { direccion: respuestaFeed([], 5) } });
        render(<HiloDireccion cliente={cliente} esDueno={false} aparato={APARATO_COMPLETO} catalogo={catalogoDeEjemplo()} />);
        const area = screen.getByRole("textbox", { name: "Mensaje a la dirección" });
        fireEvent.change(area, { target: { value: "Nota" } });
        await act(async () => { fireEvent.keyDown(area, { key: "Enter" }); });
        expect(await screen.findByTestId("marca-firmado")).toHaveTextContent("firmado · 7ETY");
    });
});

describe("GEN1114INT · aviso del reloj del aparato (§3.6, hallazgo 16)", () => {
    it("la frase sale solo con 2 min o más, y dice si va adelantado o atrasado", async () => {
        const { textoDesfaseReloj } = await import("../cabecera-espejo");
        expect(textoDesfaseReloj(null)).toBeNull();
        expect(textoDesfaseReloj(60_000)).toBeNull();
        expect(textoDesfaseReloj(Number.NaN)).toBeNull();
        expect(textoDesfaseReloj(3 * 60_000)).toMatch(/va 3 min adelantada/);
        expect(textoDesfaseReloj(-8 * 60_000)).toMatch(/va 8 min atrasada/);
    });

    it("el compositor de la dirección lo enseña cuando la puerta dio una hora muy distinta", async () => {
        const { AvisoReloj } = await import("../cabecera-espejo");
        const { rerender } = render(<AvisoReloj desfaseMs={30_000} />);
        expect(screen.queryByTestId("aviso-reloj")).toBeNull();
        rerender(<AvisoReloj desfaseMs={5 * 60_000} />);
        expect(screen.getByTestId("aviso-reloj")).toHaveTextContent("La hora de este aparato va 5 min adelantada respecto a la puerta");
    });
});

describe("guardia de nombre", () => {
    it("ningún nombre viejo del producto en el texto ni los comentarios de los archivos de GEN1114F", () => {
        const raiz = path.join(__dirname, "..", "..", "..");
        const archivos = [
            ...readdirSync(path.join(raiz, "components", "chats-genesis")).filter((f) => /\.(tsx?|ts)$/.test(f)).map((f) => path.join(raiz, "components", "chats-genesis", f)),
            path.join(raiz, "components", "messaging", "conexion-telegram.tsx"),
            path.join(raiz, "components", "messaging", "conexiones-genesis.tsx"),
            path.join(raiz, "components", "messaging", "chat-connections-panel.tsx"),
            path.join(raiz, "components", "agent", "chat-neural-sidebar.tsx"),
        ].filter((f) => statSync(f).isFile());
        const viejo = new RegExp("\\b" + "Man" + "do\\b");
        for (const f of archivos) expect(readFileSync(f, "utf8"), f).not.toMatch(viejo);
    });
});
