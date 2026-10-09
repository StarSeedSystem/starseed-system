import { describe, expect, it } from "vitest";

import {
    accionesDeBloqueada,
    accionesDeTarea,
    cambioAutomatico,
    dependenciasMuertas,
    aplicarConfiguracion,
    avanceDe,
    mediaDeAvance,
    configuracionPorDefecto,
    dependenciaDeNota,
    agruparPorTarea,
    dependenciasQueFaltan,
    detalleDeMedidor,
    resumenTokensConLatidos,
    ejecutablesDeColas,
    idEnAsuntos,
    medidoresVisibles,
    porqueBloqueada,
    type ClaveMedidor,
} from "@/lib/mando/medidores";

describe("accionesDeTarea", () => {
    it("lo que ya está en main NO se puede descartar desde un panel", () => {
        expect(accionesDeTarea("commit")).toEqual([]);
        expect(accionesDeTarea("hecho")).toEqual([]);
    });

    it("toda acción que borra va marcada como destructiva", () => {
        const destructivas = accionesDeTarea("bloqueada").filter((a) => a.clase === "descartar");
        expect(destructivas).toHaveLength(1);
        expect(destructivas[0].destructiva).toBe(true);
    });

    it("el reintento pide describir el cambio", () => {
        const r = accionesDeTarea("bloqueada").find((a) => a.clase === "reintentar");
        expect(r?.pideTexto).toBeTruthy();
    });

    it("sin estado no ofrece nada", () => {
        expect(accionesDeTarea(undefined)).toEqual([]);
    });
});

describe("dependenciaDeNota", () => {
    it("saca los ids y tira los paréntesis", () => {
        expect(dependenciaDeNota("dependencia no integrada: p320B (bloqueada)")).toEqual(["p320B"]);
        expect(dependenciaDeNota("dependencia no integrada: p320D (bloqueada), p320F (rechazada)")).toEqual([
            "p320D",
            "p320F",
        ]);
    });

    it("una nota que no habla de dependencias devuelve vacío", () => {
        expect(dependenciaDeNota("reintento gratuito 1/8")).toEqual([]);
        expect(dependenciaDeNota(undefined)).toEqual([]);
    });
});

describe("porqueBloqueada", () => {
    it("dice a quién espera", () => {
        expect(porqueBloqueada("dependencia no integrada: X1 (bloqueada)", () => "bloqueada")).toBe("espera a X1");
    });

    it("avisa cuando la dependencia YA está integrada — eso cambia qué haces con ella", () => {
        const texto = porqueBloqueada("dependencia no integrada: X1 (sin_cambios)", () => "commit");
        expect(texto).toContain("puede desbloquearse");
    });

    it("sin nota no inventa un motivo", () => {
        expect(porqueBloqueada(undefined, () => undefined)).toContain("sin motivo anotado");
    });
});

const progreso = {
    A1: { estado: "bloqueada", nota: "dependencia no integrada: A0 (bloqueada)", t: "2026-09-14 10:00" },
    A0: { estado: "bloqueada", nota: "" },
    B1: { estado: "bloqueada", nota: "dependencia no integrada: B0 (sin_cambios)" },
    B0: { estado: "commit" },
    C1: { estado: "bloqueante", nota: "escalada agotada" },
    D1: { estado: "commit" },
    E1: { estado: "en_curso", t: "2026-09-14 11:00" },
};

describe("detalleDeMedidor · bloqueadas", () => {
    it("lista las bloqueadas con su porqué y ofrece descartar la lista entera", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso });
        expect(d.filas.map((f) => f.id).sort()).toEqual(["A0", "A1", "B1", "C1"]);
        expect(d.acciones.some((a) => a.clase === "descartar-todas" && a.destructiva)).toBe(true);
    });

    it("una integrada nunca aparece entre las bloqueadas", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso });
        expect(d.filas.map((f) => f.id)).not.toContain("D1");
    });

    it("ninguna fila ofrece acciones destructivas sobre algo integrado", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso: { ...progreso, Z9: { estado: "commit" } } });
        for (const f of d.filas) {
            if (f.estado === "commit") expect(f.acciones).toEqual([]);
        }
    });

    it("la bloqueante dice que necesita una persona", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso });
        expect(d.filas.find((f) => f.id === "C1")?.porque).toContain("una persona");
    });

    it("sin bloqueadas explica por qué está vacío en vez de callarse", () => {
        const d = detalleDeMedidor("bloqueadas", { progreso: {} });
        expect(d.filas).toEqual([]);
        expect(d.vacio).toBeTruthy();
    });
});

describe("detalleDeMedidor · sin publicar", () => {
    it("lista los commits y solo ofrece publicar", () => {
        const d = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [{ sha: "abcdef1234", asunto: "arregla X" }],
        });
        expect(d.filas[0].id).toBe("abcdef12");
        expect(d.filas[0].acciones).toEqual([]);
        expect(d.acciones.map((a) => a.clase)).toEqual(["publicar"]);
    });

    it("un commit no se descarta desde un panel", () => {
        const d = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [{ sha: "abcdef1234", asunto: "x" }],
        });
        expect(d.acciones.some((a) => a.destructiva)).toBe(false);
    });
});

// (2026-09-21) Estas tres describian el medidor «agentes» pero preguntaban por el TRABAJO
// (titulo de la tarea, rancias, «lleva mucho sin cambiar de fase»). Ese comportamiento no
// ha desaparecido: se ha mudado a «en-curso», que es de quien era. Aqui se comprueba
// donde vive ahora, y debajo lo que de verdad tiene que decir un medidor de agentes.
describe("detalleDeMedidor · en-curso (el trabajo)", () => {
    it("dice quién escribe cada tarea", () => {
        const d = detalleDeMedidor("en-curso", {
            latidos: [{ tarea: "T1", fase: "escribiendo", modelo: "nim/kimi-k3", minutos: 4, donde: "mac", proveedor: "nim" }],
            titulos: { T1: "Hacer algo" },
        });
        expect(d.filas[0].quien).toContain("kimi-k3");
        expect(d.filas[0].titulo).toBe("Hacer algo");
    });

    it("una tarea en curso SIN latido sale la primera y avisa de que es rancia", () => {
        const d = detalleDeMedidor("en-curso", { progreso, latidos: [] });
        expect(d.filas[0].id).toBe("E1");
        expect(d.filas[0].porque).toContain("rancio");
    });

    it("una tarea de más de 45 minutos en la misma fase queda señalada", () => {
        const d = detalleDeMedidor("en-curso", {
            latidos: [{ tarea: "T1", fase: "escribiendo", modelo: "nim/x", minutos: 60, donde: "mac" }],
        });
        expect(d.filas[0].porque).toBeTruthy();
    });
});

describe("detalleDeMedidor · agentes (el trabajador)", () => {
    const latido = {
        tarea: "T1",
        fase: "escribiendo",
        modelo: "nim/kimi-k3",
        minutos: 4,
        donde: "mac",
        proveedor: "nim",
        bytesLog: 4096,
        quietoSegundos: 10,
        cola: "cola-auto-1",
    };

    it("cada tarjeta es una TAREA viva, titulada por la tarea (2026-10-09)", () => {
        const d = detalleDeMedidor("agentes", { latidos: [latido], titulos: { T1: "Hacer algo" } });
        expect(d.filas[0].id).toBe("T1");
        expect(d.filas[0].titulo).toBe("Hacer algo");
        expect(d.filas[0].quien).toContain("nim/kimi-k3");
        expect(d.filas[0].quien).toContain("tanda auto-1");
        expect(d.filas[0].quien).not.toContain("cola cola-");
    });

    it("dice en qué etapa va y cuánto lleva escrito, sin botones por tarjeta", () => {
        const d = detalleDeMedidor("agentes", { latidos: [latido] });
        expect(d.filas[0].etapa).toBe("etapa 1 de 6 · escribiendo");
        expect(d.filas[0].porque).toContain("KB escritos");
        expect(d.filas[0].acciones).toEqual([]);
    });

    it("un agente que lleva rato sin escribir no se llama «escribiendo»", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [{ ...latido, quietoSegundos: 600 }],
        });
        expect(d.filas[0].estado).toBe("sin escribir");
        expect(d.filas[0].porque).toContain("10 min sin escribir");
        expect(d.resumen).toBe("1 en total · 1 sin escribir");
    });

    it("tres latidos de la MISMA tarea (tandas viejas) son UN agente", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [
                { ...latido, tarea: "CPA1007Kb", quietoSegundos: 540, cola: "cola-auto-1008-140757" },
                { ...latido, tarea: "CPA1007Kb", quietoSegundos: 30, cola: "cola-auto-1008-163740" },
                { ...latido, tarea: "CPA1007Kb", quietoSegundos: 660, cola: "cola-auto-1008-160157" },
            ],
        });
        expect(d.filas).toHaveLength(1);
        expect(d.filas[0].quien).toContain("1008-163740");
        expect(d.resumen.startsWith("1 en total")).toBe(true);
    });

    it("«escribiendo» sin proceso detrás es un fantasma: no cuenta y se nombra", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [latido, { ...latido, tarea: "T2" }],
            escritores: { T1: { pid: 123, minutos: 4 } },
        });
        expect(d.filas.map((f) => f.id)).toEqual(["T1"]);
        expect(d.filas[0].porque).toContain("proceso 123");
        expect(d.resumen).toContain("1 latido(s) viejo(s) descartado(s): T2");
    });

    it("en tsc no escribe ningún modelo: «comprobando», no «callado»", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [{ ...latido, fase: "tsc", quietoSegundos: 900 }],
            escritores: {},
        });
        expect(d.filas[0].estado).toBe("comprobando");
        expect(d.filas[0].porque).toContain("los tipos (tsc)");
        expect(d.filas[0].etapa).toBe("etapa 2 de 6 · verificando");
    });

    it("si un modelo corrige tsc con su proceso vivo, se dice «corrigiendo»", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [{ ...latido, fase: "tsc" }],
            escritores: { T1: { pid: 9, minutos: 1 } },
        });
        expect(d.filas[0].estado).toBe("corrigiendo");
    });

    it("no enseña las tareas rancias: eso es del medidor de tareas", () => {
        const d = detalleDeMedidor("agentes", { progreso, latidos: [] });
        expect(d.filas).toHaveLength(0);
    });

    it("los dos medidores YA NO dicen lo mismo", () => {
        const datos = { latidos: [latido], titulos: { T1: "Hacer algo" } };
        const ag = detalleDeMedidor("agentes", datos);
        const ec = detalleDeMedidor("en-curso", datos);
        expect(ag.titulo).not.toBe(ec.titulo);
        expect(ag.resumen).not.toBe(ec.resumen);
        // (2026-10-09) Las dos hablan de la misma TAREA (T1), pero «Agentes» dice cómo está el
        // trabajador (escribiendo, sin escribir, comprobando…) y «En curso» cómo va el trabajo.
        expect(ag.filas[0].estado).toBe("escribiendo");
        expect(ec.filas[0].estado).toBe("escribiendo");
        expect(ag.filas[0].etapa).toContain("etapa 1 de 6");
    });
});

describe("configuración", () => {
    it("recorta y dice cuántas quedan fuera", () => {
        const filas = Array.from({ length: 10 }, (_, i) => ({ id: `T${i}`, titulo: "x", acciones: [] }));
        const d = aplicarConfiguracion(
            { clave: "listas", titulo: "x", resumen: "10", filas, acciones: [] },
            { ...configuracionPorDefecto(), filasMaximas: 3 },
        );
        expect(d.filas).toHaveLength(3);
        expect(d.resumen).toContain("7 más");
    });

    it("reordenar no pierde ningún medidor", () => {
        const cfg = { ...configuracionPorDefecto(), orden: ["disco", "bloqueadas"] as ClaveMedidor[] };
        const visibles = medidoresVisibles(cfg);
        expect(visibles[0]).toBe("disco");
        expect(visibles).toContain("sin-publicar");
        expect(new Set(visibles).size).toBe(visibles.length);
    });

    it("lo oculto no vuelve por la puerta de atrás", () => {
        const cfg = { ...configuracionPorDefecto(), ocultos: ["disco"] as ClaveMedidor[] };
        expect(medidoresVisibles(cfg)).not.toContain("disco");
    });
});

describe("porcentajes de avance", () => {
    it("el avance sale del MISMO camino de seis etapas que la barra de Procesos", () => {
        // Si aquí se inventara otra escala, el mismo agente diría 50 % en un sitio y 33 %
        // en otro: justo el tipo de doble verdad que llevamos días quitando.
        expect(avanceDe("escribiendo", undefined).porcentaje).toBe(17);
        expect(avanceDe("tsc", undefined).porcentaje).toBe(33);
        expect(avanceDe("revision", undefined).porcentaje).toBe(67);
        expect(avanceDe("", "commit").porcentaje).toBe(100);
    });

    it("una fase que no se reconoce es 0 %, no «desconocido»", () => {
        expect(avanceDe("haciendo cosas", undefined)).toEqual({ porcentaje: 0 });
        expect(avanceDe(undefined, undefined).porcentaje).toBe(0);
    });

    it("cada tarea en curso trae su porcentaje y su etapa", () => {
        const d = detalleDeMedidor("en-curso", {
            latidos: [
                { tarea: "T1", fase: "escribiendo", modelo: "nim/kimi", minutos: 3, donde: "mac" },
                { tarea: "T2", fase: "tsc", modelo: "nim/kimi", minutos: 3, donde: "mac" },
            ],
        });
        expect(d.filas.map((f) => f.porcentaje)).toEqual([17, 33]);
        expect(d.filas[0].etapa).toBe("escribiendo");
    });

    it("el panel dice el avance medio y el resumen lo repite en palabras", () => {
        const d = detalleDeMedidor("en-curso", {
            latidos: [
                { tarea: "T1", fase: "escribiendo", modelo: "n/m", minutos: 1, donde: "mac" },
                { tarea: "T2", fase: "revision", modelo: "n/m", minutos: 1, donde: "mac" },
            ],
        });
        expect(d.porcentajeMedio).toBe(42);
        expect(d.resumen).toContain("42 %");
    });

    it("una tarea en curso SIN agente cuenta como 0 %: no está avanzando nada", () => {
        const d = detalleDeMedidor("en-curso", { progreso: { E1: { estado: "en_curso" } }, latidos: [] });
        expect(d.filas[0].porcentaje).toBe(0);
        expect(d.porcentajeMedio).toBe(0);
    });

    it("las listas van a 0 %: definidas y sin empezar", () => {
        const d = detalleDeMedidor("listas", { ejecutables: [{ id: "L1", titulo: "x", ola: "324" }] });
        expect(d.filas[0].porcentaje).toBe(0);
        // (2026-09-22) El resumen ya no dice «0 % avanzadas», que no informaba de nada:
        // dice cuántas se pueden coger DE VERDAD y cuántas esperan a otra tarea. Esa
        // distinción es la que faltaba cuando la pantalla ofrecía 7 listas y ninguna
        // se podía empezar.
        expect(d.resumen).toContain("1 se pueden coger ya");
    });

    it("una tarea que espera a otra NO se cuenta como «se puede coger»", () => {
        // El caso de Alex: RM5 esperaba a RM3 (fallo) y RM4 (rechazada), y la pantalla
        // decía «7 se pueden coger ya · el enjambre las va cogiendo por tandas».
        const d = detalleDeMedidor("listas", {
            ejecutables: [
                { id: "RM5", titulo: "cableado", ola: "363", esperaA: ["RM3", "RM4"] },
                { id: "JF2", titulo: "enruta con Jev", ola: "338", esperaA: ["JF1"] },
            ],
        });
        expect(d.resumen).toContain("ninguna se puede coger");
        // (2026-09-22) Y ya no se listan aquí. La pastilla decía 1 y debajo salían CINCO
        // tarjetas, tres de ellas repetidas en «Bloqueadas». Una tarea, un sitio: la
        // ventana enseña lo que la pastilla cuenta, y las atadas se nombran al pie.
        expect(d.filas).toHaveLength(0);
        expect(d.resumen).toContain("2 más esperan a otra tarea");
        expect(d.resumen).toContain("RM5, JF2");
        expect(d.resumen).toContain("Bloqueadas");
    });

    it("con unas libres y otras atadas, el resumen separa las dos cosas", () => {
        const d = detalleDeMedidor("listas", {
            ejecutables: [
                { id: "A1", titulo: "libre", ola: "1" },
                { id: "B1", titulo: "atada", ola: "1", esperaA: ["A1"] },
            ],
        });
        expect(d.resumen).toContain("1 se pueden coger ya");
        expect(d.resumen).toContain("1 más espera a otra tarea");
        // La ventana enseña SOLO lo que se puede coger: ni una fila de más.
        expect(d.filas).toHaveLength(1);
        expect(d.filas[0].id).toBe("A1");
    });

    it("bloqueadas y sin publicar NO llevan porcentaje: ahí sería inventado", () => {
        const b = detalleDeMedidor("bloqueadas", { progreso });
        expect(b.filas.every((f) => f.porcentaje === undefined)).toBe(true);
        expect(b.porcentajeMedio).toBeUndefined();
        const c = detalleDeMedidor("sin-publicar", { commitsSinPublicar: [{ sha: "abc1234567", asunto: "x" }] });
        expect(c.filas[0].porcentaje).toBeUndefined();
    });

    it("sin publicar lista también los commits de Astraura 1.58 que la pastilla ya suma", () => {
        // (2026-10-08) Alex: «aparecen 11 sin publicar en el medidor pero ninguna dentro».
        const d = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [],
            commitsSinPublicarAstraura: [{ sha: "3fee41cd45c8", asunto: "túnel: publicar la URL nueva" }],
        });
        expect(d.filas).toHaveLength(1);
        expect(d.filas[0].titulo).toBe("Astraura 1.58 · túnel: publicar la URL nueva");
        expect(d.resumen).toBe("el OS está publicado · 1 de Astraura 1.58 esperan TU firma (la autopublicación no publica Astraura)");
        // El botón de publicar del medidor es solo del OS; Astraura se publica en «Commits pendientes».
        expect(d.acciones.map((a) => a.clase)).toEqual(["ir-a"]);
        // (2026-10-08) …y abre allí mismo el diálogo de publicar Astraura («no funciona» si solo cambia de pestaña).
        expect(d.acciones[0].destino).toBe("commits#publicar-astraura");
    });

    it("sin publicar dice que el OS lo publica la autopublicación y calla un fallo manual ya superado", () => {
        // (2026-10-08) Alex: «la autopublicación tampoco [funciona] ya que aún hay pendientes».
        const fin = "2026-10-08 14:02:00";
        const d = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [{ sha: "2b6df44b0000", asunto: "Enjambre: arrienda otra vez" }],
            publicacion: { estado: "fallo", terminado: fin, resumen: "no se publicó: la build falló", pasos: [] },
            autopublicacion: { activa: true, fase: "esperando", detalle: "Ventana entre lotes: próximo en 12 min.", ultimaMs: Date.parse("2026-10-08T16:31:56") },
        });
        expect(d.resumen).toBe("1 del OS: los publica sola la autopublicación (Ventana entre lotes: próximo en 12 min)");
        expect(d.aviso).toBeUndefined();
        const sinAuto = detalleDeMedidor("sin-publicar", {
            commitsSinPublicar: [{ sha: "2b6df44b0000", asunto: "x" }],
            autopublicacion: { activa: false },
        });
        expect(sinAuto.resumen).toBe("1 del OS esperando (autopublicación apagada)");
    });

    it("la media ignora las filas sin avance en vez de contarlas como cero", () => {
        expect(mediaDeAvance([{ id: "a", titulo: "", porcentaje: 100, acciones: [] }, { id: "b", titulo: "", acciones: [] }])).toBe(100);
        expect(mediaDeAvance([{ id: "a", titulo: "", acciones: [] }])).toBe(0);
    });
});

describe("qué cuenta de verdad como «lista para trabajar»", () => {
    // El caso real del 2026-09-15: el medidor decía 78 y el vigilante cogía 4.
    // Las otras 74 eran tareas de olas viejas, hechas y publicadas hace semanas,
    // que nadie cerró en progreso.json.
    const asuntos = [
        "Ola · p323E: capturar-prueba.py: captura de la ruta local que tocó cada tarea",
        "Ola 320 · p320A y p320K rehechas a mano: desbloquean las 8 tareas de Genesis",
        "fix(mando): la cabecera deja de descuadrarse",
    ].join("\n");

    it("reconoce el id como palabra entera, con o sin número de ola y en minúscula", () => {
        expect(idEnAsuntos("p323E", asuntos)).toBe(true);
        expect(idEnAsuntos("p320K", asuntos)).toBe(true);
        // `p323` no está: es un prefijo de `p323E`, no la misma tarea.
        expect(idEnAsuntos("p323", asuntos)).toBe(false);
        expect(idEnAsuntos("p324B", asuntos)).toBe(false);
        expect(idEnAsuntos("", asuntos)).toBe(false);
    });

    it("deja fuera lo que ya está en main aunque su estado siga vacío", () => {
        const colas = [
            { id: "p323E", titulo: "capturar prueba", ola: "323", cola: "323-reportes" },
            { id: "p324B", titulo: "pendiente de verdad", ola: "324", cola: "324-os" },
        ];
        expect(ejecutablesDeColas(colas, {}, asuntos).map((t) => t.id)).toEqual(["p324B"]);
    });

    it("ignora las copias `cola-auto-*`: son relanzamientos, no demanda nueva", () => {
        const colas = [
            { id: "p324B", titulo: "copia", ola: "324", cola: "auto-0915-101010" },
            { id: "p324F", titulo: "fuente", ola: "324", cola: "324-os" },
        ];
        expect(ejecutablesDeColas(colas, {}, "").map((t) => t.id)).toEqual(["p324F"]);
    });

    it("ignora las colas de sueños, que el vigilante no lee; la copia en una cola de código sí cuenta", () => {
        // (2026-10-08) «7 se pueden coger ya» y «Buscar más capacidad» con 0 listas para la Mac.
        const colas = [
            { id: "c313_QW4", titulo: "solo en sueños", cola: "suenos-ola1" },
            { id: "TK1c", titulo: "en sueños", cola: "suenos-ola1" },
            { id: "TK1c", titulo: "y en código", cola: "recomprobadas-1008b" },
        ];
        expect(ejecutablesDeColas(colas, {}, "").map((t) => `${t.id}:${t.titulo}`)).toEqual(["TK1c:y en código"]);
    });

    it("solo cuenta lo que el vigilante relanzaría: ni bloqueada, ni rechazada, ni commit", () => {
        const colas = [
            { id: "A", titulo: "", cola: "c" },
            { id: "B", titulo: "", cola: "c" },
            { id: "C", titulo: "", cola: "c" },
            { id: "D", titulo: "", cola: "c" },
        ];
        const progreso = {
            A: { estado: "pendiente" },
            B: { estado: "bloqueada" },
            C: { estado: "rechazada" },
            D: { estado: "commit" },
        };
        expect(ejecutablesDeColas(colas, progreso, "").map((t) => t.id)).toEqual(["A"]);
    });

    it("un id repetido en varias colas cuenta una sola vez", () => {
        const colas = [
            { id: "A", titulo: "nueva", cola: "324" },
            { id: "A", titulo: "vieja", cola: "300" },
        ];
        const salida = ejecutablesDeColas(colas, {}, "");
        expect(salida).toHaveLength(1);
        expect(salida[0].titulo).toBe("nueva");
    });
});

describe("detalleDeMedidor · invariante vacio explicativo", () => {
    it("todos los medidores devuelven un mensaje explicativo cuando estan vacios", () => {
        const claves: ClaveMedidor[] = [
            "en-curso",
            "agentes",
            "listas",
            "bloqueadas",
            "sin-publicar",
            "proveedores",
            "memoria",
            "disco",
            "ola-activa",
        ];
        for (const clave of claves) {
            const d = detalleDeMedidor(clave, {}, Date.now());
            expect(d.vacio).toBeTruthy();
            expect(typeof d.vacio).toBe("string");
            expect(d.vacio!.length).toBeGreaterThan(5);
        }
    });
});

describe("un agente sin pasarela NO está escribiendo (2026-09-22)", () => {
    const latido = (tarea: string, fase: string, extra = {}) => ({
        tarea, fase, modelo: "-", minutos: 35, donde: "mac", ...extra,
    });

    it("se nombra «esperando modelo» y dice por qué", () => {
        const d = detalleDeMedidor("agentes", { latidos: [latido("W1", "esperando proveedor")] });
        expect(d.filas[0].estado).toBe("esperando modelo");
        expect(d.filas[0].porque).toContain("ningún modelo con cupo");
        expect(d.filas[0].quien).toContain("sin modelo asignado");
    });

    it("el resumen cuenta primero los que ESCRIBEN", () => {
        // Lo que veía Alex: «3 agentes · 3 sin escribir» leído como tres trabajando.
        const d = detalleDeMedidor("agentes", {
            latidos: [
                latido("W1", "esperando proveedor"),
                latido("LCOMPA", "esperando proveedor"),
                latido("X1", "escribiendo", { modelo: "nim/kimi-k3", quietoSegundos: 5 }),
            ],
        });
        expect(d.resumen).toBe("3 en total · 1 escribiendo · 2 esperando modelo");
    });

    it("un agente que escribe de verdad sigue contando como tal", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [latido("X1", "escribiendo", { modelo: "nim/kimi-k3", quietoSegundos: 10 })],
        });
        expect(d.filas[0].estado).toBe("escribiendo");
        expect(d.resumen).toContain("1 escribiendo");
    });
});

describe("las dependencias se miden con la regla del orquestador (cadenas)", () => {
    // (2026-10-08, medido) «Listas» decía «RM7 · se puede coger ya» y el orquestador la tenía
    // bloqueada: RM6 estaba «sustituida» (la rehace RM6b) y Genesis daba por hecha cualquier
    // dependencia sustituida. El orquestador solo acepta una dependencia INTEGRADA, y el
    // vigilante acepta además una sucesora de su cadena integrada. Una sola regla.
    it("una dependencia sustituida con su sucesora viva sigue frenando", () => {
        const progreso = { RM6: { estado: "sustituida" }, RM6b: { estado: "reasignada" } };
        expect(dependenciasQueFaltan(["RM6"], progreso)).toEqual(["RM6"]);
    });

    it("una sucesora integrada cumple la dependencia", () => {
        const progreso = { CAMR1005Db: { estado: "fallo_tsc" }, CAMR1005Dc: { estado: "commit" } };
        expect(dependenciasQueFaltan(["CAMR1005Db"], progreso)).toEqual([]);
        // también si solo consta en los asuntos de main
        expect(
            dependenciasQueFaltan(["RM6"], { RM6: { estado: "sustituida" }, RM6b: { estado: "reasignada" } }, "Ola 363 · RM6b: red mesh"),
        ).toEqual([]);
    });

    it("una que no va a llegar frena y se ve: va a «Bloqueadas» sin salida, no a «Listas»", () => {
        // El caso JF1 (huérfana) ya no se esconde dándolo por hecho: el orquestador nunca
        // arrancaría la que espera, así que «lista» era mentira.
        expect(dependenciasQueFaltan(["JF1"], { JF1: { estado: "sustituida" } })).toEqual(["JF1"]);
        expect(
            dependenciasQueFaltan(["A", "B"], { A: { estado: "descartada" }, B: { estado: "rechazada" } }),
        ).toEqual(["A", "B"]);
    });

    it("una que sigue viva frena: todavía puede llegar", () => {
        expect(dependenciasQueFaltan(["RM3"], { RM3: { estado: "reasignada" } })).toEqual(["RM3"]);
        expect(dependenciasQueFaltan(["RM3"], { RM3: { estado: "pendiente" } })).toEqual(["RM3"]);
        expect(dependenciasQueFaltan(["RM3"], { RM3: { estado: "en_curso" } })).toEqual(["RM3"]);
    });

    it("una que no existe en el progreso sigue frenando", () => {
        expect(dependenciasQueFaltan(["p318I"], {})).toEqual(["p318I"]);
    });

    it("una ya integrada no frena, como siempre", () => {
        expect(dependenciasQueFaltan(["A"], { A: { estado: "commit" } })).toEqual([]);
    });

    it("lo que «Listas» manda a «Bloqueadas» está en «Bloqueadas», con quién la rehace", () => {
        const d = detalleDeMedidor("bloqueadas", {
            fila: [],
            ejecutables: [{ id: "PRD1005U", titulo: "Genesis muestra los puentes", esperaA: ["PRD1005S"] }],
            progreso: { PRD1005S: { estado: "sustituida" }, PRD1005Sc: { estado: "en_curso" }, PRD1005U: { estado: "pendiente" } },
            titulos: { PRD1005S: "enrutador de puentes" },
        });
        const fila = d.filas.find((f) => f.id === "PRD1005U");
        expect(fila?.estado).toBe("bloqueada");
        expect(fila?.porque).toContain("siguen vivas");
        expect(JSON.stringify(fila?.ficha)).toContain("la rehace PRD1005Sc");
        expect(d.resumen).toContain("1 esperando a otra tarea");
    });

    it("«Listas» no ofrece lo que el orquestador no cogería (RM7 con RM6 rehaciéndose)", () => {
        const colas = [{ id: "RM7", titulo: "Ajustes de red mesh", cola: "363", dependencias: ["RM5", "RM6"] }];
        const progreso = { RM5: { estado: "commit" }, RM6: { estado: "sustituida" }, RM6b: { estado: "reasignada" } };
        expect(ejecutablesDeColas(colas, progreso, "")).toEqual([
            { id: "RM7", titulo: "Ajustes de red mesh", ola: undefined, esperaA: ["RM6"] },
        ]);
        const integrada = { ...progreso, RM6b: { estado: "commit" } };
        expect(ejecutablesDeColas(colas, integrada, "")[0].esperaA).toBeUndefined();
    });
});

describe("«Tareas en curso» y «Agentes» son dos preguntas distintas", () => {
    // (2026-09-22) Dos quejas seguidas de Alex, y las dos ciertas.
    //   1. «dice que 0 tareas en curso pero 12 agentes»: la pastilla contaba latidos de la
    //      MAC (`/api/mando/estado`) y los de la nube no laten ahí. Ahora sale de aquí.
    //   2. «aún son los mismos procesos cuando en realidad son conceptos diferentes»: este
    //      medidor pintaba una fila por LATIDO, o sea por agente, así que los dos números
    //      eran el mismo por construcción. Ahora una tarea es una fila, lleve los agentes
    //      que lleve.
    const enDosMedios = [
        { tarea: "T1", fase: "escribiendo", modelo: "nim/kimi-k3", minutos: 4, donde: "mac", proveedor: "nim" },
        { tarea: "nube/35740708835", fase: "escribiendo", modelo: "llm7/minimax", minutos: 6, donde: "nube-gh" },
        { tarea: "nube/35740708835", fase: "escribiendo", modelo: "llm7/minimax", minutos: 9, donde: "nube-gh" },
    ];

    it("cuenta también a los que trabajan en la nube", () => {
        const d = detalleDeMedidor("en-curso", { latidos: enDosMedios });
        expect(d.filas.map((f) => f.id)).toContain("nube/35740708835");
    });

    it("tres agentes sobre dos tareas son DOS tareas y TRES agentes", () => {
        const enCurso = detalleDeMedidor("en-curso", { latidos: enDosMedios });
        const agentes = detalleDeMedidor("agentes", { latidos: enDosMedios });
        expect(enCurso.filas).toHaveLength(2);
        expect(agentes.filas).toHaveLength(3);
    });

    it("la tarea compartida dice cuántos agentes lleva", () => {
        const d = detalleDeMedidor("en-curso", { latidos: enDosMedios });
        const compartida = d.filas.find((f) => f.id === "nube/35740708835");
        expect(compartida?.quien).toContain("2 agentes");
        // Y se queda con el latido que más lleva: es el que cuenta la historia.
        expect(compartida?.desde).toBe("9 min");
    });

    it("el resumen dice las dos cosas, sin que haya que restarlas", () => {
        const d = detalleDeMedidor("en-curso", { latidos: enDosMedios });
        expect(d.resumen).toContain("2 en marcha");
        expect(d.resumen).toContain("3 agente(s)");
    });

    it("sin nadie trabajando, los dos dicen cero", () => {
        expect(detalleDeMedidor("en-curso", { latidos: [] }).filas).toHaveLength(0);
        expect(detalleDeMedidor("agentes", { latidos: [] }).filas).toHaveLength(0);
    });
});

describe("agruparPorTarea", () => {
    it("un agente por tarea deja todo igual", () => {
        const g = agruparPorTarea([
            { tarea: "A", minutos: 1 },
            { tarea: "B", minutos: 2 },
        ]);
        expect(g).toHaveLength(2);
        expect(g.every((x) => x.agentes === 1)).toBe(true);
    });

    it("varios agentes sobre una tarea son una fila con la cuenta", () => {
        const g = agruparPorTarea([
            { tarea: "A", minutos: 1 },
            { tarea: "A", minutos: 7 },
            { tarea: "A", minutos: 3 },
        ]);
        expect(g).toHaveLength(1);
        expect(g[0].agentes).toBe(3);
        expect(g[0].latido.minutos).toBe(7); // se queda el que más lleva
    });

    it("sin latidos no hay filas", () => {
        expect(agruparPorTarea([])).toEqual([]);
    });
});

describe("medidor de tokens por segundo", () => {
    // (2026-09-22) Alex: «tokens por segundo en total sumando los de todos los procesos de
    // cada api». Se midió antes quién publica tokens: solo Jev (del `usage` de la API).
    // opencode y codex no devuelven `usage`; las pasarelas guardan llamadas, coste y ms.
    // El medidor suma lo que tiene contador y NOMBRA lo que no, en vez de estimarlo.
    const tokens = {
        ahora: { fuentes: { jev: 42.5 }, total: 42.5, segundos: 5 },
        un_minuto: { fuentes: { jev: 30 }, total: 30, segundos: 60 },
        fuentes: [{ id: "jev", nombre: "Jev (consejero)" }],
        sin_contador: [
            { id: "opencode", nombre: "agentes opencode", porque: "su motor no devuelve `usage`" },
        ],
    };

    it("manda la media del minuto, y el instantáneo va detrás", () => {
        // El gasto va a ráfagas: un agente calla un minuto y suelta miles de golpe. Con el
        // instantáneo de 5 s al frente, la pastilla marcaba 0 casi siempre y parecía rota.
        const d = detalleDeMedidor("tokens", { tokens });
        expect(d.resumen).toMatch(/^30\.0 tok\/s de media en 1 min/);
        expect(d.resumen).toContain("42.5 tok/s en los últimos 5 s");
    });

    it("sin un minuto entero todavía, lo dice en vez de callarlo", () => {
        const d = detalleDeMedidor("tokens", { tokens: { ...tokens, un_minuto: null } });
        expect(d.resumen).toContain("42.5 tok/s ahora");
        expect(d.resumen).toContain("aún sin minuto entero");
    });

    it("dice cuántos procesos no publican tokens", () => {
        const d = detalleDeMedidor("tokens", { tokens });
        expect(d.resumen).toContain("1 proceso(s) no publican tokens");
    });

    it("cada fuente con contador es una fila con su nombre", () => {
        const d = detalleDeMedidor("tokens", { tokens });
        const jev = d.filas.find((f) => f.id === "jev");
        expect(jev?.titulo).toBe("Jev (consejero)");
        expect(jev?.etapa).toBe("42.5 tok/s");
        expect(jev?.estado).toBe("gastando");
    });

    it("los que no publican tokens salen con el porqué, no con un cero", () => {
        const d = detalleDeMedidor("tokens", { tokens });
        const oc = d.filas.find((f) => f.id === "opencode");
        expect(oc?.estado).toBe("no publica tokens");
        expect(oc?.etapa).toBe("—");
        expect(oc?.porque).toContain("usage");
    });

    it("sin dos muestras no se inventa un cero", () => {
        const d = detalleDeMedidor("tokens", { tokens: { ...tokens, ahora: null, un_minuto: null } });
        expect(d.resumen).toContain("una tasa necesita dos");
    });

    it("opencode ya es una fuente medida, no un «no se puede»", () => {
        // (2026-09-22) La primera versión lo daba por no medible. Su LOG no publica tokens,
        // pero su base de datos sí: `session.tokens_input/output/reasoning`. Medido:
        // 125.377.185 tokens acumulados en 4.055 sesiones.
        const conOpencode = {
            ...tokens,
            ahora: { fuentes: { jev: 2, opencode: 900 }, total: 902, segundos: 5 },
            un_minuto: { fuentes: { jev: 1, opencode: 500 }, total: 501, segundos: 60 },
            fuentes: [
                { id: "jev", nombre: "Jev (consejero)" },
                { id: "opencode", nombre: "agentes opencode" },
            ],
            sin_contador: [{ id: "codex", nombre: "agentes codex", porque: "no lo publica" }],
        };
        const d = detalleDeMedidor("tokens", { tokens: conOpencode });
        const oc = d.filas.find((f) => f.id === "opencode");
        expect(oc?.estado).toBe("gastando");
        expect(oc?.etapa).toBe("900 tok/s");
        expect(d.resumen).toMatch(/^501 tok\/s de media en 1 min/);
    });

    it("si el servicio no escribe, lo dice con su nombre", () => {
        const d = detalleDeMedidor("tokens", {});
        expect(d.resumen).toContain("com.starseed.tokens");
    });

    it("una fuente en reposo se distingue de una que gasta", () => {
        const quieto = { ...tokens, ahora: { fuentes: { jev: 0 }, total: 0, segundos: 5 } };
        const d = detalleDeMedidor("tokens", { tokens: quieto });
        expect(d.filas.find((f) => f.id === "jev")?.estado).toBe("en reposo");
    });

    // (TPS1004A) Cuando la media del último minuto es 0, el resumen dice POR QUÉ es 0.
    it("tokens > 0 sigue como hoy: la media del minuto manda", () => {
        const d = detalleDeMedidor("tokens", { tokens });
        expect(d.resumen).toMatch(/^30\.0 tok\/s de media en 1 min/);
    });

    it("0 tok/s con latidos vivos en 'escribiendo' nombra el motor sin contador", () => {
        const cero = {
            ahora: { fuentes: {}, total: 0, segundos: 5 },
            un_minuto: { fuentes: {}, total: 0, segundos: 60 },
        };
        const d = detalleDeMedidor("tokens", {
            tokens: cero,
            latidos: [
                { tarea: "T1", fase: "escribiendo", modelo: "opencode/x", minutos: 4, donde: "mac", proveedor: "opencode" },
            ],
        });
        expect(d.resumen).toContain("escribiendo con motores sin contador");
        expect(d.resumen).toContain("codex/pasarelas");
    });

    it("0 tok/s con latidos vivos en otras fases nombra cada fase", () => {
        const cero = {
            ahora: { fuentes: {}, total: 0, segundos: 5 },
            un_minuto: { fuentes: {}, total: 0, segundos: 60 },
        };
        const d = detalleDeMedidor("tokens", {
            tokens: cero,
            latidos: [
                { tarea: "T1", fase: "tsc", modelo: "n/m", minutos: 3, donde: "mac" },
                { tarea: "T2", fase: "tests", modelo: "n/m", minutos: 2, donde: "mac" },
                { tarea: "T2", fase: "tests", modelo: "n/m", minutos: 1, donde: "mac" },
            ],
        });
        expect(d.resumen).toContain("0 tok/s ahora: nadie está escribiendo");
        expect(d.resumen).toContain("2 en tests");
        expect(d.resumen).toContain("1 en tsc");
    });

    it("0 tok/s sin latidos vivos dice que no hay agentes trabajando", () => {
        const cero = {
            ahora: { fuentes: {}, total: 0, segundos: 5 },
            un_minuto: { fuentes: {}, total: 0, segundos: 60 },
        };
        const d = detalleDeMedidor("tokens", { tokens: cero, latidos: [] });
        expect(d.resumen).toBe("0 tok/s: no hay agentes trabajando");
    });

    it("resumenTokensConLatidos es puro y cuenta en orden descendente", () => {
        const r = resumenTokensConLatidos([
            { tarea: "A", fase: "tests", modelo: "x", minutos: 1, donde: "mac" },
            { tarea: "B", fase: "tsc", modelo: "x", minutos: 2, donde: "mac" },
            { tarea: "C", fase: "tests", modelo: "x", minutos: 3, donde: "mac" },
        ]);
        expect(r.sinLatidos).toBe(false);
        expect(r.escribiendo).toBe(0);
        expect(r.texto).toBe("2 en tests, 1 en tsc");
    });
});


// (2026-09-23) Alex: «en el medidor de bloqueadas falta la opción de reintentar con
// cambios automáticamente». El cambio se deduce de la ficha; si no se puede deducir nada
// concreto, el botón no se ofrece, porque reintentar sin cambio da el mismo resultado.
describe("cambioAutomatico", () => {
    const espera = (dep: string, estado: string) => [
        { etiqueta: "Espera a", valor: `${dep} — algo` },
        { etiqueta: "↳ su estado", valor: estado },
    ];

    it("una dependencia que NO EXISTE da la orden de hacerla sin ella", () => {
        const c = cambioAutomatico({
            estado: "bloqueada sin salida",
            ficha: espera("RM5", "NO EXISTE: ninguna ola la ha ejecutado nunca"),
        });
        expect(c).toContain("RM5 no va a llegar");
        expect(c).toContain("SIN esa dependencia");
    });

    it("una dependencia descartada también", () => {
        const c = cambioAutomatico({ ficha: espera("X1", "rechazada — no se va a integrar sola") });
        expect(c).toContain("X1 no va a llegar");
    });

    it("con una muerta y una viva, quita solo la muerta", () => {
        const c = cambioAutomatico({
            ficha: [...espera("A", "NO EXISTE: ninguna ola la ha ejecutado nunca"), ...espera("B", "escribiendo")],
        });
        expect(c).toContain("Quita la dependencia de A");
        expect(c).toContain("B siga siendo la única espera");
    });

    it("si todo lo que espera sigue vivo, no hay cambio que mandar", () => {
        expect(cambioAutomatico({ ficha: espera("B", "escribiendo") })).toBeNull();
    });

    it("sin ficha o sin nada anotado, tampoco", () => {
        expect(cambioAutomatico({})).toBeNull();
        expect(cambioAutomatico({ ficha: [{ etiqueta: "Espera a", valor: "nada anotado" }] })).toBeNull();
    });
});

describe("accionesDeBloqueada", () => {
    // (2026-10-05, BLQ1005B) Contrato bloqueadas-reparacion §3: siempre las cuatro
    // acciones — el cambio automático ya no depende de la ficha, lo calcula
    // `reintento-inteligente.ts` del estado y la nota de la tarea.
    it("ofrece siempre Reparar ahora, Reparar con mi cambio, Escalar y Descartar", () => {
        const espera = (dep: string, estado: string) => [
            { etiqueta: "Espera a", valor: `${dep} — algo` },
            { etiqueta: "↳ su estado", valor: estado },
        ];
        const clases = (fila: Parameters<typeof accionesDeBloqueada>[0]) =>
            accionesDeBloqueada(fila).map((a) => a.clase);

        expect(clases({ estado: "bloqueada sin salida", ficha: espera("RM5", "NO EXISTE: ninguna ola la ha ejecutado nunca") }))
            .toEqual(["reintentar-auto", "reintentar", "escalar", "descartar"]);
        expect(clases({ estado: "bloqueada", ficha: espera("B", "escribiendo") }))
            .toEqual(["reintentar-auto", "reintentar", "escalar", "descartar"]);
        expect(clases({ estado: "bloqueada" }))
            .toEqual(["reintentar-auto", "reintentar", "escalar", "descartar"]);
        // Lo que ya está en main o es un informe no se toca desde un panel.
        expect(clases({ estado: "commit" })).toEqual([]);
        expect(clases({ estado: "informe" })).toEqual([]);
    });
});

// (2026-09-23) Alex: «4 agentes y 0 tokens». Los cuatro eran de la nube.
describe("medidor de tokens con agentes sin contador", () => {
    const tokens = {
        ahora: { fuentes: { jev: 0, opencode: 0 }, total: 0, segundos: 5 },
        un_minuto: { fuentes: { jev: 0, opencode: 0 }, total: 0, segundos: 60 },
        fuentes: [
            { id: "jev", nombre: "Jev (consejero)" },
            { id: "opencode", nombre: "agentes opencode" },
        ],
        sin_contador: [
            { id: "codex", nombre: "agentes codex", porque: "no publica" },
            { id: "nube-gh", nombre: "4 agente(s) en la nube (GitHub Actions)", porque: "GitHub no da el log", agentes: 4 },
        ],
        resumen: "0 tok/s medidos aquí · los 4 agente(s) que trabajan ahora están donde no hay contador en vivo",
    };

    it("la frase sale TAL CUAL del archivo: una cuenta, un sitio", () => {
        const d = detalleDeMedidor("tokens", { tokens } as never);
        expect(d.resumen).toBe(tokens.resumen);
    });

    it("los agentes que trabajan sin contador no salen como un motor apagado", () => {
        const d = detalleDeMedidor("tokens", { tokens } as never);
        const nube = d.filas.find((f) => f.id === "nube-gh");
        expect(nube?.estado).toBe("trabajando sin contador");
        expect(nube?.etapa).toBe("4 agente(s)");
        const codex = d.filas.find((f) => f.id === "codex");
        expect(codex?.estado).toBe("no publica tokens");
    });

    it("sin frase en el archivo y media 0: dice que no hay agentes trabajando", () => {
        const d = detalleDeMedidor("tokens", { tokens: { ...tokens, resumen: undefined } } as never);
        expect(d.resumen).toBe("0 tok/s: no hay agentes trabajando");
    });
});


describe("dependenciasMuertas", () => {
    it("solo las que no van a llegar, que son las que el reintento quita de `depende`", () => {
        expect(
            dependenciasMuertas({
                ficha: [
                    { etiqueta: "Espera a", valor: "CU3r — algo" },
                    { etiqueta: "↳ su estado", valor: "rechazada — no se va a integrar sola" },
                    { etiqueta: "Espera a", valor: "B — algo" },
                    { etiqueta: "↳ su estado", valor: "escribiendo" },
                    { etiqueta: "Espera a", valor: "Z — sin título" },
                    { etiqueta: "↳ su estado", valor: "NO EXISTE: ninguna ola la ha ejecutado nunca" },
                ],
            }),
        ).toEqual(["CU3r", "Z"]);
        expect(dependenciasMuertas({})).toEqual([]);
    });
});
