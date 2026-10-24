# Genesis Contenedor

Plantilla de contenedor del OS: copias el workflow a **tu** repositorio y GitHub Actions corre
tareas de tu Genesis en las máquinas de GitHub (contrato: `architecture/genesis-conectores-abiertos.md` §5).

## · Qué hace

- Se lanza a mano (`workflow_dispatch`) y a los horarios que pongas (`schedule`).
- Pide trabajo a **tu ámbito** con la RPC `mando_motor_pendiente`, con el token de motor (`ssm_…`)
  que registra el botón «Usar como contenedor» de tu Genesis.
- Si hay tareas, corre una con el orquestador del OS (`scripts/enjambre/starseed-enjambre.py`)
  y devuelve el resultado por la RPC `mando_motor_reportar`.
- Telemetría apagada: el lote final solo lleva el resultado de la tarea, sin eventos, latidos ni
  medidores. Lo privado nunca sale de tus neuronas ni de las máquinas de tu cuenta: solo pasa por
  aquí lo que tu Genesis ya mandó como tarea.

## · Cómo se conecta

1. Crea un repositorio (o usa el tuyo) y copia `github-actions.yml` a
   `.github/workflows/genesis-contenedor.yml`.
2. Crea tres **secretos** del repositorio (Configuración › Secrets and variables › Actions, «New
   repository secret»; nunca un valor en el código, un commit o un log del flujo):
   - `STARSEED_MOTOR_TOKEN` · token de motor de tu ámbito, en Genesis › Conectar.
   - `NEXT_PUBLIC_SUPABASE_URL` · la URL de tu proyecto Supabase del OS (empieza por `https://`).
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` · su clave pública `anon` (la que usa la página del OS).
3. Si tu Genesis no vive en el repo oficial, crea la **variable** `STARSEED_REPO_URL` con la URL
   del que sí: es el repo que el workflow clona para correr el orquestador.
4. En la pestaña Actions del repo, elige «Genesis Contenedor» y pulsa «Run workflow».

## · Límites del plan gratuito de GitHub Actions

El flujo corre en los **minutos gratis de tu plan** de GitHub Actions y consume su cuota; también
le aplican sus límites de uso y cobros. Nada de esto se inventa aquí: cámbianos en la
[documentación oficial de GitHub sobre facturación, límites de uso y administración](https://docs.github.com/actions/learn-github-actions/usage-limits-billing-and-administration)
— qué minutos incluye tu plan, qué multiplicadores pagan y los límites de ejecución y de horarios.
La plantilla lo minimiza: sin trabajo pendiente, se acaba tras la llamada de petición (sin clonar
ni instalar nada) y el `cron` por defecto es una vez por hora. También puedes cambiar el `schedule`
o apagarlo dejando solo `workflow_dispatch`. Privacidad: `https://docs.github.com/actions/security-guides/security-hardening-for-github-actions`.

