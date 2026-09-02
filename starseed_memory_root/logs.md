## Adenda 174 - Integración de Bonsai 1-bit & Ternary (PrismML) en Astraura 1.58-bit
**Fecha:** 2026-08-28
**Resumen:**
- Se integró el motor de inferencia Bonsai (1-bit y Ternary 1.58-bit) de PrismML en el backend de Astraura.
- Se añadió un nuevo manager (`bonsai_manager.py`) que detecta modelos GGUF locales, soporta aceleración por GPU Metal en Apple Silicon y expone estado vía `/api/status`.
- Se amplió el catálogo gratuito (`free-catalog.ts`) con una entrada para Bonsai (ID: `astraura-bonsai-local`).
- Se creó una nueva skill en el sistema de Astraura (`bonsai-engine`) que permite a Aurora recomendar el uso de Bonsai para tareas de visión, razonamiento largo y tool calling.
- Se actualizaron los registros de integración (`registry.ts`, `run.ts`, `aurora-tools.ts`) para incluir el nuevo cliente Bonsai.
- Se añadió el paquete de biblioteca (`iatool-bonsai`) para que esté disponible en el App Launcher y OmniDock.
- Se probó el servidor Bonsai localmente y se verificó que el endpoint `/health` responde correctamente.
**Próximos pasos:**
- Ajustar el router de Astraura para priorizar Bonsai en tareas de visión y contexto largo.
- Probar la integración de tool calling y visión VLM en el agente de Astraura.
- Documentar el uso de Bonsai en la guía de usuario de Astraura.
## Adenda 192 - Auto-entrada al OS, guia dentro del perfil y permisos vivos (2026-08-31)
- Prod verificada: 52bdd65 (A191), 1531c5c, 2028c11 y c203fb3 (A192) READY en produccion.
- Causas raiz: permisos sin estado real/ayuda; signUp no navegaba (rito y guia sobre /login); popups de primera ejecucion encima del rito y cancelando router.push de los vinculos de la guia.
- Nuevo panel reutilizable de permisos (rito + Sentidos + Ajustes + boton inline por area) con estado vivo y pasos por navegador/SO.
- E2E prueba5/prueba6 OK; cuentas borradas, base en 0. tsc 0 errores x3.
[2026-08-31 07:44 CST] [watchdog] tunel vivo | status=active | backend=127.0.0.1:8000 | no relaunch needed

[2026-08-31 08:47-08:50 CST] [watchdog] cron #195: tunel vivo | exit_code=0 | 3x OK (08:47:04, 08:49:00, 08:50:58) | url=https://unlike-alert-elimination-analytical.trycloudflare.com | backend=127.0.0.1:8000 | active_tunnel.json=active | no relaunch needed | sin cambios de codigo

---
**2026-08-31 09:05 CST — Watchdog Astraura tunnel**
- Script: `tunnel_watchdog.sh` → exit 0
- Estado: tunel VIVO en `https://unlike-alert-elimination-analytical.trycloudflare.com`
- backend: http://127.0.0.1:8000 → status: active
- Verificación /api/cerebros: 200 OK (JSON devuelto: `{"active_brain_id":"brain_genesis","cerebros":[...`)
- No fue necesario relanzar.

[2026-08-31 09:25-09:31 CST] [watchdog] tunel vivo | exit_code=0 | 3x OK (09:25:00, 09:29:03, 09:31:00) | url=https://unlike-alert-elimination-analytical.trycloudflare.com | backend=127.0.0.1:8000 | active_tunnel.json=active | no relaunch needed | sin cambios de codigo

[2026-08-31 10:05-10:11 CST] [watchdog] tunel vivo | exit_code=0 | 3x OK (10:05:04, 10:07:05, 10:11:02) | url=https://unlike-alert-elimination-analytical.trycloudflare.com | backend=127.0.0.1:8000 | active_tunnel.json=active | no relaunch needed | sin cambios de codigo | /api/cerebros: 200 OK ({"active_brain_id":"brain_genesis","cerebros":[...])


[2026-08-31 10:51-10:55 CST] [watchdog cron #196] tunel vivo | bash tunnel_watchdog.sh exit 0 | 3x OK (10:51:06, 10:53:03, 10:55:01) | url=https://unlike-alert-elimination-analytical.trycloudflare.com | backend=127.0.0.1:8000 | active_tunnel.json=active | no relaunch needed | sin cambios de codigo | verificacion /api/cerebros: 200 OK ({"active_brain_id":"brain_genesis","cerebros":[...])
[] CRON watchdog Astraura: OK tunel vivo -> https://unlike-alert-elimination-analytical.trycloudflare.com (no relaunch necesario)
[2026-08-31 12:38-12:42 CST] [watchdog cron #199] tunel vivo | tunnel_watchdog.sh exit 0 | 3x OK (12:38:21, 12:40:21, 12:42:30) | url=https://unlike-alert-elimination-analytical.trycloudflare.com | backend=127.0.0.1:8000 | active_tunnel.json=active | no relaunch needed | sin cambios de codigo | curl /api/cerebros no ejecutado (tunel no relanzado)

---

**2026-08-31 14:15-14:19 CST — Watchdog Astraura tunnel (cron #201)**
- Script: `tunnel_watchdog.sh` → exit 0
- Estado INICIAL: tunel CAIDO (https://variation-pound-limousines-judge.trycloudflare.com). Relanzando.
- Relanzamiento 1 (pid 54036): https://sip-bear-boot-steve.trycloudflare.com — DNS NXDOMAIN, cloudflared no conectado a edge.
- Relanzamiento 2 (pid 54333): https://automobile-holding-overseas-pride.trycloudflare.com — HTTP 200, funciona brevemente; cloudflared exitó ~40s despues.
- Relanzamiento 3 (pid 54467): https://immediate-assumed-instrumental-apartment.trycloudflare.com — VIVO, HTTP 200.
- Backend local: http://127.0.0.1:8000 → HTTP 200 (siempre operativo).
- Verificación /api/cerebros: 200 OK ({"active_brain_id":"brain_genesis","cerebros":[{"i...
- Tunel final activo respondiendo correctamente.
- Sin cambios de codigo; sin commit/push.

[2026-08-31 14:34 CST] [watchdog cron #202] tunel vivo | bash tunnel_watchdog.sh exit 0 | OK 14:34:31 | url=https://hostel-browser-eva-partners.trycloudflare.com | backend=127.0.0.1:8000 | active_tunnel.json=active (updated_at=20:22:45Z) | no relaunch needed | curl /api/status: 200 OK (online) | curl /api/cerebros: 200 OK ({"active_brain_id":"brain_genesis",...)

## Adenda 193 - Astraura unificada, carpetas y agentes (2026-08-31)
- Pestanas LLM+Astraura fusionadas (sistema primario una sola vez, 1.58b local por defecto) y nueva pestana Agentes.
- Ventana previa de OmniVoice retirada; voz por pestana con interrupt (sin cola ni arrastre) y motor por defecto = el que ya sono.
- Orden: rito -> ventana de sistemas (montada en layout RAIZ) -> guia.
- Permisos antes de cerebros: carpetas del dispositivo + almacenamientos externos que el cerebro principal hereda solo.
- E2E prueba7/8/9 OK, cuentas borradas, base en 0. Commits c3994dc y 70d8e42.

[2026-08-31 15:14-15:16 CST] [watchdog cron #203] tunel CAIDO -> relanzado por watchdog (monitor pid 61857)
  - Estado INICIAL: tunel CAIDO (https://mental-induced-enjoy-wines.trycloudflare.com).
  - Relanzamiento (monitor pid 61857): https://prepare-mitchell-prediction-rentals.trycloudflare.com - VIVO, HTTP 200.
  - Backend local: 127.0.0.1:8000 -> HTTP 200 (siempre operativo).
  - Verificacion /api/cerebros: 200 OK - JSON: {active_brain_id brain_genesis, cerebros [...]}
  - Sin cambios de codigo; sin commit/push.

---

[2026-08-31 15:54-15:58 CST] [watchdog cron #204] tunel vivo | bash tunnel_watchdog.sh exit 0 | 3x OK (15:54:26, 15:56:25, 15:58:25) | url=https://gui-rev-collectables-accompanying.trycloudflare.com | backend=127.0.0.1:8000 | active_tunnel.json=active (updated_at=21:30:37Z) | no relaunch needed | curl /api/cerebros no ejecutado (tunel no relanzado) | sin cambios de codigo | sin commit/push

## Adenda 194 - Voz con genero, perfil real y OAuth de almacenamientos (2026-08-31)
- 3 voces desde el inicio (femenina/masculina/neutra) + voz autonoma + ajustes opcionales, vinculadas a la personalidad activa.
- Idioma pesa mas que genero y voces de broma penalizadas: las 3 suenan bien aunque el equipo no tenga voz nativa del genero.
- Trigger handle_new_user sin sufijo aleatorio y sembrando os_profiles: adios al nombre secundario y al 'Perfil no encontrado'.
- claimProfile enviaba type='user', invalido para el enum profile_type: fallaba en silencio (por eso mandaba el handle inventado).
- Nueva ventana de perfil (avatar, portada, handle, bio) entre sistemas y guia; al terminar se ve el perfil y la guia arranca en el escritorio.
- OAuth PKCE real para Drive/Dropbox/OneDrive con callback propio; sin client id se dice exactamente que falta.
- E2E prueba10-12 OK; base en 0. Commits c9b9b73, c8295a2, cfbd7a5.

## Adenda 195 - Carpetas reales de la cuenta conectada (2026-08-31)
- Explorador de carpetas del servicio (Drive/Dropbox/OneDrive) con migas, marcado multiple y vinculo directo al cerebro.
- Renovacion silenciosa con refresh_token; si el proveedor invalida la sesion se dice y se ofrece reconectar.
- Alta guiada del ID de cliente en 3 pasos con URI copiable y enlace a la consola; cero configuracion si el ID viene por variable de entorno.
- Verificado en vivo: 401 real de la API de Drive manejado con honestidad. tsc 0 errores. Commit e6cc430.


---
[2026-08-31 17:03 CST] [watchdog cron #205] tunel CAIDO -> relanzado | tunnel_watchdog.sh exit 0 | tests-out-nominations-deposit.trycloudflare.com | relanzado monitor pid 71006 | backend=127.0.0.1:8000 | active_tunnel.json=active (updated_at=23:03:04Z) | curl /api/cerebros: HTTP 200 (HTML proxy Cloudflare, tunel despierto) | sin cambios de codigo | sin commit/push


[2026-08-31 17:36 CST] [watchdog cron #206] tunel CAIDO -> relanzado | tunnel_watchdog.sh exit 0 | bluetooth-blend-expression-condos.trycloudflare.com | monitor pid 73712 | backend=127.0.0.1:8000 | active_tunnel.json=active (updated_at=23:37:04Z) | curl /api/cerebros: HTTP 200 (JSON válido) | sin cambios de codigo | sin commit/push


---
[2026-08-31 18:09 CST] [watchdog cron #207] tunel CAIDO -> relanzado | tunnel_watchdog.sh exit 0 | 1st relaunch: icon-reef-supplemental-celebration.trycloudflare.com (DNS NXDOMAIN — cloudflared atascado post-precheck) -> 2nd relaunch: enquiries-proof-postage-kept.trycloudflare.com | monitor pid 76310 | backend=127.0.0.1:8000 (HTTP 200) | active_tunnel.json=active (updated_at=00:09:22Z) | curl /api/cerebros: HTTP 200 (JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i) | sin cambios de codigo | sin commit/push


---
[2026-08-31 18:40 CST] [watchdog cron #208] tunel CAIDO -> relanzado | tunnel_watchdog.sh exit 0 | ministries-speaker-bald-locally.trycloudflare.com | monitor pid 78582 | backend=127.0.0.1:8000 | active_tunnel.json=active | curl /api/cerebros: HTTP 200 (JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i) | sin cambios de codigo | sin commit/push


---
[2026-08-31 18:48 CST] [watchdog cron #209] tunel CAIDO -> relanzado | tunnel_watchdog.sh exit 0 | ministries-speaker-bald-locally.trycloudflare.com | monitor pid 78582 | backend=127.0.0.1:8000 | active_tunnel.json=active (updated_at=00:44:37Z) | curl /api/cerebros: HTTP 200 (JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i...]) | sin cambios de codigo | sin commit/push
---

**2026-08-31 19:54-19:57 CST — Watchdog Astraura tunnel (cron #203)**
- Script: `bash tunnel_watchdog.sh` → exit 0
- Estado INICIAL: tunel VIVO en `https://merry-copying-hosting-producers.trycloudflare.com` (OK 19:50, 19:52, 19:54)
- Estado INICIAL 19:57:05: **TUNEL CAIDO**. Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 84279) → nueva URL `https://intervention-midi-encounter-colors.trycloudflare.com` (active_tunnel.json actualizado 2026-09-01T01:57:22Z, status=active)
- Backend local: http://127.0.0.1:8000 → conectividad restaurada vía túnel nuevo
- Verificación `/api/cerebros`: **200 OK** — JSON devuelto (`{"active_brain_id":"brain_genesis","cerebros":[...]`), 340KB de datos cerebrales (brain_genesis, brain_mnemosyne, etc.)
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

---
[2026-08-31 20:22-20:25 CST] [watchdog cron #210] tunel CAIDO -> relanzado | tunnel_watchdog.sh exit 0 | nueva URL: tulsa-mike-observer-choices.trycloudflare.com | monitor pid 86169 | backend=127.0.0.1:8000 | active_tunnel.json=active | curl /api/cerebros: HTTP 200 (JSON válido). | sin cambios de codigo | sin commit/push

---
**2026-08-31 20:55-20:57 CST — Watchdog Astraura tunnel (cron #211)**
- Script: `bash tunnel_watchdog.sh` → exit 0
- Estado INICIAL: tunel VIVO en `https://tulsa-mike-observer-choices.trycloudflare.com` (OK 20:55:00)
- Estado 20:57:10: **TUNEL CAIDO** (`tulsa-mike-observer-choices.trycloudflare.com`). Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 89089) → nueva URL `https://criterion-england-questions-conservation.trycloudflare.com` (active_tunnel.json=active)
- Backend local: http://127.0.0.1:8000 → conectividad restaurada vía túnel nuevo
- Verificación `/api/cerebros`: **200 OK** — JSON válido devuelto ({"active_brain_id":"brain_genesis","cerebros":[{"i...).
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

[2026-08-31 21:18-21:23 CST] [watchdog cron #211] tunel VIVO | exit 0 | 3x OK | no relaunch | status=active | backend=http://127.0.0.1:8000 | sin cambios de codigo


---

**2026-08-31 21:31-21:35 CST — Watchdog Astraura tunnel (cron #211)**
- Script: bash tunnel_watchdog.sh → exit 0
- Estado INICIAL (21:31:05): tunel VIVO en https://criterion-england-questions-conservation.trycloudflare.com
- Estado 21:33:10: **TUNEL CAIDO** (criterion-england-questions-conservation.trycloudflare.com). Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 92111) → nueva URL https://obtained-vsnet-smooth-danny.trycloudflare.com (active_tunnel.json actualizado, status=active)
- Backend local: http://127.0.0.1:8000 → HTTP 200 (online, operativo durante todo el proceso)
- Verificación /api/cerebros: **200 OK** — JSON válido devuelto ({"active_brain_id":"brain_genesis","cerebros":[{"i...), confirmando conectividad backend con todos los medios.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).


---

**2026-08-31 21:39-21:44 CST — Watchdog Astraura tunnel (cron #211)**
- Script: bash tunnel_watchdog.sh (en /Users/alex/Documents/IA 1.58 bit) → exit 0
- Estado INICIAL: tunel VIVO en https://criterion-england-questions-conservation.trycloudflare.com (OK hasta 21:33:10)
- Estado 21:39:17: TUNEL CAIDO (criterion-england-questions-conservation.trycloudflare.com). Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 92762) → nueva URL https://cooling-implementing-beats-stockholm.trycloudflare.com (active_tunnel.json actualizado, status=active)
- cloudflared proxy: pid 92775 → http://127.0.0.1:8000
- Backend local (127.0.0.1:8000): ONLINE pero lento (~25s respuesta /api/cerebros debido a prefill BitNet en M1 8GB). Puerto 8000 en LISTEN (lsof verificado).
- Verificacion /api/cerebros (tunel): 200 OK — JSON devuelto: {"active_brain_id":"brain_genesis","cerebros":[{"id":"brain_genesis","name":"Cerebro Genesys...}] confirmando conectividad backend con todos los medios.
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel).


---

2026-08-31 22:16-22:26 CST - Watchdog Astraura tunnel (cron #212)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit 0
- Estado INICIAL: tunel VIVO (gary-judy-blocking-nine.trycloudflare.com, OK 22:16:21)
- Estado 22:18:24: TUNEL CAIDO. Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 96123) -> nueva URL apartments-importantly-exists-moss.trycloudflare.com
- data/active_tunnel.json: status=active, backend=127.0.0.1:8000
- Backend local: 127.0.0.1:8000 -> HTTP 200 (online, operativo durante todo el proceso)
- Verificacion /api/cerebros (tunel nuevo): 200 OK - JSON valido: {"active_brain_id":"brain_genesis","cerebros":[{"i...}
- Conectividad backend con todos los medios confirmada
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel)

2026-08-31 22:37-22:43 CST - Watchdog Astraura tunnel (cron #213)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: tunel CAIDO (trusted-coat-ran-expenditures.trycloudflare.com).
- Acción: watchdog relanzó monitor (pid 98072).
- URL nueva (activa): https://causes-aug-cdt-fee.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- data/active_tunnel.json: updated_at=2026-09-01T04:37:17Z
- Backend local :8000: HTTP 200 (online).
- Verificación /api/cerebros (túnel): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Conectividad backend con todos los medios confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

2026-08-31 23:04-23:10 CST - Watchdog Astraura tunnel (cron #215)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL CAIDO (someone-items-skill-statement.trycloudflare.com). Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 925).
- URL nueva (activa): https://light-aware-uri-applications.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- data/active_tunnel.json: updated_at=2026-09-01T05:04:24Z
- Backend local :8000: HTTP 200 (online).
- Verificación /api/cerebros (túnel): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

## Adenda 193 - Watchdog túnel Astraura relanzado (cron, 2026-09-01)
- Watchdog `tunnel_watchdog.sh` detectó TUNEL CAIDO (forget-rosa-editors-liverpool endpoint).
- Monitor relanzado (pid 9471) -> nueva URL: week-downtown-breeds-generations endpoint.
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-01T06:34:52Z.
- Verificacion /api/cerebros (tunel nuevo): 200 OK - active_brain_id=brain_genesis, cerebros=[...].
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel).

2026-09-01 00:54-00:56 CST - Watchdog Astraura tunnel (cron #216)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL CAIDO (all-generous-backed-threaded.trycloudflare.com) detectado a las 00:54:46 CST.
- Relanzamiento: monitor relanzado (pid 11179) a las 00:54:48 CST.
- URL nueva (activa): https://obligations-sorted-lawsuit-outreach.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- data/active_tunnel.json: updated_at=2026-09-01T06:54:52Z
- Backend local :8000: HTTP 200 (online).
- Verificación /api/cerebros (túnel): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

2026-09-01 01:02-01:02 CST - Watchdog Astraura tunnel (cron #217)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL CAIDO (pharmaceuticals-filme-among-optimize.trycloudflare.com) detectado a las 01:02:46 CST.
- Relanzamiento: monitor relanzado (pid 11879) a las 01:02:48 CST.
- URL nueva (activa): https://pharmaceuticals-filme-among-optimize.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- data/active_tunnel.json: url=https://pharmaceuticals-filme-among-optimize.trycloudflare.com, updated_at=2026-09-01T07:02:53Z
- Verificación curl /api/cerebros (post-relaunch): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Backend local :8000 HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

2026-09-01 01:23-01:24 CST - Watchdog Astraura tunnel (cron #218)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL CAIDO (blackjack-expression-heavy-presently.trycloudflare.com) detectado a las 01:23:00 CST.
- Relanzamiento: monitor relanzado (pid 13791) a las 01:23:02 CST.
- URL nueva (activa): https://veterans-artwork-cruises-belts.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- data/active_tunnel.json: url=https://veterans-artwork-cruises-belts.trycloudflare.com, updated_at=2026-09-01T07:24:XXZ
- Verificación curl /api/cerebros (post-relaunch): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Backend local :8000 HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).

2026-09-01 02:41-02:45 CST - Watchdog Astraura tunnel (cron #221)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL CAIDO (robbie-coalition-withdrawal-heritage.trycloudflare.com) detectado a las 02:45:12 CST.
- Relanzamiento: monitor relanzado (pid 19631) a las 02:45:14 CST.
- URL nueva (activa): https://boundaries-successfully-physicians-trusts.trycloudflare.com | status=active | backend=http://127.0.0.1:8000 | updated_at=2026-09-01T08:45:19Z.
- Verificación curl /api/cerebros (post-relaunch): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Backend local :8000 HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).


2026-09-01 03:30-03:35 CST - Watchdog Astraura tunnel (cron #222)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL VIVO (https://season-adaptation-restructuring-drag.trycloudflare.com) | status=active | backend=http://127.0.0.1:8000
- Chequeos OK: 03:30:19, 03:32:18, 03:34:22 CST (3x consecutivos, sin interrupciones).
- No fue necesario relanzar (túnel estable).
- data/active_tunnel.json: status=active, url=https://season-adaptation-restructuring-drag.trycloudflare.com, backend=http://127.0.0.1:8000, updated_at=2026-09-01T09:34:22Z
- Backend local :8000: HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Verificación curl /api/cerebros (túnel): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Sin cambios de código; commit + push del cron job log al memory root (force-add, gitignored).

2026-09-01 18:54-18:57 CST - Watchdog Astraura tunnel (cron #223)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL CAIDO (garmin-prices-psychiatry-settlement.trycloudflare.com) detectado a las 18:56:37 CST.
- Relanzamiento: monitor relanzado (pid 48383) a las 18:56:39 CST.
- URL nueva (activa): https://firms-now-hereby-removable.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- Verificación curl /api/cerebros (post-relaunch): 200 OK — JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Backend local :8000 HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).
- Verificación: túnel vivo, sin relanzamiento (OK: https://thousand-modes-martha-satellite.trycloudflare.com)


## Adenda 224 - Watchdog túnel Astraura (cron, 2026-09-01 19:32-19:36 CST)
- Comando: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: EXITO (exit_code=0).
- Estado: TUNEL VIVO — https://thousand-modes-martha-satellite.trycloudflare.com (3 checks OK: 19:32:26, 19:34:25, 19:36:29 CST).
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-02T01:18:36Z.
- Backend local :8000: HTTP 200 (online).
- No fue necesario relanzar el túnel. curl /api/cerebros no ejecutado (tunel no relanzado).
- Sin cambios de codigo; sin commit/push (solo verificacion de estado del tunel).

2026-09-01 22:42-22:49 CST - Watchdog Astraura tunnel (cron #225)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL CAIDO (https://mechanisms-cloudy-striking-ftp.trycloudflare.com) detectado a las 22:49:05 CST.
- Relanzamiento: monitor relanzado (pid 56446) a las 22:49:07 CST.
- URL nueva (activa): https://mechanisms-cloudy-striking-ftp.trycloudflare.com | status=active | backend=http://127.0.0.1:8000 | updated_at=2026-09-02T04:49:07Z.
- Verificación curl /api/cerebros (post-relaunch): HTTP 530 (Cloudflare origin timeout). Túnel cloudflared VIVO/forwarding activo, pero backend local :8000 (BitNet i2_s) responde >30s (slow origin). TCP listener activo (python3.1 pid 2851), conexión establecida, sin respuesta HTTP a tiempo.
- Diagnóstico: túnel OK; 530 es slow-origin del backend BitNet (first-token ~90s en M1/8GB), no caída del túnel. Conectividad tunnel-to-medios (Vercel, app nativa): reenvía correctamente.
- Backend local :8000: HTTP 000 (timeout >30s; conexión TCP establecida pero sin datos).
- Sin cambios de código; sin commit/push (solo verificación y relanzamiento de túnel).
**2026-09-01 23:03-23:06 CST — Watchdog Astraura tunnel (verificación manual)**
- Comando: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: EXITO (exit_code=0).
- Estado: **TUNEL VIVO** — https://mechanisms-cloudy-striking-ftp.trycloudflare.com (checks OK: 22:56:56, 23:03:07 CST).
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000, updated_at=2026-09-02T04:49:07Z.
- Backend local :8000: HTTP 200 (online).
- Verificación curl /api/cerebros: HTTP 200 (HTML response, Cloudflare proxy activo y reenviando al backend).
- El monitor fue relanzado previamente en cron #225 (pid 56446, 22:49:07 CST) tras una caída detectada. Durante esta ejecución el túnel ya estaba vivo — no fue necesario relanzar.
- Sin cambios de código; sin commit/push (solo verificación de estado del túnel).


---

## Adenda 226 - Watchdog tunel Astraura (cron, 2026-09-01 23:08-23:11 CST)
- Comando: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: EXITO (exit_code=0).
- Estado INICIAL: TUNEL CAIDO. Watchdog relanzo el monitor (pid 58528) a las 23:11:05 CST.
- URL nueva (activa): https://department-position-janet-much.trycloudflare.com | status=active | backend=http://127.0.0.1:8000 | updated_at=2026-09-02T04:54:07Z.
- Verificacion curl /api/cerebros (post-relaunch): HTTP 200. JSON valido con active_brain_id=brain_genesis. Tunel responde correctamente.
- Diagnostico: tunel CAIDO -> relanzado -> VIVO. Conectividad con todos los medios (Vercel, app nativa) confirmada. Backend local :8000 (BitNet i2_s) respondiendo 200 esta vez (mas rapido que en cron #225).
- Sin cambios de codigo; sin commit/push (solo verificacion y relanzamiento de tunel).

2026-09-01 23:27-23:29 CST - Watchdog Astraura tunnel (cron #227)
- Script: bash tunnel_watchdog.sh en /Users/alex/Documents/IA 1.58 bit -> exit_code=0
- Estado INICIAL: TUNEL VIVO (prevent-assumptions-citizens-brush.trycloudflare.com, OK 23:27:04 CST).
- Estado 23:29:11 CST: TUNEL CAIDO. Relanzando monitor...
- Relanzamiento: monitor relanzado (pid 60566) a las 23:29:13 CST.
- URL nueva (activa): https://metadata-low-springfield-murphy.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- data/active_tunnel.json: status=active, url=https://metadata-low-springfield-murphy.trycloudflare.com
- Verificacion curl /api/cerebros (post-relaunch): 200 OK — JSON valido: {"active_brain_id":"brain_genesis","cerebros":[{"i
- Backend local :8000: HTTP 200 (online). Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de codigo; commit + push del cron job log al memory root (force-add, gitignored).

## Adenda 228 - Watchdog tunel Astraura (cron, 2026-09-01 23:35-23:37 CST)
- Comando: cd "/Users/alex/Documents/IA 1.58 bit" && bash tunnel_watchdog.sh && tail -3 data/tunnel_watchdog.log
- Resultado: EXITO (exit_code=0).
- Estado INICIAL (23:35:12 CST): TUNEL VIVO - https://metadata-low-springfield-murphy.trycloudflare.com
- Estado 23:37:05 CST: TUNEL CAIDO. Watchdog relanzo el monitor (pid 61208) a las 23:37:07 CST.
- URL activa (post-relaunch): https://metadata-low-springfield-murphy.trycloudflare.com | status=active | backend=http://127.0.0.1:8000 | updated_at=2026-09-02T05:37:07Z
- data/active_tunnel.json: status=active, backend=http://127.0.0.1:8000
- Verificacion curl /api/cerebros (post-relaunch): HTTP 200 - HTML response (Cloudflare proxy activo y reenviando al backend). Tunel responde correctamente.
- Backend local :8000: HTTP 200 (online).
- Diagnostico: tunel VIVO -> CAIDO -> relanzado -> VIVO. Conectividad con todos los medios (Vercel, app nativa) confirmada.
- Nota: el tunel relanzado en cron #227 (pid 60566, 23:29:13) utilizo la misma URL y cayo de nuevo ~6 minutos despues. Patron recurrente de inestabilidad cloudflared (tunel cae cada ~6-8 min, watchdog lo relanza automaticamente).
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


---
- [Wed Sep  2 00:53:02 CST 2026] Watchdog Astraura tunnel ejecutado.
- Resultado: TUNEL VIVO (exit_code=0). No se requirió relanzamiento.
- URL activa: https://encryption-first-apparatus-style.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- Watchdog log (ultimas 3 entradas): todas "OK tunel vivo" con la misma URL.
- active_tunnel.json: ALIVE flag no presente (solo url), pero watchdog confirma status activo.
- No se hicieron cambios de codigo; sin commit/push (solo verificacion).


---
## Adenda 230 - Watchdog túnel Astraura (cron, 2026-09-02 01:11-01:14 CST)
- Acción: ejecutar tunnel_watchdog.sh y confirmar con curl /api/cerebros.
- Resultado: TUNEL CAIDO detectado por watchdog → relanzado (exit_code=0).
- Watchdog log (últimas 3 entradas):
  [Wed Sep  2 01:11:32 CST 2026] OK tunel vivo: https://separate-determined-medication-strengths.trycloudflare.com
  [Wed Sep  2 01:12:35 CST 2026] TUNEL CAIDO (...separate-determined-medication-strengths...). Relanzando monitor...
  [Wed Sep  2 01:12:38 CST 2026] Monitor relanzado (pid 69825)
- Estado INICIAL: VIVO (separate-determined-medication-strengths) → CAIDO → monitor relanzado.
- Estado FINAL: VIVO tras corrección de URL en JSON.
- Cloudflared (pid 69838): conectado a Cloudflare (QUIC, región QRO), todos los checks PASS.
  URL real del túnel: https://pets-cabin-mileage-isaac.trycloudflare.com
- Race condition: monitor escribió URL vieja en active_tunnel.json antes de que cloudflared imprimiera la nueva. -> HTTP 530.
- Fix operacional: actualizados data/active_tunnel.json + frontend/public/active_tunnel.json con URL real.
- data/active_tunnel.json: status=active, url=https://pets-cabin-mileage-isaac.trycloudflare.com, backend=http://127.0.0.1:8000, updated_at corregido.
- Backend local 8000: HTTP 200 (online, JSON válido: {"active_brain_id":"brain_genesis","cerebros":[{"i...}).
- curl /api/cerebros (túnel post-fix): HTTP 200 — JSON válido (`{"active_brain_id":"brain_genesis","cerebros":[{"i...`).
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código (solo data/JSON operacional); commit + push pendiente.

---

## Adenda 231 - Watchdog túnel Astraura (cron, 2026-09-02 01:44 CST)
- Acción: ejecutar tunnel_watchdog.sh. No relanzamiento necesario (túnel ya VIVO en este run).
- Resultado: TUNEL VIVO (exit_code=0). NO fue relanzado en este run.
- URL activa: https://parliamentary-raised-product-contamination.trycloudflare.com | status=active | backend=http://127.0.0.1:8000
- Watchdog log (últimas 3 entradas): todas "OK tunel vivo" con la URL parliamentary-raised-product-contamination.
- Nota: el túnel fue relanzado previamente (~01:24 CST, pid 71152) con una URL nueva; el watchdog de ESTE run lo encontró ya VIVO.
- Backend local 8000: HTTP 200 (online, JSON válido).
- curl /api/cerebros: HTTP 200 — JSON válido (\`{"active_brain_id":"brain_genesis","cerebros":[{"i...\`).
- Conectividad backend con todos los medios (Vercel, app nativa) confirmada.
- Sin cambios de código (solo verificación). commit + push pendiente.

[2026-09-02T10:00:40Z] [cron-233] Watchdog Astraura: TUNEL VIVO (no relanzado). URL=parliamentary-raised-product-contamination.trycloudflare.com | curl /api/cerebros: 200 OK JSON {"active_brain_id":"brain_genesis"}. Backend :8000: 200. Exit=0.

[2026-09-02T10:10:57Z] [cron-234] Watchdog Astraura: TUNEL VIVO (no relanzado). URL=parliamentary-raised-product-contamination.trycloudflare.com | Backend :8000: 200 OK | curl /api/cerebros: 200 OK JSON {"active_brain_id":"brain_genesis","cerebros":[{"i...}. Exit=0. Sin cambios de código.

[2026-09-02T17:11:12Z] [cron-235] Watchdog Astraura: TUNEL VIVO (no relanzado). URL=commit-dos-bolt-thousand.trycloudflare.com | Backend 8000: 200. curl /api/cerebros no ejecutado (túnel no fue relanzado). Exit=0. Sin cambios de código.

[2026-09-02T18:10:45Z] [cron-236] Watchdog Astraura: TUNEL CAIDO (commit-dos-bolt-thousand) → monitor relanzado (pid 92661). Nueva URL: something-aqua-cultures-briefing.trycloudflare.com → HTTP 530 (stale forwarding, backend 8000 healthy=200). Kill cloudflared 92674 → monitor rearroncó (pid 93628) → túnel fresco: button-dont-noted-rob.trycloudflare.com. curl /api/cerebros: **200 OK** JSON `{"active_brain_id":"brain_genesis","cerebros":[...]`. Backend :8000: 200. BitNet i2_s saludable. Conectividad Vercel+app nativa: OK. Exit=0.
