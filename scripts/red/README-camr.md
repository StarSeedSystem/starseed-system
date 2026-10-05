# Agente local CAMR (`camr_agente.py`)

Agente Python del **Enrutamiento Cognitivo Multiespectro** de StarSeed OS
(contrato: `architecture/camr-enrutamiento-cognitivo.md`, §4). Corre en el Mac,
en Linux, en una Raspberry o en OpenWrt, y solo escucha en **127.0.0.1:4480**:
nunca expuesto a la red.

## Qué hace

- **Detecta** lo disponible e importa cada librería de radio solo si hace falta
  (importación perezosa de `RNS` y `meshtastic`):
  - `rnsd` o la librería `RNS` (Reticulum: RNode LoRa, HF, VHF, UHF);
  - la librería `meshtastic`;
  - `iw` (802.11s), `batctl` (BATMAN-adv), `babeld` y `yggdrasilctl`.
- **API local:**
  - `GET /estado` — tecnologías disponibles y por qué no las demás.
  - `GET /mediciones` — interfaces y estadísticas RNS; frecuencia, ancho de
    banda, SF, CR y txpower de la RNode; `station dump` y `survey dump` de `iw`;
    `batctl o`/`batctl n`; estado de `babeld`; `yggdrasilctl getPeers`.
  - `POST /aplicar` — **`seco` por defecto**: devuelve los comandos que
    ejecutaría sin tocar nada. Solo con `seco: false` ejecuta, y únicamente
    comandos de la lista blanca (`iw`, `batctl`, `yggdrasilctl`, `rnsd`,
    `babeld`) con argumentos validados, **nunca a través de un shell**.
  - `POST /enviar` — `{"tecnologia", "destino", "datos" (base64), "clase"}`
    con tecnología `simulado` para pruebas sin hardware.
- El **ejecutor de comandos es inyectable**, así las pruebas
  (`test_camr_agente.py`) corren sin red ni hardware con un ejecutor falso.

## Instalación

### Mac (macOS)

```bash
python3 scripts/red/camr_agente.py
pip3 install rns meshtastic   # opcional: activa RNS y Meshtastic
```

`iw`, `batctl`, `babeld` y OpenWrt no aplican en macOS: el agente lo reportará
como «no disponible» con su motivo, que es lo que espera el panel del OS.

### Raspberry Pi OS / Debian / Ubuntu

```bash
sudo apt install iw batctl babeld
pip3 install rns meshtastic
# Yggdrasil: https://yggdrasil-network.github.io/installation.html
python3 scripts/red/camr_agente.py
```

Para systemd, un `camr.service` con `ExecStart=/usr/bin/python3 .../camr_agente.py`
y `Restart=on-failure` basta.

### OpenWrt

```bash
opkg install python3-light python3-json iw-full batctl-full babeld mesh11sd   # según el router
python3 scripts/red/camr_agente.py
```

Sin pip completo, bastan la biblioteca estándar y las utilidades `iw`/`batctl`;
RNS y Meshtastic quedan desactivados con su motivo.

## Aviso legal (§5 del contrato — obligatorio)

La radio se rige por la ley de cada región y este agente **y el motor CAMR lo
aplican siempre**:

- **Perfil regional activo** (de `antennas.ts` del OS) limita frecuencias,
  potencia, PIRE y canales de Wi-Fi de 2,4, 5 y 6 GHz.
- **Bandas de radioaficionado (HF, VHF, UHF):** solo se activan registrando el
  **indicativo** del operador (licencia). En ellas el contenido **no se cifra**
  (se firma, que está permitido) y hay identificación periódica con el
  indicativo según la norma de la región.
- **ISM y LoRa:** se respeta el ciclo de trabajo (EU 868: 1 % o 10 % según la
  sub-banda) con contabilidad de tiempo de aire, potencia máxima y PIRE.
- **Por defecto, modo «recomendar»:** `/aplicar` en seco propone y el usuario
  aplica. El automático (`seco: false`) solo es legítimo en bandas sin licencia
  con perfil regional fijado, o en bandas con licencia si el operador lo activa
  con su indicativo.
- Ninguna llamada de este agente supera el límite legal configurado; quien lo
  desactive actúa bajo su responsabilidad y contra el contrato del proyecto.

## Pruebas

```bash
cd scripts/red && python3 -m unittest test_camr_agente -v
```

Sin red ni hardware: cada tecnología se cubre con un ejecutor falso.
