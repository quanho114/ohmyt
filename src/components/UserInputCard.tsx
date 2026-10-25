import {useEffect,useId,useRef,useState} from 'react';
import {FolderOpen,MessageCircleQuestion,ArrowLeft,ArrowRight,Check} from 'lucide-react';
import {api,type UserInputRequest} from '../api.ts';
import type {Project} from '../types.ts';

export function UserInputCard({request,busy,onRespond,onCancel}:{
  request:UserInputRequest;busy:boolean;
  onRespond:(item:UserInputRequest,answer:Parameters<typeof api.answerUserInput>[1])=>Promise<boolean>;
  onCancel:()=>void;
}){
  const [answers,setAnswers]=useState<Record<string,string>>({}),[projects,setProjects]=useState<Project[]>([]),[error,setError]=useState(''),[picking,setPicking]=useState(false),[directory,setDirectory]=useState('');
  useEffect(()=>{let disposed=false;if(request.kind==='project')void api.getProjects().then(items=>{if(!disposed)setProjects(items);}).catch(e=>{if(!disposed)setError(e instanceof Error?e.message:String(e));});return()=>{disposed=true;};},[request.id,request.kind]);
  const chooseFolder=async()=>{
    setPicking(true);setError('');
    try{
      const selected=window.electronAPI?await window.electronAPI.selectProjectDirectory():directory.trim();
      if(!selected)return;
      const project=await api.addProject(selected);
      await onRespond(request,{projectId:project.id});
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setPicking(false);}
  };
  const [step,setStep]=useState(0);
  const heading=useRef<HTMLLegendElement>(null);
  const questionId=useId();
  const question=request.questions[step];
  const last=step===request.questions.length-1;
  useEffect(()=>{setStep(0);setAnswers({});setError('');},[request.id]);
  useEffect(()=>{if(step>0)heading.current?.focus({preventScroll:true});},[step]);
  const submit=async()=>{
    setError('');
    try{await onRespond(request,{answers:request.questions.map(q=>({id:q.id,answer:answers[q.id]||''}))});}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const disabled=busy||picking;
  return <section className="user-input-card" aria-label="Agent cần bạn trả lời">
    <div className="user-input-heading"><MessageCircleQuestion size={17}/><span>Agent cần bạn trả lời</span></div>
    {request.kind==='project'?<>
      <p>{request.questions[0].question}</p>
      <div className="user-input-options">{projects.map(project=><button type="button" disabled={disabled} key={project.id} onClick={()=>void onRespond(request,{projectId:project.id})}><FolderOpen size={14}/>{project.name}</button>)}</div>
      {!window.electronAPI&&<label className="user-input-field"><span>Đường dẫn thư mục trên máy chạy sky</span><input value={directory} onChange={e=>setDirectory(e.target.value)} placeholder="Đường dẫn tuyệt đối" disabled={disabled}/></label>}
      <div className="user-input-actions"><button type="button" disabled={disabled} onClick={onCancel}>Dừng tác vụ</button><button type="button" disabled={disabled||(!window.electronAPI&&!directory.trim())} onClick={()=>void chooseFolder()}><FolderOpen size={14}/>{picking?'Đang chọn…':'Chọn thư mục'}</button></div>
    </>:<form className="hitl-questionnaire" onSubmit={e=>{
      e.preventDefault();if(disabled)return;
      if(!answers[question.id]?.trim()){setError('Chọn một đáp án hoặc nhập câu trả lời để tiếp tục.');return;}
      setError('');if(!last)setStep(value=>value+1);else void submit();
    }} onKeyDown={e=>{
      if(disabled||e.altKey||e.ctrlKey||e.metaKey||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLInputElement)return;
      const index=e.key.toLowerCase().charCodeAt(0)-97;
      const option=question.options?.[index];
      if(e.key.length===1&&option){e.preventDefault();setAnswers(values=>({...values,[question.id]:option}));}
    }}>
      <div className="questionnaire-progress" aria-label={`Câu ${step+1} trên ${request.questions.length}`}>
        <span>Câu {step+1} / {request.questions.length}</span>
        <div className="questionnaire-progress-track" aria-hidden="true">{request.questions.map((q,index)=><span key={q.id} data-current={index===step} data-complete={Boolean(answers[q.id]?.trim())}/>)}</div>
      </div>
      <fieldset key={question.id} disabled={disabled} className="questionnaire-item">
        <legend ref={heading} tabIndex={-1}>{question.question}</legend>
        <p className="questionnaire-description">{question.options?.length?'Chọn một phương án hoặc viết câu trả lời riêng.':'Cho agent biết thêm để tiếp tục công việc.'}</p>
        {question.options&&<div className="questionnaire-choices">{question.options.map((option,index)=><button type="button" key={option} aria-pressed={answers[question.id]===option} onClick={()=>{setAnswers(values=>({...values,[question.id]:option}));setError('');}}>
          <span className="questionnaire-choice-key" aria-hidden="true">{String.fromCharCode(65+index)}</span><span>{option}</span>{answers[question.id]===option&&<Check size={15} aria-hidden="true"/>}
        </button>)}</div>}
        <label className="questionnaire-custom" htmlFor={questionId}>{question.options?.length?'Câu trả lời khác':'Câu trả lời của bạn'}</label>
        <textarea id={questionId} rows={2} aria-label={question.question} maxLength={16000} placeholder="Nhập câu trả lời…" value={question.options?.includes(answers[question.id])?'':answers[question.id]||''} onChange={e=>{setAnswers(values=>({...values,[question.id]:e.target.value}));setError('');}}/>
      </fieldset>
      <div className="questionnaire-actions">
        <button type="button" className="questionnaire-cancel" disabled={disabled} onClick={onCancel}>Dừng tác vụ</button>
        <div>
          {step>0&&<button type="button" disabled={disabled} onClick={()=>{setStep(value=>value-1);setError('');}}><ArrowLeft size={14}/>Quay lại</button>}
          <button type="submit" className="questionnaire-primary" disabled={disabled||!answers[question.id]?.trim()||(last&&request.questions.some(q=>!answers[q.id]?.trim()))}>{busy?'Đang gửi…':last?'Trả lời và tiếp tục':'Tiếp'}{!busy&&<ArrowRight size={14}/>}</button>
        </div>
      </div>
    </form>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
