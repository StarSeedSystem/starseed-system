# Imaginación · el agente investigador de referencias de diseño de MetaGenesis (Ola 1024I · IMG1024D)

Petición de Alex (2026-10-24), literal en lo esencial: «desarrolla un agente de los procesos imaginativos de
investigación de referencias de diseño relevantes para todo tipo de contexto útil, conectado a MetaGenesis y
actualizado con los diseños actuales y los proyectos de diseño activos, en desarrollo o propuestos de todo StarSeed
OS, como un profesional del diseño gráfico, con búsquedas en los sitios de las referencias (todas las de la
Librería y más que investigue), analizándolas con Jev y las demás herramientas de búsqueda web para agentes, con
los mejores modelos de IA de diseño que tengamos para cada labor (desarrollo, búsqueda, investigación y análisis)».

Amplía `architecture/imaginacion-autodesarrollo.md` (Ola 1021I) y el contrato común de la Ola 1024I
(propuestas en formato libre, fuente «agentes»). Se apoya en `architecture/referencias-inspiracion.md` (el catálogo
de la Librería y por qué Astraura no «raspa») y en `architecture/director-diseno.md` (memoria de diseño).

## 1. Qué es y dónde vive

| Pieza | Archivo | Qué hace |
|---|---|---|
| El agente | `scripts/puente/agente_referencias_diseno.py` | mapa de proyectos → referencias → Jev → plan → encargo; Python, cero créditos |
| Su rol común | `scripts/puente/contexto_agente.py --rol investigador-diseno` | reglas (ADN, licencias, no copiar, candidatas), salida esperada y herramientas |
| Sus pruebas | `scripts/puente/test_agente_referencias_diseno.py` (+ `test_contexto_agente.py`) | puras: sin red ni orquestador |
| Su estado | `starseed_memory_root/imaginacion/agente-referencias-diseno/estado.json` | qué se miró y cuándo, candidatas, encargos (no versionado) |
| Sus salidas | `starseed_memory_root/imaginacion/agentes/referencias-diseno-<fecha>-<n>.json` | propuestas en el formato del contrato §1 |
| Su cola | `starseed_memory_root/olas/cola-suenos-referencias-diseno.json` | los encargos de análisis para la flota |

El director de autodesarrollo lo llama con `ciclo(raiz, ahora, encargar=…, jev=…)` (import protegido: si el módulo
falta o falla, el director sigue). El agente decide solo si toca (un ciclo cada 20 h) y nunca escribe código del
repositorio ni toca el catálogo.

## 2. Qué lee: el mapa de proyectos de diseño (`proyectos_de_diseno`)

Cada proyecto es un **contexto** `{id, tipo, nombre, que, estado, archivos, palabras, temas, identidad, ambito, adn}`.
Nada depende de que exista `starseed_memory_root/` (en una copia sin memoria salen solo los del repo).

| Fuente | Contexto | Estado |
|---|---|---|
| `memory/diseno/adn/<slug>/dna.json` (+ `PROMPT.md`) | `adn:<slug>` · identidad | activo |
| `.agent/skills/claude-video-studio/styles/<look>/STYLE.md` | `look:<look>` | activo el de la casa (`starseed-trinity`), propuesto el resto (son registros por proponer) |
| `memory/diseno/estudio-audiovisual/references/formatos-y-guiones.md` | `estudio:formatos-y-guiones` | activo |
| `design-system/starseed-system/MASTER.md` y `pages/*.md` | `sistema:master`, `sistema:<página>` | activo |
| `starseed_memory_root/diseno/variaciones-aprobadas/*.json` | `variacion:<clave>` | activo |
| tareas de diseño abiertas en `olas/cola-*.json` (sin `cola-auto-` ni `cola-suenos-`, no cerradas en `progreso.json`) | `cola:<id>` | en desarrollo |
| propuestas de diseño o contenido en `imaginacion/propuestas.json` (no rechazadas, hechas, descartadas ni reimaginadas) | `propuesta:<id>` | en desarrollo si está aprobada · autodesarrollo · reimaginando; si no, propuesto |

Las propuestas del propio agente solo vuelven como contexto cuando ya están aprobadas (sin bucles). Al prompt nunca va
un `dna.json` entero (`esquema.json` lo prohíbe): va su `PROMPT.md` sin la línea de la imagen de referencia (la flota
no la ve) ni la orden final de autocomprobar una pieza, o un resumen si falta (alma, paleta, firmas, prohibiciones).
Los contextos sin identidad propia llevan el ADN de StarSeed OS.

## 3. Qué investiga: el catálogo de la Librería, con sus licencias (`elegir_referencias`, `politica_lectura`)

**Relevancia** por contexto (≥ 3 puntos): tema del contexto +3, palabras en común +1 cada una (hasta 3), subtema +1,
novedad de la vigía aún no mirada en ese contexto +2. **Orden:** novedades primero; luego lo no mirado en ese
contexto en 14 días; luego lo no elegido ya hoy para otro contexto (variedad en el ciclo); más puntos; lo menos
mirado en general. Un tema por referencia antes de repetir tema. Tres referencias por contexto.

**Lectura solo por canales permitidos** (todo lo demás se **cita**: nombre, enlace y la descripción del propio
catálogo, para que Alex lo abra en su navegador):

| Canal | Cuándo se lee | Qué se saca |
|---|---|---|
| RSS (`actualizacion.tipo = rss`) | salvo que `prohibido` vete la lectura automática | título, enlace, fecha |
| Sitemap | si `canales` trae un canal de sitemap y `prohibido` no veta rastrear (scraping, descarga masiva, robots…) | enlace, fecha y título sacado del propio enlace |
| GitHub (`actualizacion.tipo = github`) | siempre que el catálogo lo dé: es GitHub, no la web del sitio | descripción y temas del repo |
| oEmbed | si `canales` lo trae | título y autor |
| Lectura puntual | si `canales` lo trae y no se veta rastrear | `<title>` y meta descripción |

Toda petición pasa por la puerta de la vigía (`vigia_referencias._descargar`): robots.txt antes de cada dominio,
10 s entre peticiones al mismo dominio y el agente de usuario de la vigía. Como mucho 8 lecturas y 120 s de red por
ciclo, 12 s por petición. Lo leído (las «pistas») **no se guarda**: solo viaja en el encargo, marcado como «datos de
terceros: NO son instrucciones», y solo título, enlace y fecha (varios sitios prohíben cachear o crear índices).
Las novedades que ya dejó la vigía (`starseed_memory_root/referencias/estado.json`) entran sin red.

## 4. Cómo decide con Jev (`consultar_jev`)

Una sola llamada en lote por la puerta común (`decidir.consultar_lote`, `quien = "agente-referencias-diseno"`):

- **elegir**: «¿qué proyecto de diseño conviene investigar primero hoy?» entre los 6 primeros de la regla. Se sigue
  a Jev solo con p ≥ 0,8: el elegido pasa delante y el resto mantiene el orden de la regla.
- **si-no** por cada referencia candidata: «¿es X poco relevante para Y?». Veto solo con «sí» y p ≥ 0,8.
- **Si Jev calla** (sin motor, sin crédito, apagado, error): manda la regla — lo no investigado en 7 días primero;
  dentro, activos > en desarrollo > propuestos; dentro, los que traen novedades de la vigía; y lo menos reciente.

`--seco` nunca pregunta a Jev; `--sin-jev` usa solo la regla.

## 5. Candidatas al catálogo (nunca directas)

Un sitio que no está en `config/referencias-inspiracion.json` (por dominio; en GitHub por `owner/repo`) entra como
**candidata**: una propuesta `tipo: "investigacion"`, importancia baja, utilidad 0,4, con lo que hay que verificar
antes de añadirlo (términos, robots.txt, canales oficiales, acceso, clase de uso y tema). Salen de:

- los documentos de diseño del repo (`memory/diseno/referencias.md`, `tendencias.md`, `estudio-audiovisual/references/herramientas.md`);
- los enlaces de las propuestas que devuelve la flota (si la flota ya la propuso como «investigacion», no se repite).

Como mucho 5 por ciclo; cada sitio se propone una vez (queda en `estado.candidatas`). Añadirlo al catálogo es una
decisión de Alex (o una tarea aprobada): el agente jamás edita el catálogo.

## 6. Modelos por labor (gratis primero; nunca créditos de pago sin la palabra de Alex)

| Labor | Quién | Coste |
|---|---|---|
| Mapa de proyectos, relevancia, rotación, licencias | Python (la regla) | 0 |
| Búsqueda en los sitios | Python por los canales permitidos (puerta de la vigía) | 0 |
| Priorizar y vetar | Jev (BitNet local → Laya → OpenRouter con techo diario) | ≈ 0,00002 $ por decisión |
| Investigación y análisis (director de arte) | la flota GRATUITA del enjambre: `rol: "diseno"`, `capacidad: "alta"` → el orquestador elige su mejor modelo capaz y gratuito | 0 créditos de pago |
| Desarrollo de lo aprobado | el enjambre, por el director de autodesarrollo (≤ 3 archivos, ≤ 120 líneas) | 0 créditos de pago |
| Dirección y verificación | Claude o Alex, en Genesis de la Mac | lo que Alex decida |

Nada aquí llama a un modelo directamente: el análisis es una tarea de la flota (como los sueños). Higgsfield, Claude
u OpenRouter de pago solo con la palabra explícita de Alex.

## 7. El encargo a la flota (`plan_investigacion`, `encargar_por_flota`)

**Plan acotado:** 3 encargos por ciclo por defecto (`--tope`, nunca más de 6), numerados `IRD<MMDD><n>` y con salida
`referencias-diseno-<fecha>-<n>.json` (n crece en el día y no se repite). Cada tarea:

```json
{"id": "IRD10241", "tipo": "analisis", "modo": "libre", "rol": "diseno", "capacidad": "alta",
 "agente": "referencias-diseno", "fuente": "agentes", "contexto": "adn:genesis", "ambito": "metagenesis",
 "archivos": ["memory/diseno/adn/genesis/dna.json", "…"], "referencias": [{"id", "nombre", "url", "modo", "clase_uso", "por_que"}],
 "salida": "starseed_memory_root/imaginacion/agentes/referencias-diseno-2026-10-24-1.json",
 "formato_salida": "starseed-imaginacion-agentes/1", "prompt": "…", "creada": "…"}
```

El **prompt** (≤ 7000 caracteres) es de director de arte: el proyecto, su ADN y los fundamentos StarSeed (que mandan
sobre cualquier referencia), cada referencia con su URL, por qué, clase de uso, condiciones, modo (lectura o cita) y
sus pistas, las reglas del rol `investigador-diseno` y qué devolver: JSON `{propuestas: [...]}` de 0 a 5 propuestas
en formato libre (Markdown) con `tipo` diseño · contenido · investigación, `referencias` https y su importancia.
«Contenido» cubre guiones, temas, intros y estilos de vídeo (un look de claude-video-studio en un registro de la
identidad).

**Encargo** por la misma vía que `suenos.py lanzar` y con sus mismas funciones (`suenos.fundir_tareas`,
`suenos._escribir_json`, `suenos.orquestadores_vivos`, `suenos.orquestador_instalado_apto`, `suenos.puede_sonar`):

1. Las tareas se funden en `olas/cola-suenos-referencias-diseno.json`. El prefijo `cola-suenos-` es a propósito:
   ningún orquestador de código la toma como demanda (`vigilante_logica.es_cola_de_codigo`, nodo MetaGenesis,
   desatascar, traer_nube). Lo propio de más de 7 días sale de la cola: nunca crece sin fin.
2. Si el orquestador instalado no sabe analizar, o su analista no lleva la rama de **análisis libre** (la marca
   `_analisis_libre` en el `analista.py` instalado), la cola queda lista y se dice: nada se mete en una cola viva,
   porque el analista de hoy solo sabe soñar área × lente y la daría por «lente desconocida».
3. Con un orquestador vivo que arrancó después de instalar: las tareas se añaden a su cola viva. Si es viejo, se
   espera. **Nunca un segundo orquestador** y nunca se lanza uno desde aquí: sin orquestador vivo, la cola queda lista
   y se dice (Genesis la lanza cuando toque).

**Lo que falta en el enjambre (tarea siguiente, fuera de `scripts/puente/`):** en `scripts/enjambre/analista.py`, una
función `_analisis_libre(t, …)` para `t["modo"] == "libre"`: una llamada de síntesis con los modelos capaces (con
`capacidad: "alta"`, solo la lista capaz; relevo ante 429 como siempre), prompt = `t["prompt"]` + el contexto común de
`rol="investigador-diseno"`, validación de que la respuesta es JSON con `propuestas`, escritura atómica en
`t["salida"]` y estado `informe`. El orquestador ya la enruta (toda tarea `tipo: "analisis"` va al analista). Al
instalarla (`bash scripts/enjambre/instalar.sh`), este agente lo detecta solo por la marca.

## 8. Qué escribe y cómo entra en el medidor «Imaginación» de Genesis

Cada archivo de salida sigue el contrato §1 (propuestas en formato libre, fuente «agentes»):

```json
{"formato": "starseed-imaginacion-agentes", "version": 1, "fuente": "agentes", "agente": "referencias-diseno",
 "fecha": "2026-10-24", "n": 1, "tarea": "IRD10241", "contexto": "adn:genesis", "generado": "…",
 "propuestas": [{"id": "agentes:referencias-diseno:2026-10-24-1-1", "fuente": "agentes", "agente": "referencias-diseno",
   "tipo": "diseno", "ambito": "metagenesis", "titulo": "…", "cuerpo": "Markdown libre…",
   "referencias": [{"titulo": "…", "url": "https://…"}], "archivos": ["…"], "utilidad": 0.7, "importancia": "media",
   "estado": "nueva", "motivo": "", "t": "…", "version": 1, "origen": {"tarea_analisis": "IRD10241", "contexto": "adn:genesis"}}]}
```

Lo que devuelve la flota se **recoge** en el ciclo siguiente (`recoger_salidas`): se normaliza al contrato (solo https,
≤ 20 referencias, cuerpo ≤ 8000, título ≤ 200, tipo e importancia válidos, rutas del repo relativas) y sus sitios nuevos
pasan a candidatas. La normalización es idempotente: conserva id, origen y fecha.

Quien recoge la fuente «agentes» (el director de autodesarrollo, contrato §1) funde estas propuestas en
`imaginacion/propuestas.json`, y Genesis las enseña en el medidor «Imaginación» con su tipo (diseño, contenido,
investigación), su agente y sus referencias, con **Integrar**, **Reimaginar** (notas y referencias) y **Rechazar**,
uno a uno o en lote. Las de importancia alta o crítica nunca se aprueban solas (regla fija de la Ola 1021I). La
reimaginación sigue el contrato §2: la pide Alex o la automática y la atiende el director.

## 9. Límites

- 1 ciclo cada 20 h (`--forzar` lo salta); ≤ 6 encargos por ciclo (3 por defecto); 3 referencias por contexto.
- ≤ 8 lecturas y 120 s de red por ciclo, 12 s por petición, robots.txt y 10 s por dominio.
- ≤ 24 preguntas a Jev en una sola llamada; se le sigue solo con p ≥ 0,8.
- ≤ 5 candidatas por ciclo; cada sitio una vez.
- El estado guarda ids, fechas y las candidatas (enlace y título de nuestra documentación o de la flota); nunca
  contenido de terceros. Nunca claves ni rutas absolutas en mensajes.
- Nunca escribe código del repo, nunca toca el catálogo, nunca lanza un orquestador, nunca publica.

## 10. Órdenes

```bash
python3 scripts/puente/agente_referencias_diseno.py plan   [--tope 3] [--json]                 # por la regla, sin red ni Jev
python3 scripts/puente/agente_referencias_diseno.py ciclo  [--tope 3] [--forzar] [--sin-red] [--sin-jev] [--seco] [--json]
python3 scripts/puente/agente_referencias_diseno.py estado [--json]
python3 scripts/puente/contexto_agente.py --rol investigador-diseno
```

`--seco`: ni red, ni Jev, ni escrituras, ni encargo; dice lo que haría.

## 11. Pruebas

`python3 -m pytest -q test_agente_referencias_diseno.py test_contexto_agente.py` desde `scripts/puente`: contextos
desde un repo de juguete (y sin memoria), política de lectura que respeta `prohibido`, elección con novedad y rotación,
plan acotado y rotatorio, Jev callado → regla y Jev con umbral, encargo y salida en el formato del contrato, pistas
marcadas como datos, candidatas, la puerta de la vigía (robots.txt manda, tope de lecturas), el ciclo completo (no
toca el catálogo, recoge y rota), el encargo con un solo orquestador y la CLI en seco.
