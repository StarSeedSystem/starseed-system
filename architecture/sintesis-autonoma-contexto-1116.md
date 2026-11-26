# Síntesis diaria autónoma, con avances en el chat y agentes con memoria completa (ola SIN1116)

## 1. Pedido de Maggasukha (2026-11-16, 17:39 México)

> No he recibido avances de la síntesis diaria autónoma de MetaGenesis en el chat de la síntesis, sin depender de
> Claude. Desde ayer el chat dice que Higgsfield cayó y los directores no lo solucionaron.
>
> Arregla todo y deja funcionando la síntesis diaria autónoma, con progreso autoevolutivo. Mejora los contextos de los
> agentes: proponen sugerencias muy básicas que ya están integradas. Les falta memoria de contextos completos y
> recuerdos relevantes con:
> - el estado en progreso de la producción audiovisual;
> - las investigaciones de los contactos;
> - las recomendaciones para los próximos pasos, con el conocimiento del estado más reciente de todo StarSeed y de lo ya
>   desarrollado e investigado.
>
> Que integren los aprendizajes de forma progresiva, con las memorias completas adecuadas para cada agente y todas las
> herramientas, conexiones, habilidades, accesos, proveedores, contenedores y capacidades de MetaGenesis. Que todo esté
> programado y dirigido desde los chats de la síntesis.

## 2. Diagnóstico (2026-11-16, 23:30 UTC)

1. **No hubo síntesis el 15 ni el 16.**
   - **El agente nativo nunca redacta.** `agente_sintesis._clave_flota()` lee `~/.starseed/env` buscando líneas
     `NOMBRE=…`, pero el archivo usa `export FREELLMAPI_KEY=…`. Así que no hay clave, `_redactar_flota` devuelve
     `None` y el respaldo de las 07:54 no escribe.
     - Comprobado en la Mac: `clave False`.
     - Estado: `fase: entregar`, `sintesis_path: null`, `respaldo: false`, con 7 tareas encoladas cada día.
   - Además pide el modelo fijo `groq/llama-3.3-70b-instruct`, que FreeLLMAPI no sirve.
2. **Las tareas que garantizaban la síntesis se perdieron.** SIN1114C (respaldo de las 08:30 en el A1) y SIN1114D
   (limpieza) quedaron «huérfanas: ninguna cola fuente la define ya». Nadie las rehízo ni avisó. `estado.json` del bot
   sigue en `sintesis: 2026-11-13`.
3. **El multiformato no tiene qué procesar.** Repite cada 15 min «Síntesis 2026-11-14 fuera de rango».
4. **«Higgsfield cayó» es un fallo del sanador, no de Higgsfield.** `higgsfield account` responde en el A1. El sanador
   (SES1113I) falla por sus propios fallos:
   - higgsfield: `[Errno 2] No such file or directory: 'account'` (argv mal construido);
   - notebooklm: `name 'subprocess' is not defined` (falta un import);
   - escalado: «sin canal de envío».

   Los directores no lo trataron como una avería de su propio código.
5. **Los agentes de la síntesis trabajan sin contexto.** Proponen lo que ya existe.
   - Ya existe `contexto_agente.py`, con reglas, área, herramientas y recuerdos LEANN por rol, y la libreta por ámbito
     (JLA1116), pero `agente_sintesis` no los usa.
   - Sus 7 informes del 14 dieron 0 propuestas en contactos, noticias y YouTube, y 1–5 genéricas en el resto.

**Puntual (Claude, 23:41 UTC).** `~/.starseed/peticiones/sintesis_hoy.py 2026-11-16` corre en el A1:
- investigación profunda;
- el informe con el protocolo completo;
- la regla de calidad «nada que ya figure como integrado»;
- los 9 formatos al chat.

Usa como fuente un **«Contexto vivo de StarSeed 2026-11-16»**, que generó Claude:
- lo integrado en 10 días por ola;
- los títulos de los 400 contratos de `architecture/`;
- `memory/workflow-actual.md`;
- los informes de los agentes de hoy;
- el estado de la síntesis nativa;
- la lista de fichas de alcance.

Ese generador (`~/.starseed/herramientas/contexto_vivo.py` en la Mac) es el modelo para SIN1116D.

## 3. Diseño

### 3.1 Que la síntesis salga sola todos los días (sin Claude)

- **Una sola lectura de claves para todo el puente** (`entorno.leer_clave(nombre)`): acepta `export NOMBRE=…`,
  `NOMBRE=…` y comillas, y nunca imprime.
- **El redactor** usa el enrutador gratuito con modelos con nombre que funcionan hoy. El orden es el de `llm()` del bot:
  `gemini-flash-lite`, NIM `minimax-m3.1-flash` y `nemotron-3.5-lightning`, con espera y presupuesto. Nunca un modelo
  fijo que no exista.
- **Respaldo del A1 a las 08:30** en el bot del repo, con NotebookLM (SIN1114C, que vuelve):
  - investigación profunda;
  - el informe con todo el protocolo, el contexto vivo como fuente y la regla de calidad;
  - el resumen al chat;
  - y después el multiformato (9 formatos).
- **Una tarea crítica nunca queda huérfana en silencio.** Si el líder ve una tarea pendiente sin cola fuente, la
  vuelve a encolar desde el contrato o la escala al Mando y al chat. Prueba con el caso SIN1114C.

### 3.2 Avances en el chat de la síntesis (autónomos)

El bot y el agente nativo publican en el chat, con una línea por hito:

| Hito | Contenido |
|---|---|
| Arranque | 06:30: agentes y tema del día |
| Agentes | cada agente terminado, con su número de propuestas nuevas y descartadas por repetidas |
| Redacción | qué modelo o NotebookLM |
| Entrega | enlace al Doc y resumen |
| Multiformato | avance n/9 y el índice final |

- **Si a las 09:00 no hay síntesis:** «va retrasada por <motivo>; MetaGenesis está en <acción>».
- Al día siguiente, una línea de seguimiento: qué recomendaciones de ayer se aprobaron, se encargaron o se
  integraron.

### 3.3 Sanador y directores

- Arreglar:
  - el argv de higgsfield (`[bin, "account", "balance"]` o `["account", "status"]`, con `--json` si existe);
  - el `import subprocess` de la comprobación de notebooklm;
  - el canal de escalado (`entorno.leer_clave` y el envío del bot).
- **Avería propia vs. servicio caído.** Si una comprobación lanza una excepción de programación (NameError,
  TypeError, FileNotFoundError del argv, ImportError), es una **avería del sanador**:
  - no se avisa «X cayó»;
  - se abre en el acto `cola-auto-salud` con la traza;
  - el servicio queda «sin comprobar».
- **Cada aviso de caída enviado tiene su mensaje de vuelta** «✓ resuelto (causa · arreglo)». Hoy se manda uno para
  Higgsfield: «falsa alarma del sanador; Higgsfield estaba bien».
- **Pruebas:** cada comprobación del registro se ejecuta con su constructor de argv real contra un binario falso que
  registra los argumentos. Se retira el drop-in `path.conf` cuando la unidad versionada fije HOME y PATH.

### 3.4 Contexto vivo y memoria para cada agente de la síntesis

**`contexto_sintesis.py`** es un núcleo puro con E/S inyectable. Construye **paquetes por agente** (contactos,
noticias, referencias, actividad, ideas, guiones y YouTube) y un **contexto vivo completo** para el redactor, con:

1. **Lo ya integrado (índice):**
   - olas con commit de los últimos 30 días;
   - los títulos y resúmenes de `architecture/*.md`;
   - `memory/workflow-actual.md`, `metagenesis.md` y `AGENTS.md`;
   - la Librería instalada (`config/repos-libreria-*.json`);
   - las rutas y apps del OS.
2. **Producción audiovisual:**
   - los vídeos en planeación y su estado;
   - los encargos (`encargos.json`) y lo producido;
   - los proyectos de Higgsfield y sus propuestas;
   - los formatos de la síntesis ya hechos.
3. **Alcance:** fichas, borradores pendientes y aprobados, respuestas y la red de resonancia. Sin datos personales.
4. **Investigaciones:**
   - las síntesis de los últimos 7 días y su «Mañana»;
   - las fuentes de los cuadernos de NotebookLM;
   - las referencias de Imaginación.
5. **Recuerdos relevantes:** `contexto_agente.py --rol investigador-diseno|investigador-alcance|analista` y
   `seccion_recuerdos` de LEANN, con consultas por el tema de cada agente, más la libreta por ámbito (JLA1116).
6. **El libro de recomendaciones** (§3.5).

**Cómo se usa:**
- Cada paquete cabe en los topes (`_encoger_contexto`).
- El contexto completo se sube a Drive como «Contexto vivo de StarSeed <fecha>» y se añade como fuente al cuaderno
  de la síntesis.

### 3.5 Novedad, libro de recomendaciones y aprendizaje progresivo

- **`filtro_novedad.py`.** Cada propuesta se compara con el índice de lo integrado y con las propuestas de los últimos
  14 días: LEANN si está, si no TF-IDF.
  - Por encima del umbral, se descarta o se replantea como «ampliación de <pieza>».
  - Toda propuesta que pasa nombra la pieza existente en la que se apoya y lo que añade.
  - Un revisor gratuito puntúa novedad, concreción y anclaje: por debajo de 6/10 se reescribe una vez o se descarta.
- **`starseed_memory_root/sintesis/recomendaciones.jsonl`.** Cada recomendación lleva id, fecha, área, texto, la
  pieza en la que se apoya y su estado: propuesta → aprobada, rechazada, «ya existe», encargada (ola) o integrada
  (commit).
  - Los estados se actualizan con las respuestas de Maggasukha en el chat y con los commits u olas que la citan.
- **Aprendizaje.** Tras cada entrega, `aprendizaje_sintesis.py`:
  - anota en `memory/sintesis-aprendizajes.md` qué funcionó (las aprobadas, lo descartado por repetido y la
    puntuación);
  - ajusta las notas de enfoque de cada agente (`starseed_memory_root/sintesis/notas-agentes.json`), que entran en
    su paquete al día siguiente.

  Así la síntesis evoluciona sola.

### 3.6 Dirección desde el chat

| Orden | Qué hace |
|---|---|
| `/sintesis` | La lanza ya |
| `/sintesis estado` | Hito actual y retrasos |
| `/sintesis contexto` | Resumen del paquete de hoy y enlace al contexto vivo |
| `aprobar <n>`, `rechazar <n>`, `ya existe <n>`, `encarga <n>` | Actualizan el libro de recomendaciones; `encarga` crea un encargo |
| «Recuerda…» | Pasa a ser regla de la síntesis |

- Los botones en línea de Telegram para aprobar o rechazar son opcionales.

### 3.7 Reglas

- Nada se publica ni se envía a terceros sin aprobación.
- Las claves solo viven en los archivos de entorno.
- No hay datos personales de terceros.
- Claude nunca es un paso necesario.
- Las pruebas no tocan servicios reales (SIN1114, la guardia de red).

## 4. Cola SIN1116

La cola está en `starseed_memory_root/olas/cola-sin1116.json`. Prioridad: A, B y C primero; D, E y F después.

## 5. Respaldo provisional en servicio (Claude, 2026-11-17 00:20 UTC)

- **La síntesis del 2026-11-16 está entregada.** El resumen llegó al chat a las 18:02 y los 9 formatos a las 18:13,
  hora de México.
- **Hasta que SIN1116B integre el respaldo en el bot del repo:**
  - en el A1 corre `starseed-sintesis-respaldo.timer` cada día a las 14:30 UTC (08:30 México);
  - ejecuta `~/.starseed/peticiones/sintesis_respaldo.sh`, que genera el contexto vivo desde el clon del repo del A1
    y lanza `sintesis_hoy.py <hoy> --si-falta`;
  - solo actúa si no hay síntesis del día en Drive.
- **SIN1116B tiene que:**
  - cubrir lo mismo;
  - deshabilitar y borrar ese timer, su servicio y los guiones provisionales;
  - avisar en el Mando.
