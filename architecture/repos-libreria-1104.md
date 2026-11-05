# Ola 1104 · Cinco repos nativos: EGM, OpenUI, BAMA, MotionSites y DeepTutor

> Contrato de la tanda `config/repos-libreria-1104.json` (módulo `src/lib/library/repos-1104.ts`).
> Pedido de Alex del 2026-11-04: «agrega estas repos a la librería de StarSeed OS e instálalas en el
> funcionamiento predeterminado natal de todo StarSeed OS en donde corresponda». Se lee ANTES de tocar
> cualquiera de estas fichas o su integración. La cola que lo cablea es `olas/cola-repos-1104.json`
> (Ola 1104R).

## 0 · Reglas que no cambian

1. Instalar en la Librería SOLO registra el enlace (cero descarga, cero ejecución, cero clave). Lo nativo
   es código propio de StarSeed OS que sigue el patrón del repo; nunca se vendoriza el repo entero.
2. Gratis primero: todo corre con los modelos gratuitos del OS (freellmapi, Ollama, NIM gratuito, enjambre).
   Ninguna clave nueva; ninguna pasarela de pago (OpenUI Gateway queda fuera).
3. Nada de telemetría: `OPENUI_TELEMETRY_DISABLED=1` y `DO_NOT_TRACK=1` en cada `npm ci` (workflows de
   GitHub y `deploy/oracle/nodo/preparar-a1.sh`); `OPENUI_RUNTIME_TELEMETRY_ENABLED` nunca se pone.
4. Nada que ocupe GB en la Mac ni en el A1 sin el visto bueno de Alex (Xcode, la imagen de DeepTutor).
5. Cada pieza nueva con su prueba; módulos puros sin `node:fs` cuando los importa el cliente (CLAUDE.md,
   trampa 11).

## 1 · Qué es cada uno (la verdad, sin adornos)

| Ficha | Qué es de verdad | Licencia | Versión seguida |
|---|---|---|---|
| `lib-egm` | Patrón de trabajo de agentes: un **elefante** con todo el contexto redacta; **peces** sin contexto lo revisan; una persona aprueba. Siete habilidades `/egm-*`. **No es un modelo que se entrene.** | Apache-2.0 | releases `v0.1.0` |
| `lib-openui` | Interfaz generativa: el modelo escribe OpenUI Lang (compacto, en streaming) y `Renderer` de `@openuidev/react-lang` lo pinta con la biblioteca de componentes que la app define (props en Zod). | MIT | etiquetas `@openuidev/react-lang@X.Y.Z` (hoy 1.1.0) |
| `lib-bama` | 21 habilidades para construir apps **nativas de Mac** en Swift 6.2 + SwiftUI + SwiftData (clonar, historias, diseño, construir y verificar con capturas). Exige macOS 26 y Xcode 26. | MIT | commits (`639893c`) |
| `lib-motionsites` | Habilidad de páginas de aterrizaje «de premio»: estudia referencias, elige medios, escribe la especificación, construye y se corrige con capturas contra una rúbrica; 55+ recetas de técnica. | MIT (código e indicaciones); prompts y medios © MotionSites | releases `v1.0.0` |
| `lib-deeptutor` | Servicio de aprendizaje (FastAPI + Next.js, puerto 3782): tutoría con bases de conocimiento, resolver, cuestionarios, práctica, camino de maestría, investigación con citas, MCP y memoria por capas. | Apache-2.0 | releases `v1.7.1` |

## 2 · EGM → el aprendizaje de cada agente, personalidad y bot (grupo `agentes`)

Lo que Alex pidió («mejorar el aprendizaje autónomo de cada agente y personalidad y bot con las memorias
de los cerebros») se cumple así:

- **Elefante = el perfil con su cerebro.** El agente, la personalidad o el bot redacta con su contexto
  completo: su cerebro (`src/lib/cerebro/brain-memories.ts`, `src/lib/cerebros/`), sus cápsulas
  (`src/lib/memorias/`) y lo que el usuario le dio.
- **Peces = revisores sin contexto.** 2 a 3 llamadas a modelos gratuitos distintos que solo ven el
  artefacto (la propuesta, la respuesta larga, el plan), nunca el cerebro. Cada uno devuelve objeciones
  con gravedad (`bloquea` · `importa` · `menor`).
- **Resolver = aprender.** Las objeciones `bloquea`/`importa` que el elefante acepta y corrige se guardan
  en el cerebro del perfil como recuerdo de tipo `leccion` (con la objeción, la corrección y la fecha);
  las rechazadas se guardan con su porqué. Es el mismo principio que `director_aprendizaje.py`: hechos,
  no opiniones.
- **Dónde corre por defecto:**
  - `src/lib/agents/egm/` (TS puro): `revisarConPeces(artefacto, opciones)` → objeciones;
    `leccionesDe(objeciones, resueltas)` → recuerdos para el cerebro. Lo usan Astraura y la Protomolécula
    antes de una respuesta larga o una creación (apps, páginas, publicaciones), si el perfil lo tiene
    activo en sus ajustes de respuesta (`src/lib/astraura/ajustes-respuesta.ts`; por defecto: activo
    para creaciones, apagado para charla).
  - `scripts/puente/egm_revision.py` (Python puro + llamada a modelos gratuitos): las direcciones de
    Genesis, PoliGenesis y MetaGenesis revisan con peces las olas que proponen la imaginación y el
    autodesarrollo ANTES de encolarlas; una ola con una objeción `bloquea` sin resolver no entra.
- Para Claude Code queda el plugin (`claude plugin marketplace add google/elephant-goldfish-model` →
  `claude plugin install egm@egm`), que usa Opus en sus olas grandes.

## 3 · OpenUI → respuestas con interfaz viva en todos los medios (grupo `respuestas`)

- **Dependencia:** `@openuidev/react-lang` 1.1.0 exacta (MIT), instalada con la telemetría apagada.
- **Biblioteca StarSeed** en `src/lib/openui/`: componentes Trinity (tarjeta, tabla, gráfica, lista de
  pasos, formulario, línea de tiempo, comparación, galería, mapa de conceptos, botón de acción del OS)
  definidos con `defineComponent` + Zod; `promptDeSistema()` sale de esa biblioteca (no se escribe a mano).
- **Renderer** en `src/components/openui/respuesta-viva.tsx`: pinta en streaming dentro del chat de
  Astraura, de los bots y de las personalidades; un bloque de la Protomolécula (`bloque-protomolecula`)
  y del lienzo de creación universal; un widget; y una página de publicación. Si el modelo no devuelve
  OpenUI Lang válido, se muestra el texto tal cual (nunca una pantalla rota).
- **Ajustes:** cada perfil decide en sus ajustes de respuesta «Interfaz viva · Solo texto · Automático»
  (por defecto Automático: interfaz cuando la respuesta tiene datos, pasos o comparaciones).
- Los botones de acción solo llaman a acciones del OS ya permitidas para ese perfil; nada se ejecuta sin
  el permiso que ya pide el OS.

## 4 · BAMA → apps nativas de cualquier sistema, también del propio StarSeed OS (grupo `apps-nativas`)

- **Hoy:** la Mac tiene macOS 26.3.1 pero solo las Command Line Tools (Swift 6.0.2) y ~10 GB libres;
  Xcode 26 ocupa más de 10 GB. **Instalar Xcode es decisión de Alex.** Hasta entonces BAMA no construye:
  planifica.
- **Plan en Genesis** (`src/lib/appgen/`, `src/lib/genesis/`): el generador de apps ofrece el destino
  «Nativa · macOS (BAMA)» que produce el paquete de planificación de BAMA (clonado de pantallas,
  historias con criterios de aceptación, kit de diseño Trinity traducido a SwiftUI) y lo guarda como
  proyecto de la Librería. Requisitos visibles en la ficha antes de construir.
- **Versiones personalizadas:** cada app nativa (y cada variante del propio StarSeed OS) se publica como
  rama pública o compartible en la Librería (`publishBranch`), con su versión.
- La app de escritorio de StarSeed OS sigue en Tauri; una versión SwiftUI de StarSeed OS es un proyecto
  aparte que espera a Xcode.

## 5 · MotionSites → habilidades creativas de páginas y publicaciones (grupo `diseno`)

- Sus **recetas de técnica, reglas y rúbrica** (MIT) entran como referencia de los agentes diseñadores
  en `src/lib/agents/referencias-diseno/motionsites.ts`: nombre de la técnica, cuándo usarla y el enlace
  a la receta en el repo. Nunca el texto completo ni los medios.
- Lo usan las habilidades que generan páginas: publicaciones (`src/lib/publicacion/`), páginas de grupos y
  comunidades, fichas de la Librería y el lienzo universal, **siempre con la identidad Trinity** y el
  director de diseño (`scripts/puente/director-diseno.py`), que aplica la rúbrica de MotionSites como
  segunda lista de comprobación.
- **Prohibido:** copiar sus prompts de ejemplo o su estante de medios al repo, a la Librería o a una
  publicación (son © MotionSites).

## 6 · DeepTutor → agentes y bots educativos (grupo `educacion`)

- **Habilidad educativa nativa** en `src/lib/education/tutor.ts`: cuando alguien pide entender o aprender
  un concepto, Astraura (y cualquier bot o agente educativo) responde con el método de DeepTutor —
  explicar, comprobar con una pregunta, practicar, resumir — usando las memorias del cerebro como base
  de conocimiento y la interfaz viva de OpenUI (§3) para cuestionarios y tarjetas. Sin servidor.
- **Conector opcional** en `src/lib/conectores-propios/` («DeepTutor · servidor propio», URL + token en
  variables de entorno): si hay un DeepTutor alojado (A1 cuando su disco tenga margen, un servidor de la
  cuenta o una neurona con sitio), Astraura le delega tutoría, cuestionarios e investigación con citas.
  Sin conector, la habilidad nativa sigue funcionando.
- Alojar DeepTutor en el A1 (`pip install -U deeptutor` o la imagen `ghcr.io/hkuds/deeptutor`, puerto
  3782 solo en 127.0.0.1) **espera el visto bueno de Alex** por el disco.
- Los grupos de estudio y la sección de educación (OpenMAIC, OSSU, `src/lib/education/`) lo enlazan.

## 7 · Comprobación

- `vitest run src/lib/library/__tests__/repos-1104.test.ts` (fichas) y las pruebas de cada pieza.
- La Librería muestra las cinco fichas (pestaña Apps; buscar «ola-1104»).
- La ruta `/api/library/actualizaciones` las sigue por su canal (se recuperan por upstream como las de la
  1027 y la 1101, porque se pintan como `app`).
