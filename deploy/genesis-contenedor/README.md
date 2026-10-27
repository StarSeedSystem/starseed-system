# Genesis · contenedor de GitHub Actions

Plantilla para que **cualquier persona** conecte un repositorio suyo a su ámbito de Genesis
como motor de nube. El flujo se lanza por `workflow_dispatch` (a mano) y por `schedule`
(cada hora), pide trabajo a su ámbito con el token del motor, corre **una** tarea con el
orquestador de StarSeed OS y devuelve el resultado por las RPC de Genesis. No escribe en el
repositorio de StarSeed OS ni imprime claves.

## Qué necesitas

- Un repositorio de GitHub: créalo (público o privado) o usa uno que ya tengas. Las
  condiciones del plan las pone GitHub.
- Acceso a tu Genesis para crear un motor y copiar su token **una sola vez**.
- Un proyecto de Supabase con las RPC `mando_motor_pendiente` y `mando_motor_reportar`
  (las del OS; si usas otro servidor, apunta ahí).

## 1. Copia el flujo

Copia `github-actions.yml` de esta carpeta a `.github/workflows/genesis.yml` en tu
repositorio. También puedes pegar su contenido desde GitHub → **Actions** → **New workflow**.

## 2. Pega el token como secreto

1. En tu repositorio: **Settings → Secrets and variables → Actions → New repository secret**.
2. Nombre: `STARSEED_MOTOR_TOKEN`. Valor: el token `ssm_…` que Genesis te enseñó una vez.
3. No lo escribas en un archivo, en un README ni en un commit: si se filtra, revócalo en
   Genesis y registra otro motor.

## 3. Configura las variables

En **Settings → Secrets and variables → Actions → Variables**:

| Variable | Para qué |
|---|---|
| `STARSEED_SUPABASE_URL` | URL del proyecto Supabase de tu ámbito. |
| `STARSEED_SUPABASE_ANON_KEY` | Clave pública `anon` de ese proyecto (no es un secreto). |
| `STARSEED_OS_REPO` | Opcional. Repositorio del OS del que se trae el orquestador; por defecto `StarSeedSystem/starseed-system`. |

`STARSEED_AMBITO` no hace falta: el token ya identifica tu ámbito.

## 4. Lánzalo

- **A mano:** Actions → **Genesis · motor de ámbito** → **Run workflow**.
- **Solo:** el flujo corre cada hora en el minuto 17 y no hace nada si no hay tareas.

## Qué hace y qué no

- Pide tareas pendientes a tu ámbito, toma **la primera** y la ejecuta con el orquestador
  del OS (`scripts/enjambre/starseed-enjambre.py`) con un trabajador.
- Devuelve el resultado por `mando_motor_reportar` (progreso, evento y resumen del job).
- Telemetría apagada (`NEEDLE_TELEMETRY=0`, `NEXT_TELEMETRY_DISABLED=1`, `DO_NOT_TRACK=1`).
- Permisos mínimos: solo `contents: read`; los dos checkout no conservan credenciales.
- **No** empuja ramas ni escribe en el repositorio de StarSeed OS.
- Lo privado no sale de tu ámbito: los eventos pasan por el filtro de `motor_ambito`.
- Local primero y de pago solo con permiso del ámbito: eso lo decide tu configuración de
  Genesis, no esta plantilla.

## Límites del plan gratuito de GitHub

Esta plantilla **no inventa cifras**. Los minutos y el almacenamiento dependen del plan y de
si el repositorio es público o privado. Consúltalos en la documentación oficial:
<https://docs.github.com/es/actions/learn-github-actions/usage-limits-billing-and-administration>

Si tu plan no permite ejecutar el flujo, GitHub lo dirá en la pestaña **Actions**; no hay un
número escondido en este archivo.

## Comprobarlo

```bash
python3 scripts/puente/test_plantilla_contenedor.py
```

La prueba lee el YAML sin red y comprueba disparadores, permisos mínimos, variables,
telemetría apagada y que no haya secretos en claro.
