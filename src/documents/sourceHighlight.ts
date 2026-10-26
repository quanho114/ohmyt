import hljs from 'highlight.js/lib/common';

const languages:Record<string,string>={js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',ts:'typescript',tsx:'typescript',mts:'typescript',cts:'typescript',py:'python',rs:'rust',go:'go',json:'json',jsonc:'json',html:'xml',htm:'xml',xml:'xml',svg:'xml',vue:'xml',svelte:'xml',astro:'xml',css:'css',scss:'scss',sass:'scss',less:'less',sh:'bash',bash:'bash',zsh:'bash',yml:'yaml',yaml:'yaml',toml:'ini',ini:'ini',java:'java',c:'c',h:'c',cpp:'cpp',hpp:'cpp',cc:'cpp',cs:'csharp',sql:'sql',rb:'ruby',php:'php',kt:'kotlin',kts:'kotlin',dart:'dart',swift:'swift',lua:'lua',r:'r',ps1:'powershell',psm1:'powershell',graphql:'graphql',gql:'graphql',proto:'protobuf',ex:'elixir',exs:'elixir',erl:'erlang',hs:'haskell',scala:'scala',diff:'diff',patch:'diff',md:'markdown',mdx:'markdown'};
const loaders:Record<string,()=>Promise<{default: import('highlight.js').LanguageFn}>>={
  kotlin:()=>import('highlight.js/lib/languages/kotlin'),
  dart:()=>import('highlight.js/lib/languages/dart'),
  swift:()=>import('highlight.js/lib/languages/swift'),
  scss:()=>import('highlight.js/lib/languages/scss'),
  less:()=>import('highlight.js/lib/languages/less'),
  dockerfile:()=>import('highlight.js/lib/languages/dockerfile'),
  makefile:()=>import('highlight.js/lib/languages/makefile'),
  lua:()=>import('highlight.js/lib/languages/lua'),
  r:()=>import('highlight.js/lib/languages/r'),
  powershell:()=>import('highlight.js/lib/languages/powershell'),
  graphql:()=>import('highlight.js/lib/languages/graphql'),
  protobuf:()=>import('highlight.js/lib/languages/protobuf'),
  elixir:()=>import('highlight.js/lib/languages/elixir'),
  erlang:()=>import('highlight.js/lib/languages/erlang'),
  haskell:()=>import('highlight.js/lib/languages/haskell'),
  scala:()=>import('highlight.js/lib/languages/scala'),
};
const loading=new Map<string,Promise<void>>();
export type HighlightedSource={html:string;language:string;plainTail:string;highlightedCharacters:number};

export async function highlightSource(name:string,text:string):Promise<HighlightedSource>{
  const basename=name.split(/[\\/]/).pop()!.toLowerCase();
  const language=/^(?:dockerfile|containerfile)(?:\.|$)/.test(basename)?'dockerfile':/^(?:makefile|gnumakefile)$/.test(basename)?'makefile':languages[basename.split('.').pop()||''];
  if(language&&!hljs.getLanguage(language)&&loaders[language]){
    if(!loading.has(language))loading.set(language,loaders[language]().then(module=>{hljs.registerLanguage(language,module.default);}).catch(error=>{loading.delete(language);throw error;}));
    await loading.get(language);
  }
  let end=Math.min(text.length,200000);
  if(end<text.length){const newline=text.lastIndexOf('\n',end);if(newline>end*0.8)end=newline+1;}
  // Avoid splitting a UTF-16 surrogate pair at the preview boundary.
  if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
  const prefix=text.slice(0,end);
  const detected=language&&hljs.getLanguage(language)?language:hljs.highlightAuto(prefix.slice(0,16000),['javascript','typescript','python','json','bash','xml','yaml','css','sql']).language;
  const result=hljs.highlight(prefix,{language:detected||'plaintext',ignoreIllegals:true});
  return {html:result.value,language:result.language||'plaintext',plainTail:text.slice(end),highlightedCharacters:end};
}
