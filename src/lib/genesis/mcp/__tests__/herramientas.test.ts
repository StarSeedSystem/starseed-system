import { describe, expect, it, vi } from "vitest";
import { CAPACIDADES_AMBITO } from "@/lib/mando/ambito";
import type { Ambito } from "@/lib/genesis/operaciones";
import { DEFINICIONES_HERRAMIENTAS, crearHerramientasGenesis, type HerramientaGenesis, type ManejadoresGenesis, type NombreHerramienta, type ResultadoHerramienta } from "../herramientas";
const PERSONA: Ambito = { tipo: "persona" };

function montar() {
    const manejadores: ManejadoresGenesis = {
        ambito: PERSONA,
        estado: vi.fn(async () => ({ vivo: true, colas: 2 })),
        tareasListar: vi.fn(async () => [{ id: "t1" }]),
        tareasCrear: vi.fn(async () => ({ id: "t2" })),
        agentesListar: vi.fn(async () => []),
        medidores: vi.fn(async () => ({ bloqueadas: 0 })),
        proponer: vi.fn(async () => ({ guardadas: 1 })),
        bibliotecaBuscar: vi.fn(async () => []),
        opcionesSugerir: vi.fn(async () => []),
        chat: vi.fn(async () => ({ respuesta: "hola" })),
    };
    return { manejadores, herramientas: crearHerramientasGenesis(manejadores) };
}
const herramienta = (lista: HerramientaGenesis[], nombre: NombreHerramienta): HerramientaGenesis => {
    const h = lista.find((x) => x.nombre === nombre);
    if (!h) throw new Error(`Falta la herramienta ${nombre}`);
    return h;
};
const datos = (r: ResultadoHerramienta): unknown => JSON.parse(r.contenido[0]!.texto) as unknown;

describe("definiciones MCP de Genesis", () => {
    it("declara las nueve herramientas con un esquema JSON válido", () => {
        expect(DEFINICIONES_HERRAMIENTAS.map((d) => d.nombre)).toEqual([
            "estado", "tareas_listar", "tareas_crear", "agentes_listar", "medidores",
            "proponer", "biblioteca_buscar", "opciones_sugerir", "chat",
        ]);
        for (const d of DEFINICIONES_HERRAMIENTAS) {
            expect(d.descripcion.length).toBeGreaterThan(10);
            expect(d.inputSchema.type).toBe("object");
            expect(d.inputSchema.additionalProperties).toBe(false);
            for (const prop of Object.values(d.inputSchema.properties)) expect(typeof prop.type).toBe("string");
            for (const requerido of d.inputSchema.required ?? []) expect(d.inputSchema.properties).toHaveProperty(requerido);
        }
    });

    it("cada herramienta declara una capacidad real del ámbito", () => {
        for (const d of DEFINICIONES_HERRAMIENTAS) expect(CAPACIDADES_AMBITO).toContain(d.permiso);
    });
});

describe("manejadores inyectados", () => {
    it("estado serializa lo que devuelve su manejador", async () => {
        const { herramientas } = montar();
        const r = await herramienta(herramientas, "estado").ejecutar({});
        expect(r.esError).toBeUndefined();
        expect(datos(r)).toEqual({ vivo: true, colas: 2 });
    });

    it("tareas_listar recorta el límite y limpia el estado", async () => {
        const { manejadores, herramientas } = montar();
        const h = herramienta(herramientas, "tareas_listar");
        await h.ejecutar({ estado: "  en-curso  ", limite: 999 });
        expect(manejadores.tareasListar).toHaveBeenCalledWith({ estado: "en-curso", limite: 100 });
        await h.ejecutar({});
        expect(manejadores.tareasListar).toHaveBeenLastCalledWith({ estado: undefined, limite: 20 });
    });

    it("tareas_crear valida y recorta antes de llamar", async () => {
        const { manejadores, herramientas } = montar();
        const h = herramienta(herramientas, "tareas_crear");
        const r = await h.ejecutar({ titulo: "  Arreglar  ", prompt: "  hazlo  ", archivos: ["a.ts", 7, "b.ts"], ola: " O1 " });
        expect(r.esError).toBeUndefined();
        expect(manejadores.tareasCrear).toHaveBeenCalledWith({ titulo: "Arreglar", prompt: "hazlo", archivos: ["a.ts", "b.ts"], ola: "O1" });
        expect((await h.ejecutar({ titulo: "x" })).esError).toBe(true);
        expect(manejadores.tareasCrear).toHaveBeenCalledTimes(1);
    });

    it("agentes, medidores y opciones pasan lo validado", async () => {
        const { manejadores, herramientas } = montar();
        await herramienta(herramientas, "agentes_listar").ejecutar({ limite: 0 });
        expect(manejadores.agentesListar).toHaveBeenCalledWith({ limite: 1 });
        await herramienta(herramientas, "medidores").ejecutar({ clave: "  tokens " });
        expect(manejadores.medidores).toHaveBeenCalledWith("tokens");
        await herramienta(herramientas, "opciones_sugerir").ejecutar({ consulta: "  voz  " });
        expect(manejadores.opcionesSugerir).toHaveBeenCalledWith("voz");
    });

    it("biblioteca y chat exigen su texto antes de llamar", async () => {
        const { manejadores, herramientas } = montar();
        const buscar = herramienta(herramientas, "biblioteca_buscar");
        expect((await buscar.ejecutar({})).esError).toBe(true);
        await buscar.ejecutar({ consulta: "  diseño  ", limite: 5 });
        expect(manejadores.bibliotecaBuscar).toHaveBeenCalledWith("diseño", 5);
        const chat = herramienta(herramientas, "chat");
        expect((await chat.ejecutar({ mensaje: "   " })).esError).toBe(true);
        await chat.ejecutar({ mensaje: "  hola  " });
        expect(manejadores.chat).toHaveBeenCalledWith("hola");
    });

    it("proponer valida con el vocabulario de operaciones y llama con lo válido", async () => {
        const { manejadores, herramientas } = montar();
        const r = await herramienta(herramientas, "proponer").ejecutar({
            operaciones: [
                { tipo: "perfil.editar", cambios: { nombre: "Ana" }, motivo: "prueba" },
                { tipo: "codigo.ejecutar", codigo: "rm -rf /" },
            ],
        });
        expect(r.esError).toBeUndefined();
        expect(manejadores.proponer).toHaveBeenCalledTimes(1);
        const lote = vi.mocked(manejadores.proponer).mock.calls[0]![0];
        expect(lote.validas).toHaveLength(1);
        expect(lote.rechazadas).toHaveLength(1);
        expect(datos(r)).toMatchObject({ previas: ["Editar tu perfil"] });
    });

    it("proponer sin ninguna válida no llama al manejador", async () => {
        const { manejadores, herramientas } = montar();
        const r = await herramienta(herramientas, "proponer").ejecutar({ operaciones: [{ tipo: "eval" }] });
        expect(r.esError).toBe(true);
        expect(manejadores.proponer).not.toHaveBeenCalled();
    });
});
