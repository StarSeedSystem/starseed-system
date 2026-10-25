# awesome-design-md en StarSeed

## 1. Para qué sirve (y para qué no)

Es una **biblioteca de lectura**: 84 análisis de interfaces reales, escritos para que un agente de diseño los entienda.
En StarSeed sirve para tres cosas:

1. **Aprender patrones** (cómo organiza un panel de datos, una navegación, un formulario o un héroe un producto bien
   resuelto) y traducirlos al ADN del contexto.
2. **Dar un formato común** para que los agentes de diseño se pasen un sistema de diseño en un solo archivo
   (`DESIGN.md`), el formato que lee Google Stitch. El OS ya tiene el suyo en la raíz del repo (`DESIGN.md`, formato
   numerado, «StarSeed Network»); esta skill ayuda a mantenerlo al día y a crear uno por contexto.
3. **Alimentar al agente de referencias de diseño** (`architecture/agente-referencias-diseno.md`) con un tema nuevo en
   el catálogo de referencias (`inspiracion-ui`).

No sirve para dar identidad. La identidad es el ADN (`memory/diseno/adn/<contexto>/dna.json`, `adn-y-tokens.md`).

## 2. Riesgos de marca

- Cada análisis describe la identidad de una empresa: colores exactos, fuentes (varias propietarias), tono de voz y
  componentes distintivos. Copiar eso en una pieza pública puede ser imitación de imagen comercial.
- Regla de StarSeed: **se estudia el patrón, se descarta la identidad.** Una lectura nunca incluye hexadecimales ni
  nombres de fuente de la marca en lo que se entrega a un diseñador.
- Dentro del OS, ningún `DESIGN.md` ajeno entra en el repo, en la Biblioteca ni en una pieza de usuario. Solo la
  lectura (en nuestras palabras) y el índice.
- Marcas sensibles: las de IA, buscadores o bancos se leen igual, pero nunca se nombran en publicaciones de la red.

## 3. Dónde se usa

| Medio | Cómo |
|---|---|
| Director de diseño (`scripts/puente/diseno_brief.py`) | Añade «patrones de referencia» al brief cuando la pieza es una pantalla o una página (tarea DSN1025B). |
| Agente de referencias de diseño | Nuevo tema `inspiracion-ui` con esta colección como fuente (`referencias.json`). |
| Astraura | Capacidad `design-md` (tarjeta, resumen y completa) para responder «¿cómo se hace un panel así?» y «escribe el DESIGN.md de este contexto». |
| Protomolécula, Estudio de Apps, widgets | Lectura de patrones antes de proponer una pantalla; el resultado va a UiSpec con el ADN. |
| Publicaciones y páginas de la red | Documento `DESIGN.md` por entidad (partido, grupo, evento) a partir de su ADN (tarea DSN1025C). |
| Claude Code / Claude Design | Se instala la skill para que el asistente de Alex pueda leer referencias y escribir `DESIGN.md` igual que los agentes del OS. |

## 4. Con las skills que ya tenemos

- `.agent/skills/design-md` (Stitch): ya existe y **escribe** un `DESIGN.md` a partir de un proyecto de Stitch. Esta
  skill añade las **lecturas** y el puente desde el ADN. Si hubiera solape, manda `design-md` para Stitch y esta para
  el resto.
- `design-taste-frontend`: el método y la crítica; esta aporta ejemplos concretos de otros productos.
- `frontend-slides`: para diapositivas se leen las plantillas de su paquete, no estos análisis (son de web).
- `starseed-estudio-audiovisual`: fuente de verdad de la marca; esta skill nunca la contradice.
