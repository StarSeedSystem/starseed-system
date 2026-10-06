# Aprendizaje de las ramas de la nube

> Qué pretendía cada rama `nube/*` que no llegó a main, por qué no llegó y qué se hizo con
> ella. Lo humano (las lecciones) va aquí; lo que anota sola cada pasada de
> `scripts/puente/revisar_ramas_nube.py` va a `starseed_memory_root/archivo/aprendizaje-ramas-nube.jsonl`.
> Nada se tira sin archivar: cada rama queda en `refs/archivo/nube/…` del repo de la Mac y en un
> paquete `starseed_memory_root/archivo/ramas-nube-<fecha>.bundle`
> (`git fetch <paquete> 'refs/archivo/*:refs/archivo/*'` la devuelve).

## Cómo se revisa (regla permanente · 2026-10-06)

Alex: «realiza una revisión y reactivación y si es necesario regeneración, adaptación o
transformación a las que sean útiles y funcionales en sus contextos y borra las demás, toma nota
para aprender de todo y que nada sea desperdiciado» · «utiliza mucho Jev… para esa revisión y las
próximas también».

1. `traer_nube.py` (cada 30 min, autocuración del Mando) **trae** lo que la nube integró y
   **repara** lo que quedó a medias (tarea sucesora que continúa desde la rama).
2. Lo que main ya hizo por otro camino queda **superada**, y en la misma pasada
   `revisar_ramas_nube.py` lo **revisa**: compara cada archivo de prueba de la rama con el de main
   y saca los casos con título nuevo (ni igual ni parecido: Jaccard de palabras sin acentos < 0,5).
3. **Regla**: ≥ 3 casos nuevos → rescatar; si no → archivar. **Jev** (`decidir.consultar`,
   dominio `ramas-nube`) solo cambia la regla con p ≥ 0,8 y nunca hacia archivar: veta perder, no
   da permiso para borrar. Cada decisión queda como experiencia para `decidir.py confirmar`.
4. **Rescatar** = tarea `RT<id>` en `cola-rescate-nube.json` con el código de los casos en el
   prompt (el agente no ve la rama): añade a la prueba de main solo lo que cubra algo nuevo,
   adaptado a la API de hoy, o responde `NO APLICA`.
5. **Archivar siempre antes de borrar** (sha verificado contra el remoto), anotar, y borrar del
   remoto con `--force-with-lease` (si la nube empujó algo después, no se borra).

## Revisión del 2026-10-06 (72 ramas, 39 tareas)

Medido: 38 tareas en 71 ramas + `LC1004Ad`, que llegó de la nube durante la revisión. **Ninguna
rama traía código que main no tuviera y siguiera haciendo falta**, salvo `SP092912` (una línea) y
`DIS1005F` (un documento); casi todas traían **pruebas** distintas de las de main. Jev se inclinó
por archivar las pruebas (p 0,51–0,74, por debajo de 0,8): la regla mandó rescatar y cada tarea de
rescate lleva el aviso de no duplicar; cuando terminen, `NO APLICA` frente a integradas dirá quién
acertó (confirmar las experiencias de Jev con ese dato).

Resultado: 18 tareas nuevas en `cola-rescate-ramas-1006.json` (Ola 1006R): 14 rescates de
pruebas (`RSC1006A`–`RSC1006N`) y la cadena del radar compartido regenerada (`RSC1006P` almacén,
`RSC1006Q` compartir por P2P, `RSC1006R` sumarlo al radar, `RSC1006S` federación sin radio);
`SP092912` y `DIS1005F` traídas a main; 12 tareas archivadas sin más; `LC1004Ad` sustituida por
`RSC1006G`. Expediente completo (propósitos, casos, respuestas de Jev con su experiencia):
`starseed_memory_root/archivo/revision-ramas-nube-2026-10-06.json`.

| Tarea | Propósito | Por qué no llegó | Casos nuevos | Decisión | Acción | Jev |
|---|---|---|---|---|---|---|
| `RDV8` | Radar compartido: almacén de resúmenes remotos y el propio | huérfana: su cola se movió a colas-fuente/ y reconciliar_progreso la dio por sustituida sin hacerse | 0 | regenerar | RSC1006P | regenerar-cadena p=0.58 |
| `SP092910` | Hacer que `pausado` detenga el tick de simulación | main la hizo por otro camino (la Mac u otra rama) | 9 | rescatar | RSC1006A | — |
| `SP092911` | try/finally en lanzar de laboratorio-astraura | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.39 |
| `SP092913` | Añadir role=status y temporizador al aviso de guardado | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.38 |
| `SP092914` | Usar onValueCommit en el slider de parámetros | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.38 |
| `SP092915` | Añadir etiqueta textual y aria-label a resultados | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.38 |
| `SP09298` | try/finally en ejecutar del comparador | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.43 |
| `SP092912` | Fallar duro si npm ci falla en entrypoint | un .sh de una línea sin prueba que la puerta reconociera: bloqueada en la revisión | 0 | traer | cherry-pick a main (1 línea) | regenerar p=0.78 |
| `SP09299` | Reemplazar catch vacíos por helper con telemetría | main la hizo por otro camino (la Mac u otra rama) | 7 | rescatar | RSC1006B | — |
| `SP092916` | Fallo de cupo = sin cupo, con registro | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.36 |
| `SP092924` | Manejar rechazo de onSave en permissions-popover | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.36 |
| `SP092925` | Etiquetar campos de búsqueda y formularios de gobernanza | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.44 |
| `SP092926` | Sustituir outline-none por foco visible del tema | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.33 |
| `SP092923` | Corregir sizes y preload en medios de Biblioteca | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.39 |
| `CC1003A` | Capas de conciencia por personalidad y agente: módulo puro con precede | main la hizo por otro camino (la Mac u otra rama) | 6 | rescatar | RSC1006C | — |
| `LP1003` | Local preferente: empujón a fuentes locales y OmniRoute apagado por de | main la hizo por otro camino (la Mac u otra rama) | 8 | rescatar | RSC1006D | — |
| `CC1003C` | Enrutador: capas efectivas de la personalidad y el agente, y contexto  | main la hizo por otro camino (la Mac u otra rama) | 1 | rescatar | RSC1006C | — |
| `CC1003F` | Capas por entidad: si el cálculo falla, el contexto personal vuelve al | main la hizo por otro camino (la Mac u otra rama) | 5 | rescatar | RSC1006C | — |
| `CDA1004` | Chat Director: tipos, canales, motores y último modelo (módulo puro) | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.40 |
| `CDV1004A` | Chat Director · tus mensajes a la derecha en cian («Tú») y un «respond | main la hizo por otro camino (la Mac u otra rama) | 7 | rescatar | RSC1006E | — |
| `CDV1004B` | Chat Director · la ruta deja de duplicar la entrega pendiente | main la hizo por otro camino (la Mac u otra rama) | 7 | rescatar | RSC1006E | — |
| `LC1004A` | Límites de Claude: CLI `limites_claude.py` (declarar lecturas, program | quedó a medias y otra tarea la sustituyó | 51 | rescatar | RSC1006G | — |
| `OPT1004C` | Optimizador · experimentos: base, ventana, confirmar o deshacer solo,  | main la hizo por otro camino (la Mac u otra rama) | 4 | rescatar | RSC1006H | — |
| `OPT1004D` | Optimizador · panel propio de 3 modelos gratuitos con autoenrutado por | main la hizo por otro camino (la Mac u otra rama) | 10 | rescatar | RSC1006I | — |
| `OPT1004H` | Optimizador · el Mando lo cuenta entre los directores vivos (§9) | main la hizo por otro camino (la Mac u otra rama) | 3 | rescatar | RSC1006J | — |
| `OPT1004I` | Optimizador · R9: escalera de contenedores de la nube (1 → 2 → 3 jobs) | main la hizo por otro camino (la Mac u otra rama) | 7 | rescatar | RSC1006H | — |
| `SB1004A` | Bus remoto del Mando · no pregunta a Supabase con la nube en pausa, y  | quedó a medias y otra tarea la sustituyó | 12 | rescatar | RSC1006K | — |
| `LC1004B` | Límites de Claude: lógica PURA en TypeScript (`limites-claude.ts`) con | quedó a medias y otra tarea la sustituyó | 28 | rescatar | RSC1006F | — |
| `OPT1004F` | Orquestador · aplica `rotacion-optimizada.json` del optimizador al ord | main la hizo por otro camino (la Mac u otra rama) | 3 | rescatar | RSC1006J | — |
| `DIS1005L` | Diseño · el brief inyecta el PROMPT.md del ADN y su imagen (nunca dna. | main la hizo por otro camino (la Mac u otra rama) | 3 | rescatar | RSC1006L | — |
| `DIS1005F` | Diseño · reglas fijas de interfaz para escritores y revisores en conte | main la hizo por otro camino (la Mac u otra rama) | 0 | traer | memory/diseno/reglas.md a main | traer p=0.84 |
| `PRD1005N` | Producción · panel de respaldo por roles al estilo CrewAI (lanzamiento | main la hizo por otro camino (la Mac u otra rama) | 7 | rescatar | RSC1006M | — |
| `PRD1005L` | Producción · herramientas MCP del director en `mcp_director.py` (estad | main la hizo por otro camino (la Mac u otra rama) | 6 | rescatar | RSC1006M | — |
| `BLQ1005D` | Bloqueadas · el desatascador repara en vez de rechazar (objeción como  | main la hizo por otro camino (la Mac u otra rama) | 12 | rescatar | RSC1006N | — |
| `LC1004Bd` | Límites de Claude: lógica PURA en TypeScript (`limites-claude.ts`) con | main la hizo por otro camino (la Mac u otra rama) | 15 | rescatar | RSC1006F | — |
| `LC1004C` | Consumo y créditos (datos): sustituir el crédito de Claude en la nube  | main la hizo por otro camino (la Mac u otra rama) | 15 | rescatar | RSC1006F | — |
| `LC1004E` | Pulso del trabajo: el medidor «credito-claude» enseña los límites del  | main la hizo por otro camino (la Mac u otra rama) | 15 | rescatar | RSC1006F | — |
| `DR1003-1` | Publicar commits pendientes (289 en cola) | main la hizo por otro camino (la Mac u otra rama) | 0 | archivar | — | no p=0.33 |
| `LC1004Ad` | Límites de Claude: CLI limites_claude.py (declarar lecturas, programad | 3 intentos en la nube; el último escribió 354+450 líneas y su commit final las borró (neto cero) | 42 | rescatar | RSC1006G | rescatar-pruebas p=0.51 |

## Lecciones (lo que el sistema tiene que dejar de hacer)

1. **Una rama reutilizada se pone al día con main antes de escribir.** La ola auto-1005-211229
   integró 0 de 12: las tareas reintentadas pasaban tsc y vitest sobre ramas de hace días (571,
   164, 162 commits por detrás) y fallaban en pruebas que main ya había arreglado. Arreglado en
   el orquestador (`poner_al_dia`, commit f4e70d21): rebase sobre main y, si choca, el intento
   viejo se archiva en `refs/archivo/ola/<id>/<sello>` y el agente arranca desde main sabiendo qué
   tocaba.
2. **La copia instalada del orquestador se quedaba atrás.** `~/.local/bin/starseed-enjambre.py` no
   tenía cambios que llevaban días en main porque nadie corría `instalar.sh`. Ahora
   `lanzar-enjambre.sh` lo instala antes de lanzar si el repo trae uno más nuevo y que parsea.
3. **La nube y la Mac hacían la misma tarea.** 28 de las 39 tareas con rama en la nube también
   las integró la Mac por su cuenta: dos implementaciones, dos juegos de pruebas, y una de las dos acaba aquí.
   El reparto a la nube debería soltar en la nube lo que la Mac ya integró (hoy solo lo mira al
   arrancar el job).
4. **«Huérfana» no es «hecha».** `reconciliar_progreso.py` marca «sustituida (huérfana)» toda
   tarea que ya no define ninguna cola de `olas/`; mover una cola a `colas-fuente/` (lo que pide
   CLAUDE.md para no duplicar ids) la deja huérfana aunque no se hiciera. Así se perdió la mitad
   de la Ola 375 (radar compartido) y hay 56 tareas en ese estado (11 pendientes y 20
   bloqueadas). Revisarlas como estas ramas: propósito frente a main, regenerar lo que siga
   haciendo falta.
5. **Integrado no es aplicado, también en la nube.** El último intento de `LC1004Ad` escribió la
   CLI y sus 42 pruebas en el salvavidas y su commit final las borró: la nube lo dio por integrado
   con un cambio neto de cero. Un commit de integración que borra lo que el salvavidas creó
   tendría que tumbar la tarea.
6. **Un arreglo de una línea en un `.sh` no tiene puerta.** `SP092912` era correcto y se quedó
   bloqueado porque la revisión no tenía prueba que reconocer; `test_guiones_parsean.py` sí
   comprueba que parsea: esa es la prueba para los guiones.
