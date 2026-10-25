/**
 * «Imaginación» en el pulso (Ola 1024I · IMG1024B): la lista con su formato libre seguro, los filtros y las
 * pestañas, el formulario de reimaginar con su validación, el lote con resultados mixtos (lo fallido sigue
 * seleccionado) y el automático. Todo contra un `/api/mando/imaginacion` simulado: sin red.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PanelImaginacion, leerReferencias, extracto } from "@/components/mando/panel-imaginacion";
import { AJUSTES_POR_DEFECTO, type AjustesAutodesarrollo, type PropuestaNormalizada } from "@/lib/mando/imaginacion-tipos";

const HOY = new Date().toISOString();
const prop = (o: Partial<PropuestaNormalizada>): PropuestaNormalizada => ({
    id: "p", fuente: "agentes", titulo: "Propuesta", cuerpo: "", archivos: [], utilidad: 0.7, importancia: "media",
    estado: "esperando-aprobacion", motivo: "", t: HOY, tipo: "codigo", ambito: "metagenesis", referencias: [], version: 1, ...o,
});
type Cuerpo = Record<string, unknown>;
type Respuesta = { status?: number; json: unknown };

/** Un servidor de mentira: GET devuelve el estado actual; POST pasa por `manejar` (que puede cambiarlo). */
function servidor(inicial: PropuestaNormalizada[], manejar: (c: Cuerpo, estado: { propuestas: PropuestaNormalizada[]; ajustes: AjustesAutodesarrollo }) => Respuesta) {
    const estado = { propuestas: structuredClone(inicial), ajustes: structuredClone(AJUSTES_POR_DEFECTO) };
    const posts: Cuerpo[] = [];
    const gets: string[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
            if (init?.method === "POST") {
                const c = JSON.parse(String(init.body)) as Cuerpo;
                posts.push(c);
                const r = manejar(c, estado);
                return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } });
            }
            gets.push(url);
            return new Response(JSON.stringify({ propuestas: estado.propuestas, ajustes: estado.ajustes, resumen: {} }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }),
    );
    return { posts, gets, estado };
}
const sinPost = () => ({ status: 500, json: { error: "no esperado" } });

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

describe("utilidades puras", () => {
    it("leerReferencias: una URL https por línea con título opcional; lo demás se dice por línea", () => {
        expect(leerReferencias("Paleta Trinity — https://ejemplo.org/paleta\nhttps://dribbble.com/x | Dribbble\n\n")).toEqual({
            referencias: [
                { titulo: "Paleta Trinity", url: "https://ejemplo.org/paleta" },
                { titulo: "Dribbble", url: "https://dribbble.com/x" },
            ],
            errores: [],
        });
        const malo = leerReferencias("http://inseguro.org\nsin dirección\nhttps://usuario:clave@x.org/");
        expect(malo.referencias).toEqual([]);
        expect(malo.errores).toEqual([
            "Línea 1: solo valen direcciones https://.",
            "Línea 2: falta la dirección (https://…).",
            "Línea 3: la dirección no es válida.",
        ]);
        expect(leerReferencias("https://solo.org").referencias).toEqual([{ titulo: "solo.org", url: "https://solo.org/" }]);
    });
    it("extracto quita la sintaxis de Markdown", () => {
        expect(extracto("## Título\n\n- uno **dos** [tres](https://x.org)")).toBe("Título uno dos tres");
        expect(extracto("x".repeat(300), 10)).toBe(`${"x".repeat(9)}…`);
    });
});

describe("PanelImaginacion", () => {
    it("lista lo por decidir con sus datos, el cuerpo libre sin HTML crudo y enlaces seguros; «versión de…» lleva a la anterior", async () => {
        const encolada = new Date();
        encolada.setHours(9, 5, 0, 0);
        servidor(
            [
                prop({
                    id: "agentes:ref-v2", titulo: "Paleta nueva", agente: "referencias-diseno", tipo: "diseno", importancia: "crítica",
                    version: 2, version_de: "agentes:ref-v1", archivos: ["src/app/globals.css"],
                    referencias: [{ titulo: "Dribbble", url: "https://dribbble.com/shots/1" }],
                    cuerpo: "## Contraste\n\nUsa **cian** <script>alert(1)</script> y [la guía](https://ejemplo.org/guia) pero no [esto](javascript:alert(1)).",
                }),
                prop({
                    id: "agentes:ref-v1", titulo: "Paleta primera", estado: "reimaginada", tipo: "diseno",
                    reimaginacion: { notas: "más contraste", referencias: [], pedida: HOY, por: "alex", encolada: encolada.toISOString(), tarea: "RIM-ref-v2", version_nueva: "agentes:ref-v2" },
                }),
                prop({ id: "hecha", titulo: "Ya hecha", estado: "hecha", fuente: "diaria" }),
            ],
            sinPost,
        );
        render(<PanelImaginacion ambito="metagenesis" />);
        const tarjeta = await screen.findByTestId("propuesta-agentes:ref-v2");
        expect(screen.queryByTestId("propuesta-hecha")).toBeNull(); // «Por decidir» por defecto
        expect(tarjeta).toHaveTextContent("Agentes imaginativos · referencias-diseno");
        for (const t of ["Esperando tu aprobación", "importancia crítica", "Diseño", "MetaGenesis", "versión 2", "utilidad 0,70", "src/app/globals.css"]) {
            expect(tarjeta).toHaveTextContent(t);
        }
        expect(screen.getByTestId("imaginacion-regla-fija")).toHaveTextContent("Lo de importancia alta o crítica siempre espera tu visto bueno.");
        const ref = within(tarjeta).getByRole("link", { name: /Dribbble/ });
        expect(ref).toHaveAttribute("href", "https://dribbble.com/shots/1");
        expect(ref).toHaveAttribute("rel", "noopener noreferrer");
        expect(ref).toHaveAttribute("target", "_blank");

        fireEvent.click(within(tarjeta).getByRole("button", { name: "Leer la propuesta completa" }));
        const cuerpo = within(tarjeta).getByTestId("cuerpo-libre");
        expect(within(cuerpo).getByText("Contraste").tagName).toBe("H5");
        expect(cuerpo.querySelector("script")).toBeNull();
        expect(cuerpo.innerHTML).not.toContain("<script");
        expect(within(cuerpo).getByRole("link", { name: "la guía" })).toHaveAttribute("rel", "noopener noreferrer");
        expect(within(cuerpo).queryByRole("link", { name: "esto" })).toBeNull();
        expect(within(cuerpo).getByText("esto").tagName).toBe("SPAN");

        fireEvent.click(within(tarjeta).getByRole("button", { name: "«Paleta primera»" }));
        await waitFor(() => expect(screen.getByRole("tab", { name: /Todas/ })).toHaveAttribute("aria-selected", "true"));
        const vieja = screen.getByTestId("propuesta-agentes:ref-v1");
        expect(vieja).toHaveTextContent("Reimaginada");
        expect(vieja).toHaveTextContent("encargada a la flota a las 09:05 (tarea RIM-ref-v2)");
        expect(vieja).toHaveTextContent("Notas: «más contraste»");
        // Lo que ya no se decide no tiene botones de decisión, solo «Ver origen».
        expect(within(vieja).queryByRole("button", { name: "Integrar" })).toBeNull();
        fireEvent.click(within(vieja).getByRole("button", { name: "Ver origen" }));
        expect(within(vieja).getByTestId("imaginacion-agentes_ref-v1-origen")).toHaveTextContent("Tarea:RIM-ref-v2");
    });

    it("filtra por tipo y por fuente, y las pestañas cuentan lo filtrado", async () => {
        servidor(
            [
                prop({ id: "d1", tipo: "diseno", fuente: "agentes" }),
                prop({ id: "d2", tipo: "diseno", fuente: "diaria", estado: "nueva" }),
                prop({ id: "c1", tipo: "codigo", fuente: "profunda" }),
                prop({ id: "i1", tipo: "investigacion", fuente: "agentes", estado: "encargada", tarea: "T1" }),
                prop({ id: "r1", tipo: "codigo", fuente: "directores", estado: "rechazada" }),
                prop({ id: "x1", tipo: "codigo", fuente: "astraura", estado: "reimaginando" }),
            ],
            sinPost,
        );
        render(<PanelImaginacion ambito="metagenesis" />);
        await screen.findByTestId("propuesta-d1");
        expect(screen.getByRole("tab", { name: /Por decidir/ })).toHaveTextContent("(3)");
        expect(screen.getByRole("tab", { name: /Integradas/ })).toHaveTextContent("(1)");
        expect(screen.getByRole("tab", { name: /Rechazadas y pospuestas/ })).toHaveTextContent("(1)");
        expect(screen.getByRole("tab", { name: /Reimaginando/ })).toHaveTextContent("(1)");

        fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "diseno" } });
        expect(screen.getByTestId("propuesta-d1")).toBeInTheDocument();
        expect(screen.getByTestId("propuesta-d2")).toBeInTheDocument();
        expect(screen.queryByTestId("propuesta-c1")).toBeNull();
        expect(screen.getByRole("tab", { name: /Por decidir/ })).toHaveTextContent("(2)");

        fireEvent.change(screen.getByLabelText("Fuente"), { target: { value: "agentes" } });
        expect(screen.getByTestId("propuesta-d1")).toBeInTheDocument();
        expect(screen.queryByTestId("propuesta-d2")).toBeNull();

        fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "todos" } });
        fireEvent.click(screen.getByRole("tab", { name: /Integradas/ }));
        expect(screen.getByTestId("propuesta-i1")).toHaveTextContent("Encargada a la flota: tarea T1.");
        expect(screen.queryByTestId("propuesta-d1")).toBeNull();
        // Flechas del teclado entre pestañas.
        fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
        expect(screen.getByRole("tab", { name: /Rechazadas y pospuestas/ })).toHaveAttribute("aria-selected", "true");
    });

    it("reimaginar valida notas y referencias antes de enviar, y dice lo que contestó el servidor", async () => {
        const alCambio = vi.fn();
        const { posts } = servidor([prop({ id: "a", titulo: "Cabecera" }), prop({ id: "b", titulo: "Otra" })], (c, estado) => {
            if (c.id === "b") return { status: 409, json: { ok: false, error: "Esa propuesta está «hecha»: no espera tu decisión." } };
            const p = estado.propuestas.find((x) => x.id === c.id)!;
            p.estado = "reimaginando";
            return { json: { ok: true, propuesta: p } };
        });
        render(<PanelImaginacion ambito="metagenesis" alCambio={alCambio} />);
        const tarjeta = await screen.findByTestId("propuesta-a");
        fireEvent.click(within(tarjeta).getByRole("button", { name: "Reimaginar" }));
        const formulario = within(tarjeta).getByTestId("imaginacion-a-reimaginar-formulario");
        const pedir = within(formulario).getByRole("button", { name: "Pedir otra versión" });

        fireEvent.click(pedir);
        expect(await within(formulario).findByRole("alert")).toHaveTextContent("di qué cambiar");
        const refs = within(formulario).getByLabelText("Referencias (una URL https por línea, con título opcional)");
        fireEvent.change(refs, { target: { value: "http://inseguro.org" } });
        fireEvent.click(pedir);
        expect(within(formulario).getByRole("alert")).toHaveTextContent("Línea 1: solo valen direcciones https://.");
        expect(posts).toHaveLength(0);

        fireEvent.change(within(formulario).getByLabelText("Qué cambiar"), { target: { value: "  más contraste  " } });
        fireEvent.change(refs, { target: { value: "Paleta Trinity — https://ejemplo.org/paleta" } });
        fireEvent.click(pedir);
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toEqual({
            accion: "reimaginar", id: "a", notas: "más contraste",
            referencias: [{ titulo: "Paleta Trinity", url: "https://ejemplo.org/paleta" }],
        });
        expect(await screen.findByText(/«Cabecera»: pedida otra versión/)).toBeInTheDocument();
        expect(alCambio).toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByTestId("propuesta-a")).toBeNull()); // ya no espera decisión

        // Un error del servidor se ve en su tarjeta y no cambia nada.
        const otra = screen.getByTestId("propuesta-b");
        fireEvent.click(within(otra).getByRole("button", { name: "Integrar" }));
        expect(await within(otra).findByRole("alert")).toHaveTextContent("Esa propuesta está «hecha»: no espera tu decisión.");
        expect(posts[1]).toEqual({ accion: "integrar", id: "b" });
    });

    it("lote con resultados mixtos: dice cuál falló y por qué, y lo fallido sigue seleccionado", async () => {
        const { posts } = servidor(
            [prop({ id: "a", titulo: "Uno" }), prop({ id: "b", titulo: "Dos", fuente: "astraura" }), prop({ id: "c", titulo: "Tres" })],
            (c, estado) => {
                if (c.accion !== "lote") return sinPost();
                if (c.ids === "pendientes") {
                    for (const p of estado.propuestas) p.estado = "rechazada";
                    return { json: { ok: true, resultados: estado.propuestas.map((p) => ({ id: p.id, ok: true })) } };
                }
                estado.propuestas.find((p) => p.id === "a")!.estado = "aprobada";
                return { json: { ok: false, resultados: [{ id: "a", ok: true }, { id: "b", ok: false, error: "El backend 1.58 no responde: no se aplicó y nada cambió." }] } };
            },
        );
        render(<PanelImaginacion ambito="metagenesis" />);
        await screen.findByTestId("propuesta-a");
        fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar «Uno»" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar «Dos»" }));
        expect(screen.getByTestId("imaginacion-lote")).toHaveTextContent("Seleccionadas (2)");

        fireEvent.click(screen.getByRole("button", { name: "Integrar seleccionadas" }));
        const resultado = await screen.findByTestId("imaginacion-resultado-lote");
        expect(posts[0]).toEqual({ accion: "lote", ids: ["a", "b"], hacer: "integrar", ambito: "metagenesis" });
        expect(resultado).toHaveTextContent("1 integradas");
        expect(resultado).toHaveTextContent("1 fallaron (siguen seleccionadas para reintentarlas)");
        expect(resultado).toHaveTextContent("«Dos» (b): El backend 1.58 no responde: no se aplicó y nada cambió.");
        await waitFor(() => expect(screen.queryByTestId("propuesta-a")).toBeNull());
        expect(screen.getByRole("checkbox", { name: "Seleccionar «Dos»" })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Seleccionar «Tres»" })).not.toBeChecked();
        expect(screen.getByTestId("imaginacion-lote")).toHaveTextContent("Seleccionadas (1)");

        // «Todas» pide confirmación y, sin filtros, manda «pendientes» del ámbito.
        fireEvent.click(screen.getByRole("button", { name: "Rechazar todas" }));
        const confirmar = screen.getByTestId("imaginacion-lote-confirmar");
        expect(confirmar).toHaveTextContent("¿Rechazar las 2 por decidir de MetaGenesis? No se deshace desde aquí.");
        expect(posts).toHaveLength(1);
        fireEvent.change(within(confirmar).getByLabelText("Motivo (opcional)"), { target: { value: " no encaja " } });
        fireEvent.click(within(confirmar).getByRole("button", { name: "Sí, rechazar las 2" }));
        await waitFor(() => expect(posts).toHaveLength(2));
        expect(posts[1]).toEqual({ accion: "lote", ids: "pendientes", hacer: "rechazar", ambito: "metagenesis", motivo: "no encaja" });
        expect(await screen.findByText(/Nada espera tu decisión aquí/)).toBeInTheDocument();
    });

    it("con un filtro puesto, «todas» son solo las que se ven; reimaginar en lote pide el mismo formulario", async () => {
        const { posts } = servidor(
            [prop({ id: "d1", tipo: "diseno" }), prop({ id: "d2", tipo: "diseno", estado: "nueva" }), prop({ id: "c1", tipo: "codigo" })],
            () => ({ json: { ok: true, resultados: [{ id: "d1", ok: true }, { id: "d2", ok: true }] } }),
        );
        render(<PanelImaginacion ambito="grupo:g1" />);
        await screen.findByTestId("propuesta-c1");
        fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "diseno" } });
        fireEvent.click(screen.getByRole("button", { name: "Reimaginar todas" }));
        const formulario = screen.getByTestId("imaginacion-lote-reimaginar-formulario");
        expect(formulario).toHaveTextContent("¿Reimaginar las 2 por decidir que se ven con este filtro?");
        fireEvent.change(within(formulario).getByLabelText("Qué cambiar"), { target: { value: "más aire" } });
        fireEvent.click(within(formulario).getByRole("button", { name: "Sí, reimaginar las 2" }));
        await waitFor(() => expect(posts).toHaveLength(1));
        expect(posts[0]).toEqual({ accion: "lote", ids: ["d1", "d2"], hacer: "reimaginar", ambito: "grupo:g1", notas: "más aire", referencias: [] });
    });

    it("el automático guarda cada interruptor al momento y el umbral y el tope con «Guardar»; un fallo se dice", async () => {
        let falla = false;
        const { posts, gets } = servidor([prop({ id: "a" })], (c, estado) => {
            if (falla) return { status: 500, json: { error: "No se pudo guardar el cambio." } };
            const auto = (c.ajustes as { auto: Partial<AjustesAutodesarrollo["auto"]> }).auto;
            estado.ajustes = { ...estado.ajustes, auto: { ...estado.ajustes.auto, ...auto } };
            return { json: { ok: true, ajustes: estado.ajustes } };
        });
        render(<PanelImaginacion ambito="personal" />);
        const aprobar = await screen.findByRole("switch", { name: "Aprobación automática" });
        expect(gets[0]).toBe("/api/mando/imaginacion?ambito=personal");
        expect(aprobar).toHaveAttribute("aria-checked", "false");

        fireEvent.click(aprobar);
        await waitFor(() => expect(aprobar).toHaveAttribute("aria-checked", "true"));
        expect(posts[0]).toEqual({ accion: "ajustes", ajustes: { auto: { aprobar: true } } });
        expect(screen.getByTestId("imaginacion-automatico")).toHaveTextContent("Aprobación automática: encendida.");

        const guardar = screen.getByRole("button", { name: "Guardar umbral y tope" });
        expect(guardar).toBeDisabled();
        fireEvent.change(screen.getByRole("slider", { name: /Umbral de utilidad/ }), { target: { value: "0.9" } });
        fireEvent.change(screen.getByLabelText("Tope de reimaginaciones"), { target: { value: "4" } });
        fireEvent.click(guardar);
        await waitFor(() => expect(posts).toHaveLength(2));
        expect(posts[1]).toEqual({ accion: "ajustes", ajustes: { auto: { umbral: 0.9, max_reimaginaciones: 4 } } });
        expect(await screen.findByText("Guardado: umbral 0,90 y tope de 4 reimaginación(es).")).toBeInTheDocument();

        falla = true;
        const reimaginar = screen.getByRole("switch", { name: "Reimaginación automática" });
        fireEvent.click(reimaginar);
        expect(await screen.findByText("No se pudo guardar el cambio.")).toBeInTheDocument();
        expect(reimaginar).toHaveAttribute("aria-checked", "false");
        // El tope fuera de rango no se puede guardar.
        fireEvent.change(screen.getByLabelText("Tope de reimaginaciones"), { target: { value: "40" } });
        expect(screen.getByRole("alert")).toHaveTextContent("El tope va de 0 a 10.");
        expect(screen.getByRole("button", { name: "Guardar umbral y tope" })).toBeDisabled();
    });

    it("si la lectura falla lo dice; un ámbito sin propuestas lo dice con su nombre y enlaza los demás", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "No se pudieron leer las propuestas." }), { status: 500 })));
        render(<PanelImaginacion ambito="metagenesis" />);
        expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron leer las propuestas.");
        cleanup();
        vi.unstubAllGlobals();

        servidor([], sinPost);
        render(<PanelImaginacion ambito="pagina:p1" otrosAmbitos={[{ ambito: "metagenesis", decidibles: 3 }]} />);
        expect(await screen.findByText("Sin propuestas de la imaginación en página p1.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "MetaGenesis (3)" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Volver al pulso de MetaGenesis" })).toBeInTheDocument();
    });
});
