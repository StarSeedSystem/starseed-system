# Ninguna tarea se desperdicia (OPB1011 · 2026-10-10)

## Qué pidió Alex

«Hay demasiadas tareas bloqueadas en MetaGenesis. Los directores, en vez de bloquear las tareas, deben
modificarlas, adaptarlas, reasignarlas o enlistarlas donde y como correspondan. Las bloqueadas deben tener
también un agente revisor automático, con todos los directores supervisores y verificadores, que las procese
como corresponda: reenlistarla, reasignarla, ordenarla, acomodarla, modificarla, trasladarla o lo que sea,
inteligentemente, para que no se desperdicien.»

## Lo que había de verdad (medido el 2026-10-10, 04:20–04:30 hora de la Mac)

La pastilla «Bloqueadas» de Genesis marcaba **40**. Ninguna de las 40 estaba atascada: **todas eran esperas
de una cadena**.

- **35 de la Protomolécula** (`cola-protomolecula-1010p.json`) dependían de **5 raíces**: PM1010F0A
  (desbloquea 25), PM1010F0B (29), PM1010F2B (4), PM1010F0K (3) y PM1010F2L (1).
- **5 de la cola S1010** esperaban a S1010-EV-ORACLE-1a, S1010-TU-LL1 y S1010-TU-AST1.
- La tanda viva, `cola-auto-1009-233520`, tenía **0 de 75 integradas en 5 horas**, con 3 trabajadores en la Mac.

### Por qué no avanzaban las raíces

Las causas eran del **medio**, no de las tareas.

| Causa | Tareas | Desde el reinicio |
|---|---|---|
| `.git/index.lock` huérfano del reinicio de la Mac (23:31), que tumbaba el `merge --ff-only` de trabajo ya revisado | PM1010F0A, F0B, F2B, F0K | 4 integraciones perdidas |
| tsc sin terminar (Mac con ~120 MB libres y 8 GB de swap) | GN1010B, GN1010D, S1010-TU-AST1 | 3 |
| worktree sin preparar (mismo motivo) | GN1010C, OC1010C, S1010-ACT5 | 3 |
| agente estancado, cortado y reenrutado | 9 tareas | 13 |
| fallo de la propia tarea (errores de tsc) | S1010-EV-ORACLE-1a, S1010-TU-LL1 | 2 |

### Qué piezas dejaban quieta una tarea, y cómo

| Dónde | Qué hacía | Efecto |
|---|---|---|
| Escalera del director (`escalada_logica.py`) | Contaba cada fallo como un intento, también los del medio | Las raíces gastaban su «reintento gratuito 1/8» por un cerrojo de git |
| Barrido de cerrojos (`cerrojos_git.py`, vigilante) | Solo miraba los worktrees y exigía cero gits vivos | Genesis lanza `git log` cada pocos segundos, así que el `index.lock` del repo principal nunca se quitaba |
| Orquestador, `reabrir` | Devolvía la tarea al **final** de lo pendiente | Las raíces que desbloqueaban 25–29 tareas esperaban horas detrás de hojas sueltas |
| Orquestador, `espera_de_dependencias` | Una dependencia «bloqueada» cuenta como muerta | Sus dependientes salían de la tanda |
| Vigilante, `_REABIERTAS` | Una tarea reabierta una vez no recibe otra orden `reabrir` en la misma tanda | La tanda puede durar horas |
| `recomprobar_bloqueadas.py` / «Borrar las que no se pueden reaplicar» | Solo con el botón; borrar marcaba «rechazada» | Nada automático; la alternativa era tirar |
| Genesis, `medidores.ts` | Contaba como «Bloqueadas» toda tarea de una cola que esperaba a otra | 40 en la pastilla con 0 atascos reales |

## La regla nueva

**Un director nunca deja una tarea quieta: la transforma con la acción que corresponda, y anota su motivo.**

| Acción | Cuándo se aplica | Cómo llega |
|---|---|---|
| `en_cadena` | Espera a otra tarea que sí avanza | No se toca. Genesis enseña: «N esperan a X, que va por Y» |
| `priorizar` | La tanda viva no pone primero lo que más desbloquea | Reescribe el orden de la cola viva (tramo de capacidad y «Asignar ya» delante). El orquestador la relee al cambiar su fecha |
| `trasladar` | Está lista, o «bloqueada» con sus dependencias ya en main, en una cola que nadie corre | Entra en la tanda viva |
| `reintentar` | Falló el medio: cerrojo, memoria, red, cupos o estancamiento | Vuelve sin gastar intento: orden `reabrir` con el mismo contador |
| `reintegrar` | La rama ya tiene el trabajo y solo falló el merge | Vuelve. El orquestador ve el trabajo previo y salta a las puertas |
| `relajar` | Espera a algo que no va a llegar (rechazado, o sustituido sin sucesora) | Se quita la dependencia en su cola y se avisa al agente |
| `reescribir` | Falla por sí misma por segunda vez | Mensaje del director (`olas/mensajes/<id>.jsonl`) con el error exacto y el main de hoy, y vuelve |
| `reasignar` | Mismo fallo con el mismo escritor | Otro modelo: Codex por suscripción si tiene cupo |
| `dividir` | Tiene más de 3 archivos, o falla repetida con varios | Partes encadenadas de 3 archivos como máximo en `cola-revisor-<fecha>.json`. Quien dependía de ella pasa a depender de la última parte |
| `fusionar` | Es igual que otra viva (mismo título y mismos archivos) | Se queda la primera; la otra pasa a sustituida y se recablea |
| `ya_hecha` | Main ya la tiene: su commit, el de una sucesora o el de una gemela | Se cierra |
| `pedir_a_alex` | La decisión es suya (credenciales, migraciones, publicar), sin definición en ninguna cola, o 3 transformaciones en 72 h sin llegar a main | Una pregunta con dos botones en Genesis: «Rehacer con otro enfoque» o «Descartar (rama guardada)» |

**Jev** (`decidir.py`) solo **veta**, y solo con p ≥ 0,8, en las acciones que cierran o sueltan algo:
`ya_hecha`, `fusionar` y `relajar`. Si calla o duda, manda la regla.

**Límite de intentos.** Se aplica por cadena: X, Xb, X-d1… cuentan juntas.
- 25 min de respiro entre dos acciones sobre la misma tarea.
- 3 transformaciones en 72 h; después decide Alex.
- La escalera tiene su propio tope: 6 reintentos «gratis» por fallo del medio.

**Aprendizaje.** Cada acción se apunta con su clase de fallo. Cuenta como acierto si la tarea o su cadena
llega a main, y como fallo si vuelve a quedarse quieta. La próxima vez, para esa clase, se elige antes la
acción que más acierta (suavizado de Laplace), y lo ya probado en la ventana pasa al final.

## El revisor automático

Es un servicio, `scripts/puente/revisor_bloqueadas.py`, y pasa cada 5 min con `--bucle`.

**Una pasada:**
1. Quita el cerrojo de git huérfano del repo principal, si lo hay.
2. Lee las colas de código (fuente y la tanda viva), el progreso con las correcciones del director encima,
   los últimos fallos de `eventos.jsonl`, `git log main` y su propia memoria.
3. Decide con `revisor_bloqueadas_logica.py`, que es puro.
4. Aplica por los caminos que ya existen:
   - **Tarea de la tanda viva:** orden `reabrir` en `olas/control-<cola>.json`. Cerrar se escribe en
     `progreso.json`, porque ahí commit/sustituida son irreversibles.
   - **Tarea fuera de la tanda:** `progreso.json`, con el flock `~/.starseed/cerrojos/progreso.lock`.
   - **Contexto para el agente:** `olas/mensajes/<id>.jsonl`.
   - **Orden, dependencias y traslados:** los archivos de cola, con escritura atómica.
   - **Tarea que solo vive en el archivo** (`colas-fuente/`): se enlista en `cola-revisor-<fecha>.json`;
     si no, el reconciliador la cerraría como huérfana.
5. Guarda el estado y lo aprendido en `olas/revisor-bloqueadas.json`.
6. Escribe una línea por acción en el Chat Director.

**En cualquier medio**, porque se instala con la misma orden en todos:

```
python3 scripts/puente/revisor_bloqueadas.py instalar
```

- **macOS:** usa launchd (`com.starseed.revisor`, a través de `instalar-servicios.py`).
- **Linux** (contenedor o A1 de Oracle): instala la unidad `systemd --user` `starseed-revisor-bloqueadas.service`.
- Un flock asegura un solo revisor por máquina.
- Cada medio revisa las colas que corre su orquestador.

**A mano:**
- `--seco` dice qué haría sin tocar nada.
- `--json` da el informe completo.
- `decidir <id> rehacer|descartar` es lo que ejecuta el botón de Genesis.

## Genesis

El medidor «Bloqueadas» (`src/lib/mando/bloqueadas.ts` y `src/components/mando/bloqueadas-grupos.tsx`)
reparte las filas en grupos:

- **Atascadas:** lo que nadie ha movido todavía. Siguen en `BloqueadasPanel`, con sus botones.
- **Necesitan a Alex:** una pregunta por tarea, con dos botones (`POST /api/mando/medidores
  {accion:"decidir-bloqueada", id, opcion}`).
- **En cadena:** «N esperan a X, que va por Y», agrupadas por raíz.
- **Transformadas hoy:** hora, tarea, acción y motivo.

La **pastilla** cuenta solo atascadas más las que necesitan a Alex; las esperas van en el texto («40 en
cadena, avanzan solas»). Debajo de las cifras se dice a qué hora pasó el revisor por última vez y en qué
medio. Si su foto tiene más de 15 min, las cadenas se deducen de las propias fichas y se avisa.

## Cambios mínimos fuera del revisor

| Archivo | Cambio |
|---|---|
| `escalada_logica.py` | Un fallo del medio no sube la escalera (`no_cuenta`, tope 6). El contador `reintentos_medio` viaja en la corrección (`vigilante_logica.CAMPOS_CORRECCION`, `director-orquestacion.correccion_de`) y en la orden `reabrir` (`vigilante-enjambre.orden_reabrir`, que el orquestador aplica) |
| `cerrojos_git.py` | `quitar_si_huerfano`: un git que arrancó **después** de crearse el cerrojo no puede ser su dueño |
| `scripts/enjambre/starseed-enjambre.py` | `quitar_cerrojo_huerfano` sigue la misma regla de edad. El merge ff se reintenta una vez si un cerrojo huérfano lo tumbó. Una reabierta recupera su sitio y la versión vigente de su cola |
| `instalar-servicios.py` | Servicio `revisor` |

## Cómo comprobarlo

- `python3 scripts/puente/revisor_bloqueadas.py --seco`: qué haría ahora.
- `tail -f /tmp/starseed-revisor-bloqueadas.log`: una línea por pasada.
- Genesis › El trabajo ahora › Bloqueadas: las cifras y los cuatro grupos.
- Pruebas: `scripts/puente/test_revisor_bloqueadas.py`, `test_escalada_logica.py` y `test_cerrojos_git.py`;
  `src/lib/mando/__tests__/bloqueadas.test.ts` y `src/components/mando/__tests__/bloqueadas-grupos.test.tsx`.

## Segunda pasada (2026-10-10, tarde): por qué volvió a atascarse y qué cambió

Alex, a las 13:50 (hora de la Mac): «de nuevo hay muchas bloqueadas, fallidas y sin publicar que no se
procesaron automáticamente». El revisor llevaba 9 h pasando cada 5 min y decía «77 en cadena (esperan a 11
raíces que avanzan)». **Las raíces no avanzaban.** Medido a las 13:55:

| Raíz | Detrás | Lo que decía el revisor | Lo que había de verdad |
|---|---|---|---|
| PM1010F0Bc | 28 | «pendiente en cola» | `fallo_tsc` desde las 08:29 |
| XR1010Cb | 19 | «la retoma el revisor» | `fallo_tests` desde las 09:13, sin nadie que la retomara |
| XR1010Bc | 18 | «pendiente en cola» | `fallo_tsc` desde las 09:38 |
| CNS1010Mc | 1 | «pendiente en cola» | `fallo_tests` desde las 10:34 |

### Las seis causas (ninguna era de las tareas)

1. **El vigilante pedía `reabrir` UNA vez por tanda.** `_REABIERTAS` (un conjunto en memoria) recordaba
   «ya pedí reabrir PM1010F0Bc» y no volvía a pedirlo. La escalera la reabrió (1/8), volvió a fallar, y su
   «2/8» se quedó en `progreso-correcciones.json` 5 h, porque la tanda (`cola-auto-1009-233520`) llevaba 14 h
   viva. El revisor y Genesis leían esa corrección y la veían «pendiente».
2. **Deadlock entre la escalera y el revisor.** XR1010Cb tenía una «sucesora» XR1010Cc rechazada al
   instante («no tocó ninguno de sus archivos»): la escalera la daba por «con sucesora» y no la tocaba; el
   revisor esperaba a la escalera («primer fallo: lo lleva la escalera»).
3. **Ping-pong entre el vigía y el revisor.** El vigía creaba S1010-EV-ORACLE-1ab para rehacer «…-1a» y el
   revisor la fusionaba de vuelta en la fallida (mismo título y archivos): **7 veces en una hora**. Además el
   orquestador la apartó como «cerrada» al verla sustituida y ya no la volvía a coger.
4. **Paquetes declarados sin instalar.** La Ola 1010 (ea362110, 09-10 22:21) añadió `qrcode` y seis
   paquetes de XR a `package.json`; `node_modules` de la Mac era del 3 de octubre. **Cada tsc del enjambre**
   arrastraba `Cannot find module 'qrcode'` de un archivo de main y lo contaba como error de la tarea.
5. **Reparador sin cupo.** El modelo que debía arreglar los 3 errores de PM1010F0Bc contestó «Free 10M tokens
   used. Buy a subscription» y no tocó nada: contó como fallo de la tarea.
6. **Copias viejas de una cadena** (PM1010F0B y Bb con Bc viva; XR1010B con Bc; XR1010C con Cb; XR1010AA y AAb
   con AAc; S1010-TU-LL1 con LL1c) seguían «fallidas» con correcciones «pendiente» de la mañana: al morir la
   tanda se habrían rehecho en paralelo a su sucesora.

### Lo que cambió

| Dónde | Cambio |
|---|---|
| `vigilante_logica.reaperturas_de_la_tanda` + `vigilante-enjambre.py` | `reabrir` se pide **una vez por peldaño** de la escalera (intentos, reintentos del medio, modelo), guardado en `olas/reaperturas-pedidas.json` (un reinicio no lo repite). Solo si en disco sigue quieta, si la corrección responde a ESE fallo y si su cadena no sigue ya por una sucesora (`es_sucesora`: el id empieza por el suyo con sufijo de reintento, o comparten base y dicen lo mismo). Si un peldaño pedido no se mueve en 30 min, se vuelve a pedir |
| revisor · `reabrir` | Red de seguridad: corrección «pendiente» que la tanda no recoge en 20 min, o tarea que la tanda apartó como cerrada («no la repito») y volvió a pendiente. Sin gastar intento |
| revisor · `ceder` | Quieta y con sucesora viva: se cierra (`sustituida`, rama guardada) y quien la esperaba pasa a esperar a la sucesora (`_recablear`) |
| revisor · `fusionar` | Nunca entre una sucesora y su predecesora |
| revisor · escalera ausente | Si en 30 min no hay corrección de la escalera para un fallo, el revisor lo transforma él |
| revisor · último tsc | Lee `olas/logs/<id>.log`: errores de paquetes declarados sin instalar = `medio:dependencias` (espera a que se instalen y reintenta sin gastar); reparador sin cupo = `medio:proveedor` (reintenta sin gastar, con los errores exactos en el mensaje al agente) |
| revisor · dependencias | Si `package.json` declara algo que no está en `node_modules`, lo instala con el turno de la máquina (`con-turno.py -- npm install --include=dev --no-save --ignore-scripts`), como mucho cada 30 min, sin tocar `package.json` ni el lock |
| revisor · orden | La sucesora hereda a quien esperaba a su predecesora (PM1010F0Bc pasa de «+0» a «+29»); un «priorizar» que repite el orden ya no llena «Transformadas hoy» |
| revisor · cierres | Lo que cierra (ya_hecha, fusionar, ceder, dividir) va también a `progreso-correcciones.json`, para que ninguna corrección vieja lo resucite |
| revisor · tope | Los movimientos del medio (reintentar, reabrir, reintegrar) no cuentan para las 3 transformaciones que acaban preguntando a Alex |
| revisor · `aliviar_memoria` | Si en 30 min hubo fallos por memoria («tsc no terminó (sin memoria)»), hace lo del botón «Aliviar memoria» de Genesis: `POST 127.0.0.1:4444/ceder` (el servidor de voz en reposo; se relanza solo en la siguiente frase) y `POST 127.0.0.1:8000/api/bitnet/dormir` (solo si lleva 1 min sin uso). Como mucho cada 10 min; estado en `~/.starseed/revisor-alivio.json` |
| `prioridad_logica.RUTAS_CAPACIDAD` | `guardia-memoria` y `turno_pesado` son capacidad: la memoria de la Mac es el techo de todo (con la swap llena, tsc pasaba de 15 min y NINGUNA tarea cruzaba sus puertas). CNS1010Mc («matar de verdad los motores congelados») pasa a la cabeza de la tanda |

Genesis (`src/lib/mando/bloqueadas.ts`): nombres para las acciones nuevas («cede a su sucesora», «vuelta a
la tanda», «dependencias instaladas») y «el entorno» como sujeto cuando la acción no es de una tarea. La
cadena dice ahora «PM1010F0Bc falló (fallo_tsc) a las 08:29; la escalera la vuelve a poner en la tanda» en
vez de «pendiente en cola».

### Resultado medido (14:23–14:32, hora de la Mac)

- **Dependencias:** `npm install --include=dev` con el turno de la máquina: 78 paquetes añadidos y 2
  actualizados en 7 s (los 7 que declaraba `package.json` y no estaban). `package.json` y el lock, intactos.
- **Vigilante reiniciado (14:23):** pidió `reabrir` justo a las 3 que lo necesitaban (PM1010F0Bc, XR1010Bc y
  CNS1010Mc, peldaño 2) y a ninguna copia vieja; la tanda las recogió a las 14:24:25.
- **Revisor reiniciado (14:25):** 7 copias viejas cedidas a su sucesora (PM1010F0B, PM1010F0Bb, XR1010B,
  XR1010C, XR1010AA, XR1010AAb y S1010-TU-LL1), XR1010Cb reescrita con el contexto de hoy, S1010-EV-ORACLE-1a
  vuelta a la tanda. Jev no vetó ninguna (p 0,75–0,84 «sí»).
- **14:43:** el revisor alivió la Mac solo (S1010-TU-LL1b había caído por «tsc no terminó (sin memoria)»): un servidor
  de voz de 900 MB cedido; la swap pasó de 7,9 a 7,2 GB usados. CNS1010Mc, el arreglo de fondo de la memoria, a la
  cabeza de la tanda.
- **Antes → después:** raíces en fallo sin que nadie las moviera **5 → 0**; las 5 raíces de las que cuelgan
  68 tareas, **otra vez las primeras de la tanda** (XR1010Bc +38, PM1010F0Bc +29, XR1010Cb, CNS1010Mc,
  S1010-EV-ORACLE-1a); en cadena 77 → 75 (S1010-TU-LL1c entró en main y soltó a S1010-TU-LL2); fusiones de
  ida y vuelta por hora 7 → 0.

### Lo que sigue limitando (no es un bloqueo, es capacidad)

- **La Mac sola**: 8 GB, swap casi llena y el gobernador baja a 2 trabajadores.
- **La nube no ayuda a la tanda viva**: `repartir-a-nube.py` excluye todo id de la tanda viva de la Mac (para
  no hacerlo dos veces, RM6b 08-10) y el vigilante mete en esa tanda todo lo pendiente. Mover tareas de la
  tanda a la nube exige `soltar`, y una tarea soltada no vuelve a esa tanda si la nube falla: queda para una
  ola propia (pendiente de diseño, no se hace a medias).

