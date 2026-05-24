# 🧠 `memory/` — Memoria persistente del proyecto

> Esta carpeta contiene el contexto profundo del proyecto que debe sobrevivir entre sesiones de trabajo. Cualquier agente IA (Claude, otros) o persona que llegue al proyecto debe leer estos archivos para tener contexto completo.

## Índice

| Archivo | Para qué sirve |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | **Empieza aquí.** Memoria de trabajo: índice maestro, estado actual, instrucciones operativas. |
| [`principles.md`](principles.md) | Desarrollo extendido de la Tríada Ideológica con implicaciones técnicas concretas. |
| [`roadmap.md`](roadmap.md) | Roadmap técnico de 3 fases (Semilla → Fruto → Cosecha) con hitos verificables. |
| [`architecture.md`](architecture.md) | Decisiones arquitectónicas vivas. Modelo A.N.T. de 3 capas, stack, schema, federación. |
| [`state.md`](state.md) | **Bitácora cronológica de cambios.** Cada sesión añade una entrada aquí al final. |
| [`glossary.md`](glossary.md) | Glosario completo de términos StarSeed (sistema, ideología, arquitectura, etc.). |

## Cómo usar esta carpeta

### Si eres un agente IA empezando una sesión nueva
1. Lee `../CLAUDE.md` completo.
2. Lee la última entrada de `state.md` para saber qué se hizo en la sesión anterior y qué quedó pendiente.
3. Lee el archivo específico del área en que vas a trabajar (`roadmap.md` para planificar, `architecture.md` para decisiones de stack, `principles.md` para validar features).
4. Al terminar tu sesión, **añade una entrada al final de `state.md`** describiendo qué hiciste.

### Si eres una persona contribuyendo al proyecto
1. Lee `../CLAUDE.md` para entender qué es esto.
2. Lee `principles.md` para entender los valores no negociables.
3. Lee `roadmap.md` para ver dónde encaja tu contribución.
4. Si tu contribución cambia una decisión arquitectónica, **actualiza primero `architecture.md`** (regla dorada del proyecto), luego implementa.

## Cómo actualizar esta carpeta

- **`state.md`**: SIEMPRE añadir, nunca borrar entradas. Es historia.
- **`principles.md`**: Cambios solo si la Constitución cambia (cláusula pétrea). Refinamientos OK.
- **`roadmap.md`**: Puede actualizarse con frecuencia. Cambios grandes requieren consenso (issue + discusión).
- **`architecture.md`**: Antes de cambiar el código de una decisión arquitectónica, actualiza este doc primero.
- **`glossary.md`**: Añade términos nuevos según aparezcan. Respeta orden alfabético dentro de cada sección.

## Fuentes externas autoritativas

Cuando esta memoria local entra en conflicto con los documentos fundacionales de Drive, **los documentos de Drive tienen prioridad** (son la Constitución viva):

- [Constitución de la Sociedad StarSeed](https://docs.google.com/document/d/1XpltI3gkYN1Ma2wBVrlisPagL_HfeoF1RsnFKG09w4I/edit)
- [Manifiesto Fundacional](https://docs.google.com/document/d/1YiX9QK_JJHbmRMRj8fXrJeNffsDQ8T2RhzMHTeyavA0/edit)
- [Codex StarSeed](https://docs.google.com/document/d/1Q7ygZvMlrVD4I7nO36jC4t8ttFezw__2K_w54L6HXNc/edit)
- [Documento Maestro del SOSD](https://docs.google.com/document/d/1DaX2bl8dIMSKR1yVtOHqh3iVtV_sLARMiSPFGkywa3M/edit)

Cuando un documento de Drive cambie, esta memoria debe sincronizarse en la siguiente sesión y registrarse en `state.md`.
