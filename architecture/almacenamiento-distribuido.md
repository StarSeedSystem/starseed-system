# Almacenamiento distribuido de MetaGenesis (ALM1125 · 25-11-2026)

Regla fundamental: `memory/orquestacion-economica.md` §24. Este archivo es el contrato que leen los agentes.

## Medios (medidos el 25-11)

| Medio | Libre / total | Para qué es | Cómo se llega |
|---|---|---|---|
| Mac (neurona de desarrollo) | ~10–12 / 228 GB | repo completo, memorias, servicios de MetaGenesis, enjambre local | local |
| Maggabox (neurona nodo, misma red) | 405 / 453 GB | espejo de GitHub, versiones, respaldos, pesados, capas (`~/StarSeed-almacen/{espejo,versiones,respaldos,pesados,capas_privadas,capas_publicas,nube}`) | ssh `maggasukha@starseed-nodo-1.local` con `~/.ssh/starseed_nodo1`, `-o AddressFamily=inet`, known_hosts `~/.ssh/known_hosts_starseed_nodo` (rutas expandidas); y las capas de capacidades de StarSeed OS |
| A1 de Oracle (nodo de MetaGenesis) | 9,6 GB libres | orquestador del préstamo, guardián de main | `scripts/puente/oracle_nodo.py` |
| Google Drive | StarSeed ocupa ~4 GB de 2 TB | memoria y contextos de las neuronas (`My Drive/StarSeed_Memory_Root`) | carpeta montada en `~/Library/CloudStorage/GoogleDrive-<cuenta>` (la sin fecha) |

El medidor: `scripts/puente/recopilar-capacidades-nodos.py` → `~/.starseed/capacidades-nodos.json` → «Almacenamiento» (`src/lib/mando/medidores.ts`).

## Qué es fundamental (≥ 2 medios además de GitHub)

Código con todas las ramas e historia; `starseed_memory_root/` y `memory/`; contextos (`CLAUDE.md`, `AGENTS.md`, `PUENTE-DE-MANDO.md`); claves SOLO cifradas; versiones instalables de StarSeed OS; datos de cuentas.

## Qué es pesado y menos fundamental (se traslada, no se queda en un medio lleno)

Registros de olas de más de 7 días, bundles, instaladores viejos, compilaciones (`native/src-tauri/target`, `.next-anterior`), cachés regenerables, árboles de tareas cerradas.

## Comportamientos

1. **Guardián que desvía** (no para): con la Mac por debajo del umbral, las tareas listas se prestan a la Maggabox/A1/nube y lo pesado y menos fundamental se traslada a la Maggabox (`scripts/puente/respaldo_maggabox.py`: copia → SHA-256 en los dos lados → quitar del origen). Sin borrar nada. Aviso por el canal principal con Telegram.
2. **Revisor de almacenamiento** (propone, no borra): una vez al día y con cualquier medio < 15 % libre. Cada propuesta: ruta, GB, por qué sobra, si se regenera, dónde hay otra copia, acción (`borrar` o `trasladar:maggabox`). Va al canal principal con Telegram y a las aprobaciones de MetaGenesis. Solo la dirección presidente ejecuta, y solo lo que Alex aprobó.
3. **Raíces permitidas para borrar** (lista cerrada): cachés en `~/Library/Caches/{go-build,electron,electron-builder}` y `*-updater`; `native/src-tauri/target` del repo y de los árboles de tareas; `.next-anterior`; `starseed_memory_root/.tmp.driveupload` de más de 24 h; árboles de tareas cerradas. Nada fuera de esa lista.
