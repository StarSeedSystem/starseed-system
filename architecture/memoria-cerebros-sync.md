# Memory Roots: Vínculo y Sincronización con Cerebros, Servidores y VMs

> Diseño de la función que permite **vincular un memory root** (`<nombre>_memory_root/`,
> local / Google Drive / remoto) al **sistema de memorias** de StarSeed, sincronizando
> **a detalle cada memoria**. Formato compartido con `starseed_memory_root/index.md`,
> `sync.md` y `memory.manifest.json`.

## Concepto
- Un **memory root** = carpeta raíz con **ramas** (subcarpetas) por tipo de memoria:
  `soul · ego · skills · style · memory · dream · accounts · tasks · logs`.
- El root se **comparte y vincula** como **servidor + almacén** de memorias a:
  - 🧠 **Cerebros** (Aurora/Astraura o del usuario).
  - 🖥️ **Servidores internos** del usuario · **servidores StarSeed** · **externos**.
  - ☁️ **Computadoras virtuales en línea** (cualquier servicio).
  - 🔌 Cualquier **servicio / plugin / conexión** integrable como servidor y almacén
    (de las memorias, su funcionamiento, configuraciones, opciones y sincronizaciones).

## Contrato (formato portátil)
`memory.manifest.json` enumera cada memoria (rama, archivo, tipo, scope, hash). El mismo
formato sirve para repo, Drive, cerebros, servidores y VMs. Ver `starseed_memory_root/sync.md`.

## Flujo de usuario (futuro)
1. Usuario: *"StarSeed, conecta este memory root con el cerebro/servidor/VM X."*
2. Selecciona origen (Drive / local / remoto) → StarSeed lee `memory.manifest.json`.
3. Previsualiza diferencias **por memoria** → confirma → sincroniza a detalle.
4. Mantiene sync (pull/push) según la política del destino.

## Estado
- ⚠️ Diseño listo; **NO conectado a cuentas reales todavía** (prueba posterior con la cuenta **Ester**).
- Puntos de integración OS: sistema de memorias de cerebros (Exocórtex), baúles, Hub de Conexiones,
  y conectores de servidores/VMs.

## Pendiente de implementar
- Tipo `memory_root` (raíz + ramas) en el modelo de memoria del OS.
- UI "Vincular memory root" en cerebro/baúl/servidor/VM.
- Lector de `memory.manifest.json` + motor de merge por `hash`/`scope`.
- Conectores de origen/destino: Google Drive, local, servidores (internos/StarSeed/externos), VMs en línea.
- Política de sync (manual / automática) por destino.
