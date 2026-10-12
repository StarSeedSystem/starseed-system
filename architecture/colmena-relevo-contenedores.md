# Colmena · Genesis siempre en línea, relevo sin pérdidas y cualquier neurona como contenedor (COL1012)

> Fecha: 2026-10-12 · Pedido por Alex · Núcleo puro: `scripts/puente/colmena_logica.py` (Python, lo usan
> los nodos) y `src/lib/metagenesis/colmena.ts` (la pantalla). Se apoya en lo que YA existe y no lo duplica:
> `architecture/metagenesis-autonoma.md` (nodos, líder, órdenes firmadas, relevo de medio, préstamo sin
> duplicar), `architecture/oracle-nube.md` §12 (A1 siempre encendido, guardián de main),
> `scripts/puente/traer_nube.py` (`tarea_reparacion`: seguir una tarea desde la rama de otro medio),
> `scripts/enjambre/medios.py` (arriendos por tarea en el disco de UNA máquina),
> `architecture/neuronas-un-aparato.md` (una neurona = un aparato) y `architecture/metagenesis-remoto-tunel.md`.

## §0 · Qué pidió Alex

1. Que **todo Genesis siga activo** en los contenedores de la nube y en los servidores en línea, **solo y sin
   necesidad de su Mac**, y que se vea y se mande desde **cualquier aparato** que abra MetaGenesis con una
   cuenta permitida.
2. Un botón **«Desconectar»** por neurona: si ese aparato va a perder internet —o lo pierde sin avisar—, los
   agentes que trabajaban en él siguen en otro contenedor o servidor del usuario **sin perder el progreso**.
3. Un botón **«Usar como contenedor»**: cualquier aparato que se conecte, incluida la Mac, trabaja para el
   enjambre como hoy la Mac, **varios a la vez**, para aprovechar la capacidad de todos los aparatos activos.

## §1 · Lo que hay hoy (medido el 2026-10-11 a las 21:15, hora de la Mac)

| Medio | Agentes | Límite real |
|---|---|---|
| Mac (8 GB) | 3 | Su tope de hardware; el gobernador baja a 2 con la swap llena. |
| A1 de Oracle (2 OCPU, 12 GB, 24/7) | 1–2 | Una cola a la vez con 2 trabajadores; solo coge lo que se le presta. |
| GitHub Actions | 3 (1 job) | Hasta 6 jobs; solo tareas de ≤ 3 archivos, sin dependencias abiertas. |
| Contenedor de Claude | 0 | 2 solo mientras una sesión de Claude lo arranca. |
| **Total** | **6–7** | ~93 tareas esperan a otra que aún no está hecha. |

Ya existe: nodos de MetaGenesis en la Mac y en el A1 que laten y eligen líder por el bus (Supabase); la
vista `/metagenesis` lee el bus y funciona con la Mac apagada; órdenes firmadas; si la Mac calla 20 min, el
líder presta hasta 8 tareas portables a otro medio; el A1 entrega cada tarea —acabada o a medias— como rama
`nube/a1-<fecha>-<id>` (con el commit «salvavidas»), y `traer_nube.py` la integra o crea una **sucesora que
continúa desde esa rama** (`tarea_reparacion`). Los arriendos por tarea (`medios.py`) solo sirven entre
orquestadores del MISMO disco.

Lo que falta, y es lo que pide Alex:

- **Puntos de control durante el trabajo.** Hoy el trabajo a medias de la Mac solo vive en su disco: si la
  Mac se apaga, se pierde todo lo escrito desde el último commit de la tarea.
- **Saber qué lleva cada aparato.** El latido no dice qué tareas tiene en curso ni desde qué punto se podrían
  seguir.
- **Relevo por aparato.** El relevo de hoy es «la Mac calla 20 min → presta lo que esté listo»; no sigue las
  tareas que estaban A MEDIAS en el aparato que se fue.
- **Cualquier aparato como contenedor.** Solo la Mac y el A1 tienen el trabajador instalado; los demás no
  saben cuánto pueden aportar ni tienen un botón para hacerlo.
- **Genesis entero fuera de la Mac.** `/metagenesis` en Vercel ve el bus; la sala de control completa
  (`/genesis` y `/api/mando/*`) solo la sirve la Mac, con el estado de su disco.

## §2 · Qué permite de verdad cada aparato («basta de ilusiones»)

Un contenedor de agentes necesita **git, Node ≥ 20.19, Python 3 y opencode**, una copia del repo y espacio.
Medido en la Mac: `node_modules` 1,4 GB, `.git` 0,25 GB, cada carpeta de tarea ~75 MB, y la comprobación de
tipos (tsc) con un pico de **3,7 GB**.

| Aparato | ¿Contenedor? | Por qué |
|---|---|---|
| Mac, Linux, Windows con WSL2 | **Sí**, con el trabajador instalado (un comando) | Pueden ejecutar git, Node y los agentes. |
| Android | **Solo con Termux** (experimental, 1 agente) | Sin Termux el sistema no deja ejecutar git ni Node. |
| iPhone, iPad | **No** | iOS no deja ejecutar programas así. Pueden mirar y mandar órdenes. |
| Cualquier navegador o app instalada desde la web (PWA) | **No por sí solo** | Una pestaña no ejecuta git ni los agentes. Enseña lo que el aparato podría aportar y cómo instalar el trabajador. |
| Menos de 6 GB de RAM | **No** | No cabe la comprobación de tipos (pico 3,7 GB) junto al sistema. |

Agentes por aparato: `min(4, (RAM total en GB − 2) ÷ 2, núcleos)`. Así salen 8 GB → 3 (la Mac de hoy) y
12 GB → 4. Con batería sin cargador, como mucho 1 (y 0 por debajo del 20 %); con datos móviles o red medida,
como mucho 1. Hace falta disco para el repo, `node_modules` y una carpeta por agente (5 GB + 0,1 GB por
agente).

## §3 · Relevo sin pérdidas

**Puntos de control.** Mientras un agente escribe o repara, cada **5 minutos** (si hay cambios) el
trabajador guarda un commit «salvavidas» en la rama de la tarea y lo deja **fuera del aparato**:

- Mac → **A1** por el mismo camino que ya usa para main (paquete git por SSH): queda en
  `relevo/<nodo>/<id>` en el A1. No pasa por GitHub ni por Supabase.
- Otros aparatos → A1 por HTTPS, firmado con la llave de su nodo (§5).
- GitHub Actions y el A1 ya entregan su rama al acabar; no necesitan más.

Así se pierden, como mucho, **5 minutos** de escritura de un agente.

**El latido dice qué lleva cada aparato:** `en_curso: [{id, fase, punto: {rama, sha, t}}]` (≤ 8, sin rutas ni
nombres de máquina) y `contenedor: {activo, trabajadores, apto, motivo}`.

**Botón «Desconectar».** Va en la tarjeta de cada neurona en `/metagenesis` y en Neuronas. Hace esto:

1. Envía la orden `desconectar` a ese nodo.
2. El nodo deja de coger tareas.
3. Guarda un punto de control de cada tarea en curso y lo sube al A1.
4. Para sus agentes y se despide (`mg_baja` con `traspaso: true`).

Tiene **2 minutos**. Si no confirma, cuenta como corte sin aviso.

**Corte sin aviso.** Un nodo que no late en `max(3 × su periodo de latido, 15 min)` cuenta como perdido.
Con el freno de consumo, que lo pone a latir cada 10 min, eso son 30 min.

**El líder sigue las tareas** (`plan_relevo`), estén donde estén:

1. Cada tarea en curso del nodo perdido se convierte en una **sucesora**. Usa el mismo
   `traer_nube.tarea_reparacion`: «continúa desde la rama …».
2. Esa sucesora va al **mejor contenedor libre**, en este orden:
   - primero lo que nunca se apaga (A1);
   - después otra neurona o la Mac;
   - después el contenedor de Claude;
   - por último GitHub Actions.
3. Con estas reglas:
   - una tarea privada nunca va a la nube compartida;
   - más de 3 archivos nunca va a GitHub Actions;
   - lo que solo puede hacer la Mac solo va a la Mac.
4. Si no hay ningún hueco, **espera en el A1** y la coge el primero que se libere. Nada se pierde.

**Al volver.** El aparato que vuelve mira las asignaciones. Lo que otro ya siguió mientras estaba fuera
deja de ser suyo: lo suelta y sube su último punto como rama extra. La sucesora puede combinarlo; no se hace
nada dos veces. Lo demás lo sigue él.

**Desconexión sola.** Si el aparato va con batería, sin cargador y al 10 % o menos, o sabe que se apaga en
menos de 5 min, pide la desconexión él mismo.

## §4 · Cualquier neurona como contenedor

**Botón «Usar como contenedor» / «Dejar de usar».** Envía la orden `contenedor` con
`{activo, trabajadores}`. El nodo lo apunta en su latido y el líder le presta tareas (`repartir`, ya existe)
según sus huecos (`capacidad_contenedor`). Varios aparatos a la vez: cada uno es un nodo con su propio tope.
El líder reparte sin duplicar, porque las asignaciones constan y la Mac salta lo que ya está en otro medio.

**Aparato sin trabajador** (navegador, PWA, móvil):

- **Mac, Linux o WSL2:** el botón explica por qué no puede y enseña lo que **podría** aportar según lo que
  el navegador sabe de él (memoria aproximada, núcleos, batería, red). Da el **comando exacto** para instalar
  el trabajador:
  `curl -fsSL <A1>/trabajador.sh | bash -s -- --emparejar <código>`. El código caduca a los 15 minutos y lo
  emite el servidor para esa cuenta.
- **iPhone o iPad:** dice que no puede trabajar y que sí puede mirar y mandar.

**Instalar el trabajador** (`scripts/puente/instalar_trabajador.sh`, Linux/macOS/WSL2):

1. Comprueba las herramientas.
2. Clona el repo y ejecuta `npm ci --include=dev`.
3. Instala el nodo en modo contenedor:
   - en Linux, con `systemd --user`;
   - en macOS, con launchd y el python3 de Homebrew por el permiso de disco.
4. Crea la llave del nodo. Solo enseña la huella; el secreto no sale nunca.
5. Se empareja con el código.

## §5 · Seguridad

- **Cada aparato tiene su llave.** Nunca se reparte el secreto común de las órdenes
  (`STARSEED_LANZADOR_SECRETO`).
- **Las llaves por nodo necesitan las tablas de MetaGenesis.** Sin ellas solo pueden trabajar la Mac y el A1,
  que ya tienen el secreto. Las tablas vienen en la migración `20261011100000_metagenesis_nodos.sql`
  (escrita y probada, **sin aplicar: necesita la palabra de Alex**).
- **Revocar un aparato** es un clic de un dueño en Ajustes › Accesos.
- **Al A1 solo entran puntos de control firmados.** Los recibe por HTTPS, firmados con la llave del nodo,
  como paquetes git sin nada fuera del repo: tamaño ≤ 20 MB, ramas solo `relevo/<nodo>/<id>`.
- **Lo que viaja de una tarea a otro medio es `tarea_limpia`:** nunca rutas de disco ni claves. Una tarea
  privada no sale a la nube compartida.
- **Genesis en el A1 va detrás de Caddy y con sesión.** `esPeticionDeEstaMaquina` ya trata como de fuera
  todo lo que llega por proxy (cabecera Host pública o `x-forwarded-for` de fuera), así que hace falta sesión
  y ser miembro de MetaGenesis. Hay una prueba obligatoria: desde fuera y sin sesión responde 401 o 403.

## §6 · Genesis entero en el A1

1. **Servicio `starseed-genesis` en el A1:**
   - ejecuta `next start` sobre la build que el guardián acaba de dar por **verde**, nunca sobre una roja;
   - lo publica Caddy en el mismo nombre HTTPS que ya usa;
   - lleva `STARSEED_MANDO=1` y **nunca** `STARSEED_LOCAL=1`.
2. **Espejo del estado.** En cada ciclo, la Mac le deja al A1 por SSH su `olas/` (progreso, colas, medios,
   colas de los últimos días y la cola de los registros, sin secretos). Genesis del A1 enseña:
   - la verdad de la Mac de hace pocos minutos;
   - lo propio del A1;
   - el bus.
3. **Main sigue al líder** (última fase). Mientras la Mac dirige, ella integra. Si el A1 dirige porque la
   Mac calla, integra el A1 sobre el main que la Mac le dejó (ya lo tiene, por el guardián). Cuando la Mac
   vuelve, trae el main del A1 hacia delante, sin forzar, antes de integrar nada.

## §7 · Cola `cola-colmena-1012.json` (el enjambre escribe; Claude revisa y cablea)

| Tarea | Qué hace |
|---|---|
| COL1012A | Órdenes `desconectar` y `contenedor` en el nodo (Python), con pruebas |
| COL1012B | Las mismas órdenes en `remoto-nodos.ts`, con pruebas |
| COL1012C | El latido publica `en_curso` y `contenedor` |
| COL1012D | Puntos de control cada 5 min en el orquestador |
| COL1012E | Subir los puntos de control de la Mac al A1 |
| COL1012F | El nodo atiende `desconectar` |
| COL1012G | El líder sigue las tareas de un nodo perdido (`plan_relevo`) |
| COL1012H | Al volver, el aparato suelta lo ya seguido |
| COL1012I | Botones en `/metagenesis` |
| COL1012J | Botón en Neuronas para «esta neurona» |
| COL1012K | Instalador del trabajador |
| COL1012L | Gobernador genérico en Linux |
| COL1012M | Genesis en el A1 |
| COL1012N | Espejo del estado de la Mac en el A1 |

## §8 · Lo que necesita a Alex

1. **La palabra para aplicar** `20261011100000_metagenesis_nodos.sql`, que trae las llaves por aparato.
   Sin eso, solo la Mac y el A1 pueden ser contenedores.
2. **En cada aparato que quiera sumar:** pegar el comando del botón, una vez.

Nada más: el resto lo hacen el enjambre y los directores.

## §9 · Cómo comprobarlo

- **Núcleo:**
  - `python3 -m unittest scripts/puente/test_colmena_logica.py`
  - `npx vitest run src/lib/metagenesis/__tests__/colmena.test.ts`
- **Relevo de punta a punta, en seco:** desde el A1, `desconectar` a un nodo de prueba con una tarea en
  curso. Comprobar que la tarea:
  - aparece como sucesora en otro medio con su rama `relevo/…`;
  - se integra sin repetir lo hecho.
- **Medidor «Agentes» de Genesis:** el total y el desglose por medio, incluidos los aparatos nuevos.
