import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface WeatherHolisticSceneProps {
    temp: number;
    kpIndex: number;
    humidity?: number;
    condition?: string;
}

export default function WeatherHolisticScene({ temp, kpIndex, humidity = 50, condition = "Clear" }: WeatherHolisticSceneProps) {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        // --- Scene Config ---
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
        camera.position.z = 4;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "high-performance"
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const currentRef = mountRef.current;
        const rect = currentRef.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height);
        currentRef.appendChild(renderer.domElement);

        // --- Colors & Theme ---
        const isHot = temp > 28;
        const isCold = temp < 10;
        const themeColor = isHot ? new THREE.Color(0xff4444) : isCold ? new THREE.Color(0x00f2ff) : new THREE.Color(0x06f9c8);
        const secondaryColor = new THREE.Color(kpIndex > 4 ? 0xff00ff : 0x0ea5e9);

        // --- Objects ---

        // 1. Neural Core Earth
        const coreGeo = new THREE.IcosahedronGeometry(1.5, 15);
        const coreMat = new THREE.MeshStandardMaterial({
            color: themeColor,
            emissive: themeColor,
            emissiveIntensity: 0.5,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
            blending: THREE.AdditiveBlending
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        scene.add(core);

        // 2. Inner Solid Glow
        const innerGeo = new THREE.SphereGeometry(1.45, 64, 64);
        const innerMat = new THREE.MeshPhongMaterial({
            color: 0x000000,
            emissive: themeColor,
            emissiveIntensity: 0.2,
            shininess: 100,
            transparent: true,
            opacity: 0.8
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        scene.add(inner);

        // 3. Atmospheric Particulate Swarm (Swarm of "Weather Spirits")
        const particleCount = 1200;
        const particlesGeo = new THREE.BufferGeometry();
        const posArr = new Float32Array(particleCount * 3);
        const colorArr = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const r = 1.6 + Math.random() * 0.4;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            posArr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            posArr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            posArr[i * 3 + 2] = r * Math.cos(phi);

            const mixed = themeColor.clone().lerp(secondaryColor, Math.random());
            colorArr[i * 3] = mixed.r;
            colorArr[i * 3 + 1] = mixed.g;
            colorArr[i * 3 + 2] = mixed.b;
        }

        particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
        particlesGeo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));

        const particlesMat = new THREE.PointsMaterial({
            size: 0.015,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        const particleSystem = new THREE.Points(particlesGeo, particlesMat);
        scene.add(particleSystem);

        // 4. Energetic Rings (Orbital data paths)
        const ringGeo = new THREE.TorusGeometry(2.2, 0.005, 16, 100);
        const ringMat = new THREE.MeshBasicMaterial({
            color: secondaryColor,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });

        const rings: THREE.Mesh[] = [];
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = Math.random() * Math.PI;
            ring.rotation.y = Math.random() * Math.PI;
            scene.add(ring);
            rings.push(ring);
        }

        // --- Lights ---
        const ambL = new THREE.AmbientLight(0xffffff, 0.2);
        scene.add(ambL);
        const ptL = new THREE.PointLight(themeColor, 2, 10);
        ptL.position.set(5, 5, 5);
        scene.add(ptL);

        // --- Animation ---
        const clock = new THREE.Clock();
        let frameId: number;

        const animate = () => {
            frameId = requestAnimationFrame(animate);
            const time = clock.getElapsedTime();
            const delta = clock.getDelta();

            // Rotation
            core.rotation.y += 0.1 * delta;
            inner.rotation.y += 0.05 * delta;
            particleSystem.rotation.y += 0.08 * delta;

            // Pulsing based on Kp Index (Space Weather)
            const pulseFactor = 1 + Math.sin(time * (1 + kpIndex * 0.3)) * 0.03;
            core.scale.set(pulseFactor, pulseFactor, pulseFactor);
            particleSystem.scale.set(pulseFactor, pulseFactor, pulseFactor);

            // Ring Motion
            rings.forEach((r, idx) => {
                r.rotation.z += 0.1 * delta * (idx + 1);
                r.rotation.x += 0.05 * delta;
            });

            // Float
            const float = Math.sin(time * 0.5) * 0.1;
            scene.position.y = float;

            renderer.render(scene, camera);
        };
        animate();

        // --- Handle Resize ---
        const handleResize = () => {
            if (!currentRef) return;
            const newRect = currentRef.getBoundingClientRect();
            camera.aspect = newRect.width / newRect.height;
            camera.updateProjectionMatrix();
            renderer.setSize(newRect.width, newRect.height);
        };
        window.addEventListener('resize', handleResize);

        // --- Cleanup ---
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(frameId);
            renderer.dispose();
            if (currentRef.contains(renderer.domElement)) {
                currentRef.removeChild(renderer.domElement);
            }
        };
    }, [temp, kpIndex, humidity, condition]);

    return <div ref={mountRef} className="w-full h-full relative" />;
}
