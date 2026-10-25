# Imaginación y autodesarrollo: las propuestas se convierten en tareas solas, con tu visto bueno en lo importante (Ola 1021I)

Petición de Alex (2026-10-21), tras ver que las «Recomendaciones para las próximas olas» no se procesaban:
«apruebo las propuestas, pero dependiendo de la utilidad de los sueños pueden ser 0-10 y se deben asignar por los
directores completos con ajustes de un switch de automático y de selección del número de rango de tareas
autodesarrolladas, y en el pulso del trabajo añade un medidor de esos procesos y de sugerencias de los sueños y
procesos imaginativos automáticos y sugerencia de los directores para aprobarlas antes de asumir cambios
importantes». Y después: «también debe ser renombrado por imaginación en vez de sueños, y deben poder ser en
cualquier rango de horarios repartidos o automáticamente ejecutados inteligentemente».

## 1. Lo que había (medido el 2026-10-21)

- **Sueños profundos:** una sola sesión (2026-09-29, consolidada el 10-03, 603 hallazgos únicos). Se encargaron sus
  27 primeras recomendaciones en dos tandas (SP09291–SP092927): 26 integradas y 1 rechazada. La siguiente tanda
  (SP092928–SP092942) nunca se encargó, y ninguna sesión nueva desde entonces: nada la programaba.
- **Dream diario** (Hermes, 07:00, `~/.hermes/scripts/starseed-dream.sh`): escribe `dream/sugerencias-<fecha>.md`
  cada día, pero `director_dream.py`, que lo convierte en tareas, no lo llamaba nadie: la última vez fue el 10-07
  (a mano). El del 10-20 no dejó informe. Prueba de que se perdía: el del 10-19 avisó de que
  `memory/aprendizaje-olas.md` tiene 11 marcas de conflicto de fusión, y siguen ahí.
- `director_dream.py` tal cual encargaría también lo que el enjambre no puede hacer («publicar los commits»).
- Los procesos imaginativos de Astraura 1.58 (`/api/imagination/status`: `creations`, `branches`,
  `pending_approval_count`) y las preguntas de los directores ya existen, pero en sitios distintos y sin un lugar
  común donde aprobarlos.

## 2. Nombres: «Imaginación», no «Sueños»

Todo texto que lea una persona o un agente dice **Imaginación**: «Imaginación diaria» (lo que era el Dream),
«Imaginación profunda» (lo que eran los sueños profundos, 14 áreas × 6 lentes), «sesión de imaginación» y el medidor
«Imaginación» del pulso. **Los identificadores no cambian, a propósito** (misma regla que Genesis): `suenos.py`,
`director_suenos.py`, `director_dream.py`, `src/lib/mando/suenos*.ts`, `panel-suenos.tsx`, `/api/mando/suenos`,
las carpetas `starseed_memory_root/dream/…` y el prefijo `cola-suenos-` (los orquestadores lo usan para NO tomar
esas colas). Guardia: `src/lib/__tests__/nombre-imaginacion.test.ts` recorre `src/components/mando` y `src/lib/mando`
y falla si un texto vuelve a decir «Sueños profundos», «sueño profundo» o «Dream» (la imaginación propia de
Astraura ya se llama así y no se toca).

## 3. Las cuatro fuentes de propuestas

| Fuente | De dónde sale | Qué es |
|---|---|---|
| Imaginación diaria | `dream/sugerencias-<fecha>.md` | accionables del informe de cada día |
| Imaginación profunda | `dream/profundo/<fecha>/consolidado.json` | ranking verificado de la sesión |
| Procesos imaginativos de Astraura | `GET /api/imagination/status` del backend 1.58 (`creations`, `branches`) | creaciones e ideas con `requires_user_approval` e `importance_level` |
| Directores | preguntas del revisor de bloqueadas («alex»), propuestas del Chat Director | decisiones que solo puede tomar Alex |

Todas se normalizan en `starseed_memory_root/imaginacion/propuestas.json` (no versionado): `{id, fuente, titulo,
cuerpo, archivos, utilidad (0–1), importancia (baja·media·alta·crítica), estado, motivo, tarea?, t}` con estados
`nueva → autodesarrollo | esperando-aprobacion | pregunta | descartada → aprobada | rechazada | pospuesta → hecha`.

## 4. Ajustes (`~/.starseed/autodesarrollo.json`, editables desde Genesis)

| Ajuste | Por defecto | Qué hace |
|---|---|---|
| `automatico` | encendido | encendido: lo útil y no importante se desarrolla solo; apagado: TODO espera tu visto bueno |
| `rango` | 0–10 | cuántas tareas autodesarrolladas por ciclo: nunca más del máximo; el mínimo es «como mucho las que sean útiles», nunca se rellena con inútiles |
| `fuentes` | las cuatro | cada fuente se puede apagar |
| `horario.modo` | `inteligente` | `inteligente`: cuando hay capacidad libre (huecos en la Mac, el A1 o la nube, proveedores con cupo, la Mac sin presión de memoria; prefiere la noche); `franjas`: solo dentro de las franjas elegidas |
| `horario.franjas` | 02:00–06:00 todos los días | cualquier número de franjas `{dias, desde, hasta}` |
| `horario.repartir` | sí | las tareas y los análisis se sueltan por lotes repartidos entre franjas, no todos de golpe |
| `profunda.cada_dias` | 7 | cada cuántos días hay sesión de imaginación profunda (0 = nunca) |
| importantes | siempre con tu visto bueno | **fijo, no editable**: ningún interruptor salta esta regla |

## 5. El director de autodesarrollo (Python, cero créditos)

`scripts/puente/director_autodesarrollo.py ciclo`, servicio `com.starseed.autodesarrollo` cada 15 min:

1. **¿Toca imaginar?** Según el horario: lanza la imaginación diaria si hoy no hay informe (la de Hermes a las 07:00
   queda de respaldo hasta que el director la sustituya; entonces se apaga en Hermes), y la profunda cada
   `cada_dias` (`suenos.py lanzar`, repartida si toca) y la consolida al completarse (`suenos.py consolidar`).
2. **Recoge** las propuestas nuevas de las fuentes encendidas, sin repetir lo ya encargado
   (`~/.starseed/dream-encargado.json`, la misma memoria de siempre).
3. **Utilidad (regla primero, Jev de consejero):** accionable por el enjambre (verbo de acción y archivos citados que
   existen HOY; nada de publicar, comprar, cuentas ni decisiones de Alex) × impacto/esfuerzo × verificación (en la
   profunda: verificado 1 · ajustado 0,8 · sin verificar 0,4) × vigencia (la cita sigue en el código). Jev solo veta
   con p ≥ 0,8 o afina la prioridad (protocolo común, `decidir.py`).
4. **Cuántas:** las de utilidad ≥ 0,6, ordenadas, acotadas por `rango.max`. Cero si nada es útil, y se dice.
5. **Importancia:** *crítica* si toca el núcleo intocable (`src/lib/nucleo`), identidad, cuentas, permisos o
   compartir, gobernanza o voto, claves o seguridad, migraciones de Supabase, `.github/`, publicación o servicios
   (`autopublicar.py`, `publicar.py`, `instalar-servicios.py`); *alta* si toca más de 3 archivos, borra, cambia valores
   por defecto de todas las cuentas o el enrutador de IA; *media* o *baja* lo demás.
6. **Destino:** automático y baja/media → tarea en `olas/cola-imaginacion-<fecha>-<hora>.json` (≤ 3 archivos y ≤ 120
   líneas por archivo, prompt que empieza por «comprueba si sigue haciendo falta; si ya está, NO APLICA»); alta →
   esperando tu aprobación; crítica → esperando tu aprobación y, al aprobarla, se desarrolla con `aprobacion: true`
   (ves el diff antes de integrar); lo que no es código → pregunta. Automático apagado → todo espera.
7. **Avisa** en una línea al Chat Director; a Telegram solo cuando hay algo esperando tu aprobación (agrupado).

Lo puro va en `autodesarrollo_logica.py` (ajustes y horario), `autodesarrollo_decidir.py` (utilidad, importancia,
destino) y `autodesarrollo_fuentes.py` (las cuatro fuentes → propuestas), con sus pruebas.

## 6. El medidor «Imaginación» del pulso

En «El trabajo ahora», después de «Fallidas». La pastilla: «N por aprobar · M autodesarrolladas hoy (rango a–b)».
El detalle: una fila por propuesta (fuente, utilidad, importancia, estado, tarea si la hay) con **Aprobar**,
**Rechazar**, **Posponer** y **Ver origen**; arriba, el interruptor Automático, el rango y el horario (el mismo
componente que en Ajustes, como la autopublicación dentro de «Sin publicar»). Aprobar una creación de Astraura la
aplica en su backend (`POST /api/imagination/action`, `apply`); aprobar lo demás lo encola el director. Si el backend
1.58 duerme, su fuente dice «dormida» y no se inventa nada. Las rutas `/api/mando/imaginacion` y
`/api/mando/autodesarrollo` son solo locales, como todo `/api/mando/*`.

**Hecho en la Ola 1024I · IMG1024B (sustituye a IMN1021H e IMN1021J).** Clave `imaginacion` en
`src/lib/mando/medidores.ts`, en «El trabajo ahora» después de «Fallidas». La pastilla
(`pastillaImaginacion`, la regla de `resumenPastilla`): «N por decidir» y debajo «R reimaginando · I
integradas hoy»; tono aviso si espera algo alto o crítico; «sin datos» si no se pudieron leer las propuestas
(nunca una cifra inventada) y «sin propuestas» si el ámbito está vacío. `/api/mando/medidores?clave=imaginacion
&ambito=` la calcula con `leerPropuestas`/`leerAjustes` sin esperar la reunión compartida. El detalle es
`src/components/mando/panel-imaginacion.tsx`: arriba el automático (aprobar · reimaginar, umbral 0,6–1 y tope
0–10) y la regla fija «lo de importancia alta o crítica siempre espera tu visto bueno»; pestañas Por decidir ·
Reimaginando · Integradas · Rechazadas y pospuestas · Todas; filtros por tipo y fuente; cada propuesta con su
cuerpo libre en Markdown sin HTML crudo (solo enlaces https, en pestaña nueva), referencias, archivos y los
botones Integrar · Reimaginar (notas + una URL https por línea) · Rechazar · Posponer · Ver origen; y el lote
(seleccionadas o todas, con confirmación) que dice cuál falló y por qué y deja seleccionado lo fallido.
**Ámbitos:** la consola con pulso es la de MetaGenesis; sin `?ambito=` la pastilla es la de MetaGenesis y sale
siempre. Mi Genesis y PoliGenesis no tienen pulso ni llegan a `/api/mando/*`, así que su ámbito existe en la
vista cuando la URL lo trae (`?ambito=personal|grupo:<id>|pagina:<id>`): entonces la pastilla y el panel se
filtran por él. Lo que espera en otros ámbitos se enlaza desde el panel, nunca se suma a la cifra.

## 7. Arreglos aprobados que van ya

- Las 15 recomendaciones siguientes de la imaginación profunda del 2026-09-29 (SP092928–SP092942): lanzadas el
  2026-10-21 en `olas/cola-imaginacion-profunda-0929b.json`, cada una comprobando antes si sigue haciendo falta;
  ninguna es importante según §5.5, así que van sin visto bueno del diff (la propuesta original quedó en
  `colas-fuente/`).
- `memory/aprendizaje-olas.md`: quitar las marcas de conflicto (unión de las dos partes, sin duplicados) y que
  `director_aprendizaje.py` no vuelva a commitear un archivo con marcas.
- Imaginación profunda semanal: la programa el director (§5.1) según el horario.

## 8. Tareas del enjambre (cola `cola-imaginacion-autodesarrollo-1021.json`)

IMN1021A (ajustes y horario), IMN1021B (utilidad, importancia y destino), IMN1021C (fuentes), IMN1021D (director),
IMN1021E (servicio launchd), IMN1021F (tipos TS y resumen), IMN1021G (servidor y ruta), IMN1021H (medidor),
IMN1021I (ajustes en Genesis), IMN1021J (pastilla y acciones en el pulso), IMN1021K1–K4 (renombrar a Imaginación y
guardia), IMN1021L (memoria con conflictos).

## Ola 1024I · propuestas libres, reimaginar, automático y agente de referencias de diseño (2026-10-24)

Petición de Alex: en el pulso, un medidor de lo que proponen los procesos imaginativos (formato libre de los agentes)
con **Integrar**, **Reimaginar** (con cambios o referencias), **Rechazar** y un botón de **aprobación y reimaginación
automática**; lo no aprobado, en una lista para decidir uno a uno o todo; y un agente de referencias de diseño
conectado a MetaGenesis. Contrato común de la ola: campos y estados de abajo. **IMG1024B (el medidor «Imaginación» del
pulso y sus botones) sustituye a IMN1021H/J**, que nunca se hicieron; los ajustes en Genesis de IMN1021I también los
sustituye esta ola.

| Tarea | Dónde | Qué deja |
|---|---|---|
| IMG1024A | `src/lib/mando/imaginacion-tipos.ts`, `imaginacion-servidor.ts`, `src/app/api/mando/imaginacion/route.ts` | datos, decisiones y API |
| IMG1024B | el medidor del pulso | la lista y los botones (sustituye a IMN1021H/J) |
| IMG1024C | `director_autodesarrollo.py`, `autodesarrollo_decidir.py`, `autodesarrollo_reimaginar.py`, `autodesarrollo_fuentes.py` | fuente «agentes», automático y reimaginación |
| IMG1024D | `agente_referencias_diseno.py` (+ `architecture/agente-referencias-diseno.md`) | el agente de referencias de diseño |
| IMG1024E | `scripts/enjambre/analista.py` (`_analisis_libre`), `instalar-servicios.py` | la flota ejecuta los encargos; el director corre solo |

**Propuestas libres de los agentes (fuente «agentes»).** Cada `starseed_memory_root/imaginacion/agentes/*.json` es una
lista de propuestas o `{agente?, propuestas: [...]}`; solo se exige el título. `autodesarrollo_fuentes.de_agentes` las
normaliza (título ≤ 200, cuerpo Markdown libre ≤ 8000 sin forzar estructura, referencias solo `https://` y ≤ 20,
archivos relativos al repo ≤ 20) y el director lee los 300 archivos más nuevos de ≤ 1 MB. Campos nuevos, todos
opcionales al leer: `agente`, `tipo` (codigo · diseno · contenido · investigacion · otro; por defecto codigo),
`ambito` (metagenesis · personal · grupo:<id> · pagina:<id>; por defecto metagenesis), `referencias`, `version` (1),
`version_de` y `reimaginacion` {notas ≤ 2000, referencias, pedida, por alex · automatica}.

**Decidir (API, solo local).** `GET /api/mando/imaginacion?ambito=` y `POST` con `integrar` (= `aprobar`: «aprobada» y
el director la encola; si es de Astraura se aplica en su backend y, si falla, no cambia), `reimaginar` (notas o al
menos una referencia https), `rechazar`, `posponer` (1–720 h), `ajustes` y **`lote`** (`ids` o `"pendientes"` = todas
las decidibles del ámbito; una lectura, una escritura y un resultado por id). Decidibles: esperando-aprobacion,
pregunta, pospuesta, nueva y descartada.

**Reimaginar.** Pedirlo pasa la propuesta a «reimaginando»; el director la convierte en UNA tarea `tipo: "analisis"`,
`modo: "reimaginar"` en `olas/cola-suenos-reimaginar-<fecha>.json` (el prefijo `cola-suenos-` aparta a los
orquestadores de código), con la propuesta, las notas, las referencias y la salida
`imaginacion/agentes/reimaginada-<id>-v<n>.json`; diseño, contenido e investigación piden `rol: "diseno"`,
`capacidad: "alta"` y sus `lecturas`. Al recogerla, la nueva entra como v n+1 con `version_de`, hereda ámbito y tipo, y la
vieja pasa a «reimaginada». Sin respuesta en 72 h vuelve a tu lista.

**Aprobación y reimaginación automática** (`auto` en `~/.starseed/autodesarrollo.json`: `{aprobar, reimaginar, umbral
0,75, max_reimaginaciones 2}`, apagado por defecto; `autodesarrollo_decidir.automatica`). Solo mira las fuentes
diaria, profunda y agentes (desde la Ola 1025S, también Astraura: ver abajo), y solo el ámbito metagenesis (lo de una persona, grupo o página lo decide su dueño). Con
`automatico` (el interruptor de la Ola 1021I) o `auto.aprobar` encendidos, lo bajo/medio de código con utilidad ≥ umbral
(0,6; con `aprobar`, el `umbral` del botón, nunca por debajo de 0,6) se integra solo (Jev solo puede vetarlo, con
p ≥ 0,8); con `auto.reimaginar`, lo de código o diseño que no llega se reimagina solo con la crítica de por qué no llegó
como notas, mientras queden reimaginaciones en la cadena; lo demás queda en la lista manual. **Alta y crítica nunca se integran solas** (regla fija de la Ola
1021I: lo comprueban `destino` en Python y `vetoDecision` en el servidor). El tope corta solo la cadena automática: lo
que pide Alex se hace siempre. Si cambian los ajustes, lo pendiente se vuelve a decidir (`firma`).

**Agente de referencias de diseño (IMG1024D).** El director lo llama en cada ciclo que toca; él decide si le toca (cada
20 h) y encarga a la flota 3 análisis por ciclo (nunca más de 6) `modo: "libre"`, `rol: "diseno"`, `capacidad: "alta"` en
`olas/cola-suenos-referencias-diseno.json`, con salida `imaginacion/agentes/referencias-diseno-<fecha>-<n>.json`.
Detalle completo en `architecture/agente-referencias-diseno.md`.

**La rama libre del analista (IMG1024E).** `analista.ejecutar` manda toda tarea de análisis con `modo` «libre» o
«reimaginar» a `_analisis_libre` (las áreas × lentes siguen igual): UNA síntesis con la flota gratuita; con `capacidad:
"alta"` solo los modelos capaces (`_CAPAZ`), con relevo ante 429 como siempre. Con `rol: "diseno"` van primero los
modelos que mejor puntúa el director de diseño (`~/.starseed/diseno/pesos-modelos.json`, notas 0–100 de las tareas de
interfaz verificadas, el mismo modelo en cualquier proveedor): ≥ 75 delante, sin nota en su orden de siempre, < 75 al
final; sin ninguna nota, el orden capaz de siempre (el código no sabe nada más de diseño ni de visión de cada modelo).
Prompt = contexto común del rol (`investigador-diseno` para diseño, `analista` para lo demás; no se repite si el
encargo ya lo trae) + `t["prompt"]` (al reimaginar sin prompt, uno con la propuesta, las notas y las referencias) +
extractos de sus `lecturas` (≤ 3 × 1500 caracteres; nunca `.env`), saneado de claves. La salida se valida (cada
propuesta con título; cuerpo libre ≤ 8000; referencias solo https; reimaginar = una lista con UNA, con `version_de` y
`version` de la tarea; un análisis libre puede no proponer nada) y se escribe de forma atómica en `t["salida"]`, que
tiene que ser un `.json` directo de `starseed_memory_root/imaginacion/agentes/` (si no, fallo sin llamar a nadie).
Sin el JSON pedido, 3 intentos y fallo honesto. Estado final `informe`. Su marca, la función `_analisis_libre`, es lo
que el agente de referencias busca en el `analista.py` instalado.

**El servicio** `com.starseed.autodesarrollo` (`instalar-servicios.py`, `CADA`): `director_autodesarrollo.py ciclo`
cada 15 min (`StartInterval` 900, sin KeepAlive), con `lanzador-tcc.py` de padre, python3 por ruta absoluta,
`ProcessType` Standard (lo que lanza —la imaginación diaria, `suenos.py lanzar`, un orquestador— hereda el papel del
servicio y en Background se ahogaría) y `AbandonProcessGroup`. Registro en `/tmp/starseed-autodesarrollo.log`.
Instalarlo en la Mac (aquí no hay launchd):

```bash
cd ~/Documents/starseed-os-main && bash scripts/enjambre/instalar.sh && \
  STARSEED_SOLO=autodesarrollo /opt/homebrew/bin/python3 scripts/puente/instalar-servicios.py ~/Documents/starseed-os-main /opt/homebrew/bin/python3
```

Un orquestador que ya corría sigue con el analista viejo hasta que acabe (el agente de referencias espera; nunca hay
dos). Pruebas: `scripts/enjambre/test_analista_libre.py` y `scripts/puente/test_instalar_servicios_autodesarrollo.py`.

## Ola 1025S · el automático decide todas las fuentes y tipos, con tope por ciclo y sin duplicadas (IMG1025A, 2026-10-25)

Alex: «en Imaginación la Aprobación y reimaginación automática no funciona, aún se quedan en por decidir». Medido en la
Mac con el botón encendido (`auto: {aprobar, reimaginar, umbral 0,75, max_reimaginaciones 2}`): 243 propuestas, 242 en
«pregunta» o «reimaginando», ninguna integrada. Causas: `FUENTES_AUTO` dejaba fuera `astraura` (234 de las 243);
`TIPOS_REIMAGINABLES` dejaba fuera contenido e investigación; `automatica()` devolvía «pregunta» para todo lo que no es
código, con utilidad 0; la firma no cambiaba con las reglas (172 ya firmadas con `1|1|1|0,75|2` no se habrían vuelto a
mirar), y una «aprobada» que no era código iba a la cola de CÓDIGO (también la de Astraura que Alex ya había aplicado
en su backend desde Genesis).

**Reglas (todas en `autodesarrollo_decidir.py`, puras):**

1. **Fuentes.** `FUENTES_AUTO = diaria, profunda, agentes, astraura`. `directores` sigue manual (son decisiones de Alex).
   Lo que no es código solo lo decide el botón de la Ola 1024I (`auto.aprobar`/`auto.reimaginar`), nunca el
   «automático» viejo de la 1021I.
2. **Vía** (`via`): `codigo` (tarea accionable: verbo y archivos que existen) · `astraura` (fuente Astraura: se aplica en
   su backend) · `entregable` (diseño, contenido, investigación u otro sin tarea accionable). Un `codigo` no accionable
   sigue siendo código: se reimagina para que lo sea, nunca se convierte en un ensayo. Se guarda en `p.via`.
3. **Utilidad de lo que no es código** (`utilidad_propuesta`; la de código no cambia):
   - *Creación de Astraura* (`utilidad_astraura`): JSON válido con nombre (`agent`, `name`, `nombre`, `title`…) y
     capacidades (`capabilities`, `skills`, `tools`…) → 0,9; ≥ 3 campos sustanciales → 0,8; 1–2 → 0,4; vacío → 0,05;
     roto → 0,1. En texto, la sustancia de abajo (un esqueleto de código con la función vacía vale ≈ 0,07).
   - *Contenido, diseño o investigación* (`utilidad_libre`): 0,5 × caracteres útiles (sin comentarios ni `{ }`
     vacíos; 1500 = 1) + 0,25 × estructura (títulos, puntos, filas de tabla y párrafos ≥ 40 caracteres; 6 = 1) +
     0,25 × referencias https distintas (de `referencias` y del texto; 3 = 1). Solo el título → 0.
   - Lo de Alex vale 0 venga por donde venga. Jev, consejero opcional: solo frena (veta → 0, «bajar» → −0,1) y solo
     con p ≥ 0,8; el director le pregunta UNA vez, al ir a integrar (`veto_jev`), como en la Ola 1024I.
4. **Importancia de Astraura.** Cuenta la que declara su backend (`origen.importance_level`, la MAYOR con la de la
   regla): `critical_security`/`critical` → crítica, `high` → alta, `medium` → media, `low` → baja. Antes salían
   «baja» por no citar archivos, y una creación «critical_security» con `requires_user_approval` se habría aplicado
   sola. **Alta y crítica: nunca se integran ni se reimaginan solas** («esperando-aprobacion» con su motivo). Una
   versión reimaginada hereda como piso la importancia de su cadena (`AR.enlazar`): reimaginar no «lava» una alta.
5. **Lo «de Alex»** (`es_de_alex`): además de publicar, pagar, cuentas, claves y tokens, las **credenciales** escritas
   de cualquier forma (`SECRETOS`: también dentro de un nombre de archivo, «r2_credentials.local.json»). Nunca solo:
   «pregunta» con su motivo.
6. **Astraura ya autorizada.** Una rama con `requires_user_approval: false` y estado distinto de «pending_approval» ya
   la autorizó y la ejecuta su orquestador: no hay nada que decidir → «descartada» con ese motivo (si no es de Alex:
   lo que toca credenciales o publicación se queda a la vista). `de_astraura` ya no las trae (como «pendiente» en la
   propia Astraura, `permisos-tab · isPendingApproval`); sin la clave, se toma como siempre.
7. **Integrar** (≥ umbral, baja o media, ámbito metagenesis, no de Alex, sin veto de Jev): código → «autodesarrollo»
   (como siempre); lo demás → «aprobada» con `aprobada_por: "automatica"`.
8. **Reimaginar** (por debajo del umbral, con reimaginaciones libres en la cadena): cualquier tipo
   (`TIPOS_REIMAGINABLES` = todos); Astraura no (vive en su backend: una versión de la flota no se puede aplicar allí).
   La crítica de lo que no es código habla de sustancia (largo, estructura, referencias), no de archivos.
   **Tope:** como mucho `TOPE_POR_CICLO` = 12 reimaginaciones automáticas nuevas por ciclo y `MAX_EN_VUELO` = 24 a la
   vez, primero la de más importancia y, dentro, la más reciente (`orden_reimaginar`); lo que no cabe queda «nueva»
   SIN firma («espera turno») y se vuelve a mirar el ciclo siguiente. Al encolar, lo de la automática también ≤ 12 por
   ciclo; lo que pide Alex se encarga siempre.
9. **Duplicadas** (`duplicadas`): entre las pendientes (nueva, pregunta, esperando-aprobacion, autodesarrollo) de una
   misma fuente automática y ámbito con el mismo título normalizado (sin acentos, emojis ni puntuación), se queda la
   más reciente (fecha de origen, números del id —las marcas de tiempo de Astraura— e instante) y las demás pasan a
   «descartada» con «duplicada de <id>» (y `duplicada_de`). Se pueden rescatar (§2).
10. **Lo que queda**: sin reimaginaciones libres o de Alex, a la lista manual con su motivo, como hoy.
11. **Revisión de lo pendiente.** La firma lleva la versión de las reglas (`REGLAS = "1025S"`): al cambiar las reglas o
    los ajustes se vuelve a decidir todo lo que estaba en nueva, pregunta, esperando-aprobacion o autodesarrollo de las
    fuentes automáticas (también las 234 de Astraura).

**El director** (`director_autodesarrollo.py`): decide (`_decidir_lote`: nuevas → duplicadas → revisables → evaluar →
tope) y **escribe `propuestas.json` siempre** que no sea seco, aunque `toca_ejecutar` sea falso por presión de memoria:
decidir no cuesta memoria; lanzar trabajo, sí. Solo con `toca` se encola o se aplica. Cada «aprobada» sin tarea va por
su vía:
- **código** → la cola de código de siempre (`cola-imaginacion-<fecha>-<hora>.json`);
- **Astraura** → si la integró Alex desde Genesis, el servidor ya la aplicó (`imaginacion-servidor.ts`): «hecha»; si la
  integró la automática, `POST /api/imagination/action {item_id, item_type, action: "apply"}` al backend 1.58
  (`ASTRAURA_158_URL`, 8 s; inyectable `aplicar_astraura`), ≤ 12 por ciclo → «hecha» con `aplicada`. Si no responde es
  un fallo del medio: no cuenta y el resto espera; tres rechazos de verdad → «pregunta» con el motivo;
- **entregable** → `autodesarrollo_entregables.py`: UNA tarea `tipo: "analisis"`, `modo: "libre"` (la rama
  `_analisis_libre` del analista, la flota gratuita; diseño, contenido e investigación con `rol: "diseno"`, `capacidad:
  "alta"` y sus lecturas) en `olas/cola-suenos-entregables-<fecha>.json`, con salida
  `imaginacion/agentes/entregable-<id>-v<n>.json` (≤ 12 por ciclo y ≤ 24 en vuelo). La fuente «agentes» NO la recoge
  como propuesta (sería un bucle); el director la marca «hecha» con `entregable {tarea, salida, cola, encolada,
  recibido, titulo}`. Sin respuesta en 72 h, o vacía, se vuelve a encargar una vez (otra tarea y otra salida,
  `-r1`, `rehacer`); a la segunda, «pregunta».

`ciclo()` devuelve además `decisiones` (lo decidido en el ciclo por destino, con `duplicadas` y `aplazadas`),
`estados`, `entregables`, `entregables_encargados`, `cola_entregables` y `aplicadas_astraura`.

**Medido en seco sobre una copia de las 243 propuestas y los ajustes reales (2026-10-25, sin red ni Jev):** antes 234
«pregunta» de Astraura, 5 de agentes, 3 de diaria y 1 «reimaginando». Después: 204 duplicadas descartadas, 14 ramas
que Astraura ya autorizó y ejecuta descartadas, 0 integradas, 0 reimaginaciones nuevas y **24 para Alex** (de 242):
9 «esperando-aprobacion» de Astraura por su importancia declarada (8 «high», 1 «critical_security»: el «Esquema de
Agente Mutado», utilidad 0,9) y 15 «pregunta» por ser de Alex (5 de agentes y 5 de Astraura por pago/vercel, 2 de
credenciales, 3 de diaria por token/publicar/publicación). Con presión de memoria, el mismo reparto y escrito.

Pruebas: `test_autodesarrollo_decidir.py` (Ola1025STest), `test_autodesarrollo_fuentes.py`,
`test_autodesarrollo_reimaginar.py`, `test_autodesarrollo_entregables.py`, `test_director_autodesarrollo.py`
(Ola1025STest) y `scripts/enjambre/test_analista_libre.py` (el entregable de punta a punta con el analista).
