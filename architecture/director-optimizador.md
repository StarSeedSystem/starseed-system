# Director optimizador — contrato (Ola 1004O · 2026-10-04)

> **Petición de Alex (2026-10-04):** «añade un agente director optimizador que sea analista
> perfeccionista de todos los procesos para la mayor eficiencia y eficacia, que use mucho Jev y
> Laya para usar la mayor cantidad de agentes simultáneos sincronizados y tareas activas y
> contenedores disponibles, todo buscando los mejores y mayor cantidad de modelos y APIs y canales
> con las opciones más económicas pero funcionales, y que verifique constantemente los resultados
> para optimizaciones constantes de las habilidades, memorias, contextos, recuerdos, herramientas,
> conectores, enrutamientos, y use en sí mismo varios modelos autoenrutándose y mejorándose para
> los mejores resultados».

Este documento es la fuente de verdad del director optimizador. Lo que no esté aquí no forma
parte del contrato. Nombre del servicio: `optimizador` (launchd `com.starseed.optimizador`);
`quien` en el canal y `de` en el Chat Director: `director-optimizador`.

## 1. El ciclo (cada `intervalo_s`, 600 s por defecto)

1. **Medir** (puro, §2). Solo lee archivos que ya existen. No llama a ningún modelo.
2. **Diagnosticar** (puro, §3). Reglas deterministas convierten las métricas en *hallazgos*, y
   cada hallazgo propone como mucho una *acción*.
3. **Decidir con Jev/Laya** (§4). Todas las acciones del ciclo van en UNA llamada
   `decidir.consultar_lote` (pirámide caché → BitNet local → Laya → OpenRouter). Jev puede frenar
   una acción que la regla propone, pero nunca convertir un «no» de la regla en «sí».
4. **Actuar** solo sobre las perillas de la lista blanca (§5), con límites y siempre reversible.
5. **Verificar** (§6). Cada cambio es un *experimento* con métricas base. Al cerrar su ventana se
   comprueba: si mejoró, se queda; si no, se deshace solo. El resultado se le devuelve a Jev
   (`decidir.py confirmar <exp> --acierto si|no`) para que aprenda.
6. **Informar** (§8). Una vez por hora, un informe en el Chat Director. Un aviso inmediato solo si
   un cambio se deshace o una métrica cae en rojo.

Una vez por hora se hace además el **análisis profundo** con el panel de modelos (§7), que propone
mejoras de habilidades, memorias, contextos, herramientas, conectores y enrutamiento. Esas
propuestas NO se aplican solas: se convierten en tareas de una cola `cola-optimizador-<AAAAMMDD>.json`
(como mucho `max_tareas_dia`) y pasan por las puertas normales del enjambre.

## 2. Métricas (`scripts/puente/optimizador_metricas.py`, puro)

Fuentes, todas opcionales (si una falta, su métrica sale `null` con el motivo):
`starseed_memory_root/olas/pasos/*.jsonl`, `olas/eventos.jsonl` (solo las últimas 24 h),
`olas/progreso.json`, `olas/medios.json` (`historial`), `olas/latidos-*.json`,
`~/.starseed/gobernador.json`, `~/.starseed/salud-proveedores.json`,
`~/.starseed/pasarelas-informe.json`, `mando/tokens-por-segundo.json`, `~/.starseed/consumo.json`,
`~/.starseed/jev-uso.json`, `mando/contenedores.json`, `~/.starseed/limites-claude.json`,
`~/.starseed/nube-pausada.json`.

`medir(fuentes, ahora, ventana_h=6) -> dict` devuelve:

| Clave | Qué es |
|---|---|
| `integradas_h` | tareas que pasaron a `commit` por hora en la ventana |
| `trabajadores` | `{tope_gobernador, vivos, escribiendo, en_puerta, ociosos}` desde los latidos |
| `listas` | tareas que se pueden coger ya (misma regla que el Mando) |
| `fracción_escribiendo` | tiempo escribiendo / tiempo total de las tareas de la ventana |
| `fases` | `{fase: {n, segundos_mediana, segundos_p90, fallos}}` (escritura, tsc, tests, revisión, integración…) |
| `modelos` | `{modelo: {intentos, con_cambios, integradas, sin_cambios, colgados, segundos_mediana, tasa}}` (`tasa` = integradas/intentos) |
| `proveedores` | `{proveedor: {estado, sin_cupo_hasta, modelos_utiles, en_rotacion}}` |
| `sin_usar` | modelos útiles según `pasarelas-informe` que NO están en la rotación |
| `memoria` | `{swap_usado_mb, swap_total_mb, ram_libre_mb}` (del gobernador) |
| `coste` | `{jev_dia_usd, opus_semana_pct, supabase_pct_dia}` |
| `nube` | `{pausada, motivo, contenedores_libres}` |

## 3. Reglas (`scripts/puente/optimizador_reglas.py`, puro)

`diagnosticar(m, config, historial_cambios) -> [hallazgo]`. Cada hallazgo es `{id, gravedad
(info|aviso|rojo), texto, evidencia, accion|null}`. Las reglas mínimas:

- **R1 · Capacidad ociosa.** Si `listas > vivos`, hay RAM libre (`ram_libre_mb ≥ 1200`) y el swap
  está bajo el 75 %, propone `subir_trabajadores` +1, sin pasar de `maximo_por_hardware`.
- **R2 · Mac saturada.** Si el swap pasa del 90 % o `ram_libre_mb < 300` con trabajadores > 1,
  propone `bajar_trabajadores` −1 (el gobernador ya frena; esto evita que se vuelva a subir).
- **R3 · Modelo improductivo.** Con ≥ 6 intentos en la ventana y `tasa < 0.1` (o `sin_cambios +
  colgados ≥ 80 %`), propone `bajar_en_rotacion`.
- **R4 · Modelo estrella.** Con `tasa ≥ 0.4` y ≥ 4 intentos, sin estar entre los 3 primeros,
  propone `subir_en_rotacion`.
- **R5 · Escritores sin usar.** Para cada modelo de `sin_usar` con prueba reciente que «escribe»,
  propone `probar_modelo` (entra al final de la rotación como experimento).
- **R6 · Puerta cuello de botella.** Si una fase de puerta ocupa más del 50 % del tiempo y su p90
  pasa de 15 min, hallazgo `aviso` con acción `proponer_tarea` (la tarea la escribe §7).
- **R7 · Nube.** Con la nube en pausa, `listas ≥ 2 × vivos` y los escritores locales con
  `tasa < 0.15`, hallazgo `aviso` que propone a ALEX reactivar la nube. Nunca la reactiva solo.
- **R8 · Coste.** Si `opus_semana_pct ≥ 60`, `jev_dia_usd ≥ 80 %` del tope o `supabase_pct_dia ≥
  70`, hallazgo `rojo`, y el optimizador deja de usar el modelo de pago en §7 ese día.

Una acción se descarta si la misma perilla cambió hace menos de `enfriamiento_min` (60), o si el
día ya lleva `max_cambios_dia` (12) cambios.

## 4. Jev y Laya

- Las acciones del ciclo se preguntan en un `consultar_lote` con `quien="director-optimizador"`,
  `dominio="optimizacion"`, el estado recortado (métricas + hallazgo) y una pregunta `si-no` por
  acción («¿aplicar X dada esta evidencia?»). Se aplica si la regla dice sí y Jev no frena:
  `p(no) < 0.8`, el mismo umbral que `director_jev.UMBRAL_FRENADO`.
- Las propuestas del panel (§7) se ordenan con `puntuar` (niveles `bajo,medio,alto`).
- Se usa la pirámide completa. Laya entra cuando hay RAM (su propio servidor decide). El coste lo
  vigila `jev-uso.json` y la regla R8.
- Si Jev no contesta, manda la regla, como en toda la casa.

## 5. Perillas (lista blanca; todo lo demás es propuesta)

| Acción | Dónde escribe | Límites |
|---|---|---|
| `subir_trabajadores` / `bajar_trabajadores` | `director-config.json → trabajadores`, con `config_director` | 1 ≤ n ≤ `maximo_por_hardware`; el gobernador sigue mandando por RAM |
| `subir_en_rotacion` / `bajar_en_rotacion` / `probar_modelo` | `~/.starseed/rotacion-optimizada.json` | como mucho 3 modelos apartados a la vez; caducan a las 12 h |

`~/.starseed/rotacion-optimizada.json` = `{t, delante: [modelo…], detras: [modelo…], probar:
[modelo…], caduca: ISO}`. El orquestador (§9) lo lee al construir la rotación de cada tarea:
`delante` primero, `detras` al final y `probar` justo antes de `detras`. Si el archivo caducó o está
roto, se ignora.

Nunca toca credenciales, claves, `git push`, la nube, servicios de launchd, Supabase ni datos de
nadie. Nunca borra nada.

## 6. Experimentos (`scripts/puente/optimizador_experimentos.py`)

`~/.starseed/optimizador/experimentos.jsonl`, append-only. Cada registro es
`{id, t, accion, perilla, antes, despues, metrica_objetivo, base, ventana_min (120), jev_exp,
estado (abierto|confirmado|deshecho), cierre}`. `evaluar(exp, m_actual) -> confirmar|deshacer|esperar`
(pura). Se confirma si la métrica objetivo mejora al menos un 10 % o no empeora con menos coste. Si
empeora, se deshace escribiendo `antes`. Al cerrar, `decidir.py confirmar <jev_exp> --acierto`.

## 7. Panel de modelos propio (`scripts/puente/optimizador_panel.py`)

- Una vez por hora, el análisis profundo pregunta a **K = 3** modelos de la flota gratuita: los de
  mejor `tasa` en `pesos-modelos.json` entre los `modelos_utiles` de `pasarelas`, más uno de
  exploración. Se les da el resumen de métricas y hallazgos, y se les pide JSON:
  `{propuestas: [{area: habilidades|memorias|contextos|recuerdos|herramientas|conectores|enrutamiento|capacidad, titulo, por_que, archivos: [≤3], prompt}]}`.
- Las propuestas se fusionan (las repetidas suman votos) y se puntúan con Jev. Las `alto` se
  convierten en tareas de `olas/cola-optimizador-<AAAAMMDD>.json`, con ids `OPZ<MMDD>-<n>` y
  como mucho `max_tareas_dia` (6).
- **Autoenrutado:** `~/.starseed/optimizador/pesos-modelos.json` =
  `{modelo: {propuestas, integradas, confirmadas, peso}}`. Cuando una tarea OPZ se integra (o su
  experimento se confirma), el modelo que la propuso sube de peso; si se rechaza, baja. El panel
  elige con esos pesos, con un 20 % de exploración.
- **Opus** (`opus_director`, con sus topes) solo entra en el análisis semanal del lunes, y solo si
  `limites-claude.json` proyecta menos del 60 % de la semana.

## 8. Informe

`director_chat.publicar(texto, de="director-optimizador", rol="director", tipo="informe")` una vez
por hora. Lleva: integradas/h y tendencia, fracción escribiendo, trabajadores (tope/vivos/escribiendo),
los 3 mejores y los 3 peores modelos, cambios aplicados con su experimento, experimentos cerrados,
propuestas encoladas y coste (Jev, Opus, Supabase). Además escribe `quien="director-optimizador"`
en `canal.jsonl` para que el Mando lo cuente vivo.

## 9. Integración

- `scripts/puente/director-optimizador.py`: el bucle. Admite `--una-vez` y `--seco` (mide,
  diagnostica y decide, pero no escribe perillas ni publica: lo imprime).
- `scripts/puente/instalar-servicios.py`: servicio `optimizador`, envuelto con `lanzador-tcc.py`
  como los demás que leen `~/Documents`.
- `scripts/enjambre/starseed-enjambre.py`: aplica `rotacion-optimizada.json` al construir `base`.
- `config_director.py` y `director-config.ts` (espejos): bloque `optimizador: {activo: true, modo:
  "actuar"|"proponer", intervalo_s: 600, max_cambios_dia: 12, max_tareas_dia: 6,
  enfriamiento_min: 60}`. Con `modo: "proponer"` no escribe perillas, solo informa.
- `src/lib/mando/director-datos.ts`: `"optimizador"` entra en `DIRECTORES`.
