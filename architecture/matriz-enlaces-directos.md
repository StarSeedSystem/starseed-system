# Matriz de enlaces directos (6×6) — MTZ1109A

Contrato de qué carriles directos caben entre CUALQUIER pareja de plataformas y cómo se usan, para que toda conexión compatible se elija y funcione sola. «Directo» = sin router y sin punto de acceso que haga salir a un aparato de su Wi‑Fi. Implementación pura: `src/lib/malla/matriz-enlaces.ts`; estado: `lanas-propias.ts` y `fallos-enlaces.ts`. Complementa `wifi-directo.md` (§0, §2) y `bluetooth-directo.md`.

## 1. Carriles (nombres exactos)

Orden de preferencia, el mismo en las dos puntas:

| # | Carril | Cuándo cabe |
|---|--------|-------------|
| 1 | `awdl` | solo Apple ↔ Apple (macOS, iOS) |
| 2 | `wifi-aware` | solo Android ↔ Android |
| 3 | `wifi-direct` | dos cualesquiera de Android / Windows / Linux (estándar, interoperable) |
| 4 | `ble-l2cap` | los dos lo tienen (y roles compatibles) |
| 5 | `ble-gatt` | un central y un periférico |
| 6 | `lan-tcp` | misma red local (canal nativo TCP 47071) |

`punto-acceso-optin` no es un carril del orden: es un permiso aparte, apagado por defecto, que solo habilita la unión por punto de acceso si lo permiten LAS DOS neuronas (Mac ↔ Android, el Mac deja su Wi‑Fi). La web/PWA no tiene antenas.

## 2. Matriz 6×6 (todo publicado, misma red)

Simétrica. `BT` = `ble-l2cap`, `ble-gatt`; `LAN` = `lan-tcp`.

| | macOS | iOS (plan.) | Windows | Linux | Android | Web/PWA |
|---|---|---|---|---|---|---|
| **macOS** | awdl, BT, LAN | awdl, BT, LAN | ble-gatt, LAN | BT, LAN | BT, LAN | — |
| **iOS** | awdl, BT, LAN | awdl, BT, LAN | ble-gatt, LAN | BT, LAN | BT, LAN | — |
| **Windows** | ble-gatt, LAN | ble-gatt, LAN | wifi-direct, ble-gatt, LAN | wifi-direct, ble-gatt, LAN | wifi-direct, ble-gatt, LAN | — |
| **Linux** | BT, LAN | BT, LAN | wifi-direct, ble-gatt, LAN | wifi-direct, BT, LAN | wifi-direct, BT, LAN | — |
| **Android** | BT, LAN | BT, LAN | wifi-direct, ble-gatt, LAN | wifi-direct, BT, LAN | wifi-aware, wifi-direct, BT, LAN | — |
| **Web/PWA** | — | — | — | — | — | — |

Windows no tiene `ble-l2cap`. Esta tabla es lo que verifica `matriz-enlaces.test.ts` (36 parejas ordenadas) y lo que enseña Ajustes › Neuronas › Medios › «Compatibilidad entre tus neuronas».

## 3. Capacidades en el saludo firmado

Cada neurona anuncia `lanas` y `plataforma`:

```
lanas = { "lan-tcp": bool,
          "ble-gatt": { central, periferico },
          "ble-l2cap": bool,
          "wifi-direct": { go, cliente, concurrente },
          "wifi-aware": bool, "awdl": bool, "punto-acceso-optin": bool }
```

Va en el `nl.hola` firmado (red local y Bluetooth: campos `lanas`, `plataforma`), en la `FichaDispositivo` de WebRTC (`lanas`; `plataforma` ya existía) y en `neuron_devices.capabilities` (`lanas`, `plataformaLanas`). El valor propio se construye con `ble_estado`, `enlace_wifi_capacidades` y `awdl_estado` (`lanasDeNativo`), de modo que los carriles nuevos de Windows y Linux aparecen solos cuando esas órdenes los publican:

- `ble_estado`: `disponible`; opcionales `roles` (`["central","periferico"]`) y `l2cap` (bool). Sin ellos, de fábrica según plataforma.
- `enlace_wifi_capacidades`: `ap`/`cliente` con `wifi-direct` y `lanas` (`wifi-direct-concurrente` si conserva su Wi‑Fi; `wifi-direct` si no).
- `awdl_estado`: `disponible`/`activo`.

Compatibilidad hacia atrás: un saludo sin `lanas` (app anterior) se infiere (`lanasInferidas`) de su plataforma y de sus campos viejos: macOS y Android hablaban Bluetooth (GATT + L2CAP), Windows y Linux solo la red local, y los carriles Wi‑Fi salen de sus capacidades `enlace.wifi.*`. Sin parte nativa conocida (navegador), ninguna antena. Lo anunciado manda siempre sobre lo inferido.

## 4. Roles

- **Wi‑Fi Direct, GO:** primero quien conserva su Wi‑Fi (`concurrente`), luego el id menor (`elegirGoWifiDirect`; `elegirRoles` puntúa igual). Si ninguna de las dos es concurrente, el carril sigue valiendo pero una deja su Wi‑Fi mientras dure (aviso; `decidirParP2p` devuelve `dejaWifi`).
- **Bluetooth:** uno central y otro periférico. Si valen las dos asignaciones, central el id menor (`elegirRolesBle`). L2CAP usa los mismos roles que GATT.
- **AWDL y Aware:** sin roles.

## 5. Varios carriles a la vez y caída por carril

- Para lo pesado se usan a la vez el mejor Wi‑Fi P2P, el mejor Bluetooth y la red local (`lanasParaPesado`); el multitrayecto de MPT1108B reparte por capacidad medida (`enlacesDeArchivo`, que además deja fuera lo que la matriz no admite, `enlaceFueraDeMatriz`).
- Las llamadas escalan al mejor carril sin punto de acceso de esa pareja (`escalarWifi` consulta `decidirParP2p`).
- **Fallo en tiempo de ejecución:** si dos extremos anuncian un carril y no abre, se anota POR PAREJA Y CARRIL (`registrarFalloEnlace`), la matriz salta al siguiente (`decidirPareja({ caidas })`) y se reintenta con espera creciente: 30 s, 1, 2, 4, 8 min, tope 10 min. Un éxito borra el fallo. Señales lo cuenta: «Wi‑Fi Direct con <neurona>: falló (motivo) · sigue por Bluetooth».

## 6. Interfaz

Ajustes › Neuronas › Medios › «Compatibilidad entre tus neuronas»: una fila por pareja de las neuronas de la cuenta, carriles de ahora numerados en orden y la frase del límite, p. ej. «Mac ↔ Windows: solo Bluetooth (macOS no tiene Wi‑Fi Direct)» y «Web/PWA: sin antenas directas; usa la red local por la app nativa o la malla». Tabla real con título y cabeceras, región desplazable en móvil, sin depender del color.

## 7. Límites

- macOS e iOS no tienen Wi‑Fi Direct: con Windows/Linux/Android solo Bluetooth y red local (punto de acceso solo si lo permites).
- Windows no tiene L2CAP; el Wi‑Fi Direct de Windows y Linux suele no ser concurrente.
- iOS es un plan: se trata como macOS hasta que exista la app.
- Las apps anteriores se estiman por su plataforma y no se les prometen antenas que no anunciaron.

## 8. Plan de prueba en aparatos

Por cada pareja (misma red apagada para forzar lo directo, luego encendida): ver la fila en Ajustes; enviar un archivo > 5 MB y comprobar en Señales qué carriles llevan trozos; apagar el Wi‑Fi Direct de un extremo (o negar el permiso) y ver «falló … sigue por Bluetooth» y la reanudación tras la espera; una llamada con vídeo y comprobar que escala por el mejor carril sin punto de acceso. Parejas: Mac↔Mac (AWDL), Android↔Android (Aware y Direct), Android↔Windows, Android↔Linux, Windows↔Linux, Windows↔Windows, Linux↔Linux, Mac↔Linux (L2CAP), Mac↔Windows (solo GATT), Mac↔Android.
