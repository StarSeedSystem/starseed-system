'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useAurora } from '@/components/aurora/aurora-provider';
import { subscribeAuroraConversation, subscribeAuroraSpeak, acquireMicAnalyser, type AuroraConversationDetail } from '@/lib/aurora/aurora-orb-bus';
import { siguienteEstadoOrbe, type EstadoOrbe, parametrosVisuales } from './estado-orbe';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import { Texto3D } from './panel-cristal';
import { usePrefsXR } from './use-prefs-xr';

function OrbeMesh({ estado }: { estado: EstadoOrbe }) {
  const ref = useRef<any>(null);
  const params = useMemo(() => parametrosVisuales(estado, false), [estado]);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.scale.setScalar(1 + Math.sin(Date.now() * 0.003) * 0.02 * params.pulso);
    }
  });
  return (
    <Sphere args={[params.radio, 32, 32]} ref={ref}>
      <meshBasicMaterial color={params.color} transparent opacity={0.85 + params.brillo * 0.15} />
    </Sphere>
  );
}

export function OrbeAstraura() {
  const aurora = useAurora();
  const { confort } = usePrefsXR();
  const reducido = confort?.reducirTransparencia ?? false;
  const [estado, setEstado] = useState<EstadoOrbe>({ fase: 'reposo', capa: null, nivelVoz: 0, texto: '' });
  const [respuesta, setRespuesta] = useState('');
  const analyserRef = useRef<any>(null);

  const dispatch = (ev: Parameters<typeof siguienteEstadoOrbe>[1]) => {
    setEstado(s => siguienteEstadoOrbe(s, ev));
  };

  useEffect(() => {
    if (!aurora) return;
    if (aurora.listening) dispatch({ tipo: 'escucha-inicio' });
    else dispatch({ tipo: 'escucha-fin' });
  }, [aurora?.listening]);

  useEffect(() => {
    if (!aurora) return;
    if (aurora.thinking) dispatch({ tipo: 'entendido', capa: null });
  }, [aurora?.thinking]);

  useEffect(() => {
    if (!aurora) return;
    if (aurora.speaking) dispatch({ tipo: 'habla-inicio' });
    else if (estado.fase === 'hablando') dispatch({ tipo: 'habla-fin' });
  }, [aurora?.speaking]);

  useEffect(() => {
    const off = subscribeAuroraConversation((d: AuroraConversationDetail) => {
      if (d.role === 'user') {
        dispatch({ tipo: 'texto-parcial', texto: d.text });
      } else {
        setRespuesta(d.text.slice(0, 180));
        setEstado(s => ({ ...s, texto: '' }));
      }
    });
    const offSpeak = subscribeAuroraSpeak((phase) => {
      if (phase === 'start') dispatch({ tipo: 'habla-inicio' });
      if (phase === 'end') dispatch({ tipo: 'habla-fin' });
    });
    return () => { off(); offSpeak(); };
  }, []);

  useEffect(() => {
    let raf = 0;
    async function loop() {
      if (estado.fase === 'escuchando' && aurora?.listening) {
        if (!analyserRef.current) {
          const a = await acquireMicAnalyser();
          analyserRef.current = a;
        }
        const a = analyserRef.current;
        if (a) {
          const { level } = a.read();
          setEstado(s => ({ ...s, nivelVoz: level }));
        }
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); analyserRef.current?.stop(); };
  }, [estado.fase, aurora?.listening]);

  const hablar = () => aurora?.toggle?.();
  const params = parametrosVisuales(estado, reducido);

  return (
    <div style={{ width: 320, height: 420 }}>
      <Canvas camera={{ position: [0, 0, 3] }}>
        <ambientLight intensity={0.6} />
        <OrbeMesh estado={estado} />
      </Canvas>
      <div style={{ marginTop: 8 }}>
        <Texto3D distancia={1.2}>{estado.texto || respuesta}</Texto3D>
        <button onPointerDown={hablar} onPointerUp={hablar} style={{ cursor: 'pointer', marginTop: 8 }}>
          hablar
        </button>
        <div>fase: {estado.fase} · capa: {estado.capa ?? '-'} · pulso: {params.pulso.toFixed(2)}</div>
      </div>
    </div>
  );
}
