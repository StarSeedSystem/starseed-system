# Aprobador automático del visto bueno (DSB1010 · 2026-10-10)

**Petición de Alex:** «hay muchas bloqueadas, fallidas y sin publicar que no se procesaron
automáticamente… que se procesen automáticamente con todos los directores».

## Qué pasaba (medido el 2026-10-10 en la Mac)

- De las últimas 40 ramas que llegaron a la puerta de visto bueno (`eventos.jsonl`), las 40
  traían `tsc 0 · tests ok`: 29 esperaban por «revisión bloqueante» y 11 con la revisión en verde.
- Cada una retenía un trabajador hasta 20 min (`STARSEED_ESPERA_APROBACION_S`) aunque el
  desatascador ya hubiera creado su sucesora a los 6 min.
- Al agotar la cadena sus reparaciones, la rama quedaba en `pendiente_aprobacion` sin nadie que
  decidiera (S1010-TU-LL1c, con S1010-TU-LL1 y LL1b repitiendo el mismo encargo).
- El contador de reparaciones del desatascador (`desatascar-reparaciones.json`) sube en cada
  pasada de 3 min, no en cada eslabón: las cinco ramas atascadas marcaban 5 «intentos». El
  aprobador cuenta el intento por la letra del eslabón (`PM1010F2F` = 1, `CNS1010Mb` = 2,
  `S1010-TU-LL1c` = 3), que es lo que de verdad se gastó.

## La regla

Decide la máquina con lo que ya sabe: dictamen del revisor, puertas, radio de impacto e intento de
la cadena. **Jev solo puede VETAR** (respuesta «no», p ≥ 0,8, de un motor de verdad; nunca convierte
un «no» en «sí»). A Alex solo le llegan cuatro cosas:

| Reservado para Alex | Cómo se detecta |
|---|---|
| Dependencias de producción | `dependencies` cambiadas o quitadas, lock sin package.json, Cargo de la app nativa |
| Migraciones | `supabase/migrations/**`, `*.sql` de migraciones |
| Claves | `.env*` (no las plantillas) o un hallazgo del escáner de `produccion_puertas` |
| Publicación de apps nativas | `tauri*.conf.json`, manifiestos nativos, workflows de release/nativas |

Excepción (XR1010A): **añadir** paquetes con licencia permisiva (MIT, Apache-2.0, BSD, ISC, MPL…)
en un diff que solo toca `package.json`, `package-lock.json` y pruebas entra solo. GPL/AGPL o
licencia desconocida → Alex.

| Situación | Acción |
|---|---|
| < 8 min en la puerta | esperar (primero actúan revisor y desatascador) |
| reservada | `reservar_alex`, aviso UNA vez en el Chat Director |
| su sucesora ya lleva el encargo | `liberar`: orden `rechazar` (suelta el trabajador) + corrección «sustituida» |
| otra copia de su cadena escribiendo | esperar |
| no consta tsc 0 y pruebas ok | esperar (nunca se integra a ciegas) |
| revisión en verde (o sin revisor e impacto bajo) | `aprobar`, salvo veto de Jev |
| bloqueante, intento 1-2 | esperar: la repara el desatascador con la objeción |
| bloqueante, intento ≥ 3, impacto bajo | `aprobar_con_seguimiento`: entra lo verde y la objeción sale como tarea `<id>obj` en `cola-seguimientos.json` |
| bloqueante, intento ≥ 3, impacto alto o veto de Jev | `rechazar` con la objeción a la vista |

Impacto alto: grafo del código `high/critical`, toca el núcleo (layout raíz, middleware,
`next.config`, providers, cliente de Supabase, autopublicación), > 6 archivos o > 600 líneas.

## Cómo se aplica (caminos que ya existían)

- Rama viva (`esperando_aprobacion`): orden `aprobar`/`rechazar` en `olas/control-<cola>.json`
  de la cola cuyo latido lleva la tarea (lo mismo que Genesis y `starseed-puente`).
- Rama suelta (`pendiente_aprobacion`): con el cerrojo `integrar`, sus commits se aplican en un
  árbol de trabajo TEMPORAL y limpio sobre main, main avanza por fast-forward y pasan las puertas
  de `traer_nube` (tsc + pruebas relacionadas); si no pasan, `reset --keep`. Si no entra sobre
  el main de hoy, se repara desde su rama (`POST /api/mando/reintentar`). Una por pasada.
- Estado y avisos: `starseed_memory_root/mando/aprobador-automatico.json`; cada acción, una línea
  en el Chat Director (`de: aprobador`).

## Dónde vive

- `scripts/puente/aprobador_logica.py` — decisión PURA (`decidir`, `reserva_para_alex`,
  `radio_de_impacto`, `intento_de_cadena`, `tarea_seguimiento`); pruebas en `test_aprobador_logica.py`.
- `scripts/puente/aprobador_automatico.py` — reúne datos y aplica; a mano:
  `python3 scripts/puente/aprobador_automatico.py [--aplicar] [--sin-jev] [--json]`.
- `scripts/puente/director-orquestacion.py` — lo llama en cada pasada (cada 180 s) y, si corre,
  sustituye a la aprobación antigua («solo verde y pedido por la cola»).
