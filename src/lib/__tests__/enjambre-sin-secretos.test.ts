import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Por qué existe este test (2026-09-06, Ola 259): el orquestador del enjambre y el lanzador
// de la nube ahora están versionados en `scripts/enjambre/`, y hablan con APIs con clave.
// La regla permanente es que las claves nunca tocan el repo (solo nombres de variable en
// `~/.starseed/env` y `~/.hermes/.env`). Este test es la puerta que lo hace cumplir: si un día
// alguien pega una clave real en un hotfix, el commit falla aquí y no en una filtración.

const ENJAMBRE = join(process.cwd(), "scripts", "enjambre");
const FICHEROS = ["starseed-enjambre.py", "lanzador.py"] as const;

// Patrones de secretos conocidos: OpenAI (sk-…), NVIDIA NIM (nvapi-…), Google (AIza…),
// HuggingFace (hf_…), un Bearer literal, y asignaciones `_KEY = "valor-largo"` en Python.
const PATRONES_SECRETO: Array<{ nombre: string; regex: RegExp }> = [
  { nombre: "clave OpenAI (sk-…)", regex: /sk-[A-Za-z0-9]{8,}/ },
  { nombre: "clave NVIDIA NIM (nvapi-…)", regex: /nvapi-[A-Za-z0-9]+/ },
  { nombre: "clave Google (AIza…)", regex: /AIza[0-9A-Za-z_-]{10,}/ },
  { nombre: "token HuggingFace (hf_…)", regex: /hf_[A-Za-z0-9]{10,}/ },
  // Un cabezazo `Bearer <token largo>` literal en el código sería una clave incrustada.
  { nombre: "Bearer con token literal", regex: /Bearer [A-Za-z0-9]{16,}/ },
  // Asignación Python tipo ALGO_KEY = "abcdef1234567890" con 16+ caracteres.
  { nombre: "asignación _KEY con valor literal", regex: /_KEY\s*=\s*['"][A-Za-z0-9]{16,}/ },
];

describe("orquestador versionado sin secretos", () => {
  for (const fichero of FICHEROS) {
    describe(fichero, () => {
      const ruta = join(ENJAMBRE, fichero);
      const contenido = readFileSync(ruta, "utf8");

      it("existe y no está vacío", () => {
        expect(statSync(ruta).size).toBeGreaterThan(0);
        expect(contenido.length).toBeGreaterThan(0);
      });

      for (const { nombre, regex } of PATRONES_SECRETO) {
        it(`no contiene ${nombre}`, () => {
          expect(contenido.match(regex)).toBeNull();
        });
      }
    });
  }

  it("starseed-enjambre.py incluye `def repo_es_python` (puertas Python, Ola 259)", () => {
    // Marca de la versión actual: si alguien sobrescribe el archivo con una copia vieja
    // sin las puertas Python (py_compile + pytest), este test lo delata.
    const contenido = readFileSync(join(ENJAMBRE, "starseed-enjambre.py"), "utf8");
    expect(contenido).toContain("def repo_es_python");
  });
});
