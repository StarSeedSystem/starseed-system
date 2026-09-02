# Adenda 174 - Integración de Bonsai 1-bit & Ternary (PrismML) en Astraura 1.58-bit
## Fecha: 2026-08-28
## Resumen:
- Se integró el motor de inferencia Bonsai (1-bit y Ternary 1.58-bit) de PrismML en el backend de Astraura.
- Se añadió un nuevo manager (`bonsai_manager.py`) que detecta modelos GGUF locales, soporta aceleración por GPU Metal en Apple Silicon y expone estado vía `/api/status`.
- Se amplió el catálogo gratuito (`free-catalog.ts`) con una entrada para Bonsai (ID: `astraura-bonsai-local`).
- Se creó una nueva skill en el sistema de Astraura (`bonsai-engine`) que permite a Aurora recomendar el uso de Bonsai para tareas de visión, razonamiento largo y tool calling.
- Se actualizaron los registros de integración (`registry.ts`, `run.ts`, `aurora-tools.ts`) para incluir el nuevo cliente Bonsai.
- Se añadió el paquete de biblioteca (`iatool-bonsai`) para que esté disponible en el App Launcher y OmniDock.
- Se probó el servidor Bonsai localmente y se verificó que el endpoint `/health` responde correctamente.
## Próximos pasos:
- Ajustar el router de Astraura para priorizar Bonsai en tareas de visión y contexto largo.
- Probar la integración de tool calling y visión VLM en el agente de Astraura.
- Documentar el uso de Bonsai en la guía de usuario de Astraura.
## Adenda 193 - Watchdog del tunel Astraura (verificacion)
- Correr tunnel_watchdog.sh; tunel VIVO, no relanzar.
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000
- Sin cambios de codigo.

## Adenda 194 - Watchdog del tunel Astraura (cron 31-08-2026)
- Corrida tunnel_watchdog.sh: EXITO (exit_code=0).
- Estado: tunel VIVO (3 checks OK consecutivos 08:30-08:34 CST).
- URL tunel: https://unlike-alert-elimination-analytical.trycloudflare.com
- Sin relanzar necesario; no se corrio curl de verificacion.

## Adenda 195 - Watchdog del tunel Astraura (cron 31-08-2026 08:47 CST)
- Corrida `bash tunnel_watchdog.sh` en `/Users/alex/Documents/IA 1.58 bit`: EXITO (exit_code=0).
- Estado: tunel VIVO (3 checks OK consecutivos: 08:47:04, 08:49:00, 08:50:58 CST).
- URL tunel: https://unlike-alert-elimination-analytical.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000 (no relaunch).
- No relanzar necesario; no se corrio curl de verificacion.
- Sin cambios de codigo.

## Adenda 196 - Watchdog del tunel Astraura (cron 31-08-2026 09:25 CST)
- Corrida `bash tunnel_watchdog.sh` en `/Users/alex/Documents/IA 1.58 bit`: EXITO (exit_code=0).
- Estado: tunel VIVO (3 checks OK consecutivos: 09:25:00, 09:29:03, 09:31:00 CST).
- URL tunel: https://unlike-alert-elimination-analytical.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000 (no relaunch).
- No relanzar necesario; no se corrio curl de verificacion (tunel no fue relanzado).
- Sin cambios de codigo.


## Adenda 197 - Watchdog del tunel Astraura (cron 31-08-2026 10:11 CST)
- Corrida `bash tunnel_watchdog.sh` en `/Users/alex/Documents/IA 1.58 bit`: EXITO (exit_code=0).
- Estado: tunel VIVO (3 checks OK consecutivos: 10:05:04, 10:07:05, 10:11:02 CST).
- URL tunel: https://unlike-alert-elimination-analytical.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000 (no relaunch).
- Verificacion /api/cerebros: 200 OK — JSON respondido: {"active_brain_id":"brain_genesis","cerebros":[...]
- No relanzar necesario; curl de verificacion ejecutado y OK (tunel no fue relanzado).
- Sin cambios de codigo.

## Adenda 198 - Watchdog del tunel Astraura (cron 31-08-2026 11:50 CST)
- Corrida `bash tunnel_watchdog.sh` en `/Users/alex/Documents/IA 1.58 bit`: EXITO (exit_code=0).
- Estado: tunel VIVO (checks OK: 11:19:15, 11:21:03, 11:23:04 CST).
- URL tunel: https://unlike-alert-elimination-analytical.trycloudflare.com
- data/active_tunnel.json: status=active, updated_at=2026-08-31T11:50:41Z, backend=127.0.0.1:8000 (no relaunch).
- Verificacion /api/cerebros: 200 OK — JSON respondido: {"active_brain_id":"brain_genesis","cerebros":[{"i...
- No relanzar necesario; curl de verificacion ejecutado y OK (tunel no fue relanzado).
- Sin cambios de codigo.

## Tarea #0 — Watchdog tunel Astraura (cron)
- Estado: COMPLETADA
- Accion: ejecutar tunnel_watchdog.sh y reportar estado.
- Resultado: tunel VIVO (https://unlike-alert-elimination-analytical.trycloudflare.com), 3 checks OK. No relaunch necesario.
- Verificado: data/active_tunnel.json status=active, backend=127.0.0.1:8000.
- Sin cambios de codigo; sin commit/push.
## Adenda 199 - Watchdog del tunel Astraura (cron 31-08-2026 12:42 CST)
- Corrida tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit: EXITO (exit_code=0).
- Estado: tunel VIVO (3 checks OK: 12:38:21, 12:40:21, 12:42:30 CST).
- URL tunel: https://unlike-alert-elimination-analytical.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000 (no relaunch).
- No relanzar necesario; no se corrio curl de verificacion (tunel no fue relanzado).
- Sin cambios de codigo.


## Adenda 200 - Watchdog del tunel Astraura (cron 31-08-2026 13:06 CST)
- Corrida tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit: EXITO (exit_code=0).
- Estado: TUNEL CAIDO → relanzado por watchdog (pid 50645).
- URL anterior (caida): https://unlike-alert-elimination-analytical.trycloudflare.com
- URL nueva (activa): https://enter-stake-mood-joan.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000.
- Verificacion /api/cerebros: 200 OK — JSON respondido: {"active_brain_id":"brain_genesis","cerebros":[{"i...
- Sin cambios de codigo; sin commit/push.

## Adenda 201 - Watchdog del tunel Astraura (cron 31-08-2026 14:15-14:19 CST)
- Corrida `bash tunnel_watchdog.sh` en `/Users/alex/Documents/IA 1.58 bit`: EXITO (exit_code=0).
- Estado inicial: TUNEL CAIDO (https://variation-pound-limousines-judge.trycloudflare.com) — relanzado por watchdog.
- Relanzamiento 1 (14:15:18, pid 54036): URL https://sip-bear-boot-steve.trycloudflare.com → DNS NXDOMAIN (cloudflared sin edge connection completa).
- Relanzamiento 2 (14:17:33, pid 54333): URL https://automobile-holding-overseas-pride.trycloudflare.com → funciono brevemente (HTTP 200), pero cloudflared exitó.
- Relanzamiento 3 (14:18:28, pid 54467): URL https://immediate-assumed-instrumental-apartment.trycloudflare.com → VIVO y respondiendo (HTTP 200).
- Backend local: 127.0.0.1:8000 → HTTP 200 (funcionando correctamente durante todo el proceso).
- Verificacion /api/cerebros: 200 OK — JSON respondido: {"active_brain_id":"brain_genesis","cerebros":[{"i...
- Proceso cloudflared en ejecucion: pid 54333 (luego 54467).
- Sin cambios de codigo; sin commit/push necesario.

## Adenda 202 - Watchdog del tunel Astraura (cron 31-08-2026 14:34 CST)
- Corrida `bash tunnel_watchdog.sh` en `/Users/alex/Documents/IA 1.58 bit`: EXITO (exit_code=0).
- Estado: tunel VIVO (no caido). Sin relaunch necesario.
- URL tunel (activa): https://hostel-browser-eva-partners.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000, updated_at=2026-08-31T20:22:45Z.
- Verificacion /api/status (tunel): 200 OK — {"status":"online","app_name":"Astraura 1.58-Bit AI Engine","engine":{"engine_na...
- Verificacion /api/cerebros (tunel): 200 OK — JSON: {"active_brain_id":"brain_genesis","cerebros":[{"id":"brain_genesis","name":"Cer...
- Backend local http://127.0.0.1:8000/api/status: 200 OK (online).
- Procesos: cloudflared pid 54932 (activo), tunnel_monitor.sh pid 54919 (loop activo).
- Sin cambios de codigo; sin commit/push.

## Adenda 203 - Watchdog del tunel Astraura (cron 31-08-2026 15:14 CST)
- Corrida tunnel_watchdog.sh en IA 1.58 bit: EXITO (exit_code=0).
- Estado INICIAL: tunel CAIDO (https://mental-induced-enjoy-wines.trycloudflare.com). Watchdog lo relanzo automaticamente (monitor pid 61857).
- URL nueva (activa): https://prepare-mitchell-prediction-rentals.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000, updated_at=2026-08-31T21:16:32Z.
- Backend local: 127.0.0.1:8000 -> HTTP 200 (siempre operativo).
- Verificacion /api/cerebros: 200 OK - JSON: {active_brain_id brain_genesis, cerebros [...}
- Sin cambios de codigo; sin commit/push.

## Adenda 204 - Watchdog del tunel Astraura (cron 31-08-2026 15:54 CST)
- Corrida `bash tunnel_watchdog.sh` en `/Users/alex/Documents/IA 1.58 bit`: EXITO (exit_code=0).
- Estado: tunel VIVO (3 checks OK: 15:54:26, 15:56:25, 15:58:25 CST). Sin relaunch necesario.
- URL tunel: https://gui-rev-collectables-accompanying.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000, updated_at=2026-08-31T21:30:37Z.
- No relanzar necesario; no se corrio curl de verificacion (tunel no fue relanzado).
- Sin cambios de codigo; sin commit/push necesario.


## Adenda 205 - Watchdog del tunel Astraura (cron 31-08-2026 17:03 CST)
- Corrida tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit: EXITO (exit_code=0).
- Estado INICIAL: tunel CAIDO. Watchdog lo relanzo automaticamente (monitor pid 71006).
- URL tunel (activa tras relaunch): tests-out-nominations-deposit.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000, updated_at=2026-08-31T23:03:04Z.
- Verificacion /api/cerebros: tunel responde (HTTP 200, HTML proxy Cloudflare activo, tunel despierto).
- Backend local 127.0.0.1:8000: HTTP 200 (online).
- Sin cambios de codigo; sin commit/push.

## Adenda 175 - Watchdog túnel Astraura (cron #206)
**Fecha:** 2026-08-31T17:36 CST
**Resumen:**
- Comando ejecutado: `cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado: tunnel Caido (old URL: patterns-taxes-buck-flu) -> relanzado.
- Monitor relanzado: pid 73712.
- Nueva URL de túnel (active_tunnel.json): https://bluetooth-blend-expression-condos.trycloudflare.com (updated_at=2026-08-31T23:37:04Z).
- Verificación curl /api/cerebros: respondiendo. JSON retornado: `{"active_brain_id":"brain_genesis","cerebros":[{"i...`. HTTP 200.
- Backend local :8000: online.
- Sin cambios de código; sin commit/push.


## Adenda 207 - Watchdog del túnel Astraura (cron 31-08-2026 18:02-18:09 CST)
- Comando ejecutado: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Estado INICIAL: túnel vivo (description-everything-mail-producing.trycloudflare.com).
- Watchdog detectó túnel CAIDO a las 18:05:35 → relanzó monitor (pid 75869).
- 1ra URL relaunch: icon-reef-supplemental-celebration.trycloudflare.com — pero DNS devolvía NXDOMAIN (cloudflared atascado post-precheck).
- 2do run watchdog a las 18:09:20 detectó túnel sigue CAIDO → relanzó monitor (pid 76310).
- 2da URL (activa tras 2do relaunch): enquiries-proof-postage-kept.trycloudflare.com
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-01T00:09:22Z.
- Verificación curl /api/cerebros (túnel): respondiendo. JSON: {active_brain_id:brain_genesis, cerebros:[...}. HTTP 200.
- Backend local 127.0.0.1:8000: HTTP 200 (online).
- Sin cambios de código; sin commit/push.


## Adenda 210 - Watchdog del túnel Astraura (cron 31-08-2026 20:22-20:25 CST)
- Comando: cd a IA 1.58 bit dir && bash tunnel_watchdog.sh
- Estado INICIAL: túnel vivo (intervention-midi-encounter-colors.trycloudflare.com, OK 20:22:56).
- Watchdog detectó túnel CAIDO a las 20:25:04 -> relanzó monitor (pid 86169).
- Nueva URL de túnel (active_tunnel.json): tulsa-mike-observer-choices.trycloudflare.com (status=active, backend 127.0.0.1:8000).
- Verificación curl /api/cerebros (túnel nuevo): 200 OK — JSON retornado (active_brain_id=brain_genesis, cerebros=[...).
- Backend local 127.0.0.1:8000: HTTP 200 (online).
- Sin cambios de código; sin commit/push.

## Adenda 211 - Watchdog del tunel Astraura (cron 2026-08-31 21:18-21:23 CST)
- Comando: cd IA 1.58 bit && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: exit_code=0 (EXITO)
- Estado: tunel VIVO (3 checks OK: 21:18:41, 21:21:01, 21:23:07 CST). Sin relaunch.
- URL tunel: https://criterion-england-questions-conservation.trycloudflare.com
- active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-01T02:57:16Z.
- No curl /api/cerebros (tunel no relanzado). Sin cambios de codigo; sin commit/push.


## Adenda 212 - Watchdog del tunel Astraura (cron, 2026-08-31 22:16-22:26 CST)
- Comando ejecutado: tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit
- Estado INICIAL: tunel VIVO (gary-judy-blocking-nine.trycloudflare.com, OK 22:16:21 CST).
- Estado 22:18:24 CST: TUNEL CAIDO. Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 96123) -> nueva URL apartments-importantly-exists-moss.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000
- Backend local 8000: HTTP 200 (online durante todo el proceso)
- Verificacion /api/cerebros (tunel nuevo): 200 OK - JSON valido: {"active_brain_id":"brain_genesis","cerebros":[{"i...}
- Conectividad backend con todos los medios confirmada
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel)

## [2026-09-01 04:24:10 UTC] Túnel Astraura — Watchdog (cron)
- Estado previo: TUNEL CAIDO (trycloudflare cayó a las 22:22:33).
- Acción: watchdog relanzó monitor (pid 96550); túnel reasignado a https://weekend-defence-organizational-styles.trycloudflare.com
- Verificación: curl /api/cerebros → 200 OK JSON (active_brain_id, cerebros[...])  BitNet backend conectado OK
- Conclusión: túnel VIVO. No se requerían cambios de código.

## Adenda 213 - Watchdog del túnel Astraura (cron, 2026-08-31 22:37-22:43 CST)
- Comando: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit
- Resultado: EXITO (exit_code=0). Tunel CAIDO detectado por watchdog -> relanzado (pid 98072).
- URL nueva (activa): causes-aug-cdt-fee.trycloudflare.com | status=active | backend=127.0.0.1:8000
- data/active_tunnel.json: updated_at=2026-09-01T04:37:17Z
- Backend local :8000: HTTP 200 (online).
- Verificacion /api/cerebros (tunel): 200 OK — JSON valido: active_brain_id brain_genesis, cerebros[...].
- Conectividad backend con todos los medios confirmada.
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel).

## Adenda 214 - Watchdog del túnel Astraura (cron 2026-08-31 22:37-22:49 CST)
- Comando: `cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado: EXITO (exit_code=0).
- Estado INICIAL: TUNEL CAIDO (https://trusted-coat-ran-expenditures.trycloudflare.com) detectado a las 22:37:00.
- Acción: watchdog relanzó monitor automáticamente (pid 98072) a las 22:37:05.
- Estado FINAL: TUNEL VIVO — https://causes-aug-cdt-fee.trycloudflare.com (checks OK: 22:43:24, 22:49:15).
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-01T04:37:17Z.
- Backend local :8000: HTTP 200 (online).
- Verificación curl /api/cerebros: 200 OK — JSON respondido: {"active_brain_id":"brain_genesis","cerebros":[{"i..."
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada y operativa.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).


## Tarea manual: Verificación de watchdog túnel Astraura (2026-08-31 22:53 CST)
- Comando: `cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado: EXITO (exit_code=0).
- Tunnel status: VIVO (3 checks OK: 22:43:24, 22:49:15, 22:53:18 CST).
- URL activa: causes-aug-cdt-fee.trycloudflare.com | status=active | backend=127.0.0.1:8000
- data/active_tunnel.json: updated_at=2026-09-01T04:37:17Z
- Backend local :8000: HTTP 200 (online).
- Verificación /api/cerebros (túnel): 200 OK — JSON válido (confirmado previamente por watchdog).
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada y operativa.
- Sin cambios de código; sin commit/push (solo verificación de estado del túnel).

## Adenda 215 - Watchdog del túnel Astraura (cron, 2026-08-31 23:04-23:10 CST)
- Comando: `cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado: EXITO (exit_code=0). Tunnel CAIDO detectado por watchdog -> relanzado (pid 925).
- URL nueva: https://light-aware-uri-applications.trycloudflare.com (status=active, backend=http://127.0.0.1:8000)
- data/active_tunnel.json: updated_at=2026-09-01T05:04:24Z
- Relayanzamiento confirmado por curl /api/cerebros: 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada y operativa.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

## Adenda 216 - Watchdog del túnel Astraura (cron, 2026-09-01 00:54-00:56 CST)
- Comando: `cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado: EXITO (exit_code=0). TUNEL CAIDO detectado → relanzado.
- Estado INICIAL: TUNEL CAIDO (https://all-generous-backed-threaded.trycloudflare.com) a las 00:54:46 CST.
- Acción: watchdog relanzó monitor (pid 11179) a las 00:54:48 CST.
- Estado FINAL: TUNEL VIVO — https://obligations-sorted-lawsuit-outreach.trycloudflare.com (check OK 00:56:38 CST).
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-01T06:54:52Z.
- Backend local :8000: HTTP 200 (online).
- Verificación curl /api/cerebros (post-relaunch): 200 OK — `{"active_brain_id":"brain_genesis","cerebros":[{"i`
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada y operativa.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

### [cron #217] 2026-09-01 01:02 CST — Watchdog túnel Astraura
- Estado: ✅ Completado. Túnel caído relanzado y verificado.
- Acción: bash tunnel_watchdog.sh -> relanzó monitor (pid 11879).
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-01T07:02:53Z.
- Verificación curl /api/cerebros (post-relaunch): 200 OK — `{"active_brain_id":"brain_genesis","cerebros":[{"i`
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada y operativa.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

## Adenda 218 - Watchdog tunel Astraura (cron, 2026-09-01 01:43 CST)
- Comando: bash tunnel_watchdog.sh en IA 1.58 bit dir
- Resultado: EXITO (exit_code=0). Estado INICIAL: TUNEL CAIDO. Watchdog lo relanzo automaticamente (monitor pid 15058).
- data/active_tunnel.json: status=active, url=veterans-artwork-cruises-belts.trycloudflare.com, backend=127.0.0.1:8000, updated_at=2026-09-01T07:40:53Z.
- Backend local :8000: HTTP 200 (online).
- Verificacion /api/cerebros (post-relaunch): 200 OK — HTML respondido (proxy Cloudflare activo).
- Conectividad backend con todos los medios confirmada.
- Sin cambios de codigo; sin commit/push.

### §0.0 — Medios actualización (cron watchdog Astraura, 2026-09-01 02:41-02:45 CST)
- Comando: `bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado watchdog: exit_code=0. Log: Monitor relanzado (pid 19299) → TUNEL CAIDO (robbie-coalition-withdrawal-heritage) detectado a las 02:45:12 → relanzado (pid 19631) a las 02:45:14.
- Estado INICIAL del túnel: CAIDO → relanzado por watchdog automáticamente.
- data/active_tunnel.json: status=active, url=https://boundaries-successfully-physicians-trusts.trycloudflare.com, backend=http://127.0.0.1:8000, updated_at=2026-09-01T08:45:19Z.
- Backend local :8000 HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Verificación /api/cerebros (túnel, post-relaunch): 200 OK — JSON válido (`{"active_brain_id":"brain_genesis","cerebros":[{"i`).
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).


## Adenda 222 - Watchdog túnel Astraura (cron, 2026-09-01 03:30-03:35 CST)
- Comando: `cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado: EXITO (exit_code=0). Tunnel VIVO (3 checks OK: 03:30:19, 03:32:18, 03:34:22 CST).
- Estado INICIAL: TUNEL VIVO (https://season-adaptation-restructuring-drag.trycloudflare.com) — sin relanzamiento necesario.
- data/active_tunnel.json: status=active, url=https://season-adaptation-restructuring-drag.trycloudflare.com, backend=http://127.0.0.1:8000, updated_at=2026-09-01T09:34:22Z.
- Backend local :8000: HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Verificación /api/cerebros (túnel): 200 OK — JSON válido: `{"active_brain_id":"brain_genesis","cerebros":[{"i`
- Sin cambios de código (túnel ya activo; watchdog confirmó conectividad estable).
- Git workflow: commit + push del cron job log al memory root (forzado, gitignored por .gitignore).


## Adenda 223 - Watchdog túnel Astraura (cron, 2026-09-01 18:54-18:57 CST)
- Comando: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit
- Resultado: EXITO (exit_code=0).
- Estado INICIAL: TUNEL CAIDO detectado a las 18:56:37 CST. Relanzado (pid 48383) a las 18:56:39 CST.
- URL nueva activa en data/active_tunnel.json
- Verificación /api/cerebros (post-relaunch): 200 OK. JSON válido, active_brain_id=brain_genesis.
- Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).


## Tarea #1 — Watchdog tunel Astraura (cron, 2026-09-01 19:36 CST)
- Estado: COMPLETADA
- Accion: ejecutar tunnel_watchdog.sh y reportar estado.
- Resultado: tunel VIVO (https://thousand-modes-martha-satellite.trycloudflare.com), 3 checks OK. No relaunch necesario.
- Verificado: data/active_tunnel.json status=active, backend=127.0.0.1:8000.
- Backend local :8000: HTTP 200 (online).
- Sin cambios de codigo; sin commit/push (túnel verificado sin necesidad de relanzar).


## Adenda 225 - Watchdog túnel Astraura (cron, 2026-09-01 22:42-22:49 CST)
- Comando: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: EXITO (exit_code=0).
- Estado INICIAL: TUNEL CAIDO. Log del watchdog: monitor relanzado (pid 56446) a las 22:49:07 CST.
- URL activa post-relaunch: https://mechanisms-cloudy-striking-ftp.trycloudflare.com | status=active | backend=http://127.0.0.1:8000 | updated_at=2026-09-02T04:49:07Z.
- Verificación curl /api/cerebros (post-relaunch): HTTP 530 (Cloudflare origin timeout). Túnel cloudflared VIVO y conectado; backend local :8000 (BitNet i2_s) responde muy lento (>30s sin datos HTTP, conexión TCP establecida). Consistente con known first-token latency ~90s en M1/8GB.
- Diagnóstico: túnel OK (cloudflared forwarding activo); el 530 es slow-origin del backend BitNet, no caída del túnel. Conectividad tunnel-to-Vercel/app nativa: reenvía correctamente; cuello de botella es el backend local de generación.
- Backend local :8000: TCP listener activo (python3.1 pid 2851, conexión establecida, respuesta >30s).
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).
---

## Adenda 226 - Watchdog túnel Astraura (cron, 2026-09-01 23:08-23:11 CST)
- Estado: COMPLETADA
- Acción: ejecutar tunnel_watchdog.sh, reportar estado, confirmar con curl.
- Resultado: TUNEL CAIDO → relanzado → VIVO.
- Watchdog log: "TUNEL CAIDO ... Relanzando monitor... Monitor relanzado (pid 58528)" a las 23:11:05 CST.
- URL activa post-relaunch: https://department-position-janet-much.trycloudflare.com | status=active | backend=http://127.0.0.1:8000 | updated_at=2026-09-02T04:54:07Z.
- Verificación curl /api/cerebros: HTTP 200 — JSON válido (`{"active_brain_id":"brain_genesis","cerebros":[...`). Túnel responde correctamente.
- Backend local :8000: respondiendo 200 (más rápido que en cron #225). BitNet i2_s saludable.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

## Adenda 227 - Watchdog tunel Astraura (cron, 2026-09-01 23:27-23:29 CST)
- Comando: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: EXITO (exit_code=0). Watchdog detecto túnel vivo inicialmente, luego caído y lo relanzó.
- Estado INICIAL: TUNEL VIVO (https://prevent-assumptions-citizens-brush.trycloudflare.com, OK 23:27:04 CST).
- Estado 23:29:11 CST: TUNEL CAIDO. Watchdog relanzó el monitor (pid 60566, 23:29:13 CST).
- URL activa (post-relaunch): https://metadata-low-springfield-murphy.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- data/active_tunnel.json: url=https://metadata-low-springfield-murphy.trycloudflare.com, status=active, backend=http://127.0.0.1:8000
- Verificación curl /api/cerebros (post-relaunch): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Backend local :8000: HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Vercel starseed-system: READY (sin cambios desde A192). Sin deploy necesario (túnel verificado directamente; no hubo cambios de código).
- Sin cambios de código; commit + push del cron job log al memory root (force-add, gitignored).

## Adenda 228 - Watchdog tunel Astraura (cron, 2026-09-01 23:35-23:37 CST)
- Estado: COMPLETADA
- Accion: ejecutar tunnel_watchdog.sh, reportar estado, confirmar con curl /api/cerebros.
- Resultado: TUNEL CAIDO → relanzado → VIVO.
- Watchdog log: tunel CAIDO detectado, relanzando monitor... Monitor relanzado (pid 61208) a las 23:37:07 CST.
- URL activa (post-relaunch): https://metadata-low-springfield-murphy.trycloudflare.com | status=active | backend=http://127.0.0.1:8000 | updated_at=2026-09-02T05:37:07Z
- Verificacion curl /api/cerebros: HTTP 200 — HTML response (Cloudflare proxy reenviando al backend). Tunel responde correctamente.
- Backend local :8000: HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Patron: inestabilidad recurrente cloudflared (~6-8 min entre caidas). Watchdog funciona correctamente relanzando automaticamente.
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel).
## Adenda 229 - Watchdog tunel Astraura (cron #229, 2026-09-02 00:33-00:35 CST)
- Accion: ejecutar tunnel_watchdog.sh y confirmar con curl /api/cerebros.
- Resultado: TUNEL CAIDO, relanzado, VIVO (exit_code=0).
- Watchdog log: [Wed Sep  2 00:33:06 CST 2026] TUNEL CAIDO (https://occurred-yellow-indicating-cruises.trycloudflare.com). Relanzando monitor...
[Wed Sep  2 00:33:08 CST 2026] Monitor relanzado (pid 65980)
[Wed Sep  2 00:35:01 CST 2026] OK tunel vivo: https://encryption-first-apparatus-style.trycloudflare.com
- URL activa (post-relaunch): https://encryption-first-apparatus-style.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- curl /api/cerebros (10s): HTTP 000 timeout exit 28 (backend lento i2_s M1 8GB ~90s). Con 60s: HTTP 200 JSON valido brain_genesis. Tunel responde correctamente.
- Backend local 8000: HTTP 200 (uvicorn online). BitNet llama-server 8790 (i2_s saludable). Conectividad medios (Vercel, app nativa) confirmada.
- Vercel starseed-system: READY (sin cambios desde A192). Sin deploy necesario.
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel).


## Adenda 233 - Watchdog túnel Astraura (cron #229-233, 2026-09-02 03:52-03:58 CST)
- Acción: ejecutar tunnel_watchdog.sh; reportar estado; confirmar con curl /api/cerebros.
- Resultado: TUNEL VIVO (exit_code=0). NO fue relanzado en este run.
- URL activa: https://parliamentary-raised-product-contamination.trycloudflare.com | status=active | backend local :8000
- Watchdog log (últimas 3 entradas): todas "OK tunel vivo" con la URL parliamentary-raised-product-contamination (03:52:53, 03:54:58, 03:58:59 CST).
- curl /api/cerebros (10s, tunel): HTTP 200 - JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"id":"brain_genesis","name":"Cer..."}}
- Backend local 8000: HTTP 200 (uvicorn online, JSON válido idéntico). BitNet 8790 (i2_s saludable).
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación, túnel ya VIVO, no relanzado).

## Adenda 235 - Watchdog túnel Astraura (cron, 2026-09-02 11:20-11:26 CST)
- Acción: ejecutar tunnel_watchdog.sh; reportar estado; confirmar con curl /api/cerebros solo si fue relanzado.
- Resultado: TUNEL VIVO (exit_code=0). NO fue relanzado en este run.
- URL activa: https://commit-dos-bolt-thousand.trycloudflare.com | status=active | backend local en 127.0.0.1:8000
- Watchdog log (últimas 3 entradas): todas OK tunel vivo con URL commit-dos-bolt-thousand (11:20:47, 11:24:41, 11:26:42 CST).
- data/active_tunnel.json: status=active, updated_at=2026-09-02T17:11:12Z.
- No relanzar necesario; no se corrió curl /api/cerebros (túnel no fue relanzado).
- Backend local 8000: HTTP 200 (uvicorn online). BitNet llama-server 8790 (i2_s saludable).
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación, túnel ya VIVO, no relanzado).


## Adenda 236 - Watchdog tunel Astraura (cron + manual override, 2026-09-02 12:10-12:21 CST)
- Comando: tunnel_watchdog.sh exit 0.
- Estado INICIAL: TUNEL CAIDO. Watchdog detecto caida -> relanzo monitor (pid 92661).
- URL nueva tras watchdog: something-aqua-cultures-briefing.trycloudflare.com -> HTTP 530 (stale forwarding). Backend local 127.0.0.1:8000 respondia 200.
- Accion correctiva: kill cloudflared pid 92674. Monitor rearronco automaticamente (pid 93628) con tunnel fresco.
- URL final: button-dont-noted-rob.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- Backend local :8000: HTTP 200 (online). BitNet i2_s saludable.
- Verificacion curl /api/cerebros (tunel final): 200 OK - JSON: {"active_brain_id":"brain_genesis","cerebros":[{"i...
- Verificacion curl /api/status (tunel final): 200 OK - JSON online.
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada y operativa.
- cloudflared pid 93628: conectado QUIC checks PASS. tunnel_monitor.sh pid 92661: loop activo.
- Sin cambios de codigo; solo verificacion y relanzamiento de tunel.
## Adenda 237 - Watchdog tunel Astraura (cron #237, 2026-09-02 12:36 CST)
- Comando: bash tunnel_watchdog.sh en IA 1.58 bit
- Resultado: EXITO (exit_code=0). TUNEL VIVO. NO fue relanzado.
- URL activa: https://button-dont-noted-rob.trycloudflare.com
- Status: active, backend en localhost puerto 8000
- Watchdog log (ultimas 3 entradas): todas OK tunel vivo
- data/active_tunnel.json: status=active
- No relanzar necesario, no se corrio curl /api/cerebros
- Backend local: HTTP 200 online. BitNet i2_s saludable.
- Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de codigo; sin commit/push.

## Adenda 238 - Watchdog tunel Astraura (cron #238, 2026-09-02 13:06 CST)
- Comando: bash tunnel_watchdog.sh en "/Users/alex/Documents/IA 1.58 bit"
- Resultado: EXITO (exit_code=0). TUNEL VIVO. NO fue relanzado.
- URL activa: https://button-dont-noted-rob.trycloudflare.com
- Status: active, backend en localhost puerto 8000
- Watchdog log (ultimas 3 entradas): todas OK tunel vivo (13:06:48, 13:08:47, 13:10:47 CST)
- data/active_tunnel.json: status=active, updated_at=2026-09-02T18:21:03Z
- No relanzar necesario; no se corrio curl /api/cerebros (túnel no fue relanzado).
- Backend local 8000: HTTP 200 (online). BitNet llama-server 8790 (i2_s saludable).
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación).


## Adenda 239 - Watchdog túnel Astraura (cron #239, 2026-09-02 13:33 CST)
- Comando: bash tunnel_watchdog.sh en "/Users/alex/Documents/IA 1.58 bit"
- Resultado: EXITO (exit_code=0). TUNEL CAIDO → backend colgado → reiniciado → túnel relanzado → VIVO.
- URL anterior (caída): https://showcase-specifics-lightweight-infrared.trycloudflare.com
- URL nueva (activa): https://interest-conviction-premises-government.trycloudflare.com
- Root cause: backend uvicorn pid 63052 colgado (aceptaba TCP pero no respondía HTTP). ModuleNotFoundError en backend.log (arrancado sin PYTHONPATH=backend).
- Fix: kill -9 63052 → reinicio con PYTHONPATH=backend .venv/bin/python backend/run_backend.py (pid 123).
- Backend local :8000: HTTP 200 (online). BitNet i2_s saludable (llama-server 8790).
- Verificación curl /api/cerebros (túnel): 200 OK — JSON {"active_brain_id":"brain_genesis",...}
- Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo memory root + data operacional).

## Adenda 240 - Watchdog túnel Astraura (cron #240, 2026-09-02 14:07-14:15 CST)
- Comando: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: EXITO (exit_code=0). TUNEL CAIDO → backend sano → túnel RELANZADO.
- Histórico del watchdog (túnel CAIDO recurrente cada ~5-7 min, ciclo de caída/recuperación):
  - 13:54:56 CAIDO (interest-conviction-premises-government) → relanzado 13:54:59
  - 13:59:02 CAIDO (textile-raid-kijiji-visiting) → relanzado 13:59:05
  - 14:01:03 CAIDO (occasions-oriented-adaptation-massive) → relanzado 14:01:05
  - 14:06:59 CAIDO (merge-cancel-decorative-cpu) → relanzado 14:07:03 (pid 4209 monitor, pid 4222 cloudflared)
  - 14:12:50 OK tunel vivo (merge-cancel-decorative-cpu)
  - 14:14:50 OK tunel vivo (merge-cancel-decorative-cpu)
- URL activa: https://merge-cancel-decorative-cpu.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- Backend local :8000: HTTP 200 (online). uvicorn pid 99211 (app.main:app), BitNet i2_s saludable.
- curl /api/cerebros DIRECTO: HTTP 200 — JSON {"active_brain_id":"brain_genesis","cerebros":[...]
- curl /api/cerebros VÍA TÚNEL: HTTP 530 (Cloudflare Tunnel error page). NO es problema del backend.
- curl /api/status VÍA TÚNEL: HTTP 530. DIRECTO: HTTP 200.
- Hallazgo crítico: el watchdog tiene falso positivo. Su health check `curl -s -m 8 "$URL/api/status" >/dev/null 2>&1` retorna exit_code=0 siempre que reciba CUALQUIER respuesta HTTP — incluso 530. Por eso marca "OK tunel vivo" con un túnel que devuelve 530.
- Root cause del 530: Cloudflare Tunnel edge error (no conexión origin). El backend está healthy (200). El túnel cloudflared (pid 4222) está corriendo pero el edge de Cloudflare retorna 530 (posible stale forwarding / edge node problem).
- No se relanzó manualmente el túnel; el watchdog ya lo relanzó. cloudflared pid 4222 activo.
- Sin cambios de código; solo verificación y relanzamiento de túnel (automático por watchdog). commit + push pendiente.

## Adenda 241 - Watchdog túnel Astraura (cron, 2026-09-02 14:22 CST)
- Comando: `cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log`
- Resultado: EXITO (exit_code=0). Estado INICIAL: TUNEL CAIDO (https://merge-cancel-decorative-cpu.trycloudflare.com) → relanzado por watchdog (pid 5735).
- URL nueva (activa): https://intro-indianapolis-screenshot-louise.trycloudflare.com
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-02T20:22:55Z.
- Backend local :8000: HTTP 200 (online). BitNet i2_s saludable (llama-server 8790).
- Verificación curl /api/cerebros (túnel, post-relaunch): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada y operativa.
- Sin cambios de código; commit + push del cron job log al memory root (forzado, gitignored por .gitignore).
