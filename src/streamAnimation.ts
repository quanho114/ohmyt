import { useRef } from 'react';

export function cadenceFadeMs(average: number, gap: number): { average: number; duration: number } {
  const next = average * 0.7 + Math.min(1000, Math.max(0, gap)) * 0.3;
  return { average: next, duration: Math.round(Math.min(400, Math.max(120, next * 3))) };
}

export function useStreamCadence(text: string): number {
  const state = useRef({ text, average: 160, last: performance.now(), duration: 400 });
  if (state.current.text !== text) {
    const now = performance.now();
    if (text.startsWith(state.current.text)) {
      const next = cadenceFadeMs(state.current.average, now - state.current.last);
      state.current.average = next.average;
      state.current.duration = next.duration;
    }
    state.current.text = text;
    state.current.last = now;
  }
  return state.current.duration;
}
