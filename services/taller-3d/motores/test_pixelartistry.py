import pytest
import services.taller-3d.motores.pixelartistry as pa

class TestRemallarImagen:
    def test_remallar_imagen_cuando_no_disponible(self, tmp_path):
        # preparar cliente falso
        cliente = pa.ClienteComfyUI()
        result = pa.remallar_imagen(
            str(tmp_path / "image.png"),
            resolucion=512,
            carpeta_workflows=tmp_path,
            comfy=cliente,
            dormir=lambda _: None
        )
        assert not result["ok"]
        assert result["glb"] is None
        assert isinstance(result["procedencia"], list)
        assert len(result["procedencia"]) >= 2
        assert isinstance(result["fallo"], str)
        assert len(result["fallo"]) >= 1
        assert result["segundos"] >= 0.0
        assert result["pico_memoria_gb"] >= 0.0
