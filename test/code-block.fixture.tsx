import React from 'react';
import {createRoot} from 'react-dom/client';
import {ContentBlock} from '../src/components/ContentBlock.tsx';
import {defaultAppearance} from '../src/appearance.ts';
import '../src/index.css';
const code=(location.search.includes('long') ? 'const value = 1;\n'.repeat(30) : '')+'/* first\nsecond */\nconst message = "'+ 'long source '.repeat(30)+'";\n';
createRoot(document.getElementById('root')!).render(<main style={{width:360,maxWidth:'100%'}}><ContentBlock language="ts" filename="example.ts" code={code} appearance={{...defaultAppearance,locale:'en'}} activeTheme="light" /></main>);
