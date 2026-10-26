import {useMemo,type RefObject,type UIEventHandler} from 'react';
import hljs from 'highlight.js/lib/core';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import './LiveHtmlPreview.css';

hljs.registerLanguage('xml',xml);
hljs.registerLanguage('css',css);
hljs.registerLanguage('javascript',javascript);

// Balance highlighter spans across visual rows without changing source text.
function highlightedLines(html:string):string[] {
  const stack:string[]=[];
  const lines:string[]=[];
  let line='';
  for(const part of html.split(/(<span[^>]*>|<\/span>|\n)/g)){
    if(part==='\n'){lines.push(line+'</span>'.repeat(stack.length));line=stack.join('');}
    else {line+=part;if(part.startsWith('<span'))stack.push(part);else if(part==='</span>')stack.pop();}
  }
  lines.push(line+'</span>'.repeat(stack.length));return lines;
}

export function HtmlCode({content,className='',codeRef,onScroll,id}:{content:string;className?:string;codeRef?:RefObject<HTMLPreElement|null>;onScroll?:UIEventHandler<HTMLPreElement>;id?:string}) {
  const lines=useMemo(()=>highlightedLines(hljs.highlight(content,{language:'xml',ignoreIllegals:true}).value),[content]);
  return <pre id={id} className={`html-code-view ${className}`} ref={codeRef} tabIndex={0} role="tabpanel" aria-label="Code HTML" onScroll={onScroll}>
    <code>{lines.map((line,index)=><span className="html-code-row" key={index}><span className="html-code-gutter" aria-hidden="true">{index+1}</span><span className="html-code-source" dangerouslySetInnerHTML={{__html:line||' '}}/></span>)}</code>
  </pre>;
}
