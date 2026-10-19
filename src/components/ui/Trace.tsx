import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** Keep visited content mounted so both directions can animate without losing focus safety. */
export function TraceDisclosure({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  const [visited, setVisited] = useState(open);
  useEffect(() => { if (open) setVisited(true); }, [open]);
  return <div id={id} className="trace-disclosure" data-open={open} aria-hidden={!open} inert={!open}>
    <div className="trace-disclosure-inner">{(open || visited) && children}</div>
  </div>;
}

/** Disclosure shared by reasoning and source rows; tool rows retain their receipts. */
export function TraceRow({ title, icon, running = false, children }: {
  title: string; icon: ReactNode; running?: boolean; children: ReactNode;
}) {
  const id = useId();
  const [manual, setManual] = useState<{ running: boolean; open: boolean } | null>(null);
  const open = manual?.running === running ? manual.open : running;
  return <div className="trace-row" data-running={running}>
    <button type="button" className="trace-row-toggle" data-trace-toggle aria-expanded={open} aria-controls={id}
      onClick={() => setManual({ running, open: !open })}>
      <span className="trace-row-icon" aria-hidden="true">{icon}</span>
      <span className="trace-row-title">{title}</span>
      <ChevronDown size={12} className="trace-tool-chevron" data-open={open} />
    </button>
    <TraceDisclosure id={id} open={open}><div className="trace-row-content">{children}</div></TraceDisclosure>
  </div>;
}
