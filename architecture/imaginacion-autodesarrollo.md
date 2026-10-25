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
