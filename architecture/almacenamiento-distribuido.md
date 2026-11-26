# Almacenamiento distribuido de MetaGenesis (ALM1125 · 25-11-2026)

Regla fundamental: `memory/orquestacion-economica.md` §24. Este archivo es el contrato que leen los agentes.

## Medios (medidos el 25-11)

| Medio | Libre / total | Para qué es | Cómo se llega |
|---|---|---|---|
| Mac (neurona de desarrollo) | ~10–12 / 228 GB | repo completo, memorias, servicios de MetaGenesis, enjambre local | local |
| Maggabox (neurona nodo, misma red) | 405 / 453 GB | espejo de GitHub, versiones, respaldos, pesados, capas (`~/StarSeed-almacen/{espejo,versiones,respaldos,pesados,capas_privadas,capas_publicas,nube}`) y `/srv/starseed-almacen` (sonda Maggabox) | ssh `maggasukha@starseed-nodo-1.local` con `~/.ssh/starseed_nodo1`, `-o AddressFamily=inet`, known_hosts `~/.ssh/known_hosts_starseed_nodo` (rutas expandidas); y las capas de capacidades de StarSeed OS. Mostrado en medidor como «Maggabox · almacén USB (btrfs)», distinto del disco interno. Si no está montado dice «desconectado» y desde cuándo, nunca 0 GB inventados. |
| A1 de Oracle (nodo de MetaGenesis) | 9,6 GB libres | orquestador del préstamo, guardián de main | `scripts/puente/oracle_nodo.py` |
| Google Drive | StarSeed ocupa ~4 GB de 2 TB | memoria y contextos de las neuronas (`My Drive/StarSeed_Memory_Root`) | carpeta montada en `~/Library/CloudStorage/GoogleDrive-<cuenta>` (la sin fecha) |

El medidor: `scripts/puente/recopilar-capacidades-nodos.py` → `~/.starseed/capacidades-nodos.json` → «Almacenamiento» (`src/lib/mando/medidores.ts`).

## Qué es fundamental (≥ 2 medios además de GitHub)

Código con todas las ramas e historia; `starseed_memory_root/` y `memory/`; contextos (`metagenesis.md`, `AGENTS.md`, `PUENTE-DE-MANDO.md`); claves SOLO cifradas; versiones instalables de StarSeed OS; datos de cuentas.

## Qué es pesado y menos fundamental (se traslada, no se queda en un medio lleno)

Registros de olas de más de 7 días, bundles, instaladores viejos, compilaciones (`native/src-tauri/target`, `.next-anterior`), cachés regenerables, árboles de tareas cerradas.

## Comportamientos

1. **Guardián que desvía** (no para): con la Mac por debajo del umbral, las tareas listas se prestan a la Maggabox/A1/nube y lo pesado y menos fundamental se traslada a la Maggabox (`scripts/puente/respaldo_maggabox.py`: copia → SHA-256 en los dos lados → quitar del origen). Sin borrar nada. Aviso por el canal principal con Telegram.
2. **Revisor de almacenamiento** (propone, no borra): una vez al día y con cualquier medio < 15 % libre. Cada propuesta: ruta, GB, por qué sobra, si se regenera, dónde hay otra copia, acción (`borrar` o `trasladar:maggabox`). Va al canal principal con Telegram y a las aprobaciones de MetaGenesis. Solo la dirección presidente ejecuta, y solo lo que Alex aprobó.
3. **Raíces permitidas para borrar** (lista cerrada): cachés en `~/Library/Caches/{go-build,electron,electron-builder}` y `*-updater`; `native/src-tauri/target` del repo y de los árboles de tareas; `.next-anterior`; `starseed_memory_root/.tmp.driveupload` de más de 24 h; árboles de tareas cerradas. Nada fuera de esa lista.

## Maggabox como medio de trabajo (ALM1125B · solo informe)

La Maggabox deja de ser solo almacén: con sus 405 GB y el espejo ya hecho, trabaja como el nodo del A1, pero con **servicio de usuario systemd SIN root** y entregando por `nube/mg-*`. Es la única máquina con disco de sobra para las puertas pesadas (**`next build`**), así que asume el guardián de main cuando Mac y A1 están ocupadas.

### Lado Mac: archivos y funciones exactos

1. **`scripts/puente/oracle_maggabox.py` (nuevo, espejo de `oracle_nodo.py`).** Mismo `SSH_BASE` (`~/.ssh/starseed_nodo1`, `-o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=8 -o AddressFamily=inet`, `UserKnownHostsFile=~/.ssh/known_hosts_starseed_nodo`, `maggasukha@starseed-nodo-1.local`) y mismas decisiones puras, copiadas con su prueba:
   - `decidir_lanzar_maggabox(estado, ahora, ultimo_lanzamiento, colas_sin_tomar)` → como `oracle_nodo.decidir_lanzar`.
   - `rama_de_cola(ts)` → `colas/maggabox-<YYYYMMDD-HHMMSS>`.
   - `devolver_de_maggabox(progreso, lanzamientos, colas_mg, vivo, ahora, colas_vivas=())` → préstamo, no traspaso (como `devolver_de_oracle`).
   - `debe_prestar(nivel_disco, estado_mg, ahora)` → (sí/no, motivo).
   - Efectos: `estado()`, `lanzar(tope)`, `traer()`, `ciclo()`, `instalar()`. `lanzar` reutiliza `repartir_nube` (`RN.CerrojoReparto`, `RN.elegir`, `RN.cedibles_y_lote`, `RN.soltar_en_la_mac`) y `cola_en_rama.commit_suelto_con_cola`; empuja `refs/heads/colas/maggabox-<fecha>` y marca el progreso con `marcar_maggabox` (`medio="maggabox"`, nota «reasignada a la Maggabox …»).
2. **`scripts/puente/traer_nube.py`.** En `dueno_de_sueltos`, añadir el patrón `^nube/mg-\d{8}-\d{6}-([A-Za-z0-9][A-Za-z0-9-]*)$` junto al de `nube/a1-…`; `inventario` y `rama_valida_para_traer` ya aceptan `nube/*` y `run_de_rama` ya devuelve None para medios que no son runs de GitHub.
3. **`scripts/enjambre/starseed-enjambre.py`.** En la orden `soltar`, `medio_nuevo` debe reconocer también `donde.startswith("maggabox")` → `medio="maggabox"`; sin eso `reclamar_varadas` la deja «reasignada» para siempre. En **`scripts/puente/asignar_huecos.py`**, `decidir()`: cuando `retiene_arranques_por_disco()` o `disco_gb < DISCO_BLOQUEA_GB`, en vez de solo «No asigno nada» devuelve `salida["prestar"] = "maggabox"` con el motivo, y `aplicar()` llama a `oracle_maggabox.lanzar(tope=huecos)` bajo el mismo cerrojo de reparto.

### Lado Maggabox: lo que se instala allí (sin root)

- **`deploy/maggabox/nodo/maggabox_medio.py` (nuevo, adaptación de `deploy/oracle/nodo/oracle_a1.py`).** El mismo bucle `Nodo` (`colas_pendientes`, `procesar_cola`, `entregar`, fase `guardian`), con `PREFIJO_COLA = "colas/maggabox-"`, `PREFIJO_ENTREGA = "nube/mg-"`, estado en `~/.starseed/maggabox/` y copia de trabajo en `~/StarSeed-trabajo/starseed-system` (**nunca** el espejo `~/StarSeed-almacen/espejo`, que debe quedar limpio). Corre el mismo `scripts/enjambre/starseed-enjambre.py`. Entrega `nube/mg-<fecha>` (cola entera) y `nube/mg-<fecha>-<id>` (por tarea).
- **`deploy/maggabox/nodo/starseed-maggabox.service` (nuevo)**, instalado en `~/.config/systemd/user/starseed-maggabox.service`: `Type=simple`, **sin `User=`/`Group=`** (corre como `maggasukha`), `ExecStart=/usr/bin/python3 -u %h/StarSeed-trabajo/starseed-system/deploy/maggabox/nodo/maggabox_medio.py servir`, `Environment=STARSEED_MEDIO=maggabox STARSEED_DONDE=maggabox STARSEED_ROOT=%h/StarSeed-trabajo/starseed-system STARSEED_WT=%h/StarSeed-trabajo/starseed-wt`, `Restart=always`, `Nice=10`, `MemoryMax` según `ramLibreMb`; `[Install] WantedBy=default.target`.
- **Alta sin root:** `oracle_maggabox.py instalar` copia el paquete por ssh y ejecuta `systemctl --user daemon-reload && systemctl --user enable --now starseed-maggabox.service`. Para que siga sin sesión abierta, el dueño habilita una vez el lingering (`loginctl enable-linger maggasukha`); el servicio nunca corre como root ni pide `sudo`. Claves: solo `~/.starseed/env` del dueño (0600) o flota gratuita; en el repo, solo NOMBRES. Trabajadores con `repartir_nube.calcular_trabajadores_a1` generalizado a `calcular_trabajadores_nodo(cpu_libre, mem_libre, cpu_total, ram_total)`.

### Cómo el guardián del disco presta ahí cuando la Mac está baja

`scripts/enjambre/guardia_disco.py` ya clasifica con `FRENO.consultar()`: `libre`, `sin_tareas` (< 10 GB) o `sin_pesados` (< 5 GB). Hoy el orquestador solo **para** (`disco_retiene_arranques()`). La regla nueva es **desviar**: con `sin_tareas` (o `sin_pesados` para lo pesado), `asignar_huecos.decidir` responde `prestar: "maggabox"` y `oracle_maggabox.ciclo()` —llamado cada 90 s por `scripts/puente/vigilante-enjambre.py`, después del paso del A1— lanza una `colas/maggabox-<fecha>` con las pendientes, siempre que `debe_prestar` vea viva la Maggabox (`sonda_maggabox.sonda_maggabox`: disco > 30 GB, RAM > 1,5 GB por trabajador, fase ≠ `cola`). Si no contesta, se cae al A1/nube de siempre: nada se para. Aviso al canal principal con Telegram (`_avisar`) y estado en `~/.starseed/maggabox.json`, que ya leen `medios_disponibles.clasificar_maggabox` y el medidor «Almacenamiento».
