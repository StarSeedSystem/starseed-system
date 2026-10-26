import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
    CLAVES_SOUP,
    PYTHON_SOUP,
    TAREAS_SOUP,
    VERSION_SOUP_VERIFICADA,
    aYamlSoup,
    comandosSoup,
    configSoup,
    rutaRelativaSegura,
    slugSujeto,
    validarConfigSoup,
    type ConfigSoup,
    type PeticionSoup,
    type TareaSoup,
} from "../soup";

const base: PeticionSoup = {
    sujeto: { tipo: "personalidad", id: "Aurora Sabia" },
    base: "Qwen/Qwen2.5-1.5B-Instruct",
    consentimiento: { otorgado: true },
};

function ok(p: PeticionSoup) {
    const r = configSoup(p);
    if (!r.ok) throw new Error(r.errores.join(" | "));
    return r;
}

/** Rutas con puntos de todas las claves de un objeto: `training.lora.r`. */
function rutas(obj: unknown, prefijo = ""): string[] {
    if (typeof obj !== "object" || obj === null) return [];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
        const ruta = prefijo ? `${prefijo}.${k}` : k;
        return typeof v === "object" && v !== null ? [ruta, ...rutas(v, ruta)] : [ruta];
    });
}

/**
 * Ejemplos TAL CUAL están en la documentación de Soup (comprobados el 2026-10-25). Las claves que genera la
 * fábrica tienen que salir de aquí: es la prueba de que ninguna está inventada.
 */
const EJEMPLOS_DOCUMENTADOS = [
    // README · Configuration
    `base: meta-llama/Llama-3.1-8B-Instruct
task: sft
data:
  train: ./data/train.jsonl
  format: alpaca
  val_split: 0.1
training:
  epochs: 3
  lr: 2e-5
  batch_size: auto
  lora:
    r: 64
    alpha: 16
  quantization: 4bit
output: ./output`,
    // docs/training.md · DPO Training
    `task: dpo
data:
  format: dpo
training:
  dpo_beta: 0.1`,
    // docs/training.md · KTO Training
    `task: kto
data:
  format: kto
training:
  kto_beta: 0.1`,
    // docs/training.md · ORPO Training
    `task: orpo
data:
  format: dpo
training:
  orpo_beta: 0.1`,
    // docs/training.md · Continued Pre-training y destilación (data.max_length)
    `data:
  max_length: 2048`,
    // docs/peft-and-efficiency.md · lora.dropout y lora.target_modules
    `training:
  lora:
    r: 16
    alpha: 32
    dropout: 0
    target_modules: auto`,
];

const CLAVES_DOCUMENTADAS = new Set(EJEMPLOS_DOCUMENTADOS.flatMap((y) => rutas(parse(y))));

describe("configSoup · el soup.yaml", () => {
    it("genera el ejemplo base de SFT con QLoRA y se lee como YAML", () => {
        const r = ok(base);
        const leido = parse(r.yaml) as ConfigSoup;
        expect(leido).toEqual(r.config);
        expect(leido.task).toBe("sft");
        expect(leido.base).toBe("Qwen/Qwen2.5-1.5B-Instruct");
        expect(leido.data).toEqual({ train: "./data/aprendizaje/corpus/aurora-sabia/train.jsonl", format: "chatml", val_split: 0.1, max_length: 2048 });
        expect(leido.training.quantization).toBe("4bit");
        expect(leido.training.lora).toEqual({ r: 16, alpha: 32, dropout: 0.05, target_modules: "auto" });
        expect(leido.training.lr).toBeCloseTo(2e-5, 12);
        expect(leido.output).toBe("./output/personalidad-aurora-sabia");
    });

    it("ninguna clave generada está inventada: todas salen de los ejemplos de la documentación de Soup", () => {
        const peticiones: PeticionSoup[] = [];
        for (const tarea of TAREAS_SOUP) {
            for (const metodo of ["lora", "qlora"] as const) {
                for (const acelerador of ["cuda", "mps", "ninguno"] as const) {
                    peticiones.push({ ...base, tarea, metodo, acelerador, lr: tarea === "sft" ? undefined : 1e-5 });
                }
            }
        }
        for (const p of peticiones) {
            const r = ok(p);
            for (const ruta of rutas(r.config)) expect(CLAVES_DOCUMENTADAS.has(ruta), `${p.tarea}/${p.metodo}/${p.acelerador}: ${ruta}`).toBe(true);
            expect(validarConfigSoup(parse(r.yaml)).ok).toBe(true);
        }
        // Y el conjunto que acepta el validador coincide con lo que la documentación ejemplifica (más modality y backend, citados en docs/training.md).
        const aceptadas = [
            ...CLAVES_SOUP.raiz,
            ...CLAVES_SOUP.data.map((k) => `data.${k}`),
            ...CLAVES_SOUP.training.map((k) => `training.${k}`),
            ...CLAVES_SOUP.lora.map((k) => `training.lora.${k}`),
        ];
        for (const ruta of aceptadas) {
            const sinAsterisco = ["modality", "backend", "training.gradient_accumulation_steps", "training.eval_steps"];
            if (sinAsterisco.includes(ruta)) continue; // documentadas en otros párrafos, no en un ejemplo completo
            expect(CLAVES_DOCUMENTADAS.has(ruta), ruta).toBe(true);
        }
    });

    it("DPO y ORPO leen format dpo con su beta; KTO lee format kto y no baja de batch 2", () => {
        for (const [tarea, formato, beta] of [["dpo", "dpo", "dpo_beta"], ["orpo", "dpo", "orpo_beta"], ["kto", "kto", "kto_beta"]] as const) {
            const { config } = ok({ ...base, tarea });
            expect(config.task).toBe(tarea);
            expect(config.data.format).toBe(formato);
            expect(config.training[beta]).toBe(0.1);
            expect(config.training.batch_size).toBe("auto");
            // Solo la beta de SU tarea.
            for (const otra of ["dpo_beta", "orpo_beta", "kto_beta"] as const) if (otra !== beta) expect(config.training[otra]).toBeUndefined();
        }
        expect(ok({ ...base, tarea: "dpo", beta: 0.3 }).config.training.dpo_beta).toBe(0.3);
        expect(ok({ ...base, tarea: "dpo" }).config.training.lr).toBeUndefined(); // sin lr inventado: manda el de Soup
    });

    it("QLoRA solo en CUDA: en MPS o CPU se escribe LoRA sin cuantizar y se dice", () => {
        const r = ok({ ...base, metodo: "qlora", acelerador: "mps" });
        expect(r.config.training.quantization).toBe("none");
        expect(r.avisos.join(" ")).toMatch(/QLoRA \(4 bits\) es de CUDA/);
        expect(ok({ ...base, metodo: "lora", acelerador: "cuda" }).config.training.quantization).toBe("none");
        expect(ok({ ...base, acelerador: "ninguno" }).config.training.quantization).toBe("none");
    });

    it("avisa de la regla de la 0.76: doctor --config antes de entrenar o de actualizar", () => {
        expect(ok(base).avisos.join(" ")).toMatch(/soup doctor --config soup\.yaml/);
        expect(aYamlSoup(ok(base).config)).toContain("base: Qwen/Qwen2.5-1.5B-Instruct");
    });

    it("sin consentimiento no se genera nada", () => {
        const r = configSoup({ ...base, consentimiento: { otorgado: false } });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errores.join(" ")).toMatch(/consentimiento/);
    });

    it("rechaza lo que Soup rechazaría o lo que sería peligroso", () => {
        const casos: [Partial<PeticionSoup>, RegExp][] = [
            [{ base: "no-es-un-modelo" }, /organización\/nombre/],
            [{ base: "../../etc/passwd" }, /organización\/nombre/],
            [{ rutaDatos: "/Users/alex/train.jsonl" }, /ruta relativa/],
            [{ rutaDatos: "../secreto/train.jsonl" }, /ruta relativa/],
            [{ rutaDatos: "./data/.env.local" }, /ruta relativa/],
            [{ tarea: "grpo" as unknown as TareaSoup }, /no la genera/],
            [{ tarea: "dpo", formatoDatos: "chatml" }, /lee datos «dpo»/],
            [{ rango: 0 }, /rango de LoRA/],
            [{ epocas: 0 }, /épocas/],
            [{ valSplit: 0.9 }, /validación/],
            [{ beta: 0 , tarea: "dpo" }, /Beta/],
            [{ sujeto: { tipo: "bot", id: "   " } }, /necesita un id/],
        ];
        for (const [extra, patron] of casos) {
            const r = configSoup({ ...base, ...extra });
            expect(r.ok, JSON.stringify(extra)).toBe(false);
            if (!r.ok) expect(r.errores.join(" | "), JSON.stringify(extra)).toMatch(patron);
        }
    });

    it("usa el slug del sujeto y no deja rutas absolutas en el YAML", () => {
        expect(slugSujeto("Ñandú Pérez!")).toBe("nandu-perez");
        const r = ok({ ...base, sujeto: { tipo: "capa", id: "colectiva" } });
        expect(r.config.output).toBe("./output/capa-colectiva");
        expect(r.yaml).not.toMatch(/(^|\s)\/(Users|home)\//);
        expect(rutaRelativaSegura("./data/a/train.jsonl")).toBe(true);
        expect(rutaRelativaSegura("C:\\datos\\x.jsonl")).toBe(false);
        expect(rutaRelativaSegura("~/x.jsonl")).toBe(false);
    });
});

describe("validarConfigSoup · como la 0.75 y la 0.76", () => {
    const valida = () => parse(ok(base).yaml) as Record<string, any>;

    it("acepta la que generamos", () => {
        expect(validarConfigSoup(valida())).toEqual({ ok: true, errores: [] });
    });

    it("rechaza las claves desconocidas, también una sección entera como `export:`", () => {
        const c = valida();
        c.export = { format: "gguf", quant: "q4_k_m" };
        const r = validarConfigSoup(c);
        expect(r.ok).toBe(false);
        expect(r.errores.join(" ")).toMatch(/«export»/);
    });

    it("rechaza el error de escritura que Soup cita en su documentación (quantizaton, max_len)", () => {
        const c = valida();
        c.training.quantizaton = "none";
        c.data.max_len = 512;
        const r = validarConfigSoup(c);
        expect(r.errores.join(" ")).toMatch(/training\.quantizaton/);
        expect(r.errores.join(" ")).toMatch(/data\.max_len/);
    });

    it("rechaza los ajustes que la 0.76 aceptaba y nunca aplicaba", () => {
        for (const [seccion, clave] of [["training", "quantization_aware"], ["training", "use_longlora"], ["training", "ebft_variant"], ["training", "freeze_layers"]] as const) {
            const c = valida();
            c[seccion][clave] = true;
            expect(validarConfigSoup(c).errores.join(" "), clave).toMatch(new RegExp(`${seccion}\\.${clave}`));
        }
        const c = valida();
        c.backend = "unsloth";
        expect(validarConfigSoup(c).ok).toBe(false);
    });

    it("rechaza tarea, formato y beta que no casan, y KTO con batch 1", () => {
        const c = valida();
        c.task = "grpo";
        expect(validarConfigSoup(c).ok).toBe(false);
        const d = parse(ok({ ...base, tarea: "dpo" }).yaml) as Record<string, any>;
        d.data.format = "chatml";
        expect(validarConfigSoup(d).errores.join(" ")).toMatch(/data\.format/);
        const e = parse(ok({ ...base, tarea: "dpo" }).yaml) as Record<string, any>;
        e.training.kto_beta = 0.1;
        expect(validarConfigSoup(e).errores.join(" ")).toMatch(/kto_beta/);
        const f = parse(ok({ ...base, tarea: "kto" }).yaml) as Record<string, any>;
        f.training.batch_size = 1;
        expect(validarConfigSoup(f).errores.join(" ")).toMatch(/KTO necesita batch_size de al menos 2/);
        const g = parse(ok({ ...base, tarea: "orpo" }).yaml) as Record<string, any>;
        delete g.training.orpo_beta;
        expect(validarConfigSoup(g).errores.join(" ")).toMatch(/Falta «training\.orpo_beta»/);
    });

    it("no es un objeto → no vale", () => {
        for (const x of [null, "texto", 3, [], undefined]) expect(validarConfigSoup(x).ok).toBe(false);
    });
});

describe("comandosSoup · órdenes exactas y guion", () => {
    const { config } = ok(base);
    const plan = comandosSoup(config);

    it("lista las órdenes del ciclo con la versión comprobada", () => {
        expect(plan.ok).toBe(true);
        if (!plan.ok) return;
        const ordenes = plan.ordenes.map((o) => o.orden);
        expect(plan.version).toBe(VERSION_SOUP_VERIFICADA);
        expect(plan.python).toBe(PYTHON_SOUP);
        expect(ordenes).toContain(`pip install "soup-cli[train]==${VERSION_SOUP_VERIFICADA}"`);
        expect(ordenes).toContain("soup doctor");
        expect(ordenes).toContain("soup doctor --config soup.yaml");
        expect(ordenes).toContain("soup train --config soup.yaml");
        expect(ordenes).toContain("soup eval custom --model ./output/personalidad-aurora-sabia --tasks ./data/aprendizaje/eval/eval.jsonl");
        expect(ordenes).toContain("soup export --model ./output/personalidad-aurora-sabia --format gguf --quant q4_k_m");
        expect(ordenes).toContain("soup data validate ./data/aprendizaje/corpus/aurora-sabia/train.jsonl --format chatml");
        expect(ordenes).toContain("soup adapters check ./output/personalidad-aurora-sabia");
    });

    it("las comillas del extra son dobles y la versión va fijada (la 0.76 ya rechaza configuraciones antiguas)", () => {
        if (!plan.ok) throw new Error("plan");
        for (const o of plan.ordenes.filter((x) => x.orden.startsWith("pip install"))) {
            expect(o.orden).toMatch(/^pip install "soup-cli(\[train\])?==0\.76\.1"$/);
            expect(o.orden).not.toContain("'");
        }
    });

    it("separa lo que sirve en cualquier medio (preparar) de lo que pide GPU", () => {
        if (!plan.ok) throw new Error("plan");
        const porId = Object.fromEntries(plan.ordenes.map((o) => [o.id, o]));
        for (const id of ["instalar-ligero", "doctor", "doctor-config", "validar-datos", "inspeccionar-datos"]) expect(porId[id].donde, id).toBe("cualquiera");
        for (const id of ["instalar-entrenar", "entrenar", "exportar-gguf", "evaluar"]) expect(porId[id].donde, id).toBe("gpu");
    });

    it("el adaptador suelto para llama-server --lora lo hace llama.cpp, no Soup, y se dice", () => {
        if (!plan.ok) throw new Error("plan");
        const lora = plan.ordenes.filter((o) => o.fuera_de_soup);
        expect(lora.map((o) => o.id).sort()).toEqual(["adaptador-gguf", "servir-lora"]);
        expect(lora.find((o) => o.id === "adaptador-gguf")!.orden).toMatch(/^python convert_lora_to_gguf\.py --base /);
        expect(lora.find((o) => o.id === "servir-lora")!.nota).toMatch(/BitNet/);
        expect(plan.ordenes.find((o) => o.id === "exportar-gguf")!.nota).toMatch(/Fusiona el adaptador con su base y deja un GGUF cuantizado COMPLETO/);
        // Las de Soup nunca llevan la marca.
        expect(plan.ordenes.filter((o) => o.orden.startsWith("soup ")).every((o) => !o.fuera_de_soup)).toBe(true);
    });

    it("el guion de Kaggle y Colab: celdas, Python 3.11/3.12, el YAML dentro y ningún secreto", () => {
        if (!plan.ok) throw new Error("plan");
        expect(plan.guion).toContain("# %%");
        expect(plan.guion).toMatch(/\(3, 11\) <= sys\.version_info\[:2\] <= \(3, 12\)/);
        expect(plan.guion).toContain(`!pip install "soup-cli[train]==${VERSION_SOUP_VERIFICADA}"`);
        expect(plan.guion).toContain("!soup doctor --config soup.yaml");
        expect(plan.guion).toContain("!soup train --config soup.yaml");
        expect(plan.guion).toContain("!soup export --model ./output/personalidad-aurora-sabia --format gguf --quant q4_k_m");
        const dentro = /write_text\("""([\s\S]*?)"""\)/.exec(plan.guion)?.[1] ?? "";
        expect(parse(dentro)).toEqual(config);
        expect(plan.guion).toMatch(/dataset PRIVADO/);
        expect(plan.guion).toMatch(/secretos del servicio/);
        expect(plan.guion).not.toMatch(/(hf_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{10,}|HF_TOKEN\s*=)/);
        expect(plan.guion).not.toMatch(/(^|\s)\/(Users|home|kaggle\/working)\//);
    });

    it("no da órdenes para una configuración inválida", () => {
        const roto = { ...config, task: "grpo" } as unknown as ConfigSoup;
        const r = comandosSoup(roto);
        expect(r.ok).toBe(false);
    });

    it("acepta otro nombre de archivo y de evaluación", () => {
        const r = comandosSoup(config, { archivoConfig: "otra.yaml", archivoEvaluacion: "./eval/x.jsonl", version: "0.76.0" });
        if (!r.ok) throw new Error("plan");
        expect(r.ordenes.map((o) => o.orden)).toContain("soup train --config otra.yaml");
        expect(r.ordenes.map((o) => o.orden)).toContain('pip install "soup-cli[train]==0.76.0"');
        expect(r.ordenes.find((o) => o.id === "evaluar")!.orden).toMatch(/--tasks \.\/eval\/x\.jsonl$/);
    });
});
