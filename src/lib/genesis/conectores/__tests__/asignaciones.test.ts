import { describe, it, expect } from "vitest";
import { sugeridas, fusionarConAmbito, Director, Preferencias, Asignacion } from "../asignaciones";
import { OpcionCatalogo, Papel } from "../catalogo-opciones";

describe("sugeridas", () => {
    it("debe devolver primero las opciones locales de Astraura seguido de las opciones gratuitas del catálogo", () => {
    // Mock catalog with some free and some paid options
    const catalogo: OpcionCatalogo[] = [
      {
        id: "free1",
        nombre: "Free Option 1",
        tipo: "modelo",
        papeles: ["escritor"],
        gratis: { rpm: 10, porDia: null, horasMes: null, almacenamientoGb: null, nota: "10 rpm" },
        requiereCuenta: false,
        enlaceAlta: null,
        enlaceClave: null,
        variables: [],
        privacidad: "local",
        licencia: null,
        verificado: null,
        fuente: "test"
      },
      {
        id: "paid1",
        nombre: "Paid Option 1",
        tipo: "modelo",
        papeles: ["revisor"],
        gratis: null, // paid
        requiereCuenta: true,
        enlaceAlta: null,
        enlaceClave: null,
        variables: [],
        privacidad: "nube-con-retencion",
        licencia: null,
        verificado: null,
        fuente: "test"
      },
      {
        id: "free2",
        nombre: "Free Option 2",
        tipo: "modelo",
        papeles: ["chat"],
        gratis: { rpm: null, porDia: 100, horasMes: null, almacenamientoGb: null, nota: "100 per day" },
        requiereCuenta: false,
        enlaceAlta: null,
        enlaceClave: null,
        variables: [],
        privacidad: "local",
        licencia: null,
        verificado: null,
        fuente: "test"
      }
    ];

    const localAstraura = ["local-opt1", "local-opt2"];

    const result = sugeridas(localAstraura, catalogo);

    // Expected: localAstraura first, then the free options from the catalog (free1 and free2)
    // Note: the order of free options in the catalog is as they appear: free1, free2
    expect(result).toEqual([
      "local-opt1",
      "local-opt2",
      "free1",
      "free2"
    ]);
  });

    it("no debe incluir opciones de pago del catálogo", () => {
    const catalogo: OpcionCatalogo[] = [
      {
        id: "paid1",
        nombre: "Paid Option 1",
        tipo: "modelo",
        papeles: ["revisor"],
        gratis: null,
        requiereCuenta: true,
        enlaceAlta: null,
        enlaceClave: null,
        variables: [],
        privacidad: "nube-con-retencion",
        licencia: null,
        verificado: null,
        fuente: "test"
      }
    ];

    const localAstraura = ["local-opt1"];

    const result = sugeridas(localAstraura, catalogo);

    expect(result).not.toContain("paid1");
    expect(result).toEqual(["local-opt1"]);
  });

    it("debe manejar localAstraura vacío y catálogo vacío", () => {
    const result = sugeridas([], []);
    expect(result).toEqual([]);
  });
});

describe("fusionarConAmbito", () => {
    it("debe dar prioridad a delAmbito y eliminar duplicados de sugeridas", () => {
    const sugeridas = ["sug1", "sug2", "sug3"];
    const delAmbito = ["del1", "sug2", "del2"];

    // Mock catalog with all IDs
    const catalogo: OpcionCatalogo[] = [
      { id: "del1", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" },
      { id: "del2", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" },
      { id: "sug1", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" },
      { id: "sug2", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" },
      { id: "sug3", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" }
    ];

    const result = fusionarConAmbito(sugeridas, delAmbito, catalogo);

    // Expected: delAmbito first (del1, sug2, del2) then sugeridas without duplicates (sug1, sug3) -> but note: sug2 is already in delAmbito so we skip it in sugeridas
    // So we expect: [del1, sug2, del2, sug1, sug3]
    expect(result).toEqual([
      "del1",
      "sug2",
      "del2",
      "sug1",
      "sug3"
    ]);
  });

    it("debe desechar los IDs que no estén presentes en el catálogo", () => {
    const sugeridas = ["sug1", "unknown1", "sug2"];
    const delAmbito = ["del1", "unknown2"];

    // Mock catalog with only some of the IDs
    const catalogo: OpcionCatalogo[] = [
      { id: "del1", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" },
      { id: "sug1", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" },
      { id: "sug2", nombre: "", tipo: "modelo", papeles: [], gratis: null, requiereCuenta: false, enlaceAlta: null, enlaceClave: null, variables: [], privacidad: "local", licencia: null, verificado: null, fuente: "test" }
      // missing unknown1 and unknown2
    ];

    const result = fusionarConAmbito(sugeridas, delAmbito, catalogo);

    // Expected: delAmbito first (del1, unknown2) but unknown2 is not in catalog -> removed
    //          then sugeridas: sug1 (valid), unknown1 (invalid -> removed), sug2 (valid)
    // So we expect: [del1, sug1, sug2]
    expect(result).toEqual(["del1", "sug1", "sug2"]);
  });

    it("debe manejar arreglos vacíos", () => {
    const result = fusionarConAmbito([], [], []);
    expect(result).toEqual([]);
  });
});
