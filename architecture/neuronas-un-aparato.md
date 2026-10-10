# Neuronas: una por aparato, con sus medios y su estado en vivo (2026-10-09)

## Qué pasaba

Alex vio la misma neurona repetida con otro nombre en «¿Es esta una neurona que ya configuraste?».
Medido en su cuenta ese día: **10 filas en `neuron_devices` para 4 aparatos reales**.

| Aparato | Filas | Por qué |
|---|---|---|
| Mac M1 | 4 | Chrome en localhost:9002, Chrome en Vercel (154 y 152) y la app nativa (WKWebView) |
| Android con Adreno 730 | 2 | dos orígenes del mismo Chrome |
| Android con Mali-G57 | 2 | ídem |
| iPhone | 1 | — |
| (vacía) | 1 | fila «fantasma» sin nombre ni capacidades |

**Causa.** El id de neurona vive en el `localStorage` de cada MEDIO (origen o app). El mismo aparato
abierto desde otro medio estrenaba id y fila. La adopción manual («Usar su configuración») existía,
pero dependía de que la persona eligiera bien en una lista sin agrupar. Y el latido ligero hacía
`upsert({id})`, que crea una fila vacía si la fila no existe (así nacían las fantasma).

## Cómo queda

- **Aparato ≠ medio.** La neurona es el aparato. Cada medio tiene su id propio
  (`starseed.medio.id.v1`, nunca se sincroniza) y queda registrado en `capabilities.medios`
  (`tipo`, `etiqueta`, `navegador`, `origen`, `visto`). Varios medios comparten la fila: la ficha
  nueva se FUNDE con la remota (`combinarCapacidades`), sin pisar lo que otro medio vio.
- **Huella del aparato** (`src/lib/neurons/huella.ts`, pura). Compara solo el hardware: sistema,
  núcleos, memoria, GPU normalizada (`ANGLE (…Apple M1…)` = `Apple M1`), pantalla con los lados
  ordenados, y la huella del nombre de máquina (`maquina`), que solo conocen la app nativa
  (`device_info`) y el servidor local (`/api/dispositivo/maquina`, que solo responde a la propia
  máquina: `esPeticionDeEstaMaquina`). Resultado: `mismo` / `probable` / `posible` / `distinto`.
- **Reconocimiento al abrir un medio nuevo** (`neuron-setup.tsx`). Si un único aparato de la cuenta
  es `mismo`, se enseña «Reconocí este aparato» y se adopta sola a los 4 s («No es este aparato»
  lo frena). Si no, la lista sale agrupada por aparato, con «Este mismo aparato / Casi seguro /
  Podría ser», y los aparatos descartados plegados al final.
- **Fusión** (`src/lib/neurons/fusion.ts`, desde el panel de Neuronas). Funde las fichas, mueve los
  ajustes de los ids absorbidos al que se queda en TODAS las claves que viajan con la cuenta (gana
  el que se queda, los demás rellenan), deja el alias `absorbida → principal` en
  `starseed.neuronas.fusiones.v1` (sincronizada), borra las filas absorbidas y avisa por el canal
  de la cuenta. Respaldo de filas y ajustes movidos: «Deshacer» los recupera (10 últimos).
- **Alias**: cada medio, al arrancar y en cada latido (`resolverAliasEsteMedio`), mira si su id fue
  fusionado y adopta el nuevo. Sin esto, el siguiente latido de un medio viejo recrearía la fila.
- **Latido sin fantasmas**: el ligero hace `update(last_seen_at)`; si no actualiza ninguna fila,
  sube la ficha completa (con capacidades), nunca una fila vacía.
- **Presencia en vivo** (`src/lib/neurons/presencia.ts`, montada en el layout raíz, también en
  Genesis). Canal de presencia de Supabase Realtime `neur:<token>`; el token es aleatorio por
  cuenta y viaja en `starseed.neuronas.canal.v1`. Cada medio anuncia neurona, medio,
  visible/segundo plano y sus señales. No escribe en la base de datos.
- **Señales por medio** (`senales-medio.ts`). Todo medido: internet (onLine + Network Information),
  malla WebRTC (pares de la cuenta y faros), radio LoRa Meshtastic (estado, transporte, nodos),
  Bluetooth (`getAvailability`), puertos serie autorizados. Reticulum se dice como «aún no corre en
  ningún medio del OS»: no se pinta como apagado.
- **Panel** (`AparatosEnVivo`, arriba en Neuronas). Una tarjeta por aparato con «Activa ahora /
  Abierta en segundo plano / Inactiva · hace X», cada medio con su estado y las señales de los
  abiertos. Arriba propone fusionar las repetidas y quitar las filas vacías.

## Reglas

- Nunca se identifica un aparato desde un navegador normal con algo más que la huella de hardware:
  el nombre de máquina solo sale de la app nativa o de la propia máquina, y como hash.
- La adopción automática exige UN solo candidato `mismo`. Ante la duda, se pregunta.
- Una fusión nunca pierde datos: respaldo + deshacer, y los ajustes se mueven, no se borran.
- Los ritmos reales: latido cada 5 min, «online» por latido = 12 min; en vivo, la presencia.
