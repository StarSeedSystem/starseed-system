# Guiones de Hermes que el repo respalda

Lo que hay aquí **no lo ejecuta el repo**: son copias versionadas de guiones que
viven en `~/.hermes/scripts/` y los lanza el cron de Hermes. Se guardan porque
son infraestructura crítica que hasta hoy no tenía respaldo en ningún sitio: si
esa carpeta se pierde, se pierde el Dream.

## starseed-dream.sh

El Dream nocturno. El cron de Hermes lo lanza cada mañana sobre las 07:00 y deja
su informe en `starseed_memory_root/dream/sugerencias-<fecha>.md`, que el
Puente de Mando procesa con `scripts/puente/director_dream.py` al cerrar cada
ola.

**Estuvo mudo el 16 y el 17 de septiembre de 2026**, y el motivo merece quedar
escrito porque es el error más repetido de este proyecto: tenía una lista fija
de seis modelos, todos de `openrouter` y `xkiro`, y esas dos pasarelas llevaban
dos días sin cupo. Salía «Dream sin respuesta de modelos gratuitos hoy» y nadie
lo veía, porque el fallo del cron no llega a ninguna parte. Mientras tanto
`apinex` escribía con ocho modelos y el renovador ya lo tenía medido en
`~/.starseed/pasarelas-informe.json`. **El dato existía y el Dream no lo
miraba.**

Ahora la lista se REORDENA con ese informe: primero las pasarelas que escriben,
después el resto. No se descarta ningún candidato —si el informe está viejo o se
equivoca, el orden solo cambia el turno—, y solo se listan proveedores que
Hermes tiene configurados en `provider_models_cache.json` (groq NO está ahí,
aunque el enjambre lo use; apinex sí).

Para sincronizar la copia con la que corre de verdad:

    cp ~/.hermes/scripts/starseed-dream.sh scripts/hermes/starseed-dream.sh

Si algún día se edita aquí y se quiere aplicar, va al revés — y conviene
`bash -n` antes, que un guion roto no avisa hasta la mañana siguiente.
