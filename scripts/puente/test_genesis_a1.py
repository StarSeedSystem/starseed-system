# -*- coding: utf-8 -*-
"""Pruebas de Genesis en el A1 (COL1012M): verifica la configuración de Caddy y systemd."""
import os
import re
import unittest


class TestGenesisA1(unittest.TestCase):
    """Pruebas para la configuración de Genesis en el A1."""

    def test_caddyfile_genesis_block(self):
        """Verifica que el Caddyfile.nodo tenga el bloque genesis con proxy correcto."""
        caddyfile_path = "deploy/oracle/nodo/Caddyfile.nodo"
        with open(caddyfile_path, encoding="utf-8") as f:
            content = f.read()

        # Verificar que exista el bloque genesis
        self.assertIn("genesis.{$STARSEED_HOST}", content)
        
        # Extraer el bloque genesis (desde la línea que empieza con genesis. hasta la línea de cierre })
        lines = content.split('\n')
        genesis_start = -1
        genesis_end = -1
        brace_count = 0
        
        for i, line in enumerate(lines):
            if line.strip().startswith("genesis.{$STARSEED_HOST} {"):
                genesis_start = i
                brace_count = 1
            elif genesis_start != -1:
                # Contar llaves para encontrar el final del bloque
                brace_count += line.count('{')
                brace_count -= line.count('}')
                if brace_count == 0:
                    genesis_end = i
                    break
        
        self.assertNotEqual(genesis_start, -1, "No se encontró el inicio del bloque genesis en Caddyfile.nodo")
        self.assertNotEqual(genesis_end, -1, "No se encontró el fin del bloque genesis en Caddyfile.nodo")
        
        genesis_lines = lines[genesis_start:genesis_end+1]
        genesis_content = '\n'.join(genesis_lines)

        # Verificar que tenga reverse_proxy al puerto 9002
        self.assertIn("reverse_proxy 127.0.0.1:9002", genesis_content)
        
        # Verificar que tenga header_up X-Real-IP
        self.assertIn("header_up X-Real-IP {remote_host}", genesis_content)

    def test_systemd_service(self):
        """Verifica que el servicio systemd tenga la configuración correcta."""
        service_path = "deploy/oracle/nodo/systemd/starseed-genesis.service"
        with open(service_path, encoding="utf-8") as f:
            content = f.read()

        # Verificar usuario
        self.assertIn("User=starseed", content)
        
        # Verificar working directory
        self.assertIn("WorkingDirectory=/opt/starseed/genesis", content)
        
        # Verificar environment variables
        self.assertIn("STARSEED_MANDO=1", content)
        self.assertIn("NODE_OPTIONS=--max-old-space-size=2048", content)
        self.assertNotIn("STARSEED_LOCAL=1", content)
        
        # Verificar execstart
        self.assertIn("next start -p 9002 -H 127.0.0.1", content)
        
        # Verificar restart y memory limit
        self.assertIn("Restart=on-failure", content)
        self.assertIn("MemoryMax=3G", content)

    def test_no_ips_or_hosts_reales(self):
        """Verifica que no haya IPs o hosts reales en los archivos de configuración."""
        # Verificar Caddyfile.nodo
        caddyfile_path = "deploy/oracle/nodo/Caddyfile.nodo"
        with open(caddyfile_path, encoding="utf-8") as f:
            caddy_content = f.read()
        
        # Verificar que no haya IPs reales (excepto 127.0.0.1 que es permitido)
        ip_pattern = r"\b(?:\d{1,3}\.){3}\d{1,3}\b"
        ips = re.findall(ip_pattern, caddy_content)
        # Solo permitir 127.0.0.1
        for ip in ips:
            if ip != "127.0.0.1":
                self.fail(f"IP real encontrada en Caddyfile.nodo: {ip}")
        
        # Verificar que no haya hosts reales (que no sean variables)
        host_pattern = r"\b[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]\.(?:sslip\.io|[a-zA-Z0-9]\.[a-zA-Z]{2,})\b"
        hosts = re.findall(host_pattern, caddy_content)
        # Solo permitir variables como {$STARSEED_HOST}
        for host in hosts:
            if not host.startswith("{") or not host.endswith("}"):
                self.fail(f"Host real encontrado en Caddyfile.nodo: {host}")

        # Verificar service file
        service_path = "deploy/oracle/nodo/systemd/starseed-genesis.service"
        with open(service_path, encoding="utf-8") as f:
            service_content = f.read()
        
        # Verificar que no haya IPs reales en el service
        ips = re.findall(ip_pattern, service_content)
        for ip in ips:
            if ip != "127.0.0.1":
                self.fail(f"IP real encontrada en service file: {ip}")


if __name__ == "__main__":
    unittest.main()