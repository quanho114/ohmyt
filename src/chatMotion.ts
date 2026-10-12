import { useLayoutEffect, useRef, useState } from 'react';
import type { Message } from './types.ts';

export function springStep(position: number, velocity: number, target: number, elapsedMs: number) {
  const dt = Math.min(64, Math.max(0, elapsedMs)) / 1000;
  const omega = 24;
  const error = position - target;
  const impulse = velocity + omega * error;
  const decay = Math.exp(-omega * dt);
  return { position: target + (error + impulse * dt) * decay, velocity: (velocity - omega * impulse * dt) * decay };
}

export function useChatFollow(sessionId: string | undefined, messages: Message[], enabled: boolean, animated: boolean, empty: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, { top: number; following: boolean }>());
  const [following, setFollowing] = useState(true);
  const update = useRef<(() => void) | null>(null);
  const jump = useRef<(() => void) | null>(null);
  const latest = useRef({ messages, enabled, animated });
  latest.current = { messages, enabled, animated };

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !sessionId) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saved = positions.current.get(sessionId);
    let follow = saved?.following ?? true;
    let initialized = false, frame = 0, previous = 0, velocity = 0, writing = false;
    let lastWritten = scroller.scrollTop;
    const bottom = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const stop = () => { cancelAnimationFrame(frame); frame = 0; velocity = 0; };
    const write = (top: number) => {
      writing = true; scroller.scrollTop = top; lastWritten = scroller.scrollTop; writing = false;
    };
    const persist = () => {
      positions.current.delete(sessionId);
      positions.current.set(sessionId, {top:scroller.scrollTop,following:follow});
      if (positions.current.size > 5) positions.current.delete(positions.current.keys().next().value!);
    };
    const mark = (value: boolean) => { follow = value; setFollowing(value); persist(); };
    const tick = (now: number) => {
      frame = 0;
      if (!follow || !latest.current.enabled) return;
      const target = bottom();
      const next = springStep(scroller.scrollTop, velocity, target, now - previous);
      previous = now; velocity = next.velocity;
      if (Math.abs(target - next.position) < 0.5 && Math.abs(velocity) < 3) {
        write(target); velocity = 0; persist(); return;
      }
      write(Math.min(target, Math.max(0, next.position))); persist();
      frame = requestAnimationFrame(tick);
    };
    const measure = () => {
      if (!scroller.clientHeight || latest.current.messages.some(m => m.session_id !== sessionId)) return;
      if (!initialized) {
        if (!empty && latest.current.messages.length === 0) return;
        write(saved && !saved.following ? saved.top : bottom());
        initialized = true; mark(follow); return;
      }
      if (!follow || !latest.current.enabled) { stop(); return; }
      if (!latest.current.animated || media.matches) { stop(); write(bottom()); persist(); return; }
      if (!frame && Math.abs(bottom() - scroller.scrollTop) > 0.5) {
        previous = performance.now(); frame = requestAnimationFrame(tick);
      }
    };
    const pause = () => { stop(); mark(false); };
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY >= 0) return;
      let element = event.target instanceof Element ? event.target : null;
      while (element && element !== scroller) {
        if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight && element.scrollTop > 0 && /auto|scroll/.test(getComputedStyle(element).overflowY)) return;
        element = element.parentElement;
      }
      pause();
    };
    const onScroll = () => {
      if (writing || Math.abs(scroller.scrollTop - lastWritten) < 1) return;
      stop(); mark(bottom() - scroller.scrollTop <= 2);
      lastWritten = scroller.scrollTop;
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]')) return;
      if (['ArrowUp','PageUp','Home'].includes(event.key)) pause();
    };
    const reduced = () => { stop(); measure(); };
    jump.current = () => { stop(); mark(true); write(bottom()); persist(); };
    update.current = measure;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    if (feedRef.current) observer.observe(feedRef.current);
    scroller.addEventListener('wheel', onWheel, {passive:true});
    scroller.addEventListener('touchstart', pause, {passive:true});
    scroller.addEventListener('scroll', onScroll, {passive:true});
    scroller.addEventListener('keydown', onKey);
    media.addEventListener('change', reduced);
    measure();
    return () => {
      persist(); stop(); observer.disconnect(); update.current = null; jump.current = null;
      scroller.removeEventListener('wheel', onWheel); scroller.removeEventListener('touchstart', pause);
      scroller.removeEventListener('scroll', onScroll); scroller.removeEventListener('keydown', onKey);
      media.removeEventListener('change', reduced);
    };
  }, [sessionId, empty]);
  useLayoutEffect(() => update.current?.());
  return {scrollRef,feedRef,following,jumpToBottom:()=>jump.current?.()};
}

export function useComposerDock(docked: boolean, sessionId: string | undefined, animated: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<{sessionId:string|undefined;docked:boolean;top:number}|null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const from = previous.current;
    const top = element.getBoundingClientRect().top;
    previous.current = {sessionId,docked,top};
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const animation = from && from.sessionId === sessionId && !from.docked && docked && animated && !media.matches
      ? element.animate([{transform:`translateY(${from.top-top}px)`},{transform:'translateY(0)'}],{duration:480,easing:'cubic-bezier(.22,1,.36,1)'}) : null;
    const cancel = () => animation?.cancel();
    const resize = () => {
      cancel();
      if (!docked) previous.current = {sessionId,docked,top:element.getBoundingClientRect().top};
    };
    window.addEventListener('resize',resize);
    media.addEventListener('change',cancel);
    return () => {cancel();window.removeEventListener('resize',resize);media.removeEventListener('change',cancel);};
  }, [docked,sessionId,animated]);
  return ref;
}
