# Contrato de proveedores de modelos: abliteration.ai, modelo privado del A1 y ramas de la Biblioteca (MOD1116)

Fuente: código de las tareas MQA1–MQA7, MQB1–MQB5, MQC1–MQC4.

---

## 1. abliteration.ai — proveedor de pago por saldo

**Qué es** (`scripts/puente/abliteration.py:4–10`): API compatible con OpenAI (`POST https://api.abliteration.ai/v1/chat/completions`), clave en `ABLITERATION_API_KEY`, modelo `abliterated-model` (256K contexto, texto e imagen, herramientas; $1 entrada / $0,10 entrada en caché / $3 salida por millón). Se paga con saldo en dólares; **NO hay créditos diarios documentados**: la cuenta se cuenta por saldo y gasto del día medidos aquí (`scripts/puente/abliteration_creditos.py:22–40`).

**Qué NO se sabe** (`src/lib/astraura/modelos/modelos-api.ts:24–43, 63–81`):
- `abliterated-model` **no declara su modelo base** ni si es fijo o enrutador.
- `abliterated-model-large-flash` **sí declara base** (DeepSeek V4.1-Flash-1017, 1M).
- `abliterated-model-large-v2` declara base GLM-5.3; `abliterated-model-large` (obsoleto) no declara base.

**Clave** (`scripts/puente/abliteration.py:31–44`): solo el nombre `ABLITERATION_API_KEY`, en `~/.starseed/env` de la Mac, puesta por Alex. Al ser de pago **NO viaja al A1** (`scripts/puente/oracle_nodo.py:141`) ni a la nube (`scripts/puente/nube-gh.py:49`) salvo decisión escrita de Alex. Nunca en memorias, informes ni chat.

**Dónde entra** (`scripts/enjambre/flota_opcional.py:20–28`, `scripts/enjambre/starseed-enjambre.py:1924–1933`): apagado por defecto; `STARSEED_ABLITERATION=1` lo enciende. Sueños profundos, síntesis diaria y último relevo de Hermes, **siempre AL FINAL de la rotación**; **nunca** como escritor ni revisor de código (los prompts de escritura pesan ~22.000 tokens y el proveedor es de pago: `memory/orquestacion-economica.md:1036`).

**Saldo y gasto del día** (`scripts/puente/abliteration_creditos.py:79–142`, `scripts/puente/abliteration.py:131–153`): `abliteration_creditos.py` provee `saldo_usd`, `registrar`, `gasto_del_dia`, `permitido`. Cuenta del día como Jev: variable `STARSEED_ABLITERATION_DIA_USD` (defecto 0,50), margen mínimo 0,50 USD, lectura < 6 h (`scripts/puente/abliteration_creditos.py:92–141`); pasado el tope se calla.

**Quitarlo todo** (`deploy/oracle/nodo/modelo-privado-a1.sh:161–187`): sin `STARSEED_ABLITERATION` y sin el servicio del A1 no queda nada activo; `deshacer` del guion del A1 apaga Ollama y retira su configuración sin borrar los pesos.

---

## 2. Modelo privado del A1 (Oracle Always Free)

**Candidato** (`deploy/oracle/nodo/modelo-privado-a1.sh:40–41`, `memory/orquestacion-economica.md:1037`): `huihui_ai/qwen3.5-abliterated:4B` (3,3 GB, Q4_K_M, Apache 2.0, contexto de trabajo 8K), solo en `127.0.0.1:11434`, unidad con tope de memoria (`MemoryHigh=4500M`, `MemoryMax=5200M`) y `Nice=10`, `CPUWeight=50` (`deploy/oracle/nodo/modelo-privado-a1.sh:51–59`). La 9b (6,6 GB, `MemoryMax=9000M`) solo bajo demanda y con el guardián de `main` parado.

**Rendimiento medido** (`scripts/puente/modelo_privado_a1.py:106–145`, `memory/orquestacion-economica.md:1037`): ≈4,8 tokens/s escribiendo con 1.500 tokens de entrada (base 4B); con 11.000 tokens → ×0,5 (≈2,4 t/s). La 9b se estima en 2–2,5 t/s (aritmética, no medida).

**Para qué sirve** (`memory/orquestacion-economica.md:1037`, `scripts/enjambre/flota_opcional.py:26–27`): sesiones de imaginación, síntesis y sueños (esperan minutos); **no** para Telegram, bots ni escritores.

**Existencia condicional** (`scripts/puente/modelo_privado_a1.py:74–103`): la pasarela **EXISTE solo mientras el servicio responde** (`estado["vivo"] == True`). Nada se escribe en disco. `declaracion_pasarela` devuelve variables `STARSEED_PASARELA_PRIVADO_*` o `None`.

**Memoria y compilación** (`scripts/puente/modelo_privado_a1.py:148–212`): `leer_memoria` extrae `MemAvailable` y `SwapFree` de `/proc/meminfo`; `esta_compilando` detecta `next build`, `tsc` o `vitest` en procesos; `puede_cargar` exige ≥5200 MB RAM disponible, ≥1024 MB swap libre y que no se esté compilando; si falta memoria o se compila, **el modelo privado se apaga**.

**Deshacer** (`deploy/oracle/nodo/modelo-privado-a1.sh:161–187`): `deshacer` detiene el servicio, borra el drop-in y el alias, indica GB ocupados y el comando para quitar pesos (`sudo rm -rf /usr/share/ollama/.ollama/models`).

---

## 3. Dos avisos permanentes

1. **Sin filtros solo en lo privado propio** (`architecture/modelos-recomendados.md:134–150`): un modelo sin rechazos ofrecido a agentes y bots de otras personas deja la moderación de la app y las reglas de salas públicas y menores como única salvaguarda; es elección explícita por cuenta o página, **nunca el valor por defecto en espacios públicos** (coherente con Decisión 1). El interruptor «Mostrar variantes sin filtros» está apagado por defecto y por perfil; encenderlo pide confirmación y guarda el día (`variantesConfirmadoEl`). `candidatosPara` filtra `clase === "normal"`: «Automático» no elige variante sin filtros. `aplicarEleccionManual` impone uso solo con interruptor encendido **y** permitido en el perfil, contexto `privado-propio`, caso en `CASOS_SIN_FILTROS`; fuera se devuelve recomendación normal con línea explicativa. Quedan fuera siempre: bots y dots, asistentes de grupo/comunidad/página, capas públicas, capas de conciencia, segundo plano, aprendizaje colectivo, voz, servir a otra cuenta por la malla.

2. **Medir antes de dar más trabajo** (`scripts/puente/medida_modelo_privado.py:3–31`, `memory/orquestacion-economica.md:1038`): no se da más trabajo al modelo hasta medirlo en tareas de la fábrica (`medida_modelo_privado.py`); quitar los rechazos no añade capacidad. `resumir` calcula métricas por modelo (casos, ttft_mediana, tokens_s_mediana, rss_pico, tasa_rechazo, acuerdo_con_flota); `veredicto` devuelve «se queda» (≥90 % completitud frente a lo que la flota no rechazó Y ttft_mediana ≤ 600 s), «se descarta» o «faltan datos» (< 200 casos del modelo privado). Umbrales en `UMBRALES` (línea 47–51), único sitio donde Alex los cambia.

---

## 4. Ramas de la Biblioteca (proveedores)

**Definición** (`src/lib/astraura/modelos/ramas-proveedor.ts:1–9, 25–37`): una rama por proveedor —Ollama, variantes sin filtros de su publicador (`huihui_ai`), capas propias de Astraura y proveedores de API (`abliteration.ai`…)— con SUS modelos ordenados de MÁS a MENOS capaz, marcando el mejor que cabe y el más ligero que cabe en la neurona. Módulo **PURO y determinista**.

**Regla de CPU** (`src/lib/astraura/modelos/ramas-proveedor.ts:16, 102–108`, `src/lib/astraura/modelos/__tests__/ramas-proveedor.test.ts:55–70`): neurona SIN tarjeta gráfica (chip «cpu») recibe como local el modelo **MÁS PEQUEÑO** que cabe, y una línea `NOTA_CPU = "un modelo por API es mejor punto de partida: aquí corre en CPU y es lento"`. Con memoria por debajo del mínimo de todos, **solo la rama de API**.

**Ramas de API** (`src/lib/astraura/modelos/ramas-proveedor.ts:109–118`): solo se ofrecen si la cuenta permite lo sin filtros (`opciones.sinFiltrosPermitido`). Modelos válidos (`modeloApiValido`: `estado === "vigente"`, fuentes, precios ≥ 0) ordenados por contexto descendente, precio salida ascendente, id.

**Orden de capacidad** (`src/lib/astraura/modelos/ramas-proveedor.ts:44–54`): de MÁS a MENOS capaz: con puntuación primero (la de la BASE en variantes; mayor ECI); sin ella, más grande (descargaGb, contextoK, id).

**Grupos locales** (`src/lib/astraura/modelos/ramas-proveedor.ts:56–74`): Ollama = builds normales comprobadas del editor; `huihui_ai` = variantes sin filtros listables (solo con permiso); capas = propias de Astraura (`estado === "comprobado"`).

---

## Abierto (lo que Alex debe decidir)

1. **¿Se activa `STARSEED_ABLITERATION=1` en la Mac y/o en la nube?** (hoy está apagado por defecto).
2. **¿Cuál es el tope diario real para abliteration.ai?** (`STARSEED_ABLITERATION_DIA_USD` defecto 0,50 USD; `memory/orquestacion-economica.md:1036`).
3. **¿Se instala el modelo privado 4B en el A1 ahora o se espera a que algo lo use?** (guion está idempotente y apagado: `deploy/oracle/nodo/modelo-privado-a1.sh:11–14`).
4. **¿Se permite el modelo privado 9B bajo demanda?** (requiere guardián de `main` parado y ~9 GB RAM).
5. **¿Se conecta la puerta de la malla (`puerta.cjs` / `src/lib/malla/**`) para bloquear variantes `*-abliterated`/`*-uncensored` al servir a otra cuenta?** (`architecture/modelos-recomendados.md:180` — hoy la regla «jamás a otra cuenta» está impuesta al elegir, no al servir).
6. **¿Se invierte la privacidad por defecto?** (hoy: proveedor externo permitido en general, **no** para archivos privados; `architecture/modelos-recomendados.md:185`).
7. **¿Se aceptan puntuaciones «sin medir» para Qwen3.5 4b/27b, Gemma 4 e4b/12b, Qwen3.8 27B y las variantes sin filtros?** (`architecture/modelos-recomendados.md:184`).
8. **¿Se define el dato de edad/menor/control parental en el perfil para desactivar el interruptor de variantes sin filtros?** (`architecture/modelos-recomendados.md:179` — gancho `datosEdadDelPerfil()` existe y devuelve `null` hoy).

---

**Archivos que cumplen cada afirmación** (resumen):
- `scripts/puente/abliteration.py`, `scripts/puente/abliteration_creditos.py`, `scripts/puente/test_abliteration*.py` — abliteration.ai
- `deploy/oracle/nodo/modelo-privado-a1.sh`, `scripts/puente/modelo_privado_a1.py`, `scripts/puente/medida_modelo_privado.py`, `scripts/puente/test_medida_modelo_privado.py`, `scripts/puente/test_modelo_privado_a1*.py` — modelo privado A1
- `architecture/modelos-recomendados.md` §10 — avisos y decisiones
- `src/lib/astraura/modelos/ramas-proveedor.ts`, `src/lib/astraura/modelos/modelos-api.ts`, `src/lib/astraura/modelos/__tests__/ramas-proveedor.test.ts` — ramas de la Biblioteca
- `scripts/enjambre/flota_opcional.py`, `scripts/enjambre/test_flota_opcional.py`, `scripts/enjambre/starseed-enjambre.py` — integración en flota
- `memory/orquestacion-economica.md` §23 — regla permanente vinculada