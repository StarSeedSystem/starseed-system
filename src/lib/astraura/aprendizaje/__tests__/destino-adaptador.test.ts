import { describe, expect, it } from "vitest";

import { MEDIOS_FABRICA, type MedioFabrica, type NecesidadFabrica } from "../fabricas";
import {
    adaptadorCompatibleConBase,
    alcanceDelAdaptador,
    ambitoDeSujeto,
    explicarAmbito,
    planificarAdaptador,
    puedeUsarAdaptador,
    type FuenteAdaptador,
    type PeticionAdaptador,
    type SujetoAdaptador,
} from "../destino-adaptador";

const medio = (id: string): MedioFabrica => MEDIOS_FABRICA.find((m) => m.id === id)!;
const ahora = new Date("2026-10-25T12:00:00Z");

const fuente = (alcance: FuenteAdaptador["alcance"], extra: Partial<FuenteAdaptador> = {}): FuenteAdaptador => ({
    ruta: `./data/aprendizaje/corpus/${alcance}/train.jsonl`,
    alcance,
    consentimiento: true,
    ...extra,
});

const personalidad: SujetoAdaptador = { tipo: "personalidad", id: "aurora-sabia", actor: { tipo: "agente-personal" } };
const botDeGrupo: SujetoAdaptador = { tipo: "bot", id: "recepcion", actor: { tipo: "agente-grupo", grupoId: "g-huerta" } };
const agentePublico: SujetoAdaptador = { tipo: "agente", id: "guia-publica", actor: { tipo: "agente-publico" } };
const SOUP: NecesidadFabrica = { tarea: "adaptador", base: "estandar", parametros_b: 1.5 };

function peticion(extra: Partial<PeticionAdaptador>): PeticionAdaptador {
    return {
        sujeto: personalidad,
        fuentes: [fuente("personal")],
        necesidad: { tarea: "adaptador", base: "bitnet-1.58" },
        medio: medio("mac-8gb"),
        base: "bitnet-b1.58-2B",
        ahora,
        ...extra,
    };
}

describe("ámbito y alcance de un adaptador", () => {
    it("lo privado es de la persona y de sus agentes personales; el resto es colectivo", () => {
        expect(ambitoDeSujeto(personalidad)).toBe("privado");
        expect(ambitoDeSujeto({ tipo: "personalidad", id: "x", actor: { tipo: "usuario" } })).toBe("privado");
        expect(ambitoDeSujeto(botDeGrupo)).toBe("colectivo");
        expect(ambitoDeSujeto(agentePublico)).toBe("colectivo");
    });

    it("la capa de conciencia colectiva es colectiva aunque la lance una persona", () => {
        expect(ambitoDeSujeto({ tipo: "capa", id: "colectiva", actor: { tipo: "usuario" } })).toBe("colectivo");
        expect(ambitoDeSujeto({ tipo: "capa", id: "local", actor: { tipo: "usuario" } })).toBe("privado");
    });

    it("el alcance del adaptador es el del dato más privado que vio", () => {
        expect(alcanceDelAdaptador(["publica", "grupo"])).toBe("grupo");
        expect(alcanceDelAdaptador(["publica", "personal", "grupo"])).toBe("personal");
        expect(alcanceDelAdaptador(["publica"])).toBe("publica");
    });

    it("solo lo carga quien podría leer ese dato (personal › perfil › grupo › pública, nunca al revés)", () => {
        expect(puedeUsarAdaptador({ alcance: "personal" }, { tipo: "agente-personal" })).toBe(true);
        expect(puedeUsarAdaptador({ alcance: "personal" }, { tipo: "agente-grupo", grupoId: "g" })).toBe(false);
        expect(puedeUsarAdaptador({ alcance: "personal" }, { tipo: "agente-publico" })).toBe(false);
        expect(puedeUsarAdaptador({ alcance: "grupo" }, { tipo: "agente-grupo", grupoId: "g" })).toBe(true);
        expect(puedeUsarAdaptador({ alcance: "grupo" }, { tipo: "agente-publico" })).toBe(false);
        expect(puedeUsarAdaptador({ alcance: "publica" }, { tipo: "agente-publico" })).toBe(true);
    });

    it("un adaptador LoRA solo vale sobre la familia de base con la que se entrenó", () => {
        expect(adaptadorCompatibleConBase({ familiaBase: "bitnet-1.58", formato: "lora-gguf" }, "bitnet-1.58")).toBe(true);
        expect(adaptadorCompatibleConBase({ familiaBase: "estandar", formato: "lora-gguf" }, "bitnet-1.58")).toBe(false);
    });

    it("explica el ámbito en claro", () => {
        expect(explicarAmbito("privado", "personal")).toMatch(/nunca se publica ni lo carga un agente de grupo o público/);
        expect(explicarAmbito("colectivo", "publica")).toMatch(/ningún dato personal ni de perfil/);
    });
});

describe("planificarAdaptador · privado (personal)", () => {
    it("QVAC en la Mac para la personalidad: registro candidato, privado, alcance personal", () => {
        const p = planificarAdaptador(peticion({}));
        if (!p.ok) throw new Error(p.errores.join(" | "));
        expect(p.ambito).toBe("privado");
        expect(p.alcance).toBe("personal");
        expect(p.entrenamiento.motor).toBe("qvac");
        expect(p.entrenamiento.modo).toBe("entrenar");
        const r = p.registro;
        expect(r.id).toBe("ad-qvac-personalidad-aurora-sabia-20261025");
        expect(r.personalidad).toBe("aurora-sabia"); // lo que ya lee Genesis
        expect(r.fecha).toBe("2026-10-25T12:00:00.000Z");
        expect(r.estado).toBe("candidato");
        expect(r.requiereEvaluacion).toBe(true);
        expect(r.formato).toBe("lora-gguf");
        expect(r.cargaCon).toMatch(/llama-server --lora/);
        expect(r.archivo).toBe("starseed_memory_root/aprendizaje/adaptadores/ad-qvac-personalidad-aurora-sabia-20261025.gguf");
        expect(p.explicacion).toMatch(/^Privado:/);
    });

    it("el registro es compatible con la entrada que lee Genesis (id, personalidad, fecha)", () => {
        const p = planificarAdaptador(peticion({ sujeto: { tipo: "bot", id: "pip", actor: { tipo: "agente-personal" } } }));
        if (!p.ok) throw new Error("plan");
        const { id, personalidad: etiqueta, fecha } = p.registro;
        expect([typeof id, typeof etiqueta, typeof fecha]).toEqual(["string", "string", "string"]);
        expect(etiqueta).toBe("bot:pip"); // el sujeto no personalidad lleva su tipo delante
    });

    it("con Soup en la Mac de 8 GB solo se prepara y se apunta a Kaggle o Colab (con consentimiento de salida)", () => {
        const p = planificarAdaptador(peticion({ necesidad: SOUP, base: "Qwen/Qwen2.5-1.5B-Instruct" }));
        if (!p.ok) throw new Error(p.errores.join(" | "));
        expect(p.entrenamiento.modo).toBe("preparar");
        expect(p.avisos.join(" ")).toMatch(/entrena en kaggle-gpu o colab-gpu/);
        expect(p.registro.motor).toBe("soup");
        expect(p.registro.formato).toBe("gguf-fusionado");
        expect(p.registro.cargaCon).toMatch(/no se carga sobre el BitNet/);
    });

    it("una persona puede entrenar en una GPU prestada con memoria personal solo si lo autoriza", () => {
        const sin = planificarAdaptador(peticion({ necesidad: SOUP, medio: medio("kaggle-gpu"), base: "Qwen/Qwen2.5-1.5B-Instruct" }));
        expect(sin.ok).toBe(false);
        if (!sin.ok) expect(sin.errores.join(" ")).toMatch(/consentimiento explícito/);
        const con = planificarAdaptador(peticion({ necesidad: SOUP, medio: medio("kaggle-gpu"), base: "Qwen/Qwen2.5-1.5B-Instruct", autorizaNube: true }));
        if (!con.ok) throw new Error(con.errores.join(" | "));
        expect(con.entrenamiento.modo).toBe("entrenar");
        expect(con.avisos.join(" ")).toMatch(/dataset privado/);
        expect(con.avisos.join(" ")).toMatch(/sale de la neurona/);
    });

    it("las fuentes sin sello de consentimiento se dejan fuera; sin ninguna con sello no se entrena", () => {
        const p = planificarAdaptador(peticion({ fuentes: [fuente("personal"), fuente("perfil", { consentimiento: false })] }));
        if (!p.ok) throw new Error("plan");
        expect(p.fuentesUsadas).toHaveLength(1);
        expect(p.fuentesExcluidas).toEqual([{ ruta: "./data/aprendizaje/corpus/perfil/train.jsonl", motivo: "Sin sello de consentimiento." }]);
        const nada = planificarAdaptador(peticion({ fuentes: [fuente("personal", { consentimiento: false })] }));
        expect(nada.ok).toBe(false);
    });

    it("una capa que se sirve fuera del aparato con memoria personal pide el consentimiento", () => {
        const nube: SujetoAdaptador = { tipo: "capa", id: "nube", actor: { tipo: "agente-personal" } };
        expect(planificarAdaptador(peticion({ sujeto: nube })).ok).toBe(false);
        const p = planificarAdaptador(peticion({ sujeto: nube, autorizaNube: true }));
        if (!p.ok) throw new Error("plan");
        expect(p.avisos.join(" ")).toMatch(/solo lo carga tu persona/);
        expect(planificarAdaptador(peticion({ sujeto: { tipo: "capa", id: "local", actor: { tipo: "agente-personal" } } })).ok).toBe(true);
    });
});

describe("planificarAdaptador · colectivo (público): jamás memoria personal", () => {
    const publico = (extra: Partial<PeticionAdaptador>) =>
        peticion({ sujeto: agentePublico, necesidad: SOUP, medio: medio("kaggle-gpu"), base: "Qwen/Qwen2.5-1.5B-Instruct", autorizaNube: true, ...extra });

    it("rechaza (no filtra en silencio) memoria personal o de perfil en un adaptador público", () => {
        for (const alcance of ["personal", "perfil"] as const) {
            const p = planificarAdaptador(publico({ fuentes: [fuente("publica"), fuente(alcance)] }));
            expect(p.ok, alcance).toBe(false);
            if (!p.ok) expect(p.errores.join(" ")).toMatch(/no puede entrenarse con memoria personal ni de perfil/);
        }
    });

    it("rechaza memoria personal también para la capa colectiva lanzada por una persona y para un bot de grupo", () => {
        const capa = planificarAdaptador(publico({ sujeto: { tipo: "capa", id: "colectiva", actor: { tipo: "usuario" } }, fuentes: [fuente("personal")] }));
        expect(capa.ok).toBe(false);
        const bot = planificarAdaptador(publico({ sujeto: botDeGrupo, fuentes: [fuente("perfil")] }));
        expect(bot.ok).toBe(false);
    });

    it("con solo memoria pública y consentimiento sale, con alcance público", () => {
        const p = planificarAdaptador(publico({ fuentes: [fuente("publica")] }));
        if (!p.ok) throw new Error(p.errores.join(" | "));
        expect(p.ambito).toBe("colectivo");
        expect(p.alcance).toBe("publica");
        expect(p.registro.actor).toBe("agente-publico");
        expect(puedeUsarAdaptador(p.registro, { tipo: "agente-publico" })).toBe(true);
        expect(p.explicacion).toMatch(/^Colectivo:/);
        expect(p.avisos.join(" ")).not.toMatch(/memoria personal/);
    });

    it("el plan incluye las recetas YAML de LlamaFactory con el ámbito saneado", () => {
        const p = planificarAdaptador(publico({
            fuentes: [fuente("publica")],
            plantilla: "qwen",
        }));
        if (!p.ok) throw new Error(p.errores.join(" | "));
        expect(p.recetas).toBeDefined();
        if (!p.recetas) return;
        expect(p.recetas.modo).toBe("qlora4");
        expect(p.recetas.dondeEjecutar).toBe("gpu-gratuita-permitida");
        expect(p.recetas.entrenamiento).toContain("trust_remote_code: false");
        expect(p.recetas.entrenamiento).toContain("saves/guia-publica/sft-lora");
        expect(p.recetas.fusion).toContain("export_dir: exports/guia-publica");
    });

    it("la memoria de grupo exige la aprobación de la entidad; sin ella se deja fuera", () => {
        const sin = planificarAdaptador(publico({ sujeto: botDeGrupo, fuentes: [fuente("grupo"), fuente("publica")] }));
        if (!sin.ok) throw new Error(sin.errores.join(" | "));
        expect(sin.fuentesExcluidas.map((e) => e.motivo)).toEqual(["Memoria de grupo sin la aprobación de la entidad."]);
        expect(sin.alcance).toBe("publica");
        const con = planificarAdaptador(publico({ sujeto: botDeGrupo, fuentes: [fuente("grupo", { aprobadoPorEntidad: true })] }));
        if (!con.ok) throw new Error("plan");
        expect(con.alcance).toBe("grupo");
        expect(puedeUsarAdaptador(con.registro, { tipo: "agente-grupo", grupoId: "g-huerta" })).toBe(true);
        expect(puedeUsarAdaptador(con.registro, { tipo: "agente-publico" })).toBe(false);
    });

    it("un agente de grupo tiene que declarar su grupo", () => {
        const p = planificarAdaptador(publico({ sujeto: { ...botDeGrupo, actor: { tipo: "agente-grupo" } }, fuentes: [fuente("publica")] }));
        expect(p.ok).toBe(false);
        if (!p.ok) expect(p.errores.join(" ")).toMatch(/a qué grupo sirve/);
    });

    it("el archivo no puede salir a una GPU prestada sin consentimiento, ni siquiera siendo público", () => {
        const p = planificarAdaptador(publico({ autorizaNube: false, fuentes: [fuente("publica")] }));
        expect(p.ok).toBe(false);
    });
});

describe("planificarAdaptador · entradas inválidas", () => {
    it("rechaza ids vacíos, capas que no existen, rutas peligrosas y listas vacías", () => {
        const casos: [Partial<PeticionAdaptador>, RegExp][] = [
            [{ sujeto: { ...personalidad, id: "  " } }, /necesita un id/],
            [{ sujeto: { tipo: "capa", id: "galactica", actor: { tipo: "usuario" } } }, /capa de conciencia/],
            [{ fuentes: [] }, /ningún archivo de corpus/],
            [{ fuentes: [fuente("personal", { ruta: "/Users/alex/train.jsonl" })] }, /relativa/],
            [{ fuentes: [fuente("personal", { ruta: "./data/.env" })] }, /relativa/],
        ];
        for (const [extra, patron] of casos) {
            const p = planificarAdaptador(peticion(extra));
            expect(p.ok, JSON.stringify(extra)).toBe(false);
            if (!p.ok) expect(p.errores.join(" | ")).toMatch(patron);
        }
    });

    it("sin camino de fábrica (preferencias sobre el BitNet) no hay plan", () => {
        const p = planificarAdaptador(peticion({ necesidad: { tarea: "preferencias", base: "bitnet-1.58" }, medio: medio("kaggle-gpu"), autorizaNube: true }));
        expect(p.ok).toBe(false);
        if (!p.ok) expect(p.errores.join(" ")).toMatch(/preferencias/);
    });
});
