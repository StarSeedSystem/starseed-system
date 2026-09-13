# Colas versionadas para los medios sin estado (la nube)

`starseed_memory_root/` no se versiona y muere con cada contenedor: por eso los latidos de la nube
encontraban «cero colas» y no escribían nada. Las colas de aquí SÍ viajan con el repo.

Regla: una tarea de estas colas está HECHA cuando su id figura como token en el asunto de un commit
de `main` (`scripts/puente/vigilante_logica.seleccionar_pendientes` ya lo mira así). El medio que
la toma la marca `reasignada · nube` en el progreso de la Mac para que el vigilante local no la
duplique (`scripts/puente/repartir-a-nube.py`, tarea p317B).

- `cola-nube-atraso.json` — atraso de olas ≤315 repartido a la nube el 2026-09-12.
