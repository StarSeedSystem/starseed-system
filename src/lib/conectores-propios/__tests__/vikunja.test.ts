import { describe, it, expect } from "vitest";
import { clienteVikunja, tituloProyecto, type Pedir } from "../vikunja";

type Llamada = { url: string; init?: RequestInit };

function crearPedir(manejar: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    const llamadas: Llamada[] = [];
    const pedir: Pedir = async (url, init) => {
        llamadas.push({ url, init });
        return manejar(url, init);
    };
    return { pedir, llamadas };
}

const json = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

const base = "http://vikunja.local/api/v1/";
const entidad = { tipo: "grupo" as const, id: "g-42", nombre: "Huerto" };

describe("cliente puro de Vikunja", () => {
    it("un proyecto por entidad: lo crea una vez y después lo reutiliza", async () => {
        const proyectos: { id: number; title: string }[] = [];
        const { pedir, llamadas } = crearPedir((url, init) => {
            if ((init?.method ?? "GET") === "GET") return json(proyectos);
            if (url.endsWith("/projects") && init?.method === "PUT") {
                const cuerpo = JSON.parse(String(init.body)) as { title: string };
                const proyecto = { id: 7, title: cuerpo.title };
                proyectos.push(proyecto);
                return json(proyecto, 201);
            }
            return json({}, 404);
        });
        const vikunja = clienteVikunja(pedir);

        const primera = await vikunja.asegurarProyecto(base, "tok", entidad);
        const segunda = await vikunja.asegurarProyecto(base, "tok", entidad);

        expect(primera).toEqual({ ok: true, id: 7, titulo: "grupo · Huerto · g-42", creado: true });
        expect(segunda).toEqual({ ok: true, id: 7, titulo: "grupo · Huerto · g-42", creado: false });
        expect(llamadas.filter((l) => l.init?.method === "PUT")).toHaveLength(1);
    });

    it("el título canónico lleva tipo, nombre e id", () => {
        expect(tituloProyecto({ tipo: "comunidad", id: "c-9", nombre: " Semilla " }))
            .toBe("comunidad · Semilla · c-9");
    });

    it("un 401 explica que el token no vale, sin lanzar", async () => {
        const { pedir } = crearPedir(() => json({ message: "no autorizado" }, 401));
        const resultado = await clienteVikunja(pedir).asegurarProyecto(base, "token-que-no-vale", entidad);

        expect(resultado.ok).toBe(false);
        if (!resultado.ok) {
            expect(resultado.estado).toBe(401);
            expect(resultado.motivo).toContain("401");
            expect(resultado.motivo).toContain("token");
        }
    });

    it("crea la tarea de una propuesta ya aprobada y enlaza la propuesta", async () => {
        const { pedir, llamadas } = crearPedir((url) =>
            url.endsWith("/projects/9/tasks") ? json({ id: 55 }, 201) : json({}, 404),
        );
        const decision = {
            propuestaId: "p-77",
            titulo: "Plantar el huerto",
            aprobadaEn: "2026-10-20T10:00:00Z",
            sector: "alimentación",
        };

        const resultado = await clienteVikunja(pedir).tareaDesdeDecision(base, "tok", 9, decision);

        expect(resultado).toEqual({ ok: true, id: 55, proyectoId: 9 });
        const llamada = llamadas[0];
        expect(llamada.init?.method).toBe("PUT");
        expect(llamada.url).toBe("http://vikunja.local/api/v1/projects/9/tasks");
        const cuerpo = JSON.parse(String(llamada.init?.body)) as { title: string; description: string };
        expect(cuerpo.title).toBe("Plantar el huerto");
        expect(cuerpo.description).toContain("p-77");
        expect(cuerpo.description).toContain("2026-10-20T10:00:00Z");
        expect(cuerpo.description).toContain("alimentación");
    });

    it("un fallo de red se devuelve como motivo legible", async () => {
        const vikunja = clienteVikunja(async () => {
            throw new Error("sin red");
        });
        const resultado = await vikunja.asegurarProyecto(base, "tok", entidad);

        expect(resultado.ok).toBe(false);
        if (!resultado.ok) expect(resultado.motivo).toContain("No se pudo contactar con Vikunja");
    });
});
