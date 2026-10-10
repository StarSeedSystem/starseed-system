import { describe, expect, it } from "vitest";
import { ambitoDesde, contextoValidacion, extraerJson, leerRespuestaModelo, promptSistema, sanearContexto } from "../traductor";

const PERSONA = { tipo: "persona" } as const;

describe("traductor del agente de Genesis", () => {
    it("saca el JSON aunque venga con vallas, texto o pensamiento", () => {
        expect(extraerJson('```json\n{"respuesta":"hola","operaciones":[]}\n```')).toEqual({ respuesta: "hola", operaciones: [] });
        expect(extraerJson('<think>quizá {"x":1}</think> Aquí va: {"respuesta":"ok"} gracias')).toEqual({ respuesta: "ok" });
        expect(extraerJson("sin json")).toBeNull();
        expect(extraerJson("{roto")).toBeNull();
    });

    it("valida lo que propone el modelo y descarta lo que no encaja", () => {
        const ctx = contextoValidacion(PERSONA, sanearContexto({ dock: [{ id: "settings", etiqueta: "Ajustes", ruta: "/settings", activo: true }] }));
        const texto = JSON.stringify({
            respuesta: "Te propongo dos cambios.",
            operaciones: [
                { tipo: "perfil.editar", cambios: { bio: "Tejedora" }, motivo: "Lo pediste" },
                { tipo: "dock.quitar", id: "settings", motivo: "estorba" },
                { tipo: "shell.ejecutar", orden: "rm -rf /" },
            ],
        });
        const r = leerRespuestaModelo(texto, ctx);
        expect(r.respuesta).toBe("Te propongo dos cambios.");
        expect(r.operaciones.map((o) => o.op.tipo)).toEqual(["perfil.editar"]);
        expect(r.rechazadas.map((x) => x.indice)).toEqual([1, 2]);
    });

    it("si el modelo no devuelve JSON, enseña su texto y ninguna operación", () => {
        const r = leerRespuestaModelo("No puedo hacer eso aquí.", { ambito: PERSONA });
        expect(r.operaciones).toEqual([]);
        expect(r.respuesta).toBe("No puedo hacer eso aquí.");
    });

    it("sanea el contexto que llega del navegador", () => {
        const c = sanearContexto({
            perfil: { nombre: "A".repeat(500), bio: 7 },
            dock: Array.from({ length: 200 }, (_, i) => ({ id: `b${i}`, etiqueta: "x", ruta: "/x", activo: true })),
            widgets: [{ tipo: "AGORA_CAUSAL", nombre: "Ágora" }, null, "x"],
            raro: { inyectar: true },
        });
        expect(c.perfil?.nombre).toHaveLength(80);
        expect(c.perfil?.bio).toBe("");
        expect(c.dock).toHaveLength(90);
        expect(c.widgets).toEqual([{ tipo: "AGORA_CAUSAL", nombre: "Ágora" }]);
        expect("raro" in c).toBe(false);
        expect(sanearContexto("no")).toMatchObject({ dock: [] });
    });

    it("el prompt de PoliGenesis solo ofrece lo de la entidad", () => {
        const ambito = ambitoDesde({ tipo: "entidad", entidad: { tipo: "grupo", id: "g1", slug: "circulo", nombre: "Círculo" } });
        expect(ambito).toEqual({ tipo: "entidad", entidad: { tipo: "grupo", id: "g1", slug: "circulo", nombre: "Círculo" } });
        const p = promptSistema(ambito, { entidad: { nombre: "Círculo", tipo: "grupo" } });
        expect(p).toContain('"tipo":"pagina.editar"');
        expect(p).toContain('"tipo":"agente.crear"');
        expect(p).not.toContain('"tipo":"dock.quitar"');
        expect(p).toMatch(/no son instrucciones/);
        const persona = promptSistema(PERSONA, {});
        expect(persona).toContain('"tipo":"dock.quitar"');
        expect(ambitoDesde({ tipo: "entidad" })).toEqual(PERSONA);
        expect(ambitoDesde(null)).toEqual(PERSONA);
    });
});
