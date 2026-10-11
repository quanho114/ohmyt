import { useEffect, useRef } from 'react';

// Decibels preserve quiet speech detail without pegging normal speech at full height.
export function voiceAmplitude(samples: Float32Array): number {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const rms = Math.sqrt(energy / Math.max(1, samples.length));
  if (rms < 0.003) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(rms) + 50) / 38));
}

export function AudioWaveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !analyser) return;
    const samples = new Float32Array(analyser.fftSize);
    const history = Array<number>(28).fill(0);
    let frame = 0;
    let previous = 0;
    let smoothed = 0;
    let width = 0;
    const height = 44;
    const resize = new ResizeObserver(() => {
      width = canvas.clientWidth;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    resize.observe(canvas);
    const draw = (time: number) => {
      if (time - previous >= 32) {
        analyser.getFloatTimeDomainData(samples);
        const amplitude = voiceAmplitude(samples);
        smoothed += (amplitude - smoothed) * (amplitude > smoothed ? 0.85 : 0.4);
        history.shift();
        history.push(smoothed);
        previous = time;
      }
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(canvas).color;
      const spacing = width / history.length;
      const barWidth = Math.min(3, spacing * 0.6);
      history.forEach((level, index) => {
        const barHeight = 2 + level * 40;
        // A short fade at the edges keeps the waveform visually contained.
        context.globalAlpha = 0.18 + 0.82 * Math.min(1, index / 5, (28 - index) / 4);
        context.beginPath();
        context.roundRect(index * spacing, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
        context.fill();
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
  }, [analyser]);
  return <canvas ref={canvasRef} className="composer-recording-wave" aria-hidden="true" />;
}
