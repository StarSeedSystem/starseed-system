
"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useAppearance } from "@/context/appearance-context";
import { TouchTexture } from "./TouchTexture";
import { vertexShader, fragmentShader } from "./shaders";

export function LiquidGradient() {
    const containerRef = useRef<HTMLDivElement>(null);
    const { config } = useAppearance();
    const touchTextureRef = useRef<TouchTexture | null>(null);

    const uniformsRef = useRef<any>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Cleanup any existing children to prevent duplication
        while (containerRef.current.firstChild) {
            containerRef.current.removeChild(containerRef.current.firstChild);
        }

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
            alpha: false,
            stencil: false,
            depth: false,
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        containerRef.current.appendChild(renderer.domElement);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
        camera.position.z = 50;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0e27);

        const clock = new THREE.Clock();
        const touchTexture = new TouchTexture();
        touchTextureRef.current = touchTexture;

        // Initial uniforms
        const uniforms = {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uColor1: { value: new THREE.Color(0.945, 0.353, 0.133) },
            uColor2: { value: new THREE.Color(0.039, 0.055, 0.153) },
            uColor3: { value: new THREE.Color(0.945, 0.353, 0.133) },
            uColor4: { value: new THREE.Color(0.039, 0.055, 0.153) },
            uColor5: { value: new THREE.Color(0.945, 0.353, 0.133) },
            uColor6: { value: new THREE.Color(0.039, 0.055, 0.153) },
            uSpeed: { value: 1.2 },
            uIntensity: { value: 1.8 },
            uTouchTexture: { value: touchTexture.texture },
            uGrainIntensity: { value: 0.08 },
            uZoom: { value: 1.0 },
            uDarkNavy: { value: new THREE.Color(0.039, 0.055, 0.153) },
            uGradientSize: { value: 0.45 },
            uGradientCount: { value: 12.0 },
            uColor1Weight: { value: 0.5 },
            uColor2Weight: { value: 1.8 },
        };

        uniformsRef.current = uniforms;

        const geometry = new THREE.PlaneGeometry(100, 100);
        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader,
            fragmentShader,
        });
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        const onMouseMove = (e: MouseEvent) => {
            const mouse = {
                x: e.clientX / window.innerWidth,
                y: 1 - e.clientY / window.innerHeight,
            };
            touchTexture.addTouch(mouse);
        };

        const onResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

            const fovRad = (camera.fov * Math.PI) / 180;
            const height = Math.abs(camera.position.z * Math.tan(fovRad / 2) * 2);
            const width = height * camera.aspect;
            mesh.scale.set(width / 100, height / 100, 1);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("resize", onResize);
        onResize();

        let reqId: number;
        const animate = () => {
            reqId = requestAnimationFrame(animate);
            const delta = clock.getDelta();
            uniforms.uTime.value += delta;
            touchTexture.update();
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("resize", onResize);
            cancelAnimationFrame(reqId);
            if (containerRef.current) {
                // Check if child still exists before removing
                if (renderer.domElement.parentNode === containerRef.current) {
                    containerRef.current.removeChild(renderer.domElement);
                }
            }
            geometry.dispose();
            material.dispose();
            renderer.dispose();
        };
    }, []);

    // Effect to update uniforms when config changes
    useEffect(() => {
        if (!uniformsRef.current) return;

        const uniforms = uniformsRef.current;

        // Update floats
        uniforms.uSpeed.value = config.background.webglSpeed || 1.2;
        uniforms.uZoom.value = config.background.webglZoom || 1.0;

        // Update colors
        if (config.background.liquidColors) {
            const c = config.background.liquidColors;
            if (c[0]) uniforms.uColor1.value.set(c[0]);
            if (c[1]) uniforms.uColor2.value.set(c[1]);
            if (c[2]) uniforms.uColor3.value.set(c[2]);
            if (c[3]) uniforms.uColor4.value.set(c[3]);
            if (c[4]) uniforms.uColor5.value.set(c[4]);
            if (c[5]) uniforms.uColor6.value.set(c[5]);
        }
    }, [config.background.webglSpeed, config.background.webglZoom, config.background.liquidColors]);

    return <div ref={containerRef} className="fixed inset-0 -z-50 pointer-events-none" />;
}
