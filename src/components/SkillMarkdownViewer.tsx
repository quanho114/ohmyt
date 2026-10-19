import {Children,isValidElement} from 'react';
import {ContentBlock} from './ContentBlock.tsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {Appearance} from '../appearance.ts';

interface SkillMarkdownViewerProps {
  markdown:string;
  appearance:Appearance;
  activeTheme:'light'|'dark';
}

export function SkillMarkdownViewer({markdown,appearance,activeTheme}:SkillMarkdownViewerProps){
  if(!markdown.trim())return <p className="text-sm text-tertiary">Chưa có hướng dẫn cho kỹ năng này.</p>;
  return <div className="skill-markdown-viewer"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{pre:({children})=>{
    const child=Children.toArray(children)[0];
    if(isValidElement<{className?:string;children?:unknown}>(child)){
      const language=child.props.className?.match(/(?:^|\s)language-([^\s]+)/)?.[1];
      if(language)return <ContentBlock language={language} code={String(child.props.children ?? '').replace(/\n$/,'')} appearance={appearance} activeTheme={activeTheme} preview={language.toLowerCase()==='mermaid'}/>;
    }
    return <pre>{children}</pre>;
  },img:({alt})=><span className="text-tertiary">{alt || "Image"}</span>,a:({children,...props})=><a {...props} target="_blank" rel="noopener noreferrer">{children}</a>}}>{markdown}</ReactMarkdown></div>;
}
