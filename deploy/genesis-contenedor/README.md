# Genesis Contenedor

Plantilla de GitHub Actions para que **tu repositorio** sea un contenedor de trabajo de tu
ámbito de Genesis StarSeed OS (contrato: `architecture/genesis-conectores-abiertos.md` §5).
Tu repo se registra como motor en Genesis, recibe tareas pendientes y las escribe con el
orquestador del OS. Gratis: corre dentro de los minutos gratuitos de tu plan de GitHub
Actions ([límites y facturación oficiales de GitHub Actions][limites]).

[limites]: https://docs.github.com/es/actions/learn-github-actions/usage-limits-billing-and-administration

## Cómo conectarlo (5 minutos)

1. **Registra el motor en tu Genesis.** En la Mac (localhost:9002): Genesis › Conectar ›
   «Añadir motor» › «GitHub Actions». Copia el token que te enseña UNA sola vez (empieza
   por `ssm_`; en el servidor solo queda su huella).
2. **Copia la plantilla.** En tu repositorio, guarda
   `deploy/genesis-contenedor/github-actions.yml` como `.github/workflows/genesis.yml`.
3. **Guarda los secretos.** En tu repositorio: Ajustes › Secrets and variables › Actions
   › New repository secret, uno por línea:
   - `STARSEED_MOTOR_TOKEN` — el token del paso 1. **Obligatorio.**
   - `NEXT_PUBLIC_SUPABASE_URL` — la dirección del proyecto del OS.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — su clave pública.
   Nunca escribas esos valores en un archivo del repositorio ni en un mensaje del bus.
4. **Pruébalo.** En tu repositorio: pestaña Actions › Genesis Contenedor › Run workflow.
   También se lanza solo cada hora. En el resumen verás cuántas tareas pendientes había,
   qué escribió el orquestador y el paso «Informar el resultado» en verde.

## Qué hace cada ejecución

| Paso | Qué |
|---|---|
| Pedir tarea al ámbito | RPC `mando_motor_pendiente` con tu token: trae las tareas con estado `pendiente` |
| Escribir la tarea | Cola `cola-acciones-motor.json` → `scripts/enjambre/starseed-enjambre.py --workers 1` |
| Informar el resultado | RPC `mando_motor_reportar` con el estado de cada tarea en `progreso.json` |

Si no hay tareas pendientes, solo el paso de pedir habla y la ejecución termina en verde.

## Segundo a segundo de tu cuenta

- La llave de acceso (token del motor) vive solo como secreto de tu repositorio:
  el flujo la pasa a `Conector.desde_entorno` (`scripts/enjambre/motor_ambito.py`),
  que además oculta cualquier patrón de llave antes de enviar nada
  (`sk-…`, `ghp_…`, llaves de servicio…).
- **Telemetría apagada**: no se envían latidos ni medidores; solo el estado de las
  tareas que atendió y de las que no pudo atender.
- Permisos mínimos: del token de tu repositorio solo `contents: read`, y el flujo no
  toca tu repo: clona el del OS en una carpeta aparte, listos para las puertas
  (tsc › vitest › revisión › integración ff en `main`) que ya trae el orquestador.

## Límites y costes

- Los minutos los consume **tu plan** de GitHub Actions. Consulta las cifras vigentes en
  la [documentación oficial de límites y facturación][limites]; no vienen aquí porque
  cambian y no se inventan límites.
- Con `schedule`, si un repositorio no tiene actividad durante 60 días GitHub lo puede
  desactivar; reactiva el flujo desde la pestaña Actions. Detalle en la [misma página][limites].
- El gasto del enjambre en proveedores de IA es de su ámbito: gratis primero, de pago
  solo con permiso del ámbito (`tope de gasto` en Genesis › Conectar).
