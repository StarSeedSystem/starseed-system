# Contrato · Permisos completos por medio (PRM1119 · parte 1 de 3)

> **Tarea:** `PRM1119B-d1` · **Ola:** `PRM1119` · **Fecha:** 2026-11-21 · **Estado:** contrato; esta
> parte **no escribe código de producto**. La parte 2 escribe `src/lib/permisos/matriz.ts` y sus
> pruebas; la parte 3 abre la cola por medio en `starseed_memory_root/olas/`.
>
> **Pedido de Alex (19-11):** revisar los permisos completos de **todos** los sistemas —macOS,
> Android, Linux, Windows, iOS, navegadores web, terminal y cualquier medio donde se use StarSeed
> OS— y pedirlos desde la instalación o al abrir la app cuando se detecte que faltan, **salvo los
> que la persona haya denegado a mano**. Nunca se concede nada por la persona.
>
> **Base leída:** `AUDITORIA-PRM.md`; `architecture/permisos-y-control-del-dispositivo.md` (§1, §2,
> §5); `architecture/permisos-enlaces-directos.md`; `src/lib/nativa/permisos-registro.ts`;
> `src/lib/nativa/permisos-enlaces.ts`; `src/lib/permisos/{contrato,permission-engine}.ts`;
> `src/lib/aurora/senses/request-permission.ts`; `native/src-tauri/src/permisos_sistema.rs`;
> `native/src-tauri/Info.plist`; y `memory/diseno/{identidades,armonia,referencias}.md`.

## 0 · Convenciones y límites honestos

- **[verificado]**: leído en el código de este repositorio (`archivo:línea`). **[conocimiento]**:
  se sabe de fuera y **hay que medirlo en un aparato** antes de prometerlo. **[por medir]**: ni
  siquiera hay una implementación en este árbol.
- **Este documento no sustituye** el contrato de referencia `architecture/permisos-y-control-del-
  dispositivo.md`; lo ordena **por medio** y fija la regla de «falta» frente a «denegado a mano».
  Donde ambos discrepen, manda el contrato de referencia y se corrige este.
- **iOS:** hoy no hay app nativa publicada; iPhone/iPad usan la PWA o el navegador
  (`architecture/apps-nativas-segundo-pleno.md`: «Sin app nativa»). Lo de iOS en la matriz es
  **[conocimiento]/[por medir]**, no una promesa. Lo mismo vale para una futura app Tauri iOS:
  necesita su `Info.ios.plist` y sus pruebas en aparato.
- **Terminal:** no es una app con diálogos de permiso. Sus permisos son del **sistema** (TCC,
  grupos, udev, polkit, firewall) y se conceden a la persona, al binario o al servicio, no al
  código de StarSeed. El terminal **hereda** el permiso del proceso padre; por eso un servicio de
  launchd con `zsh` como primer argumento puede leer la carpeta y no su contenido
  (`metagenesis.md` §💠, trampa 4).
- **Nada de este documento concede nada.** Abrir una pantalla de Ajustes deja el interruptor en
  manos de la persona. Escribir en TCC.db, usar `tccutil`, `pm grant`, `appops set`, pulsar
  diálogos por guion o perfiles MDM/PPPC está prohibido (contrato §1; prueba
  `src/lib/nativa/__tests__/permisos-registro.test.ts` › «nada de la app se autoconcede»).

## 1 · Vocabulario de estado (el mismo en todos los medios)

| Estado | Qué significa | Qué hace StarSeed |
|---|---|---|
| `concedido` | El sistema confirma que el permiso está dado. | No vuelve a pedirlo; lo muestra como listo. |
| `falta` | El sistema no lo tiene y **no consta** que la persona lo haya negado. | Lo pide **solo si es útil** y en el momento justo. |
| `denegado-a-mano` | La persona lo negó o lo revocó expresamente. | **No lo vuelve a pedir solo**; lo muestra con «Abrir ajustes» si hay enlace. |
| `por-uso` | El sistema pregunta **cada vez** que se usa; no existe una concesión previa. | No lo pide al abrir: lo pide al usarlo, en el gesto de la persona. |
| `no-aplica` | Ese medio no pide ese permiso (lo da, lo declara o no lo tiene). | Lo dice; no abre una pantalla que no existe. |
| `no-disponible` | El medio no soporta la capacidad (navegador sin File System Access, Android WebView sin `getDisplayMedia`…). | Lo dice y ofrece la alternativa real. |
| `desconocido` | El sistema **no deja leer** el estado (macOS Accesibilidad, red local, disco completo; Windows micro/cámara; iOS red local). | Se trata como `falta` **solo si no hay constancia de negativa**; si la hay, `denegado-a-mano`. |

**Regla de oro de la distinción:** `desconocido` **nunca** se convierte en `denegado-a-mano` por
sospecha. Para pasar de uno a otro hace falta **evidencia**: o el sistema lo dice, o consta que
la persona ya vio el aviso y aun así no hay concesión, o consta que antes estaba concedido y ahora
no. Sin evidencia, es `falta` y se puede pedir una vez.

<!-- SECCIONES -->
