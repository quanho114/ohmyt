// MIT, Copyright (c) 2026 DeepSeek. Parser from command-goal; see server/vendor/deepseek-goal/LICENSE.
export function parseGoalCommand(rawInput        )              {
  const input = rawInput.trim()
  if (input.length === 0) return { kind: 'show' }
  const control = input.toLowerCase()
  if (control === 'clear') return { kind: 'clear' }
  if (control === 'pause') return { kind: 'pause' }
  if (control === 'resume') return { kind: 'resume' }
  if (control === 'edit') return { kind: 'invalid-edit' }
  if (/^edit(?=\s)/iu.test(input)) return { kind: 'edit', objective: input.slice(4).trim() }
  return { kind: 'create', objective: input }
}

