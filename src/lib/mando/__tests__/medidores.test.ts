import { describe, expect, it } from "vitest";

import {
    accionesDeTarea,
    aplicarConfiguracion,
    avanceDe,
    mediaDeAvance,
    configuracionPorDefecto,
    dependenciaDeNota,
    agruparPorTarea,
    dependenciasQueFaltan,
    detalleDeMedidor,
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

    it("el sujeto es el agente, no la tarea", () => {
        const d = detalleDeMedidor("agentes", { latidos: [latido], titulos: { T1: "Hacer algo" } });
        expect(d.filas[0].id).toContain("kimi-k3");
        expect(d.filas[0].titulo).toContain("mac");
        expect(d.filas[0].titulo).not.toBe("Hacer algo");
    });

    it("dice en qué tarea trabaja y cuánto lleva escrito", () => {
        const d = detalleDeMedidor("agentes", { latidos: [latido] });
        expect(d.filas[0].etapa).toContain("T1");
        expect(d.filas[0].porque).toContain("KB escritos");
    });

    it("un agente que lleva rato sin escribir no se llama «escribiendo»", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [{ ...latido, quietoSegundos: 600 }],
        });
        expect(d.filas[0].estado).toBe("callado");
        expect(d.filas[0].porque).toContain("sin escribir");
        // (2026-09-22) El resumen ahora empieza por los que ESCRIBEN y llama «callado(s)» a los
        // que no: «3 agentes · 3 sin escribir» se leía como tres trabajando.
        expect(d.resumen).toContain("0 escribiendo");
        expect(d.resumen).toContain("1 callado(s)");
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
        expect(ag.filas[0].id).not.toBe(ec.filas[0].id);
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
        "Ola 320 · p320A y p320K rehechas a mano: desbloquean las 8 tareas del Mando",
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

    it("se nombra «esperando pasarela» y dice por qué", () => {
        const d = detalleDeMedidor("agentes", { latidos: [latido("W1", "esperando proveedor")] });
        expect(d.filas[0].estado).toBe("esperando pasarela");
        expect(d.filas[0].porque).toContain("NO está escribiendo");
        expect(d.filas[0].porque).toContain("sin cupo");
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
        expect(d.resumen).toContain("1 escribiendo");
        expect(d.resumen).toContain("2 sin pasarela libre");
        expect(d.resumen).toContain("3 en total");
    });

    it("un agente que escribe de verdad sigue contando como tal", () => {
        const d = detalleDeMedidor("agentes", {
            latidos: [latido("X1", "escribiendo", { modelo: "nim/kimi-k3", quietoSegundos: 10 })],
        });
        expect(d.filas[0].estado).toBe("escribiendo");
        expect(d.resumen).toContain("1 escribiendo");
    });
});

describe("una dependencia que no va a llegar nunca no es un candado", () => {
    // (2026-09-22, medido) JF2 esperaba a JF1, y JF1 estaba así en el progreso:
    //   {"estado": "sustituida", "nota": "huérfana: ninguna cola fuente la define ya"}
    // Esperar a algo que nadie va a hacer no es una dependencia, es un candado: JF2 se
    // quedaba «lista» para siempre sin que ningún agente pudiera cogerla.
    it("una dependencia sustituida deja de frenar", () => {
        expect(dependenciasQueFaltan(["JF1"], { JF1: { estado: "sustituida" } })).toEqual([]);
    });

    it("también si fue descartada o rechazada", () => {
        expect(
            dependenciasQueFaltan(["A", "B"], {
                A: { estado: "descartada" },
                B: { estado: "rechazada" },
            }),
        ).toEqual([]);
    });

    it("una que sigue viva SÍ frena: todavía puede llegar", () => {
        expect(dependenciasQueFaltan(["RM3"], { RM3: { estado: "reasignada" } })).toEqual(["RM3"]);
        expect(dependenciasQueFaltan(["RM3"], { RM3: { estado: "pendiente" } })).toEqual(["RM3"]);
        expect(dependenciasQueFaltan(["RM3"], { RM3: { estado: "en_curso" } })).toEqual(["RM3"]);
    });

    it("una que no existe en el progreso sigue frenando", () => {
        // p318Jb esperaba a un p318I que nunca se creó. Eso no es «imposible por estado»:
        // es una cola mal escrita, y hay que verlo, no esconderlo.
        expect(dependenciasQueFaltan(["p318I"], {})).toEqual(["p318I"]);
    });

    it("una ya integrada no frena, como siempre", () => {
        expect(dependenciasQueFaltan(["A"], { A: { estado: "commit" } })).toEqual([]);
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
});
