import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const vite = await createServer({ server: { middlewareMode: true } });
try {
  const {ChatMessage} = await vite.ssrLoadModule('/src/components/ChatMessage.tsx');
  const {defaultAppearance} = await vite.ssrLoadModule('/src/appearance.ts');
  const render = content => renderToStaticMarkup(React.createElement(ChatMessage, {
    message:{id:'math-test',sender:'agent',content,created_at:0},
    appearance:{...defaultAppearance,responseAnimation:'off',transition:'none'},activeTheme:'light',
  }));
  const inline = render('Công thức $W = (X^T X)^{-1} X^T y$.');
  assert.ok(inline.includes('class="katex"'));
  assert.ok(inline.includes('MathML'));
  assert.ok(render('\\(x_1^2\\)').includes('class="katex"'));
  for (const formula of ['$$\\frac{a}{b}\n+ x^2$$','\\[\\sum_{i=1}^{n} x_i\\]']) {
    assert.ok(render(formula).includes('message-math-display'));
  }
  assert.ok(!render('`$x^2$`').includes('class="katex"'));
  assert.ok(!render('`$$x^2$$`').includes('class="katex"'));
  assert.ok(!render('```python\nvalue = "$x^2$"\n```').includes('class="katex"'));
  assert.ok(!render('Giá $5 và $10.').includes('class="katex"'));
  assert.ok(render('$\\badcommand{x}$').includes('message-math-fallback'));
  const unsafe=render('$\\href{javascript:alert(1)}{click}$');
  assert.ok(!unsafe.includes('href="javascript:'));
  console.log('PASS math: inline/display formulas, code exclusions, currency, invalid formula fallback and trusted commands disabled');
} finally { await vite.close(); }
