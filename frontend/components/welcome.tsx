'use client';

import React, { useRef, useEffect } from 'react';
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl';
import type { OGLRenderingContext } from 'ogl';
import { Button } from '@/components/ui/button';

// --- Start of the React version of the "cool white thread thing" ---

interface CoolWhiteThreadThingProps {
  color?: [number, number, number];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
}

const CoolWhiteThreadThing: React.FC<CoolWhiteThreadThingProps> = ({
  color = [0.6, 0.6, 0.6],
  amplitude = 1,
  distance = 0,
  enableMouseInteraction = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use a ref to hold onto variables that shouldn't trigger re-renders
  const oglRef = useRef<{
    renderer: Renderer | null;
    gl: OGLRenderingContext | null;
    program: Program | null;
    mesh: Mesh | null;
    animationId: number | null;
    currentMouse: [number, number];
    targetMouse: [number, number];
  }>({
    renderer: null,
    gl: null,
    program: null,
    mesh: null,
    animationId: null,
    currentMouse: [0.5, 0.5],
    targetMouse: [0.5, 0.5],
  });

  const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

const int u_line_count = 40;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;
    fragColor = vec4(uColor * colorVal, colorVal);
}

void main() {
    mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;

  useEffect(() => {
    const ogl = oglRef.current;
    const container = containerRef.current;
    if (!container) return;

    const cleanup = () => {
      if (ogl.animationId) {
        cancelAnimationFrame(ogl.animationId);
        ogl.animationId = null;
      }
      window.removeEventListener('resize', resize);
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
        container.removeEventListener('mouseleave', handleMouseLeave);
        const canvas = container.querySelector('canvas');
        if (canvas) {
          container.removeChild(canvas);
        }
      }
      if (ogl.gl) {
        ogl.gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      ogl.renderer = null;
      ogl.gl = null;
      ogl.program = null;
      ogl.mesh = null;
      ogl.currentMouse = [0.5, 0.5];
      ogl.targetMouse = [0.5, 0.5];
    };

    const resize = () => {
      if (!container || !ogl.renderer || !ogl.program) return;
      const { clientWidth, clientHeight } = container;
      ogl.renderer.setSize(clientWidth, clientHeight);
      ogl.program.uniforms.iResolution.value.r = clientWidth;
      ogl.program.uniforms.iResolution.value.g = clientHeight;
      ogl.program.uniforms.iResolution.value.b = clientWidth / clientHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      ogl.targetMouse = [x, y];
    };

    const handleMouseLeave = () => {
      ogl.targetMouse = [0.5, 0.5];
    };

    const update = (t: number) => {
      if (!ogl.program || !ogl.renderer || !ogl.mesh) return;
      if (enableMouseInteraction) {
        const smoothing = 0.05;
        ogl.currentMouse[0] += smoothing * (ogl.targetMouse[0] - ogl.currentMouse[0]);
        ogl.currentMouse[1] += smoothing * (ogl.targetMouse[1] - ogl.currentMouse[1]);
        ogl.program.uniforms.uMouse.value[0] = ogl.currentMouse[0];
        ogl.program.uniforms.uMouse.value[1] = ogl.currentMouse[1];
      } else {
        ogl.program.uniforms.uMouse.value[0] = 0.5;
        ogl.program.uniforms.uMouse.value[1] = 0.5;
      }
      ogl.program.uniforms.iTime.value = t * 0.001;
      ogl.renderer.render({ scene: ogl.mesh });
      ogl.animationId = requestAnimationFrame(update);
    };

    const initializeScene = () => {
      cleanup();
      ogl.renderer = new Renderer({ alpha: true });
      ogl.gl = ogl.renderer.gl;
      ogl.gl.clearColor(0, 0, 0, 0);
      ogl.gl.enable(ogl.gl.BLEND);
      ogl.gl.blendFunc(ogl.gl.SRC_ALPHA, ogl.gl.ONE_MINUS_SRC_ALPHA);

      const geometry = new Triangle(ogl.gl);
      ogl.program = new Program(ogl.gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new Color(ogl.gl.canvas.width, ogl.gl.canvas.height, ogl.gl.canvas.width / ogl.gl.canvas.height) },
          uColor: { value: new Color(...color) },
          uAmplitude: { value: amplitude },
          uDistance: { value: distance },
          uMouse: { value: new Float32Array([0.5, 0.5]) },
        },
      });

      ogl.mesh = new Mesh(ogl.gl, { geometry, program: ogl.program });
      const canvas = ogl.gl.canvas as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      container.appendChild(canvas);

      window.addEventListener('resize', resize);
      if (enableMouseInteraction) {
        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseleave', handleMouseLeave);
      }

      resize();
      ogl.animationId = requestAnimationFrame(update);
    };

    initializeScene();

    return cleanup; // This cleanup function will be called when the component unmounts
  }, [color, amplitude, distance, enableMouseInteraction]); // Re-run effect if props change

  return <div ref={containerRef} className="w-full h-full absolute inset-0 -z-10" />;
};

// --- End of the React component ---

interface WelcomeProps {
  disabled: boolean;
  startButtonText: string;
  onStartCall: () => void;
}

export const Welcome = React.forwardRef<HTMLDivElement, WelcomeProps>(
  ({ disabled, startButtonText, onStartCall }, ref) => {
    return (
      <div
        ref={ref}
        // @ts-ignore - `inert` is not yet in React's official types but is valid
        inert={disabled ? '' : undefined}
        className="fixed inset-0 z-10 mx-auto flex h-svh flex-col items-center justify-center text-center"
      >
        <CoolWhiteThreadThing enableMouseInteraction={true} amplitude={1} distance={0} />
        <div className="relative z-10 flex flex-col items-center p-4">
          {/* Headline with better typography */}
          <h1 className="font-serif text-5xl sm:text-7xl md:text-9xl tracking-tight text-foreground">
            Kairos
          </h1>

          {/* Sub-headline with more spacing and better readability */}
          <p className="mt-8 max-w-lg text-lg leading-8 text-foreground/80">
            Welcome to this moment, created just for you. When you're ready, begin your session.
          </p>

          {/* Button with more vertical space */}
          <Button
            variant="primary"
            size="lg"
            onClick={onStartCall}
            className="mt-10 w-64 font-mono"
            disabled={disabled}
          >
            {startButtonText}
          </Button>
        </div>

        {/* The footer is moved outside the main content block for better separation */}
        <p className="fixed bottom-6 left-1/2 w-full max-w-prose -translate-x-1/2 text-xs text-foreground/60">
          Built by Dheeraj Appaji using{' '}
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://livekit.io"
            className="underline hover:text-foreground/80"
          >
            LiveKit
          </a>
          . This is an AI companion, not a medical professional.
        </p>
      </div>
    );
  }
);

Welcome.displayName = 'Welcome';
