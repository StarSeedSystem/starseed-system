# Maggabit · almacenamiento vivo · contrato MAG1117

**Fecha:** 2026-11-17

Maggabit es el disco de respaldo vivo de MetaGenesis. No es una copia fría que se
hace a mano cada tanto: es un disco que, cuando está presente, sostiene por su
cuenta espejos de repos, paquetes, versiones diarias, instaladores de cada
publicación, memoria, estado y un kit sin internet — con ritmo, verificación y
manifiesto propios. Este documento es el contrato que cumplen todos los módulos
de la ola MAG1117 (`scripts/puente/maggabit_*.py`).

## 1. El medio

Tres volúmenes que trabajan juntos:

| Volumen | Ruta | Papel |
|---|---|---|
| Maggabit | `/Volumes/Maggabit` | Raíz de MetaGenesis: bóveda, imágenes, paquetes, código, estado |
| MaggabitTrabajo | `/Volumes/MaggabitTrabajo` | Volumen de trabajo: espejos de repos, copias en marcha |
| MaggabitBoveda | `/Volumes/MaggabitBoveda` | Bóveda: la copia que solo se abre cuando toca |

- **Reconocimiento por UUID, jamás por nombre.** En `/Volumes/Maggabit` puede
  montarse cualquier otro disco con el mismo nombre; el UUID
  (`7C596EA4-EFA0-38F1-A4D5-3E060EBA11D7`) es la única identidad válida.
- Estados del medio: `ausente`, `otro-disco` (hay algo montado en la ruta pero
  no es Maggabit), `sin-imagen`, `listo`. La bóveda, aparte: `abierta`,
  `cerrada`, `sin-crear`. Se informa el espacio libre del medio y del trabajo.
- La imagen de trabajo vive en
  `RAIZ/MetaGenesis/imagenes/trabajo.sparsebundle` y la de bóveda en
  `RAIZ/MetaGenesis/imagenes/boveda.sparsebundle`.

## 2. Principios del contrato (reglas duras de toda la ola)

1. **Principio 0 · disco ausente.** Con el disco ausente **nada falla y nada
   espera**: se informa «sin-disco» (o el estado del medio) y se termina la
   pasada sin reintento, sin sondeo y sin error. El respaldo vivo no es
   condición de funcionamiento de nada más.
2. **Todo subprocess lleva timeout.** El volumen puede ser exFAT y puede no
   responder: ante silencio se devuelve «sin-respuesta» y se sigue. **Nunca
   se cuelga** una pasada por un volumen mudo.
3. **Decisión pura, E/S fina.** Cada módulo separa la decisión (funciones puras
   que reciben lo medido y responden) de la capa de E/S, con todo inyectable:
   reloj, subprocess, lectura de disco. Las decisiones se prueban solas.
4. **Nunca se borra en el origen.** Ningún trabajo elimina nada de donde
   copia; «retirar» y podas solo actúan sobre copias ya traídas a este equipo.
5. **Credenciales jamás.** No se imprimen ni se registran tokens, claves ni
   URLs con credenciales; un error se limpia antes de guardarse o avisarse.
6. **Sin dependencias nuevas.** Módulos de Python en `scripts/puente`, solo
   biblioteca estándar. Pruebas con `unittest` en
   `scripts/puente/test_<módulo>.py`, **herméticas**: jamás tocan `/Volumes`,
   la red, `~/.starseed` ni el disco real, y ninguna ejecuta git.
7. **Español neutro.** Textos y comentarios en español con acentos, sin
   vocabulario de puestos ni jerarquías ajenas al sistema.
8. **Un trabajo a la vez.** La contrapresión manda: nunca dos copias
   simultáneas sobre el medio.

## 3. Ritmo y contrapresión

Una sola cosa se copia cada vez. La decisión (`siguiente`, PURA) elige el
trabajo más atrasado según su ritmo, o renuncia con un motivo en claro
(`disco ausente: sin trabajo`, `presión del disco interno`, `trabajo en marcha`).

| Familia | Segundos de silencio entre copias |
|---|---|
| `repos-locales`, `memoria` | 300 |
| `repos-github`, `codigo` | 900 |
| `desarrollo`, `estado`, `drive` | 1800 |
| `instaladores`, `boveda` | 3600 |
| `versiones`, `verificar` | 86400 |

Cuando el disco interno está bajo presión, la copia en marcha se frena con
`--bwlimit` de rsync: 20000 kb/s con presión 1. Aprendido el 17-11: tres copias
a la vez con la Mac paginando dejaron el disco a 1 MB/s.

## 4. Una sola lista de exclusiones

`config/respaldo-exclusiones.txt` gobierna **todas** las copias (desarrollo,
bóveda y espejos). Un patrón por línea; los que llevan «!» son excepciones que
se copian aunque otro patrón los cubra. Tres secciones:

- **REGENERABLE:** peso muerto que se reconstruye (`node_modules/`, `.next/`,
  `.turbo/`, cachés, `__pycache__/`, `.DS_Store`…). No viaja.
- **ARBOLES:** worktrees y copias de trabajo (`/starseed-wt/`, `/wt-*/`…).
- **CLAVES:** secretos que nunca salen del origen en ninguna copia
  (`.env`, `*.pem`, `*.p12`, `*.credentials.json`…; `.env.example` sí viaja).

## 5. Repos de GitHub: espejo, paquete y código abierto

Módulo `maggabit_repos.py`. Los repos de las cuentas
(`StarSeedSystem`, `alexbordongarrigos`) se traen del sitio de GitHub y sobre
cada uno se decide un plan de acciones por pasos:

- **clonar / actualizar / empaquetar** → espejo en
  `TRABAJO/respaldo/repos/<cuenta>/<repo>.git` y paquete
  `RAIZ/MetaGenesis/repos-paquetes/<cuenta>__<repo>.bundle`
  (escrito primero en `.tmp` y movido: un bundle nunca queda a medias).
- **abrir / avanzar** → copia de trabajo del código en
  `RAIZ/MetaGenesis/codigo/<cuenta>/<repo>`.

Las rutas de las acciones usan prefijos literales («TRABAJO/», «RAIZ/») y la
capa de E/S los resuelve contra sus raíces reales. Un clon grande cortado por
la red no deja espejo: la pasada siguiente lo reintenta sola. `ordenes`
traduce el plan a comandos git exactos; la E/S los ejecuta con timeout.

## 6. Respaldo de desarrollo y versiones diarias

- `maggabit_desarrollo.py`: respaldo del código de desarrollo del repo usando
  la lista única de exclusiones. Estados posibles: `sin-disco`, `sin-lista`
  (no hay exclusiones que aplicar), `sin-respuesta` (subprocess mudo) y la
  copia buena; «mkstempsock» no cuenta como fallo.
- `maggabit_clones.py`: versiones diarias del volumen por **clon APFS**, un
  clon por día (`%Y-%m-%d`): se conservan **14 diarios** y **8 semanas**; lo
  más viejo se retira de la copia (nunca del origen). Ningún clon borra nada
  del origen y todo subprocess lleva timeout (`sin-respuesta`).

## 7. Instaladores de cada publicación

Módulo `maggabit_versiones.py`. Del repo de publicaciones
(`StarSeedSystem/starseed-system`) se bajan versiones **completas y listas para
instalar** a `RAIZ/MetaGenesis/instaladores/<etiqueta>/`: la publicación
marcada «Latest», las de `canal-pruebas` y la de `servidor-local`.

- `plan(publicaciones, guardadas)` (PURA): baja una etiqueta solo si su ficha
  (nombre, publicado, lista de archivos con bytes) cambió respecto del
  `_publicacion.json` guardado.
- En `canal-pruebas` cada número de prueba va a su subcarpeta `prueba-<n>/` y
  se conservan **las 3 últimas**: las más viejas se listan en `retirar` y la
  poda se anota; **nunca se toca una estable**.
- `comprobar(carpeta, ficha)` (PURA): cada archivo existe y mide lo que dice
  la ficha; si no, «incompleta».
- Las órdenes usan `gh release view … --json` y `gh release download …
  --clobber`, siempre con timeout.

## 8. Verificación y manifiesto

Módulo `maggabit_verificar.py`. Tres decisiones PURAS y una capa de E/S fina:

- `manifiesto(medio, fuentes, ahora)`: estado que vive en
  `RAIZ/MetaGenesis/estado/manifiesto.json` y en
  `~/.starseed/maggabit/estado.json`. Por fuente: último respaldo bueno, su
  retraso en segundos frente a su ritmo, tamaños, recuentos, último error
  (limpio, sin credenciales). Un campo `solo_en_maggabit` lista lo que no
  tiene otra casa — lo que se perdería si el disco desapareciera.
- `plan_verificacion(ahora, ultimas)`: en cada pasada `git bundle verify` del
  paquete tocado; semanal, `git fsck --connectivity-only` de cada espejo;
  mensual, **restauración de prueba** (clonar desde el paquete a una carpeta
  temporal y comparar el commit de la rama por defecto).
- `avisos(manifiesto_antes, manifiesto_ahora)`: un fallo nuevo se dice **UNA
  vez**; lo que ya se avisó no se repite.

## 9. Kit sin internet

Módulo `maggabit_kit.py`: capas de Astraura (reflejo, memoria, palabra, voz,
razón, profunda) verificadas por SHA en
`RAIZ/MetaGenesis/sin-internet/`, con `indice.json` al lado. La decisión
(`plan`, `indice`, `orden_copiar`) es pura; el copiado va en trozos y nada se
escribe sin verificar el SHA. Así un aparato puede instalar y servir sin red.

## 10. Módulos y pruebas de la ola

| Módulo (`scripts/puente/`) | Prueba | Qué decide |
|---|---|---|
| `maggabit_medio.py` | `test_maggabit_medio.py` | Estado del medio: presente, imagen, bóveda, libre |
| `maggabit_ritmo.py` | `test_maggabit_ritmo.py` | Ritmo y contrapresión: el trabajo más atrasado o renuncia |
| `maggabit_repos.py` | `test_maggabit_repos.py` | Plan de repos: espejo, paquete y código abierto |
| `maggabit_desarrollo.py` | `test_maggabit_desarrollo.py` | Respaldo de desarrollo con la lista única de exclusiones |
| `maggabit_clones.py` | `test_maggabit_clones.py` | Versiones diarias por clon APFS |
| `maggabit_versiones.py` | `test_maggabit_versiones.py` | Instaladores de cada publicación |
| `maggabit_verificar.py` | `test_maggabit_verificar.py` | Manifiesto, verificación y avisos |
| `maggabit_kit.py` | `test_maggabit_kit.py` | Kit sin internet: capas de Astraura por SHA |

Todas las pruebas son herméticas: solo deciden con datos inventados en el
propio test. La capa de E/S se prueba con dobles (reloj fijo, subprocess
simulado, disco en memoria) — jamás contra `/Volumes`, la red, `~/.starseed`
ni el disco real.
