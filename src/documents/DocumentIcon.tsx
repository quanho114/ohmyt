import { FileText, Folder, FolderOpen } from 'lucide-react';

export function DocumentIcon({name,directory=false,expanded=false}:{name:string;directory?:boolean;expanded?:boolean}) {
  if(directory){const Icon=expanded?FolderOpen:Folder;return <Icon size={17} className="document-folder-icon" aria-hidden="true"/>;}
  const ext=name.split('.').pop()?.toLowerCase();
  const types:Record<string,{label:string;kind:string}>={docx:{label:'W',kind:'word'},doc:{label:'W',kind:'word'},xlsx:{label:'X',kind:'excel'},xls:{label:'X',kind:'excel'},pptx:{label:'P',kind:'powerpoint'},ppt:{label:'P',kind:'powerpoint'},pdf:{label:'PDF',kind:'pdf'},md:{label:'M↓',kind:'markdown'}};
  const type=ext?types[ext]:undefined;
  return type?<span className={`document-type-icon document-type-${type.kind}`} data-document-type={type.kind} aria-hidden="true">{type.label}</span>:<FileText size={17} aria-hidden="true"/>;
}
