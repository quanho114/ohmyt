import { useId, useLayoutEffect, useRef, useState } from 'react';

/** Keep long prompts compact without changing the stored or copied message. */
export function UserMessageText({ text, lang }: { text: string; lang: string }) {
  const id = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(content).lineHeight);
      setOverflows(content.scrollHeight > lineHeight * 6 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [text]);

  return <>
    <div id={id} ref={contentRef}
      className="message-content select-text leading-relaxed break-words whitespace-pre-wrap font-normal"
      style={expanded ? undefined : { maxHeight: '9.75em', overflow: 'hidden' }}>
      {text}
    </div>
    {overflows && <button type="button" className="user-message-expand"
      aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded(value => !value)}>
      {lang === 'en' ? (expanded ? 'Show less' : 'Show more') : (expanded ? 'Thu gọn' : 'Xem thêm')}
    </button>}
  </>;
}
