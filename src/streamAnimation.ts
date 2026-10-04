import { useEffect, useRef, useState } from 'react';

/**
 * Làm mượt chữ stream theo preset của @lobehub/streamdown (LobeHub).
 */
interface SmoothPreset {
  minCps: number;
  maxCps: number;
  minCommitMs: number;
  targetBufferMs: number;
  settleIdleMs: number;
  flushCps: number;
}

const PRESETS: Record<'balanced' | 'silky', SmoothPreset> = {
  balanced: { minCps: 18, maxCps: 72, minCommitMs: 48, targetBufferMs: 120, settleIdleMs: 360, flushCps: 160 },
  silky: { minCps: 14, maxCps: 56, minCommitMs: 56, targetBufferMs: 170, settleIdleMs: 460, flushCps: 96 }
};

export const STREAM_FADE_MS = 180;

export type SmoothPresetName = keyof typeof PRESETS;

export function useSmoothedText(target: string, enabled: boolean, presetName: SmoothPresetName = 'balanced', startEmpty = false): string {
  const preset = PRESETS[presetName];
  const [shown, setShown] = useState(startEmpty ? '' : target);
  const shownRef = useRef(startEmpty ? '' : target);
  const wasEnabledRef = useRef(enabled);
  const arrivalEmaRef = useRef(38);
  const lastInputTsRef = useRef(0);
  const lastTargetLenRef = useRef(target.length);
  const targetTsRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (wasEnabledRef.current) {
        // Vừa stream xong: giữ 1s cho ký tự cuối kịp fade rồi mới chốt.
        wasEnabledRef.current = false;
        const timer = window.setTimeout(() => {
          shownRef.current = target;
          setShown(target);
        }, 1000);
        return () => window.clearTimeout(timer);
      }
      if (shownRef.current !== target) {
        shownRef.current = target;
        setShown(target);
      }
      return;
    }
    wasEnabledRef.current = true;

    // Cập nhật ước lượng tốc độ luồng vào.
    const now = performance.now();
    const gained = target.length - lastTargetLenRef.current;
    if (gained > 0 && lastInputTsRef.current > 0) {
      const instant = (gained * 1000) / Math.max(1, now - lastInputTsRef.current);
      arrivalEmaRef.current +=
        (Math.min(Math.max(instant, preset.minCps), 280) - arrivalEmaRef.current) * 0.3;
    }
    lastInputTsRef.current = now;
    lastTargetLenRef.current = target.length;
    targetTsRef.current = now;

    let raf = 0;
    let lastTick = 0;
    const tick = (ts: number) => {
      const current = shownRef.current;
      if (current === target) return;
      if (!target.startsWith(current)) {
        shownRef.current = target;
        setShown(target);
        return;
      }
      if (!lastTick) {
        lastTick = ts;
        raf = requestAnimationFrame(tick);
        return;
      }
      const elapsed = ts - lastTick;
      if (elapsed < preset.minCommitMs) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastTick = ts;
      const cps = Math.min(Math.max(arrivalEmaRef.current, preset.minCps), preset.maxCps);
      const backlog = target.length - current.length;
      // Stream lắng quá 360ms mà vẫn còn nợ: xả nhanh nhưng vẫn theo nhịp
      // (flush ~160 ký tự/s, tối đa ~0.5s) thay vì đổ ập một lúc.
      const settled = performance.now() - targetTsRef.current > preset.settleIdleMs;
      if (settled) {
        const drain = Math.min(backlog, Math.max(2, Math.round((preset.flushCps * elapsed) / 1000)));
        const next = target.slice(0, current.length + drain);
        shownRef.current = next;
        setShown(next);
        raf = requestAnimationFrame(tick);
        return;
      }
      // Giữ trễ ~120ms để chữ chảy đều thay vì giật theo chunk.
      // Tin mới hiện từ trống: giới hạn tối đa ~3.5s để câu dài không gõ quá lâu.
      const buffered = Math.max(0, backlog - Math.round((cps * preset.targetBufferMs) / 1000));
      const minStep = current.length === 0 ? Math.ceil(backlog / 70) : 1;
      const step = Math.max(minStep, Math.min(backlog, Math.round((cps * elapsed) / 1000), Math.max(2, buffered)));
      const next = target.slice(0, current.length + (buffered > 0 ? step : backlog));
      shownRef.current = next;
      setShown(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, presetName]);

  return shown;
}
