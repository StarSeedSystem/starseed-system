from typing import List

def unidad_systemd(usuario: str, ruta_servicio: str) -> str:
    """Devuelve el texto de una unidad systemd --user para node servidor-laya.mjs."""
    home = f"/home/{usuario}"
    return f"""[Unit]
Description=Laya Service
After=network.target

[Service]
Type=simple
ExecStart={ruta_servicio}
Restart=on-failure
MemoryMax=3G
Environment=LAYA_HOST=127.0.0.1
Environment=LAYA_CACHE={home}/.laya_cache

[Install]
WantedBy=default.target
"""

def ordenes_instalacion() -> List[str]:
    """Devuelve la lista de órdenes para instalar y habilitar el servicio."""
    # Nota: El archivo de unidad debe colocarse en ~/.config/systemd/user/layas.service
    # por el llamador antes de ejecutar estas órdenes.
    return [
        "loginctl enable-linger starseed",  # Asumiendo que el usuario es starseed según la tarea
        "systemd --user daemon-reload",
        "systemd --user enable --now layas.service"
    ]

if __name__ == "__main__":
    # Al ejecutarse directamente, podemos instalar si se proporciona --instalar.
    import sys
    if "--instalar" in sys.argv:
        # Esta parte es impura y no se prueba en las pruebas unitarias puras.
        # Necesitaríamos obtener el usuario y la ruta_servicio de argumentos o variables de entorno.
        # Por ahora, solo imprimimos un mensaje.
        print("La instalación mediante --instalar requiere los argumentos usuario y ruta_servicio.")
        sys.exit(1)