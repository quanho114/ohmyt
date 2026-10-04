import { useMemo } from 'react';
import { Avatar, Style } from '@dicebear/core';
import gaze from '@dicebear/styles/gaze.json';

const style = new Style(gaze);

export function SessionAvatar({ sessionId }: { sessionId: string }) {
  const source = useMemo(() => new Avatar(style, { seed: sessionId }).toDataUri(), [sessionId]);
  return <img src={source} width={32} height={32} alt="" draggable={false} className="session-kit-avatar" />;
}
