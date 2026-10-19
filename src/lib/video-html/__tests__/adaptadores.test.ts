import { describe, it, expect } from "vitest";
import { detectarAdaptadores } from "../adaptadores";
import { plantillaStarSeed } from "../plantilla";

describe("detectarAdaptadores", () => {
  it("debe devolver adaptadores vacíos y editable cuando no hay adaptadores", () => {
    const html = "<div>Hola</div>";
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toEqual([]);
    expect(resultado.editableVisualmente).toBe(true);
    expect(resultado.motivo).toBe("");
  });

  it("debe detectar adaptador CSS con @keyframes", () => {
    const html = `<div><style>@keyframes test { from { opacity: 0; } to { opacity: 1; } }</style></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("css");
    expect(resultado.editableVisualmente).toBe(true);
  });

  it("debe detectar adaptador WAAPI con element.animate()", () => {
    const html = `<div><script>element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 });</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("waapi");
    expect(resultado.editableVisualmente).toBe(true);
  });

  it("debe detectar adaptador Anime.js", () => {
    const html = `<div><script>anime({ targets: 'div', translateX: 100 });</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("animejs");
    expect(resultado.editableVisualmente).toBe(true);
  });

  it("debe detectar adaptador Lottie con <lottie-player>", () => {
    const html = `<div><lottie-player src="animation.json"></lottie-player></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("lottie");
    expect(resultado.editableVisualmente).toBe(true);
  });

  it("debe detectar adaptador Lottie con import en script", () => {
    const html = `<div><script>import lottie from 'lottie-web'; lottie.loadAnimation({});</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("lottie");
    expect(resultado.editableVisualmente).toBe(true);
  });

  it("debe detectar adaptador Three.js", () => {
    const html = `<div><script>import * as THREE from 'three'; const scene = new THREE.Scene();</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("three");
    expect(resultado.editableVisualmente).toBe(true);
  });

  it("debe detectar adaptador TypeGPU", () => {
    const html = `<div><script>import { typegpu } from 'typegpu';</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("typegpu");
    expect(resultado.editableVisualmente).toBe(true);
  });

  it("debe detectar adaptador GSAP y marcar como no editable visualmente", () => {
    const html = `<div><script>import { gsap } from 'gsap'; gsap.to('.box', { x: 100 });</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("gsap");
    expect(resultado.editableVisualmente).toBe(false);
    expect(resultado.motivo).toContain("licencia de GSAP Standard");
  });

  it("debe detectar GSAP con TweenMax", () => {
    const html = `<div><script>TweenMax.to('.box', 1, { x: 100 });</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("gsap");
    expect(resultado.editableVisualmente).toBe(false);
  });

  it("debe detectar GSAP con TimelineMax", () => {
    const html = `<div><script>const tl = new TimelineMax(); tl.to('.box', 1, { x: 100 });</script></div>`;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("gsap");
    expect(resultado.editableVisualmente).toBe(false);
  });

  it("debe detectar múltiples adaptadores simultáneamente", () => {
    const html = `
      <div>
        <style>@keyframes test { to { opacity: 1; } }</style>
        <script>element.animate([{ opacity: 0 }], { duration: 500 });</script>
        <script>anime({ translateX: 100 });</script>
        <lottie-player></lottie-player>
        <script>import * as THREE from 'three';</script>
        <script>import { typegpu } from 'typegpu';</script>
        <script>import { gsap } from 'gsap';</script>
      </div>
    `;
    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toEqual(
      expect.arrayContaining(["css", "waapi", "animejs", "lottie", "three", "typegpu", "gsap"])
    );
    expect(resultado.editableVisualmente).toBe(false);
    expect(resultado.motivo).toContain("licencia de GSAP Standard");
  });

  it("la plantilla StarSeed no debe contener 'gsap' y debe ser detectable como CSS", () => {
    const html = plantillaStarSeed({
      ancho: 1920,
      alto: 1080,
      duracion: 5,
      titulo: "Vídeo de prueba",
      fondo: "#000000",
      acento: "#FFFFFF",
    });

    expect(html).not.toContain("gsap");
    expect(html).not.toContain("GSAP");

    const resultado = detectarAdaptadores(html);
    expect(resultado.usados).toContain("css");
    expect(resultado.usados).not.toContain("gsap");
    expect(resultado.editableVisualmente).toBe(true);
    expect(resultado.motivo).toBe("");
  });

  it("la plantilla StarSeed debe tener estructura válida de HyperFrames", () => {
    const html = plantillaStarSeed({
      ancho: 1280,
      alto: 720,
      duracion: 3,
      titulo: "Título con <script>alerta()</script> & \"comillas\"",
      fondo: "#1a1a1a",
      acento: "#007FFF",
    });

    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('data-start="0"');
    expect(html).toContain('data-duration="3"');
    expect(html).toContain('data-width="1280"');
    expect(html).toContain('data-height="720"');
    expect(html).toContain('data-no-timeline');
    expect(html).toContain('class="clip ');
    expect(html).toContain('data-track-index="0"');
    expect(html).toContain('data-track-index="1"');
    expect(html).toContain('data-track-index="2"');
    expect(html).toContain("@keyframes sf-fade-in");
    expect(html).toContain("@keyframes sf-slide-up");
    expect(html).toContain("@keyframes sf-scale-in");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
    expect(html).toContain("Título con <script>alerta()</script> & \"comillas\"");
  });

  it("la plantilla debe escapar correctamente caracteres HTML especiales", () => {
    const html = plantillaStarSeed({
      ancho: 800,
      alto: 600,
      duracion: 2,
      titulo: 'Test & "quotes" <tag> \'apostrophe\'',
      fondo: "#fff",
      acento: "#000",
    });

    expect(html).toContain("Test & \"quotes\" <tag> 'apostrophe'");
  });
});