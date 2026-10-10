# SOP · MetaGenesis desde cualquier neurona, por túnel cifrado hacia la Mac (2026-10-10)

Contrato: `architecture/genesis-niveles-malla-universal-estaciones.md` §A.1 (opción por defecto:
Alex no eligió otra). Puerta de acceso y tabla de miembros: ya hechas el mismo día
(`src/lib/mando/guardian.ts`, `src/lib/seguridad/misma-maquina.ts`, migración
`20261010090000_metagenesis_accesos.sql`, Ajustes › Accesos).

## Qué hace

Un miembro de MetaGenesis abre `/metagenesis` en cualquier aparato (la web de Vercel, un móvil,
otro ordenador). La interfaz se sirve desde donde se abra; los DATOS y las ACCIONES vienen del
motor de la Mac (Genesis en `localhost:9002`) por un túnel cifrado de Cloudflare, con el token de
la sesión de Supabase en `Authorization: Bearer`.

```
navegador (/metagenesis en Vercel)
   │  fetch("/api/mando/…")  ── guardia-fetch (modo remoto) ──►  https://<túnel>/api/mando/…
   │                                                           + Authorization: Bearer <token>
   ▼                                                           + sin cookies (credentials: omit)
Cloudflare (túnel rápido) ──► cloudflared (Mac) ──► PUERTA 127.0.0.1:9012 (solo /api/mando)
                                                        └─► Genesis 127.0.0.1:9002
                                                             middleware: CORS (solo orígenes del OS)
                                                             guardián: token válido + es_metagenesis()
```

## Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Tabla del motor | `supabase/migrations/20261010100000_metagenesis_motor.sql` | Fila única (`id=1`): `url`, `encendido`, `ultimo_latido`, `arrancado_en`, `maquina`, `motivo`. RLS: SELECT solo `es_metagenesis()`; sin políticas de escritura (solo la clave de servicio). **Sin aplicar** (la aplica el director). |
| Servicio de la Mac | `scripts/puente/tunel_metagenesis.py` (+ `test_tunel_metagenesis.py`) | Puerta en `127.0.0.1:9012` que solo deja pasar `/api/mando/*` (404 para todo lo demás, también `..` codificados); cloudflared hacia la puerta; lee la URL de su salida sin imprimirla (las líneas se tachan); publica en la tabla cuando el motor CONTESTA por el túnel; latido cada 60 s; relanza si cloudflared muere o el túnel falla 5 veces seguidas con Genesis local vivo (espera 30 s → 10 min; 20 min si Cloudflare limita con 429/1015); al parar, fila apagada y URL borrada. `--estado` dice qué ve sin mostrar la URL. |
| launchd | `scripts/puente/com.starseed.tunel-metagenesis.plist` y entrada `tunel-metagenesis` en `instalar-servicios.py` | python3 de Homebrew directo (tiene el permiso de disco), KeepAlive, registro `/tmp/starseed-tunel-metagenesis.log`. |
| CORS | `src/lib/metagenesis/cors-mando.ts` + 3 líneas en `middleware.ts` | Pregunta previa (OPTIONS) de `/api/mando/*`: 204 solo para `https://starseed-os.vercel.app` y `http://localhost:9002` (y `METAGENESIS_ORIGENES_EXTRA`), permite `Authorization` y `Content-Type`; 403 para cualquier otro origen. Nunca `Access-Control-Allow-Credentials`. A una petición del mismo origen (la Mac) no se le toca nada. |
| Reescritura | `src/lib/metagenesis/remoto.ts` + modo remoto en `src/lib/mando/guardia-fetch.ts` | `ponerModoRemoto({base, token})`: TODA `/api/mando/*` de la página (lecturas en cola, POST, la sonda de la autocuración) va a `base` con Bearer y `credentials: "omit"`; tras un 401 renueva el token y reintenta una vez. Sin modo remoto, todo como antes. |
| Conexión | `src/lib/metagenesis/conexion.ts` (puro) + `src/lib/metagenesis/motor.ts` (Supabase) | Orden: en la Mac → nada; sin sesión; no miembro; ¿la página la sirve la propia Mac? (sonda al mismo origen); si no, fila del motor → SONDA con el token (manda lo medido, no la fila). |
| Envoltura | `src/components/mando/metagenesis-remoto.tsx`, `src/app/(app)/metagenesis/page.tsx` | Avisos: «Conectado a MetaGenesis en la Mac (máquina) · respuesta comprobada hace X», «La Mac está apagada o sin túnel (último latido hace X)», no miembro → explicación + «Ir a mi Genesis», sin sesión → «Iniciar sesión», sin tabla, rechazado. Conectado: re-sondea el MISMO motor cada minuto (cero peticiones a Supabase); si falla, comprobación completa. Apagada: cada minuto y, tras 5 fallos, cada 5 min. Al salir de la página quita el modo remoto. |
| Guardián | `src/lib/mando/guardian.ts` + `src/lib/metagenesis/cache-verificacion.ts` | Recuerda 60 s (y nunca más allá de su caducidad) el resultado de verificar un token, por su HUELLA sha256: sin esto cada lectura remota costaba 2 llamadas a Supabase (getUser + es_metagenesis), decenas de miles al día contra un presupuesto de 25.000. |

`/metagenesis` ya no reexporta `/genesis`: pinta la consola dentro de la envoltura. `/genesis` queda
como estaba (pendiente de convertirse en la entrada con selector de nivel, otro encargo).

## Seguridad (lo que se garantiza y cómo se comprueba)

- **La URL del túnel no se imprime ni se guarda fuera de la tabla.** El script la tiene en memoria;
  las líneas de cloudflared se tachan (`[túnel]`) antes de guardarlas; `_log` tacha por segunda vez;
  el .pid guarda solo el pid. El navegador la tiene en memoria y nunca la pinta (prueba del
  componente: el texto de la página no contiene `trycloudflare`).
- **Nada pasa sin token válido y membresía.** Por el túnel, `esPeticionDeEstaMaquina` dice que no
  (Host del túnel, `cf-connecting-ip`, y la puerta añade `X-Real-IP` y
  `Forwarded: for="_metagenesis-tunel"`): pruebas `misma-maquina-tunel.test.ts` y
  `guardian-tunel.test.ts` (sin token → 401 aunque la Mac tenga `STARSEED_LOCAL=1`).
- **Solo el motor sale por el túnel.** La puerta deja fuera todo lo que no sea `/api/mando/*`
  (proxies de IA con claves compartidas, voz, Jev…), que con `STARSEED_LOCAL=1` pasarían sin sesión.
- **El token solo va a un motor válido**: https de `*.trycloudflare.com` (un nivel), sin ruta,
  puerto ni usuario, o a `NEXT_PUBLIC_METAGENESIS_MOTOR_HOSTS`, o al propio origen de la página.
- **Ningún secreto llega al navegador**: la clave de servicio solo la lee el script de la Mac, por
  nombre (`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` en `.env.local`).
- Lo que no se puede evitar con esta opción: el token de sesión viaja cifrado hasta el borde de
  Cloudflare, que termina el TLS del túnel rápido. Un miembro revocado puede seguir hasta 60 s
  (memoria del guardián).

## Consumo

- La Mac: 1 escritura por minuto en la tabla (≈1.440/día) con `return=minimal`.
- Cada consola remota abierta: comprobación completa al abrir (≈4 peticiones a Supabase: acceso
  ×2, fila ×1 y, en Vercel, la sesión del middleware) y luego solo sondas al motor; la membresía
  vale 30 min en la página.
- El motor: el guardián pregunta a Supabase una vez por token y minuto, no por lectura.

## Operación en la Mac

```bash
# 1) Aplicar la migración (director): supabase/migrations/20261010100000_metagenesis_motor.sql
# 2) Instalar solo este servicio:
STARSEED_SOLO=tunel-metagenesis python3 scripts/puente/instalar-servicios.py
# 3) Ver qué ve (sin URL):
python3 scripts/puente/tunel_metagenesis.py --estado
tail -f /tmp/starseed-tunel-metagenesis.log
```

Convive con el túnel viejo de Genesis (`com.starseed.mando.tunel`, `tunel-mando.sh`, que manda el
enlace a Telegram y abre TODO el servidor): son dos túneles rápidos distintos; el de MetaGenesis
pone `--no-autoupdate` antes de `--url` para que el `pkill` del viejo no lo confunda.

## Pruebas

- `npx vitest run src/lib/metagenesis src/lib/seguridad/__tests__/misma-maquina-tunel.test.ts src/lib/mando/__tests__/guardian-tunel.test.ts src/lib/mando/__tests__/guardia-fetch-remoto.test.ts src/components/mando/__tests__/metagenesis-remoto.test.tsx`
- `cd scripts/puente && python3 -m unittest test_tunel_metagenesis` (puerta de verdad con un Genesis
  de mentira, bucle con relojes falsos, plist).

## Pendiente (fuera de este encargo)

- Aplicar la migración `20261010100000_metagenesis_motor.sql` y cargar el servicio en la Mac.
- `/api/mando/accesos` y `/api/mando/ambitos` usan `esDespliegueLocal` DESPUÉS del guardián: por el
  túnel (con `STARSEED_LOCAL=1`) tratan a cualquier miembro como dueño del registro antiguo de
  accesos. Cambiar a `esPeticionDeEstaMaquina`.
- Estado del túnel dentro de Genesis de la Mac (Ajustes › Accesos): servicio cargado, último
  latido y última línea del registro (tachada).
- `/genesis` como entrada con selector de nivel (para que «Ir a mi Genesis» lleve a la cuenta).
