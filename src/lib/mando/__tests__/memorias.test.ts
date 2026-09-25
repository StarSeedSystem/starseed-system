import { describe, expect, it } from "vitest";

import {
    DEFINICION_CAPAS,
    agruparPorCapa,
    buscarArchivos,
    construirBacklinks,
    construirCapas,
    construirGrafo,
    construirIndice,
    contarPorCapa,
    debeOmitirArchivo,
    esIdDeTarea,
    etiquetasDe,
    extraerIdsTarea,
    extraerResumen,
    extraerTitulo,
    extraerVinculos,
    filtrarCapasPorBusqueda,
    formatoTamano,
    masRecientes,
    normalizarBusqueda,
    puntuarBusqueda,
    recortarTexto,
    redactarTexto,
    resolverVinculo,
    resolverVinculos,
    rutaSegura,
    seleccionarRecuerdosDeTarea,
    type ArchivoMemoria,
} from "@/lib/mando/memorias";

/** Fábrica mínima de `ArchivoMemoria` para las pruebas de capas/grafo/búsqueda. */
function archivo(parcial: Partial<ArchivoMemoria> & Pick<ArchivoMemoria, "ruta" | "capa">): ArchivoMemoria {
    return {
        titulo: parcial.ruta,
        tamano: 100,
        actualizado: "2026-09-20T00:00:00.000Z",
        resumen: "",
        vinculos: [],
        etiquetas: [],
        ...parcial,
    };
}

describe("debeOmitirArchivo", () => {
    it("omite archivos con «env» en el nombre", () => {
        expect(debeOmitirArchivo(".env")).toBe(true);
        expect(debeOmitirArchivo("env")).toBe(true);
        expect(debeOmitirArchivo("STARSEED_ENV.local")).toBe(true);
    });

    it("omite archivos .key, *token*, *secret*, credentials* y auth*.json", () => {
        expect(debeOmitirArchivo("openai.key")).toBe(true);
        expect(debeOmitirArchivo("mi-token.json")).toBe(true);
        expect(debeOmitirArchivo("client-secret.json")).toBe(true);
        expect(debeOmitirArchivo("credentials.json")).toBe(true);
        expect(debeOmitirArchivo("credentials-google.json")).toBe(true);
        expect(debeOmitirArchivo("auth.json")).toBe(true);
        expect(debeOmitirArchivo("auth-firebase.json")).toBe(true);
    });

    it("deja pasar archivos normales de memoria", () => {
        expect(debeOmitirArchivo("state.md")).toBe(false);
        expect(debeOmitirArchivo("CLAUDE.md")).toBe(false);
        expect(debeOmitirArchivo("gobernador.json")).toBe(false);
        expect(debeOmitirArchivo("salud-proveedores.json")).toBe(false);
    });

    it("omite CUALQUIER archivo dentro de una carpeta .../keys/..., aunque su nombre sea inocente", () => {
        // Caso real de esta máquina: `~/.astraura/keys/agent_apis.json` guarda
        // claves de agente en texto plano bajo un nombre que no dice nada.
        expect(debeOmitirArchivo("/home/alex/.astraura/keys/agent_apis.json")).toBe(true);
        expect(debeOmitirArchivo("~/.astraura/keys/personality_apis.json")).toBe(true);
    });

    it("omite carpetas .../secrets/..., .../credentials/... y .../private/...", () => {
        expect(debeOmitirArchivo("proyecto/secrets/config.json")).toBe(true);
        expect(debeOmitirArchivo("proyecto/credentials/config.json")).toBe(true);
        expect(debeOmitirArchivo("proyecto/private/notas.md")).toBe(true);
    });

    it("no omite un hermano inocente de esa carpeta (solo la carpeta de claves está vetada)", () => {
        expect(debeOmitirArchivo("~/.astraura/os_control/estado.json")).toBe(false);
    });

    it("omite un nombre vacío (nada seguro que mostrar)", () => {
        expect(debeOmitirArchivo("")).toBe(true);
    });
});

describe("redactarTexto", () => {
    it("oculta el valor de API_KEY= sin tocar el nombre de la variable", () => {
        const out = redactarTexto("OPENROUTER_API_KEY=sk-or-abcdefghijklmnopqrstuvwxyz123456");
        expect(out).toContain("OPENROUTER_API_KEY=[oculto]");
        expect(out).not.toContain("sk-or-abcdefghijklmnopqrstuvwxyz123456");
    });

    it("oculta «token: valor» y «secret: valor» con dos puntos", () => {
        expect(redactarTexto("token: abcDEF123")).toBe("token: [oculto]");
        expect(redactarTexto("secret: muy-secreto-9000")).toBe("secret: [oculto]");
    });

    it("oculta «password=valor»", () => {
        expect(redactarTexto("password=hunter2000")).toBe("password=[oculto]");
    });

    it("oculta «Authorization: Bearer <token>» preservando la cabecera", () => {
        const out = redactarTexto("Authorization: Bearer sk-abc123def456ghi789");
        expect(out).toBe("Authorization: Bearer [oculto]");
    });

    it("oculta cadenas hexadecimales largas sueltas (≥ 32)", () => {
        const hex = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f6071";
        const out = redactarTexto(`huella=${hex} fin`);
        expect(out).not.toContain(hex);
        expect(out).toContain("[oculto]");
    });

    it("oculta cadenas base64 largas sueltas (≥ 32)", () => {
        const b64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVoxMjM0NTY=";
        const out = redactarTexto(`clave: ${b64}`);
        expect(out).not.toContain(b64);
    });

    it("oculta \"api_key\": \"valor\" con comillas de JSON, conservando la forma del documento", () => {
        // Caso real: `~/.astraura/keys/*.json` guarda exactamente esta forma.
        const json = [
            "{",
            '  "api_key": "ast_agent_agent_aurora_7b3b9a9135ed328b6431fa8a3c73d1fdc76cac4f",',
            '  "key_hash": "d08787ecdfc3672cca0a2f7a7663b9a2a13dd9657319a3108f585e91db4f8701",',
            '  "name": "Aurora Core"',
            "}",
        ].join("\n");
        const out = redactarTexto(json);
        expect(out).not.toContain("7b3b9a9135ed328b6431fa8a3c73d1fdc76cac4f");
        expect(out).not.toContain("d08787ecdfc3672cca0a2f7a7663b9a2a13dd9657319a3108f585e91db4f8701");
        expect(out).toContain('"api_key": "[oculto]"');
        expect(out).toContain('"name": "Aurora Core"'); // el resto del JSON no se toca
    });

    it("oculta \"token\":\"valor\" sin espacios (JSON compacto)", () => {
        const out = redactarTexto('{"token":"abc123def456"}');
        expect(out).toBe('{"token":"[oculto]"}');
    });

    it("NO toca una raya de separación markdown de 40 guiones", () => {
        const raya = "-".repeat(40);
        expect(redactarTexto(raya)).toBe(raya);
    });

    it("NO toca un párrafo normal que solo menciona la palabra «secreto»", () => {
        const texto = "El secreto de StarSeed es la cooperación entre agentes.";
        expect(redactarTexto(texto)).toBe(texto);
    });

    it("es tolerante con texto vacío o undefined", () => {
        expect(redactarTexto("")).toBe("");
        expect(redactarTexto(undefined as unknown as string)).toBe("");
    });

    it("deja intacto un texto sin nada sensible", () => {
        const texto = "# Estado\n\nLa ola 320 terminó bien, sin incidentes.";
        expect(redactarTexto(texto)).toBe(texto);
    });
});

describe("esIdDeTarea", () => {
    it("reconoce ids con letra+dígitos (p318Jb, X4F2, AS1, MD12, L6)", () => {
        for (const id of ["p318Jb", "X4F2", "AS1", "MD12", "L6"]) {
            expect(esIdDeTarea(id)).toBe(true);
        }
    });

    it("reconoce «Ola 318»", () => {
        expect(esIdDeTarea("Ola 318")).toBe(true);
    });

    it("rechaza palabras sin dígitos y números sin letras", () => {
        expect(esIdDeTarea("hola")).toBe(false);
        expect(esIdDeTarea("318")).toBe(false);
        expect(esIdDeTarea("")).toBe(false);
    });
});

describe("extraerIdsTarea", () => {
    it("extrae ids de tarea y referencias a ola de un texto libre", () => {
        const texto = "La Ola 318 quedó cerrada; la tarea p318Jb sigue pendiente y X4F2 se reintentó.";
        const ids = extraerIdsTarea(texto);
        expect(ids).toContain("Ola 318");
        expect(ids).toContain("p318Jb");
        expect(ids).toContain("X4F2");
    });

    it("no confunde palabras normales con ids", () => {
        const ids = extraerIdsTarea("El sistema StarSeed es próspero y abundante para todos.");
        expect(ids).toEqual([]);
    });
});

describe("extraerVinculos", () => {
    it("extrae un wiki-link [[destino]]", () => {
        expect(extraerVinculos("Ver [[state]] para más detalle.")).toContain("state");
    });

    it("extrae el alias de un wiki-link con |", () => {
        expect(extraerVinculos("Ver [[state|el estado]] para más detalle.")).toContain("state");
    });

    it("extrae la ruta de un enlace markdown interno", () => {
        expect(extraerVinculos("Lee [el estado](./memory/state.md) primero.")).toContain("./memory/state.md");
    });

    it("ignora enlaces markdown externos (http/https)", () => {
        const vinculos = extraerVinculos("Fuente: [Vercel](https://vercel.com/docs)");
        expect(vinculos).not.toContain("https://vercel.com/docs");
    });

    it("ignora anclas sueltas (#seccion)", () => {
        expect(extraerVinculos("Ver [más abajo](#seccion)")).toEqual([]);
    });

    it("incluye ids de tarea/ola junto a los enlaces", () => {
        const vinculos = extraerVinculos("Ver [[state]] — cerrado en la Ola 320 por p320K.");
        expect(vinculos).toEqual(expect.arrayContaining(["state", "Ola 320", "p320K"]));
    });

    it("deduplica y respeta el límite", () => {
        const texto = "[[a]] [[a]] [[b]] [[c]]";
        expect(extraerVinculos(texto, 2)).toHaveLength(2);
    });

    it("es tolerante con texto vacío", () => {
        expect(extraerVinculos("")).toEqual([]);
    });
});

describe("recortarTexto / extraerTitulo / extraerResumen / formatoTamano", () => {
    it("recorta con elipsis solo si excede el máximo", () => {
        expect(recortarTexto("hola", 10)).toBe("hola");
        expect(recortarTexto("0123456789abcdef", 10)).toBe("012345678…");
    });

    it("extrae el primer encabezado como título", () => {
        expect(extraerTitulo("# Estado del proyecto\n\ntexto", "state.md")).toBe("Estado del proyecto");
    });

    it("cae al nombre alterno sin encabezado", () => {
        expect(extraerTitulo("solo texto plano", "state.md")).toBe("state.md");
    });

    it("el resumen salta líneas vacías y rayas de separación, y redacta", () => {
        const texto = "# Título\n\n---\n\nPrimera línea útil.\nSegunda línea.\ntoken: secreto123";
        const resumen = extraerResumen(texto, 500);
        expect(resumen).toContain("Primera línea útil.");
        expect(resumen).not.toContain("secreto123");
    });

    it("formatea bytes a humano", () => {
        expect(formatoTamano(500)).toBe("500 B");
        expect(formatoTamano(2048)).toBe("2 KB");
        expect(formatoTamano(1536)).toBe("1.5 KB");
        expect(formatoTamano(5 * 1024 * 1024)).toBe("5 MB");
        expect(formatoTamano(-1)).toBe("—");
    });
});

describe("etiquetasDe", () => {
    it("añade la extensión, «externo» y «tarea» cuando corresponde", () => {
        const et = etiquetasDe({ ruta: "~/.hermes/memories/a.md", redactado: false, vinculos: ["p318Jb"] });
        expect(et).toEqual(expect.arrayContaining(["md", "externo", "tarea"]));
    });

    it("añade «redactado» cuando el archivo tuvo secretos ocultos", () => {
        const et = etiquetasDe({ ruta: "memory/state.md", redactado: true, vinculos: [] });
        expect(et).toContain("redactado");
        expect(et).not.toContain("externo");
    });
});

describe("capas: agrupar / construir / contar / recuerdos por tarea", () => {
    const archivos: ArchivoMemoria[] = [
        archivo({ ruta: "CLAUDE.md", capa: "nucleo", titulo: "CLAUDE" }),
        archivo({ ruta: "memory/state.md", capa: "proyecto", titulo: "Estado", vinculos: ["p318Jb"] }),
        archivo({ ruta: "memory/glossary.md", capa: "proyecto", titulo: "Glosario" }),
    ];

    it("agrupa por capa respetando el orden fijo de DEFINICION_CAPAS", () => {
        const grupos = agruparPorCapa(archivos);
        expect(Object.keys(grupos)).toEqual(DEFINICION_CAPAS.map((c) => c.id));
        expect(grupos.nucleo).toHaveLength(1);
        expect(grupos.proyecto).toHaveLength(2);
        expect(grupos["recuerdos-tarea"]).toHaveLength(0);
    });

    it("construye las 8 capas en orden, con archivos e id/titulo correctos", () => {
        const capas = construirCapas(archivos, { nucleo: "raíz del repositorio" });
        expect(capas).toHaveLength(8);
        expect(capas[0].id).toBe("nucleo");
        expect(capas[0].origen).toBe("raíz del repositorio");
        expect(capas[0].archivos).toHaveLength(1);
    });

    it("cuenta archivos por capa", () => {
        const capas = construirCapas(archivos);
        const cuentas = contarPorCapa(capas);
        expect(cuentas.proyecto).toBe(2);
        expect(cuentas.nucleo).toBe(1);
    });

    it("selecciona como «recuerdos por tarea» solo los archivos que mencionan una tarea/ola", () => {
        const seleccion = seleccionarRecuerdosDeTarea(archivos);
        expect(seleccion.map((a) => a.ruta)).toEqual(["memory/state.md"]);
    });
});

describe("masRecientes", () => {
    it("ordena por actualizado descendente y respeta el límite", () => {
        const archivos: ArchivoMemoria[] = [
            archivo({ ruta: "a.md", capa: "nucleo", actualizado: "2026-09-10T00:00:00.000Z" }),
            archivo({ ruta: "b.md", capa: "nucleo", actualizado: "2026-09-20T00:00:00.000Z" }),
            archivo({ ruta: "c.md", capa: "nucleo", actualizado: "2026-09-15T00:00:00.000Z" }),
        ];
        const top = masRecientes(archivos, 2);
        expect(top.map((a) => a.ruta)).toEqual(["b.md", "c.md"]);
    });

    it("excluye las entradas sintéticas", () => {
        const archivos: ArchivoMemoria[] = [
            archivo({ ruta: "version:os", capa: "programas", actualizado: "2026-09-25T00:00:00.000Z", sintetico: true }),
            archivo({ ruta: "a.md", capa: "nucleo", actualizado: "2026-09-01T00:00:00.000Z" }),
        ];
        const top = masRecientes(archivos, 5);
        expect(top.map((a) => a.ruta)).toEqual(["a.md"]);
    });

    it("no repite una misma ruta vista desde dos capas (p. ej. aprendizaje-olas.md)", () => {
        const archivos: ArchivoMemoria[] = [
            archivo({ ruta: "memory/aprendizaje-olas.md", capa: "proyecto", actualizado: "2026-09-20T00:00:00.000Z" }),
            archivo({ ruta: "memory/aprendizaje-olas.md", capa: "aprendizajes", actualizado: "2026-09-20T00:00:00.000Z" }),
            archivo({ ruta: "memory/state.md", capa: "proyecto", actualizado: "2026-09-10T00:00:00.000Z" }),
        ];
        const top = masRecientes(archivos, 20);
        expect(top.map((a) => a.ruta)).toEqual(["memory/aprendizaje-olas.md", "memory/state.md"]);
    });

    it("devuelve vacío con límite 0", () => {
        expect(masRecientes([archivo({ ruta: "a.md", capa: "nucleo" })], 0)).toEqual([]);
    });
});

describe("índice, grafo y backlinks", () => {
    const archivos: ArchivoMemoria[] = [
        archivo({ ruta: "memory/state.md", capa: "proyecto", titulo: "Estado", vinculos: ["glossary", "no-existe"] }),
        archivo({ ruta: "memory/glossary.md", capa: "proyecto", titulo: "Glosario", vinculos: [] }),
    ];

    it("construye un índice por ruta, nombre de archivo y título", () => {
        const indice = construirIndice(archivos);
        expect(resolverVinculo("memory/glossary.md", indice)).toBe("memory/glossary.md");
        expect(resolverVinculo("glossary.md", indice)).toBe("memory/glossary.md");
        expect(resolverVinculo("Glosario", indice)).toBe("memory/glossary.md");
        expect(resolverVinculo("glosario", indice)).toBe("memory/glossary.md"); // sin tilde/mayúscula
    });

    it("no resuelve un vínculo que no coincide con ninguna memoria conocida", () => {
        const indice = construirIndice(archivos);
        expect(resolverVinculo("no-existe", indice)).toBe(null);
    });

    it("resuelve una lista completa de vínculos, marcando null los que no existen", () => {
        const indice = construirIndice(archivos);
        const resueltos = resolverVinculos(["glossary", "no-existe"], indice);
        expect(resueltos).toEqual([
            { texto: "glossary", ruta: "memory/glossary.md" },
            { texto: "no-existe", ruta: null },
        ]);
    });

    it("construye el grafo solo con aristas que resuelven a otra memoria conocida", () => {
        const grafo = construirGrafo(archivos);
        expect(grafo.nodos).toHaveLength(2);
        expect(grafo.aristas).toEqual([{ origen: "memory/state.md", destino: "memory/glossary.md" }]);
    });

    it("construye los backlinks (mencionado por) a partir del grafo", () => {
        const grafo = construirGrafo(archivos);
        const backlinks = construirBacklinks(grafo);
        expect(backlinks.get("memory/glossary.md")).toEqual(["memory/state.md"]);
        expect(backlinks.get("memory/state.md")).toBeUndefined();
    });

    it("nunca crea una arista de un archivo hacia sí mismo", () => {
        const autoref: ArchivoMemoria[] = [archivo({ ruta: "memory/state.md", capa: "proyecto", titulo: "Estado", vinculos: ["Estado", "state"] })];
        const grafo = construirGrafo(autoref);
        expect(grafo.aristas).toEqual([]);
    });

    it("deduplica los nodos por ruta (una memoria vista desde dos capas es un solo nodo)", () => {
        const duplicados: ArchivoMemoria[] = [
            archivo({ ruta: "memory/aprendizaje-olas.md", capa: "proyecto", titulo: "Aprendizaje" }),
            archivo({ ruta: "memory/aprendizaje-olas.md", capa: "aprendizajes", titulo: "Aprendizaje" }),
        ];
        const grafo = construirGrafo(duplicados);
        expect(grafo.nodos).toHaveLength(1);
    });
});

describe("búsqueda", () => {
    const archivos: ArchivoMemoria[] = [
        archivo({ ruta: "memory/state.md", capa: "proyecto", titulo: "Estado del proyecto", resumen: "todo en orden" }),
        archivo({ ruta: "memory/glossary.md", capa: "proyecto", titulo: "Glosario", resumen: "términos y definiciones" }),
    ];

    it("puntúa más alto una coincidencia en el título que en el resumen", () => {
        const pTitulo = puntuarBusqueda(archivos[0], "estado");
        const pResumen = puntuarBusqueda(archivos[1], "definiciones");
        expect(pTitulo).toBeGreaterThan(pResumen);
    });

    it("es insensible a mayúsculas y tildes", () => {
        expect(normalizarBusqueda("Órdenes")).toBe("ordenes");
        expect(puntuarBusqueda(archivos[0], "ESTADO")).toBeGreaterThan(0);
    });

    it("buscarArchivos filtra y ordena por relevancia", () => {
        const resultado = buscarArchivos(archivos, "glosario");
        expect(resultado.map((a) => a.ruta)).toEqual(["memory/glossary.md"]);
    });

    it("una consulta vacía devuelve todo sin filtrar", () => {
        expect(buscarArchivos(archivos, "")).toHaveLength(2);
    });

    it("filtrarCapasPorBusqueda aplica la búsqueda dentro de cada capa", () => {
        const capas = construirCapas(archivos);
        const filtradas = filtrarCapasPorBusqueda(capas, "glosario");
        const capaProyecto = filtradas.find((c) => c.id === "proyecto");
        expect(capaProyecto?.archivos.map((a) => a.ruta)).toEqual(["memory/glossary.md"]);
    });
});

describe("rutaSegura", () => {
    it("acepta rutas normales del repositorio y pseudo-rutas ~/...", () => {
        expect(rutaSegura("memory/state.md")).toBe(true);
        expect(rutaSegura("~/.starseed/gobernador.json")).toBe(true);
        expect(rutaSegura("starseed_memory_root/relevo/informe-320.md")).toBe(true);
    });

    it("rechaza el escape de directorio (..)", () => {
        expect(rutaSegura("../../etc/passwd")).toBe(false);
        expect(rutaSegura("memory/../../etc/passwd")).toBe(false);
    });

    it("rechaza rutas absolutas del disco", () => {
        expect(rutaSegura("/etc/passwd")).toBe(false);
        expect(rutaSegura("C:/Windows/system32")).toBe(false);
    });

    it("rechaza cadenas vacías, nulas o demasiado largas", () => {
        expect(rutaSegura("")).toBe(false);
        expect(rutaSegura("a\0b")).toBe(false);
        expect(rutaSegura("a".repeat(600))).toBe(false);
    });
});

describe("la URL del túnel nunca se enseña (2026-09-25)", () => {
    it("omite tunel-mando.json y parecidos", () => {
        expect(debeOmitirArchivo("/Users/alex/.starseed/tunel-mando.json")).toBe(true);
        expect(debeOmitirArchivo("cloudflare-tunnel.json")).toBe(true);
    });
});
