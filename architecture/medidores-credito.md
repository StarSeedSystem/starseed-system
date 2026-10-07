# Medidores de crédito por terminal (Ola 1007M · 2026-10-06)

> Petición de Alex (2026-10-06): «El medidor de Claude debe usar la terminal para
> autoactualizarse y contar con un medidor para cada crédito del usuario en sus APIs y modelos
> de pago (en nuestro caso, Claude y ChatGPT, pero con espacio para cualquier medidor adaptado a
> cualquier modelo y APIs).»

Este documento es el CONTRATO de la ola. Lo que no esté aquí no se inventa. Si algo de aquí
choca con el código real, gana el código real y se anota la diferencia en el informe de la tarea.

## 0. Por qué

Hasta hoy el medidor «Claude · límites» del Mando enseñaba lo que alguien DECLARABA a mano
(`limites_claude.py declarar`). La última lectura tenía días: decía semana 24 % cuando la real
era 41 %. Un medidor que hay que alimentar a mano miente en cuanto nadie lo alimenta. Las dos
suscripciones de pago de Alex se pueden leer desde la terminal de la Mac SIN gastar tokens; se
comprobó en vivo el 2026-10-06 (§2). Este contrato convierte esas lecturas en un sistema de
medidores con adaptadores, que se actualiza solo y deja sitio para cualquier otro proveedor.

## 1. Reglas que no se negocian

1. **Cero tokens.** Un medidor nunca manda un prompt a un modelo para medir. `claude -p "/usage"`
   es una orden local del CLI (no llama al modelo) y `account/rateLimits/read` del servidor de
   aplicaciones de Codex solo pide metadatos. Cualquier adaptador nuevo que necesite gastar
   cupo para medir NO se admite.
2. **Solo números y fechas.** El archivo de salida guarda porcentajes, saldos, fechas de reinicio,
   nombre del plan y etiquetas. NUNCA: claves, tokens, ids de cuenta (`accountId`), ids de
   créditos, correos, textos de publicidad (`rateLimitUpsell`) ni texto de conversaciones.
3. **Claves solo del entorno.** Un adaptador HTTP recibe el NOMBRE de la variable
   (`clave_env`) y la lee de `os.environ` o de los archivos de entorno (`~/.starseed/env`,
   `~/.hermes/.env`) como datos, nunca ejecutándolos. Nunca se imprime ni se escribe su valor.
4. **Un fallo no borra lo bueno.** Si un adaptador falla, se conserva la última lectura buena
   con `ok: false`, `obsoleto: true` y `error` corto (sin secretos). Nunca un 0 inventado.
5. **Aislamiento.** Cada adaptador corre con tope de tiempo (60 s Claude, 30 s Codex, 20 s HTTP)
   y su excepción no tumba a los demás.
6. **Claude sin claves de API.** El CLI de Claude se lanza con
   `motores_director.entorno_sin_claves_api(os.environ)`: con `ANTHROPIC_API_KEY` en el entorno,
   `claude` usaría la API (sin saldo) en vez de la suscripción y `/usage` no mediría el plan.
7. **Sin dependencias nuevas.** Python estándar (subprocess, json, re, zoneinfo, urllib) y, en
   TypeScript, lo que ya usa `src/lib/mando/`.

## 2. Fuentes comprobadas en la Mac (2026-10-06, Claude Code 2.1.289, codex-cli 0.154.0)

### 2.1 Claude: `claude -p "/usage" < /dev/null`

Binario: `~/.local/bin/claude`. Sin `< /dev/null` espera 3 s a la entrada y avisa por stderr.
Salida real (la sección «What's contributing…» se ignora):

```
You are currently using your subscription to power your Claude Code usage

Current session: 23% used · resets Oct 6 at 6:10pm (America/Mexico_City)
Current week (all models): 41% used · resets Oct 10 at 4am (America/Mexico_City)
Current week (Fable): 0% used · resets Oct 10 at 4am (America/Mexico_City)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai. Behaviors are independent characteristics, not a breakdown.

Last 24h · 51 requests · 7 sessions
  92% of your usage was at >150k context
```

Interpretación:
- Línea `Current <ventana>: <N>% used · resets <Mes> <día> at <h>[:<mm>]<am|pm> (<zona IANA>)`.
  `<ventana>` = `session` → id `sesion`, etiqueta «Sesión (5 h)»; `week (all models)` → id
  `semana`, «Semana (todos los modelos)»; `week (<Modelo>)` → id `semana-<modelo en minúsculas>`,
  «Semana (<Modelo>)». Puede haber 0..n líneas de modelo.
- La fecha no trae año: se usa el año actual en esa zona; si queda más de 200 días en el pasado,
  el año siguiente. Se devuelve ISO-8601 con desfase (`2026-10-06T18:10:00-06:00`).
- `using your subscription` → `plan: "suscripción"`; si en su lugar dice API o no aparece, `plan:
  null` y `ok: false`, `error: "claude no está usando la suscripción"`.
- Una línea `Current …` que no encaje con el patrón no rompe nada: se ignora y se cuenta en
  `extras.lineas_sin_entender`.
- Se lanza con `cwd` = `~/.starseed/medidores-entrada/` (si el CLI guarda algo de la sesión, que
  quede fuera de los proyectos de trabajo).

Fuente secundaria gratis (opcional, §5.2): la línea de estado de Claude Code recibe por stdin
`rate_limits.five_hour.{used_percentage,resets_at}` y `rate_limits.seven_day.{…}` (`resets_at` en
segundos Unix) desde la versión que ya tiene la Mac (documentado en
https://code.claude.com/docs/en/statusline). Solo existe mientras corre una sesión interactiva.

### 2.2 ChatGPT / Codex: `codex app-server` (JSON-RPC por stdio, una línea JSON por mensaje)

Binario: `~/.local/bin/codex`. Secuencia que funcionó:

```
→ {"method":"initialize","id":0,"params":{"clientInfo":{"name":"starseed_medidor","title":"StarSeed medidor","version":"0.1.0"}}}
→ {"method":"initialized"}
→ {"method":"account/rateLimits/read","id":1}
← {"id":1,"result":{ ... }}
```

Respuesta real, SANEADA (la real trae además `accountId`, el `id` de cada crédito y
`rateLimitUpsell`: NO se guardan):

```json
{"ordinaryUsageAllowed": false,
 "rateLimits": {"limitId": "codex", "primary": {"usedPercent": 0, "windowDurationMins": 300, "resetsAt": 1791349120},
                "secondary": {"usedPercent": 100, "windowDurationMins": 10080, "resetsAt": 1791605571},
                "credits": {"hasCredits": false, "unlimited": false, "balance": "0"},
                "planType": "plus", "rateLimitReachedType": "rate_limit_reached"},
 "rateLimitsByLimitId": {"codex": { "...": "igual que rateLimits" }},
 "rateLimitResetCredits": {"availableCount": 1,
   "credits": [{"resetType": "codexRateLimits", "status": "available", "grantedAt": 1790705400,
                "expiresAt": 1793297400, "title": "Full reset (Weekly + 5 hr)"}]}}
```

Interpretación por cada entrada de `rateLimitsByLimitId` (si falta, `rateLimits`):
- `primary` → ventana id `5h`, etiqueta «5 horas» (por `windowDurationMins` 300; otra duración →
  «<n> min»); `secondary` → id `semana`, «Semana» (10080). `usedPercent` → `usado_pct`;
  `resetsAt` (segundos Unix) → ISO local.
- `credits.balance` (texto numérico) → `saldo: {valor, unidad: "créditos"}`; `unlimited: true` →
  `saldo.ilimitado: true`.
- `planType` → `plan`; `rateLimitReachedType` no nulo → `extras.bloqueado` (texto corto).
- `ordinaryUsageAllowed: false` → `extras.uso_normal: false`.
- `rateLimitResetCredits.availableCount` → `extras.reinicios_gratis`; el `expiresAt` más cercano
  de los `available` → `extras.reinicio_gratis_vence` (ISO). Usar ese reinicio es decisión de
  Alex: el medidor solo lo enseña.
- Un `limitId` distinto de `codex` (p. ej. `premium`) es OTRO medidor (`codex-premium`) si trae
  alguna ventana no nula; si todas son nulas, se omite.

Respaldo sin proceso (si `app-server` falla): el último evento con `"rate_limits"` de
`~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl` (los 10 archivos más recientes por fecha de
modificación). Forma en snake_case dentro de `payload.rate_limits` (o
`payload.info.rate_limits`): `{"limit_id":"codex","primary":{"used_percent":36.0,"window_minutes":300,"resets_at":1791242699},"secondary":{"used_percent":99.0,"window_minutes":10080,"resets_at":1791605571},"credits":{"balance":"0"},"plan_type":"plus"}`.
Se marca `fuente: "registro de sesiones de codex"` y `leido` = el `timestamp` del evento.

### 2.3 Cualquier otra API: adaptador `http_json` (configuración, no código)

`~/.starseed/medidores.json` (fuera del repo; dato de la cuenta del usuario):

```json
{"medidores": [
  {"id": "openrouter", "tipo": "http_json", "nombre": "OpenRouter · saldo", "proveedor": "openrouter",
   "url": "https://openrouter.ai/api/v1/key", "clave_env": "OPENROUTER_API_KEY",
   "rutas": {"usado": "data.usage", "limite": "data.limit", "restante": "data.limit_remaining"},
   "unidad": "USD", "cada_min": 60},
  {"id": "claude-nube", "tipo": "declarado", "nombre": "Claude · crédito nube", "proveedor": "anthropic",
   "archivo": "~/.starseed/credito-claude-nube.json",
   "rutas": {"restante": "restante_usd", "limite": "total_usd", "vence": "vence"}, "unidad": "USD"}
]}
```

- `http_json`: GET con `Authorization: Bearer <valor de clave_env>`; solo `https://`; respuesta
  ≤ 256 KB; `rutas` son caminos con puntos; cada valor extraído debe ser número (o texto
  numérico) — si no, se descarta. `usado_pct` = `usado/limite*100` si hay límite; si no, solo
  `saldo`. `cada_min` limita la frecuencia (la última lectura sirve mientras no toque).
- `declarado`: lee un JSON local (lo que declara una persona) con las mismas `rutas`; se marca
  `fuente: "declarado"` y su edad se enseña siempre. Así el crédito de Claude en la nube
  (`credito_claude_nube.py`) entra en la misma familia sin reescribirlo.
- Los adaptadores `claude_terminal` y `codex_terminal` vienen activados si existe su binario; una
  entrada `{"id": "claude", "activo": false}` los apaga.

## 3. Salida: `~/.starseed/medidores-credito.json`

```json
{"version": 1, "t": "2026-10-06T18:05:00-06:00",
 "medidores": {
  "claude": {"id": "claude", "proveedor": "anthropic", "nombre": "Claude · plan", "tipo": "plan",
             "plan": "suscripción",
             "ventanas": [{"id": "sesion", "etiqueta": "Sesión (5 h)", "usado_pct": 23, "reinicia": "2026-10-06T18:10:00-06:00"},
                          {"id": "semana", "etiqueta": "Semana (todos los modelos)", "usado_pct": 41, "reinicia": "2026-10-10T04:00:00-06:00"},
                          {"id": "semana-fable", "etiqueta": "Semana (Fable)", "usado_pct": 0, "reinicia": "2026-10-10T04:00:00-06:00"}],
             "saldo": null, "extras": {}, "fuente": "terminal: claude -p /usage",
             "leido": "2026-10-06T18:05:00-06:00", "ok": true, "obsoleto": false, "error": null,
             "enlace": "https://claude.ai/settings/usage"},
  "codex":  {"id": "codex", "proveedor": "openai", "nombre": "ChatGPT · Codex", "tipo": "plan", "plan": "plus",
             "ventanas": [{"id": "5h", "etiqueta": "5 horas", "usado_pct": 0, "reinicia": "2026-10-06T22:58:40-06:00"},
                          {"id": "semana", "etiqueta": "Semana", "usado_pct": 100, "reinicia": "2026-10-09T22:12:51-06:00"}],
             "saldo": {"valor": 0, "unidad": "créditos"},
             "extras": {"bloqueado": "rate_limit_reached", "uso_normal": false, "reinicios_gratis": 1,
                        "reinicio_gratis_vence": "2026-10-29T12:10:00-06:00"},
             "fuente": "terminal: codex app-server", "leido": "…", "ok": true, "obsoleto": false, "error": null,
             "enlace": "https://chatgpt.com/codex/settings/usage"}},
 "historial": {"claude": [{"t": "…", "v": {"sesion": 23, "semana": 41}}]}}
```

- Escritura atómica (`.tmp` + `os.replace`), permisos 0600, carpeta `~/.starseed/`.
- `historial`: por medidor, como mucho 300 puntos `{t, v: {id_ventana: usado_pct}}`, uno por
  lectura que cambie algo (para proyecciones y gráficas).
- `enlace`: la página oficial donde el usuario lo comprueba a mano.

## 4. Piezas y responsables (Ola 1007M)

| Id | Pieza | Archivos |
|---|---|---|
| MC1007A | Adaptador Claude por terminal (puro + lectura) | `scripts/puente/medidor_claude_terminal.py`, `scripts/puente/test_medidor_claude_terminal.py` |
| MC1007B | Adaptador Codex/ChatGPT (app-server + respaldo de registros) | `scripts/puente/medidor_codex_terminal.py`, `scripts/puente/test_medidor_codex_terminal.py` |
| MC1007C | Adaptadores por configuración `http_json` y `declarado` | `scripts/puente/medidor_http_json.py`, `scripts/puente/test_medidor_http_json.py` |
| MC1007D | Recolector: registro, salida, historial, puente a `limites_claude` y a la salud de proveedores | `scripts/puente/medidores_credito.py`, `scripts/puente/test_medidores_credito.py` |
| MC1007E | Servicio 24/7 + línea de estado que alimenta gratis | `scripts/puente/com.starseed.medidores.plist`, `scripts/puente/statusline-starseed.sh`, `scripts/puente/test_statusline_starseed.py` |
| MC1007F | Lectura y estado en el Mando (puro) | `src/lib/mando/creditos-pago.ts`, `src/lib/mando/__tests__/creditos-pago.test.ts` |
| MC1007G | Medidor «creditos» en el panel y la ruta | `src/lib/mando/medidores.ts`, `src/app/api/mando/medidores/route.ts` |
| MC1007H | Una tarjeta por crédito en el pulso de trabajo + «Actualizar ahora» | `src/components/mando/centro-mando.tsx`, `src/app/api/mando/creditos/route.ts` |
| MC1007I | El plugin del puente de mando conoce el medidor | `integraciones-de-codigo/claude-code/puente-de-mando/hooks/texto.ts`, `integraciones-de-codigo/claude-code/puente-de-mando/hooks/script-mac.ts` |

### 4.1 Recolector (`medidores_credito.py`)

- `ADAPTADORES = {"claude_terminal": …, "codex_terminal": …, "http_json": …, "declarado": …}`;
  cada uno expone `leer(entrada_config, ahora, **inyectables) -> dict|list[dict]` con la forma de
  §3 (un medidor o varios).
- `recoger(config, previo, ahora, adaptadores=ADAPTADORES) -> dict`: corre todos con su tope,
  respeta `cada_min`, fusiona con `previo` según §1.4, añade historial y devuelve el documento.
- `puente_limites_claude(medidor_claude)`: si `ok`, añade una lectura a
  `~/.starseed/limites-claude.json` con `limites_claude.anadir_lectura` (`sesion_pct`,
  `semana_pct`, el primer `semana-<modelo>` como `modelo_*`, `fuente: "terminal"`). Así la
  tarjeta «Claude · límites» y sus proyecciones siguen funcionando sin tocarlas. Solo si la
  lectura cambió o la anterior tiene más de 30 min.
- `alimentar_salud(medidores)`: si una ventana de `codex` está ≥ 100 %, marca la entrada
  `codex` de `~/.starseed/salud-proveedores.json` con `"sin_cupo_hasta": "%Y-%m-%d %H:%M:%S"`
  (hora local de su `reinicia`) y `"motivo": "medidor: semana 100 %"`, el mismo formato que
  `marcar_sin_cupo` del orquestador. Si después ninguna ventana está al 100 % y el `motivo`
  empieza por `medidor:`, quita esas dos claves (no toca marcas puestas por otros). Lee y escribe
  bajo `fcntl.flock` exclusivo de `~/.starseed/cerrojos/salud.lock` (el cerrojo «salud» del
  orquestador), sin tocar el resto de campos ni de proveedores. Así el orquestador deja de
  ofrecerle tareas a Codex sin esperar a que falle, y vuelve a ofrecérselas en cuanto se reinicia.
- CLI: `medidores_credito.py recoger [--solo claude,codex]` (imprime un resumen de una línea por
  medidor, sin secretos) y `medidores_credito.py ver` (imprime el JSON de salida).

### 4.2 Autoactualización 24/7

- `com.starseed.medidores`: `StartInterval` 600 s (cada 10 min), `RunAtLoad`, `Nice` 10,
  `PATH` con `/Users/alex/.local/bin` delante, log en `/tmp/starseed-medidores.log`. Lo instala
  la dirección (Claude) tras integrarse, con `launchctl bootstrap`.
- Bajo demanda: el botón «Actualizar ahora» del Mando hace `POST /api/mando/creditos`, que
  lanza `medidores_credito.py recoger` (máximo una vez por minuto; si hay otra en marcha,
  responde 202 con la lectura actual).
- Gratis cuando hay sesión de Claude Code abierta: `statusline-starseed.sh` hace lo mismo que la
  línea de estado actual de Alex (modelo · ctx % · coste · carpeta) y ADEMÁS, si llega
  `rate_limits`, escribe solo los números en `~/.starseed/medidores-entrada/claude-statusline.json`
  (`{"t", "five_hour": {"usado_pct", "reinicia"}, "seven_day": {…}}`). El adaptador Claude lo usa
  si es más reciente que su última lectura por terminal.

### 4.3 En el Mando

- `creditos-pago.ts` (puro salvo `leerCreditosPago()`): `estadoCreditos(doc, ahora)` → por
  medidor y ventana: `tono` `peligro` ≥ 90 %, `aviso` ≥ 70 % (los mismos umbrales que
  `ai/astraura/presupuesto.ts`), `ok` por debajo; si `reinicia` ya pasó, la ventana cuenta como
  reiniciada (0 %, «se reinició, falta lectura nueva»); si `leido` tiene más de 45 min, el
  medidor sube al menos a `aviso` y dice «hace N min». El tono del medidor es el peor de sus
  ventanas. `resumenCredito(m)` → texto corto («41 % semana · reinicia vie 4:00»).
- Medidor `creditos`: una fila por medidor con una ficha por ventana (usado, queda, reinicia,
  fuente, leído hace), saldo y extras («1 reinicio gratis hasta el 29 oct»), y la acción
  «Actualizar ahora».
- Pulso de trabajo: UNA tarjeta por medidor (dinámica: aparecen las que haya en el JSON). La
  tarjeta «Claude · límites» actual se queda (tiene las proyecciones de revisiones).
- Plugin del puente de mando: `medidor` acepta la clave `creditos`.

## 5. Para todos los usuarios de StarSeed OS

El mismo contrato sirve fuera de la Mac de Alex (ver `architecture/puente-mando-para-todos.md`):
el motor del usuario (su ordenador o su servidor) corre estos mismos adaptadores con SUS
binarios y SUS claves, y sube SOLO el documento de §3 (números y fechas) a su ámbito. El servidor
de StarSeed nunca ve sus claves.

## 6. Cómo se verifica

- Pruebas Python sin red ni procesos reales (subprocess y urllib inyectados) con las salidas de
  §2 como datos; vitest para `creditos-pago.ts`.
- En la Mac: `medidores_credito.py recoger` → el JSON trae `claude` y `codex` con `ok: true`; el
  Mando enseña una tarjeta por crédito; `limites_claude.py estado` tiene `lectura_hace_min` < 15
  y `fuente` «terminal» sin que nadie declare nada.
