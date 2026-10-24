import {zipSync,unzipSync,strFromU8,strToU8} from 'fflate';
import {read as xlsxRead,write as xlsxWrite,utils as xlsxUtils} from 'xlsx';

// Minimal Office Open XML authoring and extraction for agent tools. The
// produced packages are standard zip containers with the parts Word and Excel
// expect; reading back through this module is the round-trip verification.
const XML_HEADER='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const escXml=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const OFFICE_LIMIT=8*1024*1024;

export function isOfficePath(path){
  return typeof path==='string'&&/\.(docx|xlsx)$/i.test(path);
}

export function buildDocx({title=null,paragraphs=[]}={}){
  if(!Array.isArray(paragraphs)||paragraphs.length>500)throw new Error('Docx needs up to 500 paragraphs');
  const lines=[];
  if(typeof title==='string'&&title.trim())lines.push(title.trim());
  for(const paragraph of paragraphs){
    if(typeof paragraph!=='string'||paragraph.length>20000)throw new Error('Each docx paragraph must be text up to 20000 chars');
    lines.push(paragraph);
  }
  if(!lines.length)throw new Error('Docx needs a title or at least one paragraph');
  const body=lines.map(text=>`<w:p><w:r><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`).join('');
  const files={
    '[Content_Types].xml':strToU8(`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    '_rels/.rels':strToU8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml':strToU8(`${XML_HEADER}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`)
  };
  return Buffer.from(zipSync(files,{level:6}));
}

function docxParagraphs(documentXml){
  const body=documentXml.split('<w:body>')[1]?.split('</w:body>')[0] ?? '';
  const paragraphs=[];
  for(const match of body.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)){
    const texts=[...match[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(t=>t[1]).join('');
    paragraphs.push(texts.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
  }
  return paragraphs;
}

export function buildXlsx({sheets=[]}={}){
  if(!Array.isArray(sheets)||!sheets.length||sheets.length>20)throw new Error('Xlsx needs 1-20 sheets');
  const workbook=xlsxUtils.book_new();
  for(const sheet of sheets){
    if(!sheet||typeof sheet.name!=='string'||!/^[^\\/?*[\]:]+$/.test(sheet.name)||sheet.name.length>31)throw new Error('Sheet names must be 1-31 chars without \\ / ? * [ ] :');
    if(!Array.isArray(sheet.rows)||sheet.rows.length>10000)throw new Error('Each sheet needs up to 10000 rows');
    const normalized=sheet.rows.map(row=>{
      if(!Array.isArray(row))throw new Error('Sheet rows must be arrays of cells');
      if(row.length>200)throw new Error('Sheet rows support up to 200 cells');
      return row.map(cell=>{
        if(cell===null||cell===undefined)return null;
        if(typeof cell==='string')return cell.length>5000?cell.slice(0,5000):cell;
        if(typeof cell==='number'&&Number.isFinite(cell))return cell;
        if(typeof cell==='boolean')return cell;
        throw new Error('Sheet cells must be text, numbers or booleans');
      });
    });
    xlsxUtils.book_append_sheet(workbook,xlsxUtils.aoa_to_sheet(normalized),sheet.name);
  }
  return Buffer.from(xlsxWrite(workbook,{type:'buffer',bookType:'xlsx'}));
}

export function readOffice(buffer,path){
  if(Buffer.byteLength(buffer)>OFFICE_LIMIT)throw new Error('Office file exceeds the 8MB tool limit');
  const lower=path.toLowerCase();
  if(lower.endsWith('.docx')){
    const files=unzipSync(new Uint8Array(buffer));
    const document=files['word/document.xml'];
    if(!document)throw new Error('Not a valid docx package: word/document.xml missing');
    const paragraphs=docxParagraphs(strFromU8(document));
    return {kind:'docx',paragraphs,text:paragraphs.join('\n\n'),parts:Object.keys(files)};
  }
  if(lower.endsWith('.xlsx')){
    const workbook=xlsxRead(buffer,{type:'buffer'});
    const sheets=workbook.SheetNames.map(name=>{
      const rows=xlsxUtils.sheet_to_json(workbook.Sheets[name],{header:1,blankrows:false,defval:null});
      return {name,rows,rowCount:rows.length};
    });
    return {kind:'xlsx',sheetNames:workbook.SheetNames,sheets};
  }
  throw new Error('Office tools support .docx and .xlsx files');
}

export function appendDocxParagraphs(buffer,paragraphs){
  if(!Array.isArray(paragraphs)||!paragraphs.length||paragraphs.length>200)throw new Error('Append needs 1-200 paragraphs');
  for(const paragraph of paragraphs)if(typeof paragraph!=='string'||!paragraph.trim()||paragraph.length>20000)throw new Error('Each appended paragraph must be non-empty text up to 20000 chars');
  const files=unzipSync(new Uint8Array(buffer));
  const document=strFromU8(files['word/document.xml']);
  if(!document?.includes('</w:body>'))throw new Error('Not a valid docx package: word/document.xml missing');
  const additions=paragraphs.map(text=>`<w:p><w:r><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`).join('');
  files['word/document.xml']=strToU8(document.replace('</w:body>',`${additions}</w:body>`));
  return Buffer.from(zipSync(files,{level:6}));
}

const CELL_ADDRESS=/^([A-Z]{1,2})([1-9][0-9]{0,6})$/;
export function editXlsxCell(buffer,{sheet=null,cell,value}){
  const match=typeof cell==='string'?cell.match(CELL_ADDRESS):null;
  if(!match)throw new Error('Cell must be A1 notation like B2');
  if(value!==null&&value!==undefined&&!['string','number','boolean'].includes(typeof value))throw new Error('Cell value must be text, a number, a boolean or null');
  if(typeof value==='string'&&value.length>5000)throw new Error('Cell value supports up to 5000 chars');
  const column=xlsxUtils.decode_col(match[1]);
  if(column>16383||Number(match[2])>1048576)throw new Error('Cell is outside the sheet bounds');
  const workbook=xlsxRead(buffer,{type:'buffer'});
  const sheetName=sheet===null||sheet===undefined?workbook.SheetNames[0]:sheet;
  if(!workbook.SheetNames.includes(sheetName))throw new Error(`Sheet not found: ${sheetName}`);
  const target=workbook.Sheets[sheetName];
  if(value===null||value===undefined)delete target[cell];
  else target[cell]={t:typeof value==='boolean'?'b':typeof value==='number'?'n':'s',v:value};
  return Buffer.from(xlsxWrite(workbook,{type:'buffer',bookType:'xlsx'}));
}
