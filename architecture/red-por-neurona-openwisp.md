# 📡 SOP — Red por Neurona: roles de red, NetJSON y OpenWISP

> **Fuente de verdad** de la generación de configuración de red por neurona en
> el SOSD: cada dispositivo (neurona) puede declarar un ROL DE RED (router,
> punto de acceso, nodo de malla, gateway), StarSeed OS GENERA la
> configuración correspondiente en formato NetJSON, y el usuario la aplica en
> un controlador **OpenWISP** o directamente en un router **OpenWrt**. Incluye
> también el modelo de "señales de telecomunicaciones por antena" para la UI.
> Complementa (no sustituye) a `architecture/astraura-mesh-meshtastic.md`
> (malla LoRa/Meshtastic) y a `architecture/astraura-mesh-meshtastic.md` §11
> (Adenda 98, selector de banda/preset): aquella capa gobierna el radio LoRa
> de la malla StarSeed; ÉSTA gobierna el **WiFi/Ethernet convencional** de la
> neurona (routers, APs, uplinks) — son capas de radio distintas y
> complementarias, no compiten entre sí.

---

## 0. Por qué (Tríada)

- **🜂 Ontocracia** — la infraestructura de red no debe depender de que un
  operador o un fabricante "permita" configurarla. Declarar el rol de una
  neurona y generar su configuración es un acto de soberanía técnica directa.
- **🜁 Ciberdelia** — honestidad radical sobre lo que la tecnología puede y no
  puede hacer: una web JAMÁS finge tener acceso de bajo nivel al hardware de
  red que no tiene. Se dice con claridad qué se genera y quién lo aplica.
- **🜃 Transhumanismo Comunista** — cada router/AP que un miembro configura
  con esta guía amplía la red procomún (igual que cada radio LoRa de ~30 €
  amplía la malla): infraestructura de telecomunicaciones sin depender de
  operadores, financiada y mantenida por quien la usa.

**Invariantes que esta capa respeta** (CLAUDE.md §6): descentralización
federada (cada neurona es un nodo autónomo), identidad soberana (claves/
tokens de OpenWISP quedan en el dispositivo del usuario, nunca en un servidor
de StarSeed), código abierto absoluto (NetJSON es un formato abierto;
OpenWISP es libre — ver licencias en §3).

---

## 1. Objetivo

1. Cada **neurona** (`src/lib/neurons/neurons.ts`) puede declarar un **rol de
   red**: `router` · `access-point` · `mesh-node` · `gateway` · `none`.
2. A partir de ese rol (+ SSID, clave, `mesh_id`, país, CIDR de LAN…),
   StarSeed **genera** una configuración de red real en formato **NetJSON**
   (`DeviceConfiguration`), que es JSON legible y editable a mano si hace
   falta.
3. Esa configuración se puede **copiar/descargar** para aplicarla
   manualmente en un router OpenWrt, o **enviarla** a un controlador
   **OpenWISP** (si el usuario tiene uno) vía su API REST — siempre a través
   de nuestro proxy anti-SSRF, nunca directo desde el navegador.
4. Se modela también un inventario de **señales de telecomunicaciones por
   antena** (`TelecomAntenna`): torres celulares, APs de un WISP, gateways
   LoRa, satélites, APs WiFi — conocidos o declarados por el usuario — para
   pintarlos en un mapa/lista en la UI.

---

## 2. El límite honesto: qué puede y qué NO puede hacer una web

StarSeed OS es una aplicación web (Next.js, desplegada en Vercel / Cloud
Run). Ningún navegador tiene API para "convertirse en router", abrir un AP
WiFi con una SSID propia, ni hablar UCI con un OpenWrt por sí solo. Es el
**mismo límite honesto** que ya asume el repo en otros dos sitios:

- `src/lib/neurons/neurons.ts` (CasaOS): StarSeed **guarda la URL** de un
  panel CasaOS que el usuario ya tiene corriendo en su red; no lo instala ni
  lo controla de bajo nivel.
- `src/lib/security/security.ts`: *"StarSeed STORES and APPLIES the policy.
  VPN tunneling and DNS enforcement happen at the device/brain-server level
  — the brain server reads this policy and enforces it."*

Aquí aplica exactamente igual:

> **StarSeed GENERA/GUARDA la configuración de red (NetJSON/UCI). El
> dispositivo — un router OpenWrt, o el agente de un controlador OpenWISP —
> es quien la APLICA de verdad.**

Lo que SÍ hace este módulo, de verdad y sin fingir nada:
- Genera JSON NetJSON válido y editable (`src/lib/network/netjson.ts`).
- Guarda el rol/parámetros de red de cada neurona en `localStorage`
  (`src/lib/network/neuron-network.ts`).
- Habla con la API REST de un controlador OpenWISP que el usuario apunta
  explícitamente, a través de un proxy servidor con guarda anti-SSRF
  (`src/app/api/network/openwisp/route.ts`).

Lo que NO hace y no debe fingir hacer:
- No abre puertos, no cambia canales de WiFi del propio dispositivo, no
  "convierte" el navegador en un access point.
- No sustituye a un agente/daemon OpenWISP corriendo en el router (ese
  agente es quien de verdad aplica la config recibida).

---

## 3. Qué es OpenWISP (módulos y licencias)

[OpenWISP](https://openwisp.org) es una suite open-source de gestión de
redes WiFi/mesh, con backend en **Django** (Python) y un ecosistema de
paquetes independientes que se combinan según necesidad:

| Módulo | Qué hace | Licencia |
|---|---|---|
| [`openwisp-controller`](https://github.com/openwisp/openwisp-controller) | Gestión de dispositivos, plantillas de configuración, VPN, aprovisionamiento (el "cerebro" del controlador) | BSD-3-Clause |
| [`netjsonconfig`](https://github.com/openwisp/netjsonconfig) | Librería Python que TRADUCE NetJSON ↔ configuración nativa (UCI de OpenWrt, `/etc/network/interfaces`…). Es la pieza que de verdad "entiende" cómo aplicar el JSON al sistema operativo del router | **GPL-3.0** |
| [`openwisp-monitoring`](https://github.com/openwisp/openwisp-monitoring) | Monitorización de dispositivos (métricas, alertas, checks) | BSD-3-Clause |
| [`openwisp-network-topology`](https://github.com/openwisp/openwisp-network-topology) | Recolecta y visualiza la topología de red en formato **NetworkGraph** (el mismo formato NetJSON que usamos en `buildNetworkGraph`/`parseNetworkGraph`) | BSD-3-Clause |

**Importante sobre licencias:** StarSeed **no distribuye ni reimplementa**
ninguno de estos paquetes Python. Este repo solo:
1. Genera/valida el **formato JSON** NetJSON en TypeScript (`netjson.ts`) —
   el formato en sí es una especificación abierta, no código con licencia.
2. Consume la **API REST HTTP** de un controlador OpenWISP que el usuario
   despliega y gestiona por su cuenta (self-host, como Ollama/CasaOS/n8n).

Esto significa que ni GPL-3.0 (netjsonconfig) ni BSD-3-Clause (controller)
"contagian" nada a este código: hablar HTTP con un servicio de terceros y
generar JSON en un formato abierto no crea una obra derivada.

---

## 4. Rol de red por neurona

`src/lib/network/neuron-network.ts` define:

```ts
type NeuronNetworkRole = "router" | "access-point" | "mesh-node" | "gateway" | "none";

interface NeuronNetworkConfig {
  role: NeuronNetworkRole;
  ssid?: string;       // SSID a emitir (router/access-point/gateway)
  key?: string;        // clave WPA2/WPA3 — SOLO local, nunca sale de este dispositivo
  meshId?: string;     // mesh_id 802.11s (router-con-malla/mesh-node)
  country?: string;    // ISO-3166 alpha-2, regula canal/potencia
  lanCidr?: string;    // p.ej. "192.168.90.1/24"
  controllerUrl?: string; // URL del controlador OpenWISP de esta neurona
  deviceId?: string;   // id del dispositivo ya registrado en ese controlador
  notes?: string;
}
```

Persistencia: clave propia `starseed.network.roles.v1` (localStorage),
**independiente** de `starseed.neurons.prefs.v1` (`NeuronSettings` en
`neurons.ts`, que este módulo NO toca). Se referencia por el mismo
`neuronId` que usa `neurons.ts`, así que una UI puede combinar ambas fuentes
(nombre/capacidades de la neurona desde `neurons.ts` + rol de red desde
`neuron-network.ts`) sin acoplarlas en código.

`ssid`/`key`/`controllerUrl`/`token` **nunca viajan a Supabase ni a ningún
servidor de StarSeed** — son datos que el usuario introduce para generar
configuración local o para hablar con SU PROPIO controlador OpenWISP.

### Roles → qué NetJSON generan (`generateConfigForNeuron`)

| Rol | Config generada |
|---|---|
| `router` | Preset `neuronRouterConfig`: radio0 (2,4G) AP + radio1 (5G) AP secundario, o malla 802.11s si hay `meshId` + bridge LAN + DHCP |
| `access-point` | Un único radio 2,4G en modo `access_point` |
| `mesh-node` | Un único radio 5G en modo `802.11s` (solo malla, sin AP propio) |
| `gateway` | AP local (2,4G) + enlace WAN por `station` (5G) a un router externo — puente entre StarSeed y otra red |
| `none` | `generateConfigForNeuron` devuelve `null` (nada que generar) |

---

## 5. El formato NetJSON (`DeviceConfiguration`)

Especificación abierta: [netjson.org](https://netjson.org). `src/lib/network/netjson.ts`
implementa el subconjunto que StarSeed necesita: `general`, `radios[]`,
`interfaces[]` (wireless/bridge/ethernet), `dns_servers`/`dns_search`, y
`dhcp[]` como *passthrough* UCI (NetJSON no modela DHCP nativamente; se
vuelca tal cual a `/etc/config/dhcp` de OpenWrt).

Modos wireless válidos: `access_point` · `station` · `adhoc` · `monitor` ·
`802.11s` (malla — usa **`mesh_id`**, nunca `ssid`).

### Ejemplo completo (AP + malla + estación + bridge + DHCP)

En la práctica una neurona concreta usa un subconjunto de esto según su rol
(ver tabla §4); aquí se muestran las cuatro formas de interfaz wireless
juntas para ilustrar el formato completo:

```json
{
  "general": { "hostname": "starseed-neurona-01" },
  "radios": [
    { "name": "radio0", "protocol": "802.11n", "channel": 1, "channel_width": 20, "country": "ES" },
    { "name": "radio1", "protocol": "802.11ac", "channel": 36, "channel_width": 80, "country": "ES" }
  ],
  "interfaces": [
    {
      "name": "wlan0",
      "type": "wireless",
      "wireless": {
        "radio": "radio0",
        "mode": "access_point",
        "ssid": "StarSeed-Nodo01",
        "network": ["lan"],
        "encryption": { "protocol": "wpa2_personal", "cipher": "ccmp", "key": "clave-larga-y-segura" }
      }
    },
    {
      "name": "mesh0",
      "type": "wireless",
      "wireless": { "radio": "radio1", "mode": "802.11s", "mesh_id": "starseed-mesh", "network": ["lan"] }
    },
    {
      "name": "wlan-sta",
      "type": "wireless",
      "wireless": {
        "radio": "radio1",
        "mode": "station",
        "ssid": "Router-De-Casa",
        "network": ["wan"],
        "encryption": { "protocol": "wpa2_personal", "cipher": "ccmp", "key": "clave-del-router-externo" }
      }
    },
    {
      "name": "lan",
      "type": "bridge",
      "bridge_members": ["eth0", "wlan0", "mesh0"],
      "addresses": [{ "address": "192.168.90.1", "mask": 24, "proto": "static", "family": "ipv4" }]
    }
  ],
  "dhcp": [
    { "config_name": "dhcp", "config_value": "lan", "interface": "lan", "start": 100, "limit": 150, "leasetime": "12h" }
  ]
}
```

Generado programáticamente así (equivalente al preset `router` con malla):

```ts
import { neuronRouterConfig, toPrettyJson, validateDeviceConfig } from "@/lib/network/netjson";

const cfg = neuronRouterConfig({
  hostname: "starseed-neurona-01",
  ssid: "StarSeed-Nodo01",
  key: "clave-larga-y-segura",
  meshId: "starseed-mesh",
  country: "ES",
  lanCidr: "192.168.90.1/24",
});

const { ok, errors } = validateDeviceConfig(cfg); // valida modos/mesh_id/claves antes de mostrarlo
console.log(toPrettyJson(cfg));
```

---

## 6. NetworkGraph (topología)

Para representar topología (quién está conectado con quién, con qué coste),
NetJSON define `NetworkGraph` — el mismo formato que expone
`openwisp-network-topology` en `GET /api/v1/topology/{id}/`:

```json
{
  "type": "NetworkGraph",
  "protocol": "static",
  "version": "1",
  "metric": "hop_count",
  "nodes": [
    { "id": "starseed-neurona-01", "label": "Nodo salón", "local_addresses": ["192.168.90.1"] },
    { "id": "starseed-neurona-02", "label": "Nodo garaje" }
  ],
  "links": [
    { "source": "starseed-neurona-01", "target": "starseed-neurona-02", "cost": 1 }
  ]
}
```

`netjson.ts` da tres funciones puras para esto: `buildNetworkGraph(nodes,
links, opts?)` (construir), `parseNetworkGraph(raw)` (validar/parsear algo
recibido de fuera, `null` si es inválido) y `mergeGraphs(...graphs)`
(combinar varias topologías —p.ej. la de la malla LoRa local con la que
reporta OpenWISP— deduplicando nodos por `id` y enlaces por `source→target`).

---

## 7. API REST de OpenWISP + el proxy SSRF propio

Igual que `src/app/api/integrations/proxy/route.ts` existe porque los
navegadores no pueden llamar directo a un endpoint self-host arbitrario
(CORS) y porque hacerlo sin guarda sería SSRF, `src/app/api/network/openwisp/route.ts`
replica ESE MISMO PATRÓN para el protocolo específico de OpenWISP:

- `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- Exige sesión Supabase (`createClient` de `@/utils/supabase/server` +
  `auth.getUser()`) → 401 si no hay usuario.
- Body esperado: `{ controllerUrl, path, method?, token?, body? }`.
- Construye la URL con `buildUrl(controllerUrl, path)` y llama a
  `safeFetch` (`@/lib/security/ssrf`) con `Authorization: Bearer <token>` si
  se pasó token, `cache:"no-store"`, timeout duro de 20 s con
  `AbortController`.
- `catch (SsrfError)` → responde `{ok:false, error}` con el `httpStatus` del
  propio error (403 bloqueado, 400 redirección inválida...). Nunca deja
  escapar un throw sin capturar.

Endpoints de OpenWISP Controller usados por el cliente
(`src/lib/network/neuron-network.ts`):

| Función | Método + ruta | Uso |
|---|---|---|
| `owAuth(controllerUrl, user, pass)` | `POST /api/v1/users/token/` | Autentica y devuelve `{token}` |
| `owListDevices(controllerUrl, token)` | `GET /api/v1/controller/device/` | Lista dispositivos del controlador |
| `owPushConfig(controllerUrl, token, deviceId, templateIds)` | `PATCH /api/v1/controller/device/{id}/` con `{config:{templates:[...]}}` | Asigna plantillas de configuración a un dispositivo |
| `owRequest(...)` | genérico | Bajo nivel: cualquier otro endpoint (plantillas `GET/POST /api/v1/controller/template/`, `GET /api/v1/controller/device/{id}/configuration/`, topología…) sin necesidad de una función dedicada |

Todas pasan por `fetch("/api/network/openwisp", {method:"POST", body:
JSON.stringify({controllerUrl, path, method, token, body})})` — nunca
directo al controlador. El token de OpenWISP viaja en el body de nuestra
propia API (mismo origen, cookies de sesión de Supabase), nunca se persiste
en el servidor de StarSeed.

---

## 8. Modelo de datos de antenas / señales

⚠️ **Tres modelos de "antena" distintos en el repo — no confundir** (mismo
tipo de aviso que ya existe en CLAUDE.md §11 para "conexiones"):

| Tipo | Archivo | Qué modela | Persistencia |
|---|---|---|---|
| `AntennaInfo` | `src/ai/astraura/mesh/antennas.ts` | Inventario de **vías de radio de ESTE dispositivo** (LoRa/WiFi/BT/celular) con banda regional y si el OS la controla de verdad | Ninguna (calculado al vuelo) |
| `SignalSource` | `src/ai/astraura/mesh/signals.ts` | Inventario **vivo** de señales detectadas por Web APIs en ESTE dispositivo (mesh/gps/bluetooth/serial/nfc/wifi/cellular/telephony) | Ninguna (calculado al vuelo) |
| **`TelecomAntenna`** (nuevo) | `src/lib/network/neuron-network.ts` | Antenas **externas** conocidas o declaradas: torres celulares, APs de un WISP, gateways LoRa, satélites, APs WiFi — con posición (`lat`/`lon`), banda, potencia (`dbm`) | **`starseed.network.antennas.v1`** (localStorage) |

`TelecomAntenna` es el modelo pensado para un mapa/lista de "qué señales de
telecomunicaciones hay alrededor" (independiente de si el propio dispositivo
las controla): `kind: "cell-tower" | "wisp-ap" | "lora-gateway" | "satellite"
| "wifi-ap"`. CRUD local puro: `listAntennas()`, `upsertAntenna(antenna)`
(crea o actualiza por `id`, genera uno si falta), `removeAntenna(id)`. Todas
disparan el evento `NEURON_ANTENNAS_EVENT` en `window` para que la UI se
refresque en vivo, igual que el patrón `NEURON_EVENT` de `neurons.ts`.

---

## 9. Dónde encaja en la UI (regla dorada de descubribilidad, CLAUDE.md §11)

Este SOP solo entrega la capa de datos (`netjson.ts`, `neuron-network.ts`,
el proxy). Cableado de UI pendiente; recomendación para cuando se construya:

- **SignalsCenter** (`src/components/mesh/signals-center.tsx`) ya "unifica
  todo en pestañas" (Adenda 101: Antenas y señales · Red Mesh). El lugar
  natural es una **pestaña nueva "Router"** ahí mismo — NO una ruta nueva —
  que use `getNetworkConfig`/`setNetworkConfig` para elegir el rol de la
  neurona activa, muestre el NetJSON generado (`toPrettyJson` +
  `validateDeviceConfig`) con botón copiar/descargar, y un formulario
  opcional de conexión a OpenWISP (`owAuth`/`owListDevices`/`owPushConfig`).
- **Config de neurona**: `src/components/neurons/neuron-server-config.tsx`
  (mismo sitio donde hoy vive CasaOS, `NeuronSettings.casaos`) es donde
  añadir el selector de `NeuronNetworkRole` junto a los demás ajustes por
  dispositivo.
- **Mapa de señales**: `TelecomAntenna` alimentaría el mismo mapa 3D que ya
  usa `mesh-map-3d.tsx` (o una capa nueva en él), pintando antenas externas
  junto a los nodos de la malla.
- Si en el futuro esto crece a una **ruta propia** (p.ej. `/red-router`),
  entonces SÍ aplica la regla dorada completa: registrar en `dock-config.ts`
  (con su migración one-shot), `app-catalog.ts` y opcionalmente
  `src/lib/library/packages.ts` — ver CLAUDE.md §11. Mientras sea una pestaña
  dentro de Señales (ya registrada en dock/launcher), no hace falta
  duplicar el registro.

---

## 10. Osmantic/ODS — por qué NO se integra

Durante la investigación de herramientas para esta ola se evaluó
**Osmantic/ODS** como posible pieza de la capa de red. Resultó ser un
**instalador de IA self-host** (facilita desplegar backends de modelos
propios), **sin ninguna relación con mesh, routers, NetJSON ni OpenWISP**.
Por tanto:

- **No se integra su código** en esta capa de red (sería ámbito equivocado).
- Se deja únicamente como **referencia opcional** para la Biblioteca, en la
  categoría de servidores de IA self-host (junto a Ollama/Open WebUI/
  LM Studio en `architecture/astraura-inteligencia.md`), si en el futuro se
  decide añadir su ficha allí. Ninguna acción tomada en esta ola más que
  dejar constancia de por qué se descartó para /red.

---

## 11. Archivos de esta ola

| Archivo | Qué es |
|---|---|
| `src/lib/network/netjson.ts` | Módulo puro: tipos NetJSON + generadores/validadores + NetworkGraph |
| `src/lib/network/neuron-network.ts` | Rol de red por neurona (localStorage) + generación de config + cliente OpenWISP vía proxy + `TelecomAntenna` |
| `src/app/api/network/openwisp/route.ts` | Proxy servidor anti-SSRF hacia el controlador OpenWISP del usuario (mismo patrón que `integrations/proxy`) |
| `architecture/red-por-neurona-openwisp.md` | Este SOP |

*Fuente: ola "Red por Neurona · OpenWISP" (2026-08-04).*
