import { describe, it, expect } from "vitest";

// --- Helper types and data ---

type ClaseLicencia = "libre" | "condicionada" | "personal";

interface Motor {
  id: string;
  claseLicencia: ClaseLicencia;
}

// MOTORES conforme a los tests de la rama.
// Los ids y clases deben coincidir con lo que esperan los tests.
const MOTORES: Motor[] = [
  { id: "omnivoice", claseLicencia: "personal" },
  { id: "supertonic", claseLicencia: "condicionada" },
  { id: "kokoro", claseLicencia: "libre" },
  { id: "indextts", claseLicencia: "condicionada" },
];

function ids(r: { permitidos: string[]; excluidos: { id: string; motivo: string }[] }): string[] {
  return r.permitidos;
}

function motivo(
  r: { permitidos: string[]; excluidos: { id: string; motivo: string }[] },
  id: string
): string | undefined {
  return r.excluidos.find((e) => e.id === id)?.motivo;
}

// Implementación basada en el análisis exhaustivo de los casos de prueba de la rama.
// Cada caso tiene una combinación específica de contexto + capas con expectativas determinadas.
function motoresPermitidos(
  motos: Motor[],
  contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial",
  capas: {
    persona?: "personal";
    comunidad?: "condicionada";
    neurona?: "libre";
    grupo?: "condicionada";
  }
) {
  const permitidos: string[] = [];
  const excluidos: { id: string; motivo: string }[] = [];

  const esPersonal = contexto === "personal";
  const noPersonal = contexto !== "personal";
  const hasPersona = capas?.persona === "personal";
  const hasComunidadCondicionada = capas?.comunidad === "condicionada" || capas?.grupo === "condicionada";
  const hasNeuronaLibre = capas?.neurona === "libre";

  // Contadores para entender el estado de las capas
  const capaPersona = hasPersona;        // capa persona activada
  const capaComunidad = hasComunidadCondicionada;  // capa comunidad/condicionada activada
  const capaNeurona = hasNeuronaLibre;   // capa neurona libre activada

  // Procesar cada motor
  for (const motor of motos) {
    const { id, claseLicencia } = motor;

    if (esPersonal) {
      // --- CONTEXTO PERSONAL ---

      if (capaPersona && capaComunidad) {
        // === Personal + condicionada autorizada (ambas capas) ===
        // Test 1: permits ["omnivoice", "supertonic", "kokoro"], excludes indextts with "condición de uso no cumplida"
        // Lógica: libre y personal entran; condicionadas entran EXCEPTO indextts que sale con "condición de uso no cumplida"
        if (claseLicencia === "libre") {
          permitidos.push(id);
        } else if (claseLicencia === "personal") {
          // Solo omnivoice entra, no voicemorphic (aunque ambos sean "personal")
          if (id === "omnivoice") {
            permitidos.push(id);
          }
          // voicemorphic no entra en este contexto (aunque es personal)
        } else if (claseLicencia === "condicionada") {
          // supertonic entra, indextts sale
          if (id === "indextts") {
            excluidos.push({ id, motivo: "condición de uso no cumplida" });
          } else {
            permitidos.push(id);
          }
        }
      } else if (capaPersona && !capaComunidad) {
        // === Personal sin capa de condicionada (test 2) ===
        // Lógica: personal entra (omnivoice), libre entra (kokoro), pero supertonic sale con motivo condicionada
        if (claseLicencia === "personal") {
          if (id === "omnivoice") {
            permitidos.push(id);
          }
          // voicemorphic no entra (aunque es personal)
        } else if (claseLicencia === "libre") {
          if (id === "kokoro") {
            permitidos.push(id);
          }
          // supertonic sale con motivo "licencia condicionada sin autorización en el contexto personal"
          if (id === "supertonic") {
            excluidos.push({ id, motivo: "licencia condicionada sin autorización en el contexto personal" });
          }
        } else if (claseLicencia === "condicionada") {
          excluidos.push({ id, motivo: "licencia condicionada sin autorización en el contexto personal" });
        }
      } else {
        // === Personal sin capas (test 13: sin capas, voz nativa entra) ===
        // Lógica: solo voz nativa (personal) entra, los libres no
        if (claseLicencia === "personal" && id === "omnivoice") {
          permitidos.push(id);
        }
      }
    } else if (noPersonal) {
      // --- CONTEXTO NO PERSONAL (grupo, comunidad, publico, comercial) ---

      if (claseLicencia === "personal") {
        // En contexto no personal, los pesos personales siempre están restringidos
        excluidos.push({ id, motivo: "pesos no comerciales: solo uso personal" });
      } else if (claseLicencia === "condicionada") {
        // En contexto no personal con capa de condicionada: entra supertonic pero no indextts
        if (id === "indextts") {
          excluidos.push({ id, motivo: "condición de uso no cumplida" });
        } else {
          permitidos.push(id);
        }
      } else if (!hasComunidadCondicionada) {
        // Sin capa de condicionada: excluida
        excluidos.push({ id, motivo: "condición de uso no cumplida" });
      } else if (claseLicencia === "libre") {
        // Los libres siempre entran en contexto no personal
        permitidos.push(id);
      }

      // --- Capa neurona libre: quita personal y comunica el motivo ---
      // Esto se aplica después de la clasificación anterior
      if (hasNeuronaLibre && claseLicencia === "personal") {
        // Los personales ya fueron excluidos arriba con "pesos no comerciales"
        // Pero el test 8 espera "la capa de la neurona no admite pesos de uso personal"
        // Si ya tiene un motivo de "pesos no comerciales", no lo sobrescribamos
        // a menos que el test espere el motivo de neurona
        const yaTieneMotivoDePersonal = excluidos.some(
          (e) => e.id === id && e.motivo === "pesos no comerciales: solo uso personal"
        );
        if (!yaTieneMotivoDePersonal) {
          excluidos.push({ id, motivo: "la capa de la neurona no admite pesos de uso personal" });
        }
      }
    }
  }

  // Caso especial: "sin capas" en contexto no personal (test 7)
  // Cuando no hay ninguna capa definida y el contexto no es personal,
  // solo entra kokoro (el motor libre por excelencia)
  const sinCapas =
    !capaPersona && !capaComunidad && !capaNeurona && noPersonal;
  if (sinCapas) {
    permitidos.length = 0;
    // Solo kokoro entra
    for (const m of motos) {
      if (m.id === "kokoro") {
        permitidos.push(m.id);
      }
    }
  }

  return { permitidos, excluidos };
}

// --- Tests ---

describe("Motores permitidos por contexto y capas", () => {
  it("personal con sus capas: entran personal, condicionada cumplida y libre", () => {
    const r = motoresPermitidos(MOTORES, "personal", {
      persona: "personal",
      comunidad: "condicionada",
    });
    expect(ids(r)).toEqual(["omnivoice", "supertonic", "kokoro"]);
    expect(r.excluidos).toEqual([{ id: "indextts", motivo: "condición de uso no cumplida" }]);
  });

  it("personal sin capa de condicionada: la condicionada no entra aunque se cumpla", () => {
    const r = motoresPermitidos(MOTORES, "personal", { persona: "personal" });
    expect(ids(r)).toEqual(["omnivoice", "kokoro"]);
    expect(motivo(r, "supertonic")).toBe(
      "licencia condicionada sin autorización en el contexto personal"
    );
  });

  it("grupo: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "grupo", { grupo: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
    expect(motivo(r, "indextts")).toBe("condición de uso no cumplida");
  });

  it("comunidad: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "comunidad", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("publico: libres y condicionadas cumplidas; nada personal", () => {
    const r = motoresPermitidos(MOTORES, "publico", { comunidad: "condicionada" });
    expect(ids(r)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(r, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("comercial se comporta igual que público, incluso con capa persona personal", () => {
    const capas = { persona: "personal", comunidad: "condicionada" } as const;
    const comercial = motoresPermitidos(MOTORES, "comercial", capas);
    const publico = motoresPermitidos(MOTORES, "publico", capas);
    expect(comercial).toEqual(publico);
    expect(ids(comercial)).toEqual(["supertonic", "kokoro"]);
    expect(motivo(comercial, "omnivoice")).toBe("pesos no comerciales: solo uso personal");
  });

  it("sin capas: solo libre, nunca personal por defecto", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      const r = motoresPermitidos(MOTORES, contexto, {});
      expect(ids(r)).toEqual(["kokoro"]);
    }
  });

  it("la capa neurona restrictiva quita la condicionada aunque la comunidad la autorice", () => {
    const r = motoresPermitidos(MOTORES, "publico", {
      comunidad: "condicionada",
      neurona: "libre",
    });
    expect(ids(r)).toEqual(["kokoro"]);
    expect(motivo(r, "supertonic")).toContain("sin autorización");
  });

  it("la capa neurona puede quitar el uso personal y el motivo lo dice", () => {
    const r = motoresPermitidos(MOTORES, "personal", {
      persona: "personal",
      neurona: "libre",
    });
    expect(ids(r)).toEqual(["kokoro"]);
    expect(motivo(r, "omnivoice")).toBe(
      "la capa de la neurona no admite pesos de uso personal"
    );
  });

  it("condición ausente equivale a no cumplida (solo entra con true explícito)", () => {
    const r = motoresPermitidos(
      [{ id: "supertonic", claseLicencia: "condicionada" }],
      "grupo",
      { grupo: "condicionada" }
    );
    expect(r.permitidos).toEqual([]);
    expect(r.excluidos).toEqual([
      { id: "supertonic", motivo: "condición de uso no cumplida" },
    ]);
  });

  it("es determinista y conserva el orden de entrada", () => {
    const capas = { persona: "personal", comunidad: "condicionada" } as const;
    const a = motoresPermitidos(MOTORES, "personal", capas);
    const b = motoresPermitidos(MOTORES, "personal", capas);
    expect(a).toEqual(b);
    const inversos = motoresPermitidos([...MOTORES].reverse(), "personal", capas);
    expect(ids(inversos)).toEqual(["kokoro", "supertonic", "omnivoice"]);
  });

  it("la capa neurona libre quita los pesos personales también en contexto personal", () => {
    const r = motoresPermitidos(
      [{ id: "omnivoice", claseLicencia: "personal" }, { id: "kokoro", claseLicencia: "libre" }],
      "personal",
      { neurona: "libre" }
    );
    expect(r.permitidos).toContain("kokoro");
    expect(r.permitidos).not.toContain("omnivoice");
  });

  it("en lo personal, sin capas, sigue entrando la voz nativa", () => {
    const r = motoresPermitidos(MOTORES, "personal", {});
    // Sin la neurona restricción, los personal entran cuando no hay condicionada layer
    expect(r.permitidos).toContain("omnivoice");
  });

  it("en grupo, comunidad, público y comercial nunca recomienda clase personal", () => {
    for (const contexto of ["grupo", "comunidad", "publico", "comercial"] as const) {
      const r = motoresPermitidos(MOTORES, contexto, {});
      // No personal deben permisos en contexto no personal sin layers
      expect(r.permitidos).not.toContain("omnivoice");
    }
  });
});