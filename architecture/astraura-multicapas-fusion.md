# Astraura multicapas · el mapa de la fusión (2026-10-28)

**Alex (2026-10-28):** «todos deben ser fusionados, recuerda».

**La regla:** ningún sistema nuevo es un sistema aparte. Cada uno entra por **una puerta que ya existe** y la usa todo lo
demás: las capas, los agentes, los bots, las personalidades, el Mausbot, la orbe, el Exocórtex y la Protomolécula. Si un
repo trae su propio agente, su propia memoria o su propia app, se toma la pieza que falta y se deja el resto en la
Biblioteca.

## Las puertas

| Puerta (dónde está) | Qué decide | Lo que entra por ella |
|---|---|---|
| **Planificador de capas** (`src/lib/astraura/capas/planificador.ts`, `config/capas-astraura.json`) | qué motor responde cada capa, por tarea, medio, privacidad y lo que cabe | Needle 3 (reflejo), BitNet 1.58 (memoria y razón), Bonsai, **Colibri** (`architecture/colibri-multicapas.md`), los de la nube; medidas por neurona que reordenan (CLB1027G) |
| **Juicio** (`scripts/puente/decidir.py` → `jev.py`) | sí/no, elegir y puntuar con probabilidad, barato | Laya, GLiNER2.5-Decide y Clef (por Colibri, contrato `/v1/systemone`), BitNet local, OpenRouter con tope; pautas aprendidas (Meta^n) |
| **Recordar** (`recordar`, LNN1028F; antes `recordarDeCapsulas`) | qué recuerdos entran en la respuesta, con el alcance de quien pregunta | **Memvid** (cápsulas: historia, tiempo, cifrado; `architecture/memvid-capsulas.md`) + **LEANN** (significado; `architecture/leann-recuerdo-semantico.md`) + los destinos de memoria de los cerebros |
| **Alcance** (`src/lib/nucleo/alcance-memoria.ts`) | quién ve qué: personal › perfil › grupo › pública | todo lo anterior; nada sube de alcance |
| **Fábrica de aprendizaje** (`src/lib/astraura/aprendizaje/fabricas.ts`, `destino-adaptador.ts`) | cómo mejora cada capa | **pesos** (Needle colectivo, QVAC, Soup, onebitllms) · **orden** (medidas) · **proceso** (**Meta^n**, `architecture/automejora-meta-n.md`) |
| **Permisos para actuar** (`src/lib/astraura-bots/permisos.ts`, `decidirUi`, permisos de la neurona) | qué puede hacer un agente en el OS | bots, agentes, el **cursor del agente** del Mausbot, el control de pantalla |
| **Cuerpo y presencia** (orbe `quantum-orb-bus.ts`, Exocórtex, avatares) | cómo se ve y se oye Astraura | **Mausbot** (`architecture/mausbot-astraura.md`), voces, avatares 3D |
| **Disponibilidad y malla** (colmena, MetaGenesis, presencia, servidor de cerebro) | qué neurona trabaja y sirve | **neurona insomne** (Insomnia, `architecture/neurona-insomne.md`), el A1, contenedores, apps en la malla |
| **Creación** (Protomolécula) | diseñar y producir | átomos nuevos (Mausbot, pautas, cápsulas compartidas como moléculas) |
| **Biblioteca** (tandas `config/repos-libreria-*.json`) | qué versión de cada repo y cuándo subirla | todos los repos, autoactualizados por su canal |

## Un ejemplo, de punta a punta

Una persona le pregunta a su personalidad «¿qué decidimos del café?»:

1. **Juicio:** decide que hace falta recordar.
2. **Recordar:** busca a la vez en las cápsulas de su perfil, su personalidad y su cerebro.
   - Memvid por palabras y por fecha.
   - LEANN por significado, solo con lo de su alcance.
   - Funde los dos, filtra y comprueba que nada personal se vaya a una nube.
3. **El planificador** elige el motor que cabe en esa neurona: BitNet local, Colibri o la nube, con las pautas activas de
   esa capa (Meta^n).
4. **La orbe y el Mausbot** ponen cara de «pensando» y luego de «hablando».
5. Si la respuesta propone abrir la página del café, **el cursor del agente** la señala y pregunta (nivel «proponer»).
6. **La experiencia** queda anotada: la cápsula de la personalidad (Memvid) y su índice (LEANN) crecen. Si se confirma que
   acertó, mañana Meta^n y el adaptador colectivo aprenden de ella.
7. Si la Mac de la persona está **insomne**, todo esto sigue funcionando con la tapa cerrada para sus otras neuronas.

## Dónde corre cada cosa hoy (medido el 2026-10-28)

- **Mac (8 GB, 2,6 GB de disco libres):** Genesis, el orquestador, BitNet local, Jev, el Mausbot y la lectura de
  Insomnia.
  - Memvid llega por un binario compilado en Actions.
  - Nada pesado: ni LEANN ni Colibri.
- **A1 (11–12 GB, 16 GB de disco, Docker y cargo):** tres trabajadores del enjambre (uno menos con Colibri o de noche),
  FreeLLMAPI, Colibri juicio, Meta^n de noche en su caja, LEANN con Ollama bajo demanda y Memvid.
- **GitHub Actions:** escritores del enjambre y comprobaciones (tsc, pruebas y `cargo test`), y los binarios de la Mac.

## Olas que lo llevan

| Ola | Qué | Contrato |
|---|---|---|
| MBT1027 | Mausbot | `architecture/mausbot-astraura.md` |
| INS1027 | neurona insomne | `architecture/neurona-insomne.md` |
| CLB1027 | Colibri en las capas | `architecture/colibri-multicapas.md` |
| MTN1027 | Meta^n | `architecture/automejora-meta-n.md` |
| MVD1027 | Memvid | `architecture/memvid-capsulas.md` |
| LNN1028 | LEANN | `architecture/leann-recuerdo-semantico.md` |
| DEC1028 | decisiones de Alex | trabajadores del A1 y «pasarelas de repuesto» |

Cada ola nueva que añada un sistema **actualiza esta tabla y la de las puertas** en la misma tarea en que lo conecta.
