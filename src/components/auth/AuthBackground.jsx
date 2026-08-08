/**
 * Fond animé des pages d'authentification
 * Globe de points en rotation (canvas 2D, projection maison, aucune dépendance).
 * Partagé par les pages Inscription, Connexion, Mot de passe oublié et Réinitialisation.
 * AdsFacile Frontend
 */

import { useEffect, useRef } from 'react';
import './AuthBackground.css';

const POINT_COUNT = 760;
// Indices des noeuds mis en avant (les "villes" du réseau)
const HUB_RATIOS = [0.12, 0.28, 0.41, 0.55, 0.68, 0.83];

const AuthBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Répartition de Fibonacci : des points régulièrement espacés sur une sphère
    const points = [];
    for (let i = 0; i < POINT_COUNT; i++) {
      const y = 1 - (i / (POINT_COUNT - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      points.push({ x: Math.cos(theta) * radius, y, z: Math.sin(theta) * radius });
    }
    const hubs = new Set(HUB_RATIOS.map((ratio) => Math.floor(ratio * POINT_COUNT)));

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let sphereRadius = 0;
    let angle = 0.6;
    let frameId = null;

    const resize = () => {
      // Repli sur la fenêtre : au premier rendu la feuille de style peut ne pas
      // être encore appliquée et le canvas mesurer 0.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const compact = width < 1024;
      centerX = compact ? width * 0.5 : width * 0.28;
      centerY = compact ? height * 0.2 : height * 0.46;
      sphereRadius = Math.min(width, height) * (compact ? 0.3 : 0.31);
    };

    const draw = () => {
      // Se remesure si la taille a changé : plus fiable que d'attendre un
      // événement resize, qui n'arrive pas dans tous les contextes.
      if (canvas.clientWidth && (canvas.clientWidth !== width || canvas.clientHeight !== height)) {
        resize();
      }
      if (!width || !height) {
        if (!prefersReducedMotion) frameId = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, width, height);
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);

      const projected = points.map((p) => {
        const x = p.x * cos - p.z * sin;
        const z = p.x * sin + p.z * cos;
        const y = p.y * 0.94 - 0.1 * z;
        const depth = 1 / (1.9 - z);
        return {
          sx: centerX + x * sphereRadius * depth * 1.9,
          sy: centerY + y * sphereRadius * depth * 1.9,
          z,
          depth
        };
      });

      // Liens entre noeuds proches, uniquement sur la face visible
      ctx.lineWidth = 1;
      for (let i = 0; i < projected.length; i += 3) {
        const a = projected[i];
        if (a.z < -0.1) continue;
        for (let j = i + 3; j < i + 30 && j < projected.length; j += 3) {
          const b = projected[j];
          if (b.z < -0.1) continue;
          const distance = Math.hypot(a.sx - b.sx, a.sy - b.sy);
          if (distance < 58) {
            const alpha = 0.16 * (1 - distance / 58) * ((a.z + 1) / 2);
            ctx.strokeStyle = `rgba(59, 130, 246, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
            ctx.stroke();
          }
        }
      }

      projected.forEach((p, i) => {
        const front = (p.z + 1) / 2;
        const isHub = hubs.has(i);
        const r = Math.max((isHub ? 2.6 : 1.25) * p.depth * 1.2, 0.4);
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        if (isHub) {
          ctx.fillStyle = `rgba(16, 185, 129, ${0.35 + front * 0.6})`;
          ctx.fill();
          if (p.z > 0) {
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, r * 3.4, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(16, 185, 129, ${0.16 * front})`;
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = `rgba(148, 163, 184, ${0.1 + front * 0.42})`;
          ctx.fill();
        }
      });

      if (!prefersReducedMotion) {
        angle += 0.0016;
        frameId = requestAnimationFrame(draw);
      }
    };

    resize();
    draw();
    window.addEventListener('resize', resize);

    // Suit la taille réelle du canvas une fois la mise en page stabilisée
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (!canvas.clientWidth) return;
        resize();
        // En mouvement réduit la boucle est arrêtée : il faut redessiner ici.
        if (prefersReducedMotion) draw();
      });
      observer.observe(canvas);
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (observer) observer.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="auth-bg" aria-hidden="true">
      <canvas ref={canvasRef} className="auth-bg-globe" />
      <div className="auth-bg-halo" />
      <div className="auth-bg-vignette" />
    </div>
  );
};

export default AuthBackground;
