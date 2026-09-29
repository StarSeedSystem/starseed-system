# SOP · Sueños profundos (2026-09-29)

> **Encargo de Alex:** «a través del Puente de Mando orquesta una flota de agentes de sueños
> profundos que pueda llevar varias horas, donde analicen a detalle cada área de todo StarSeed
> OS para buscar mejoras y optimizaciones potenciales como recomendaciones para próximas
> olas». Y: «para los sueños del Puente de Mando utiliza tus modelos de Claude como directores,
> supervisores y verificadores, y los modelos de las APIs gratuitas y contenedores del Puente
> de Mando y de los 250 $ de crédito de Claude en la nube». Y: «recuerda usar localhost y la
> terminal para controlar el Puente de Mando». Y: «usa todas las habilidades y herramientas del
> Puente de Mando y del workflow como Jev y demás conectores y utilidades».

El Dream de Hermes lee REGISTROS una vez al día. Los sueños profundos leen CÓDIGO, área por
área y con seis lentes, y dejan cada hallazgo citado (`archivo:línea`) para que Claude lo
compruebe antes de que se convierta en trabajo. Nada de esto escribe en el repositorio: el
resultado es un informe y una cola PROPUESTA que una persona abre en el Diseñador de olas.

## 1. Las tres capas

| capa | quién | coste | qué hace | dónde |
|---|---|---|---|---|
| A · trabajadores | el orquestador único (`starseed-enjambre.py`) con tareas `tipo: "analisis"` | **cero crédito de Claude**: flota gratuita (llm7, NIM, xKiro `:free`, Groq, AIHubMix, OpenRouter solo `:free`, Gemini al final) | lectura compartida → síntesis → contraste; un informe por área × lente | `scripts/enjambre/analista.py` |
| B · dirección, supervisión y verificación | **Claude**: sesiones en la nube (tarea programada, crédito de 250 $) y la sesión interactiva | crédito de Claude, poco y corto | lanzar, desatascar, verificar 3-6 informes por pasada abriendo el código citado, consolidar | `scripts/puente/suenos.py` + `scripts/puente/supervisor_suenos.md` |
| C · consolidación | `director_suenos.py` (Python puro) + **Jev** de consejero | cero (Jev: BitNet local primero; OpenRouter con techo diario) | rechazos, ajustes, duplicados, ranking, INFORME.md, cola propuesta, avisos | `scripts/puente/director_suenos.py` |
| D · Mando | `/api/mando/suenos` + panel «Sueños profundos» en Procesos | cero (lee disco local, sin Supabase) | rejilla área × lente, quién verificó, recomendaciones, lanzar, «Abrir en Diseñador» | `src/lib/mando/suenos*.ts`, `src/components/mando/panel-suenos.tsx` |

## 2. El plan: áreas × lentes (`scripts/puente/suenos_areas.py`)

- **Áreas** = `AREAS_TRABAJO` de `src/lib/mando/areas.ts` (11) + `mando`, `dashboards`,
  `gobernanza`. Cada área tiene sus raíces en el repo (`RAICES`). `test_suenos_areas.py` se
  pone rojo si areas.ts gana o pierde un área sin raíces aquí.
- **Lentes** (definidas en `analista.py`, una sola verdad): `arquitectura-deuda`,
  `ux-accesibilidad-diseno`, `rendimiento-consumo` (RAM de 8 GB, salida y peticiones de
  Supabase, bundle), `seguridad-privacidad` (**privada**: solo en la Mac), `pruebas-fiabilidad`,
  `coherencia-triada` (CLAUDE.md §3/§6).
- **Ids** `SA<MMDD><n>` (≤ 9, `^[A-Za-z][A-Za-z0-9]{0,8}$`), `n` = índice canónico área × lente:
  el mismo sueño tiene el mismo id todo el día, así relanzar no duplica.
- **Mismo conjunto de archivos para las seis lentes de un área** (documentos que mandan +
  código repartido por turnos según la relevancia de cada lente): es lo que permite leer cada
  trozo UNA vez. Profundidad: 16 archivos por área hasta 1 h, +6 por hora, máx. 48.
- **`--horas N`** solo da la PROFUNDIDAD (archivos por área). No hay pausa global: el ritmo lo
  pone el cupo por minuto de cada proveedor (primera sesión real, 2026-09-29: con 104 s de pausa
  entre llamadas, 4 informes en 151 min). Al relanzar una sesión con `--fecha`, se reusan sus
  horas para aprovechar la lectura ya hecha. Nunca salen `.env`, `.pem`…

## 3. El analista (`scripts/enjambre/analista.py`)

1. **Lectura compartida (map).** Trozos de ≤ 16.000 caracteres con líneas numeradas (caben en
   Groq, 7.000 tokens), cada uno leído por un modelo rápido con las seis lentes a la vez y
   guardado en `dream/profundo/<fecha>/.mapa/<hash>.json`. Cerrojo por trozo: los sueños de
   la misma área se reparten la lectura; seis veces menos llamadas.
2. **Síntesis (reduce).** Un modelo capaz (kimi-k3, qwen3.8-max, deepseek-v4-pro, glm-5.3…;
   si no hay ninguno, cualquiera de la flota) funde las observaciones de SU lente en ≤ 10
   hallazgos: cita, impacto 1-5, esfuerzo 1-5, confianza 0-1, propuesta ≤ 3 archivos / ≤ 120 líneas.
3. **Contraste.** OTRO proveedor recibe cada hallazgo con el fragmento REAL (± 6 líneas, leído
   del disco por el analista) y dice confirmado · dudoso · refutado. Lo refutado sale del
   informe (queda en «Descartados»). Una cita inexistente pierde la mitad de la confianza.

**Flota viva y salud de sesión (2026-09-29, tras la primera sesión real).** La flota no es una
lista fija: el orquestador la calcula (`_flota_analisis` → `analista.flota_desde`) con lo que el
informe de pasarelas da por vivo (`~/.starseed/pasarelas-informe.json`, la «puerta de
pasarelas»), la rotación de escritores, los revisores y las sondas; solo proveedores que
`llamar_llm` sabe llamar, nada de pago y OpenRouter solo `:free`; se relee cada 3 min y, si el
informe tiene más de 15 min, se renueva en segundo plano. La salud es de la SESIÓN y la comparten
todos los sueños (`SaludFlota`): 403/404/410/«model not found» → fuera al primer intento; sin
clave → fuera; sin cuota → 1 h fuera; 429 → ese modelo 90 s y su proveedor 30 s; 5xx/timeout →
60 s, creciente; dos respuestas sin el JSON pedido → 10 min, cinco → fuera. Reparto por turnos
entre TODOS los proveedores sanos (el menos usado primero; los de cupo por minuto lleno, al final).
Sin nadie sano se espera en tramos cortos releyendo la flota; si ya no queda nadie que pueda
volver, fallo al momento. Tope por defecto: 8 sueños a la vez.

**JSON robusto.** `extraer_json(texto, clave)` busca objetos balanceados en cualquier parte
(razonamiento «We need to output JSON…», vallas ```json, prosa), prefiere el que trae la clave
pedida y, si la respuesta llegó cortada por max_tokens, rescata los elementos completos de la
lista. A Groq, OpenRouter, Gemini y NIM se les pide modo JSON (se aprende y se quita si alguno lo
rechaza con 400/422). Salida de la lectura: 4000 tokens (Groq 1800 por su límite por minuto).

Cuotas: todo pasa por `llamar_llm` del orquestador (cupos RPM, rotación de claves, avisos de
cuota). Salida:
`<área>--<lente>.md` (formato del Dream: Top 3 accionables · Mejoras · Riesgos · Ideas, que
`dream_a_cola.py` sabe leer) y `.json`. Estado final en progreso.json: **`informe`** (nunca
«sin_cambios») o `fallo`. Al bus solo `inicio` e `informe`/`fallo` por sueño; los pasos van a
`olas/pasos/<id>.jsonl` y el detalle a los latidos locales (fase `analizando`, subfase, tokens
estimados).

**En el orquestador**: rama temprana en `ejecutar()` para `tipo == "analisis"` (sin worktree,
sin tsc/vitest, sin integración, sin arriendo: el analista se reclama la tarea en
`.reclamos/`), tope propio `STARSEED_TOPE_ANALISIS` (o `tope_analisis` del plan, 5 por
defecto; < 400 MB libres → la mitad, < 200 MB → 1), y una cola solo de análisis no exige árbol
limpio ni corre tsc/vitest al final.

## 4. Verificación por Claude (`suenos.py` + `supervisor_suenos.md`)

```
python3 scripts/puente/suenos.py estado                 # rejilla, proveedor, tokens, tiempo, veredicto
python3 scripts/puente/suenos.py por-verificar --n 6    # los de más peso primero, con sus citas
python3 scripts/puente/suenos.py veredicto SA092967 --estado verificado --nota "abrí x.ts:40…" --por claude-opus-5.5
python3 scripts/puente/suenos.py veredicto SA092967 --estado ajustado --hallazgo 2 --esfuerzo 4 --rechazar-hallazgos 5 --nota "…" --por claude-sonnet
python3 scripts/puente/suenos.py consolidar             # INFORME.md + cola propuesta + avisos
python3 scripts/puente/suenos.py latido --agente claude-sup-1 --fase "verificando"   # el supervisor en el Mando (medio «claude»)
```

`verificaciones.jsonl` solo se añade. Verificar con correcciones cuenta como «ajustado». El
protocolo horario completo, listo para pegar en una tarea programada: `scripts/puente/supervisor_suenos.md`.

## 5. Consolidación y Jev (`scripts/puente/director_suenos.py`)

Rechazado fuera · ajustes aplicados · duplicados fundidos (misma clave del Dream o cita a ±3
líneas) · orden: **tramo de capacidad primero** (`prioridad_logica.es_de_capacidad`), luego
accionable antes que no, luego verificación (1 · 0,8 · 0,4) × impacto/esfuerzo × confianza.

**Jev de consejero** (contrato de `POST /api/jev/systemone`, `jev.contrato`): a los 30 primeros
(`STARSEED_SUENOS_JEV_MAX`) se les pregunta «¿accionable?» (sí/no con probabilidad) y «¿qué
prioridad?» (alta · media · baja). Pirámide de Jev: BitNet local → Laya → OpenRouter con su
techo diario; lo privado solo en local; sin presupuesto, todo a local. Consejero, nunca
oráculo: Jev solo VETA lo accionable con p < 0,2 y cambia la prioridad con confianza ≥ 0,6. Sin
Jev manda la regla y queda escrito («regla: media»).

Escribe `dream/profundo/<fecha>/INFORME.md` (resumen ejecutivo, top 15 con columna Jev, por
área, riesgos, cómo seguir), `consolidado.json` (lo que pinta el Mando) y
`olas/cola-suenos-propuesta-<fecha>.json` (≤ 15 tareas ≤ 3 archivos, `aprobacion: true`,
`importancia: "capacidad"` cuando toca, `privado` en las de seguridad). **La propuesta no se
lanza**: el vigilante ignora toda `cola-suenos-*` (`vigilante_logica.PREFIJO_SUENOS`). Lo ya
propuesto (memoria `~/.starseed/dream-encargado.json`, la del Dream) no se repite. Avisos: canal
común, UN evento `informe` de `director-suenos` en el bus (bandeja de Reportes del Mando) y,
solo con la sesión completa, Telegram por Hermes (`hermes send -t telegram:Maggasukha -s …`).

## 6. Un solo orquestador

`suenos.py lanzar` escribe `olas/cola-suenos-<fecha>.json` y `dream/profundo/<fecha>/plan.json`, y:
- si ya hay un orquestador soñando esta sesión → la releerá (acción `releida`);
- si hay OTRO orquestador vivo que sabe soñar (arrancó después de instalar el analista) → le
  añade las tareas a su cola viva (acción `tanda_viva`): los sueños van con su tope propio y no
  quitan huecos a los agentes de código;
- si ese orquestador es viejo o va con `--solo` → NO lanza otro (acción `esperar`; `--forzar`
  lo haría, HTTP y ~80 MB, solo si Alex lo pide);
- sin orquestador → lo pide al Mando (`POST localhost:9002/api/mando/colas`, «aquí») y, si el
  Mando no contesta, lo arranca directamente como hace el Mando (`python3 -u … --workers N`);
- si la copia instalada no sabe soñar → acción `instalar` con la orden exacta.
`--donde` solo admite `mac`: allí están las claves de la flota y la lente privada no sale.

## 7. Despliegue y lanzamiento en la Mac (terminal y localhost)

```bash
cd ~/Documents/starseed-os-main
# 1) traer la rama (la trae el coordinador por git bundle en .transfer/, o por origin)
git fetch -q .transfer/<paquete>.bundle ola0929-suenos:suenos && git merge --ff-only suenos
# 2) instalar el orquestador y sus módulos (copia TODO .py de scripts/enjambre a ~/.local/bin)
bash scripts/enjambre/instalar.sh && bash scripts/enjambre/instalar.sh --comprobar
# 3) pruebas de lo nuevo (segundos)
python3 -m pytest -q scripts/enjambre/test_analista.py scripts/puente/test_suenos.py scripts/puente/test_suenos_areas.py scripts/puente/test_director_suenos.py
# 4) el Mando sirve el build compilado: reconstruir con el turno de la máquina (enjambre parado, §0)
python3 scripts/puente/reconstruir_mando.py --una-vez
# 5) ver el plan y lanzar (todas las áreas × lentes, repartido en 4 h)
python3 scripts/puente/suenos.py plan --horas 4
python3 scripts/puente/suenos.py lanzar --horas 4
#    o solo algunas:  --areas mando,voz --lentes rendimiento-consumo,pruebas-fiabilidad
python3 scripts/puente/suenos.py estado
```

Por localhost (lo mismo, desde el Mando o con curl):

```bash
open "http://localhost:9002/mando?pestana=procesos"          # panel «Sueños profundos»
curl -s http://localhost:9002/api/mando/suenos | python3 -m json.tool | head -60
curl -s -X POST http://localhost:9002/api/mando/suenos -H 'Content-Type: application/json' \
     -d '{"accion":"lanzar","horas":4,"areas":[],"lentes":[]}'
curl -s -X POST http://localhost:9002/api/mando/suenos -H 'Content-Type: application/json' -d '{"accion":"consolidar"}'
curl -s -X POST http://localhost:9002/api/mando/suenos -H 'Content-Type: application/json' -d '{"accion":"a-disenador"}'
# la cola de sueños ya escrita también se puede lanzar por la API de colas del Mando:
curl -s -X POST http://localhost:9002/api/mando/colas -H 'Content-Type: application/json' \
     -d '{"accion":"lanzar","nombre":"suenos-2026-09-29","donde":"mac","workers":3}'
```

Luego, la tarea programada «Supervisor de sueños» (cada hora, «Requerir esta computadora»)
con el bloque de `scripts/puente/supervisor_suenos.md`.

## 8. Cambio en caliente de una sesión en marcha

```bash
cd ~/Documents/starseed-os-main
git fetch -q .transfer/<paquete>.bundle ola0929-suenos:suenos && git merge --ff-only suenos
bash scripts/enjambre/instalar.sh && bash scripts/enjambre/instalar.sh --comprobar
python3 scripts/puente/suenos.py detener --fecha <fecha> --seco    # qué pid pararía
python3 scripts/puente/suenos.py detener --fecha <fecha>           # SIGTERM solo a ese orquestador
python3 scripts/puente/suenos.py lanzar --fecha <fecha>            # mismas horas; lo escrito se conserva
python3 scripts/puente/suenos.py estado
```
`detener` toma el flock de `progreso.json` (`~/.starseed/cerrojos/progreso.lock`) mientras
manda la señal, así el orquestador nunca muere a medio escribir el progreso (que no se escribe
con renombrado atómico), y no manda SIGKILL. (El botón «detener» del Mando busca con
`pgrep -af`, que en macOS solo imprime pids: allí no encuentra la cola; usa la CLI.)
Parar con SIGTERM no pierde nada: los informes escritos se saltan al relanzar, la lectura
compartida (`.mapa/`) se reutiliza y los reclamos y cerrojos de un proceso muerto se rompen solos.

## 9. Límites honestos

- Los tokens de los sueños son **estimados** (3 caracteres por token, como `limite_proveedor.py`):
  `llamar_llm` no devuelve el uso real de cada pasarela.
- Algunos ids de modelo de la flota pueden no existir en su catálogo el día que se lance: fallan
  en segundos y la rotación sigue, pero conviene mirar `analizando · subfase` las primeras horas.
- La calidad del hallazgo depende de modelos gratuitos: por eso existe el contraste y, sobre
  todo, la verificación por Claude. Un hallazgo «sin verificar» pesa 0,4 en el orden.
- La cola propuesta nunca se lanza sola; si se guarda en el Diseñador con otro nombre, el
  vigilante sí la coge (cada tarea espera el visto bueno antes de integrar).
