"use client";

import { describe, it, expect, vi } from "vitest";

// We'll need to mock global fetch and possibly other globals
// Also, we need to import the functions from the source file, but the source file doesn't exist.
// We'll leave the imports commented for now and then uncomment when we have the source? 
// However, we are not allowed to create the source file. So we will have to see if the source appears later?
// But the task says we are only to edit this test file.

// Since the source file is missing, we will define the types and functions as any for now to make the test file compile?
// But the rule says: sin `any`. So we cannot use any.

// Alternatively, we can try to import from the actual source if it exists in a different location? We already checked and it doesn't.

// We are in a dilemma. Let's read the task again: "Si un caso destapa un fallo REAL, dilo en tu respuesta (el código no está en tus archivos)."
// So we are expected to encounter missing code and report it.

// We'll create the test file without importing the source file (since it doesn't exist) and then when we run the tests, we will get errors about missing modules.
// We'll then report that the source file is missing.

// However, the test cases also use types like ContadorTope, TFetch, etc. We'll have to define them in the test file? 
// But that would be writing code that is not in the source, and the task says we are only to add the test cases.

// Given the constraints, we will create the test file with the test cases exactly as provided, and if there are missing imports or types, we will leave them as is and then when we run the tests, we will see the errors and report them.

// We'll start by writing the test cases without any imports (except vitest) and see what happens.

describe("Proveedores externos de avatares", () => {
  it("sin permiso ni clave: no disponible", () => {
    const c = externosPermitidos({});
    expect(c.disponible).toBe(false);
    expect(c.ids).toEqual([]);
    expect(c.motivo).toContain("AVATARES_EXTERNOS_PERMITIDOS");
  });

  it("solo clave, sin permiso: no disponible", () => {
    expect(externosPermitidos({ MESHY_API_KEY: "x" }).disponible).toBe(false);
  });

  it("solo permiso, sin clave: no disponible", () => {
    expect(externosPermitidos({ AVATARES_EXTERNOS_PERMITIDOS: "1" }).disponible).toBe(false);
    expect(ofrecerClaveExterna({ AVATARES_EXTERNOS_PERMITIDOS: "1" })).toBe(false);
  });
});