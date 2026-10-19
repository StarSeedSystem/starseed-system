/**
 * TESTS DE decidirResultado y propuestaMetaGenesis · ProtoGenesis PG1013D
 * Cubren las reglas definidas en architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import { describe, it, expect } from "vitest";

import { decidirResultado, propuestaMetaGenesis } from "../decision";
import type { Ambito } from "@/lib/protomolecula/tipos";
import type { Encargo } from "../encargo";
import { decidirAplicacion, rangoDeRol } from "@/lib/genesis/operaciones";

describe("decidirResultado", () => {
  it("debe devolver 'proponer-metagenesis' cuando toca fuera de la molécula", () => {
    const e = {
      ambito: "personal" as Ambito,
      esDueno: true,
      rol: null,
      democratico: undefined,
      tocaFueraDeLaMolecula: true,
    };

    const result = decidirResultado(e);
    expect(result.modo).toBe("proponer-metagenesis");
    expect(result.motivo).toBe(
      "un átomo, un conversor o código del OS lo decide MetaGenesis"
    );
  });

  it("debe devolver 'aceptar' para personal cuando es dueño", () => {
    const e = {
      ambito: "personal" as Ambito,
      esDueno: true,
      rol: null,
      democratico: undefined,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    expect(result.modo).toBe("aceptar");
    expect(result.motivo).toBe("es el dueño del ámbito personal/perfil");
  });

  it("debe devolver 'sin-permiso' para personal cuando no es dueño", () => {
    const e = {
      ambito: "personal" as Ambito,
      esDueno: false,
      rol: null,
      democratico: undefined,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    expect(result.modo).toBe("sin-permiso");
    expect(result.motivo).toBe("no es el dueño del ámbito personal/perfil");
  });

  it("debe devolver 'aceptar' para perfil cuando es dueño", () => {
    const e = {
      ambito: "perfil" as Ambito,
      esDueno: true,
      rol: null,
      democratico: undefined,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    expect(result.modo).toBe("aceptar");
    expect(result.motivo).toBe("es el dueño del ámbito personal/perfil");
  });

  it("debe devolver 'sin-permiso' para perfil cuando no es dueño", () => {
    const e = {
      ambito: "perfil" as Ambito,
      esDueno: false,
      rol: null,
      democratico: undefined,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    expect(result.modo).toBe("sin-permiso");
    expect(result.motivo).toBe("no es el dueño del ámbito personal/perfil");
  });

  it("debe usar decidirAplicacion para grupo en modo jerárquico con rol de gestión", () => {
    const e = {
      ambito: "grupo" as Ambito,
      esDueno: false,
      rol: "admin",
      democratico: false,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    // Para rol admin, rangoDeRol devuelve 3, decidirAplicacion en modo jerárquico con rango>=3 devuelve aplicar
    expect(result.modo).toBe("aceptar");
    // El motivo debería ser el de decidirAplicacion
    expect(result.motivo).toBe("Tienes rol de gestión en esta entidad.");
  });

  it("debe usar decidirAplicacion para grupo en modo democrático con rol de colaboración", () => {
    const e = {
      ambito: "grupo" as Ambito,
      esDueno: false,
      rol: "editor",
      democratico: true,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    // Para rol editor, rangoDeRol devuelve 2, decidirAplicacion en modo democrático con rango>=2 devuelve proponer
    expect(result.modo).toBe("proponer-voto");
    expect(result.motivo).toBe(
      "Esta entidad decide en democracia: cada cambio se convierte en una propuesta que se vota."
    );
  });

  it("debe devolver 'sin-permiso' para grupo en modo jerárquico sin rol suficiente", () => {
    const e = {
      ambito: "grupo" as Ambito,
      esDueno: false,
      rol: "observador",
      democratico: false,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    // Para rol observador, rangoDeRol devuelve 1, decidirAplicacion en modo jerárquico con rango<3 devuelve sin-permiso
    expect(result.modo).toBe("sin-permiso");
    expect(result.motivo).toBe(
      "En modo jerárquico solo aplican cambios quienes tienen rol de gestión (o la cuenta dueña)."
    );
  });

  it("debe tratar 'publica' como grupo", () => {
    const e = {
      ambito: "publica" as Ambito,
      esDueno: false,
      rol: "admin",
      democratico: false,
      tocaFueraDeLaMolecula: false,
    };

    const result = decidirResultado(e);
    expect(result.modo).toBe("aceptar");
    expect(result.motivo).toBe("Tienes rol de gestión en esta entidad.");
  });
});

describe("propuestaMetaGenesis", () => {
  it("debe generar un ID estable basado en el encargo y la falta", () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula de prueba",
      criterios: [],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };

    const falta: { tipo: "atomo"; detalle: string } = { tipo: "atomo", detalle: "falta el átomo de renderizado 3D" };

    const result1 = propuestaMetaGenesis(encargo, falta);
    const result2 = propuestaMetaGenesis(encargo, falta);

    // El ID debe ser el mismo para las mismas entradas
    expect(result1.id).toBe(result2.id);
    // El ID debe empezar con PGM y tener 11 caracteres en total (PGM + 8 hex)
    expect(result1.id).toMatch(/^PGM[0-9a-f]{8}$/);
  });

    it("debe generar diferentes IDs para diferentes faltas", () => {
      const encargo: Encargo = {
        id: "E001",
        moleculaId: "M001",
        ambito: "personal",
        intencion: "crear una molécula de prueba",
        criterios: [],
        autor: { tipo: "persona", id: "U001" },
        origen: "texto",
        creadoEn: Date.now(),
      };

      const falta1: { tipo: "atomo"; detalle: string } = { tipo: "atomo", detalle: "falta el átomo A" };
      const falta2: { tipo: "atomo"; detalle: string } = { tipo: "atomo", detalle: "falta el átomo B" };

      const result1 = propuestaMetaGenesis(encargo, falta1);
      const result2 = propuestaMetaGenesis(encargo, falta2);

      expect(result1.id).not.toBe(result2.id);
    });

    it("debe establecer archivos y depende como arrays vacíos", () => {
      const encargo: Encargo = {
        id: "E001",
        moleculaId: "M001",
        ambito: "personal",
        intencion: "crear una molécula de prueba",
        criterios: [],
        autor: { tipo: "persona", id: "U001" },
        origen: "texto",
        creadoEn: Date.now(),
      };

      const falta: { tipo: "conversor"; detalle: string } = { tipo: "conversor", detalle: "falta conversor de audio a texto" };

      const result = propuestaMetaGenesis(encargo, falta);
      expect(result.archivos).toEqual([]);
      expect(result.depende).toEqual([]);
    });

    it("debe establecer el título según el tipo de falta", () => {
      const encargo: Encargo = {
        id: "E001",
        moleculaId: "M001",
        ambito: "personal",
        intencion: "crear una molécula de prueba",
        criterios: [],
        autor: { tipo: "persona", id: "U001" },
        origen: "texto",
        creadoEn: Date.now(),
      };

      // Átomo
      const faltaAtomo: { tipo: "atomo"; detalle: string } = { tipo: "atomo", detalle: "herramienta de escultor" };
      let result = propuestaMetaGenesis(encargo, faltaAtomo);
      expect(result.titulo).toBe("Átomo faltante: herramienta de escultor");

      // Conversor
      const faltaConversor: { tipo: "conversor"; detalle: string } = { tipo: "conversor", detalle: "de OBJ a glTF" };
      result = propuestaMetaGenesis(encargo, faltaConversor);
      expect(result.titulo).toBe("Conversor faltante: de OBJ a glTF");

      // Otro
      const faltaOtro: { tipo: "otro"; detalle: string } = { tipo: "otro", detalle: "servicio de renderizado en la nube" };
      result = propuestaMetaGenesis(encargo, faltaOtro);
      expect(result.titulo).toBe("Otro recurso faltante: servicio de renderizado en la nube");
    });

    it("no debe incluir la intención en el prompt cuando el ámbito es personal", () => {
      const encargo: Encargo = {
        id: "E001",
        moleculaId: "M001",
        ambito: "personal",
        intencion: "esta es una intención privada que no debe aparecer",
        criterios: [],
        autor: { tipo: "persona", id: "U001" },
        origen: "texto",
        creadoEn: Date.now(),
      };

      const falta: { tipo: "atomo"; detalle: string } = { tipo: "atomo", detalle: "falta el átomo X" };

      const result = propuestaMetaGenesis(encargo, falta);
      expect(result.prompt).toBe("Falta: falta el átomo X");
      // Aseguramos que la intención no está incluida
      expect(result.prompt).not.toContain("intención privada");
    });

    it("debe incluir la intención en el prompt cuando el ámbito no es personal", () => {
      const encargo: Encargo = {
        id: "E001",
        moleculaId: "M001",
        ambito: "grupo",
        intencion: "intención pública del grupo",
        criterios: [],
        autor: { tipo: "persona", id: "U001" },
        origen: "texto",
        creadoEn: Date.now(),
      };

      const falta: { tipo: "conversor"; detalle: string } = { tipo: "conversor", detalle: "falta conversor Y" };

      const result = propuestaMetaGenesis(encargo, falta);
      expect(result.prompt).toBe(
        "Intencion: intención pública del grupo. Falta: falta conversor Y"
      );
    });

    it("debe funcionar con todos los ámbitos no personales", () => {
      const ámbitos: Ambito[] = ["perfil", "grupo", "publica"];
      const encargoBase: Encargo = {
        id: "E001",
        moleculaId: "M001",
        ambito: "personal", // Se sobrescribirá en cada iteración
        intencion: "intención de prueba",
        criterios: [],
        autor: { tipo: "persona", id: "U001" },
        origen: "texto",
        creadoEn: Date.now(),
      };

      for (const ambito of ámbitos) {
        const encargo = { ...encargoBase, ambito };
        const falta: { tipo: "otro"; detalle: string } = { tipo: "otro", detalle: "falta algo" };

        const result = propuestaMetaGenesis(encargo, falta);
        // Para ámbitos no personales, el prompt debe incluir la intención
        expect(result.prompt).toContain("Intencion: intención de prueba");
        expect(result.prompt).toContain("Falta: falta algo");
      }
    });
});