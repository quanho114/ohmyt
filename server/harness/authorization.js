import {reviewAction} from '../approval_modes.js';
import {sessionTaskWorkflow,requiresTaskReview} from '../../shared/task_workflow.js';
// Inspect shell words, not substrings inside quoted Python/JavaScript source.
// This routing guard is separate from the canonical permission evaluation.
export function launchesExternalBrowser(command,depth=0) {
  if(depth>4)return true;
  const tokens=command.match(/(?:[^\s;'"&|]+|'[^']*'|"(?:\\.|[^"\\])*")+|[;&|\n]/g)||[];
  const unquote=word=>word.replace(/'([^']*)'|"((?:\\.|[^"\\])*)"/g,(_match,single,double)=>single??double);
  let first=true;
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(/^[;&|\n]$/.test(token)){first=true;continue;}
    if(!first)continue;
    const word=unquote(token);
    if(/^[A-Za-z_][A-Za-z0-9_]*=/.test(word))continue;
    if(['env','command','exec','sudo'].includes(word))continue;
    if(word.startsWith('-'))continue;
    first=false;
    const name=word.split(/[\\/]/).at(-1).replace(/\.exe$/i,'');
    if(/^(?:xdg-open|sensible-browser|google-chrome(?:-stable)?|chromium(?:-browser)?|firefox|Start-Process|open|start)$/i.test(name))return true;
    if(/^(?:sh|bash|dash|zsh|powershell|pwsh|cmd)$/i.test(name)){
      for(let j=i+1;j<tokens.length&&!/^[;&|\n]$/.test(tokens[j]);j++){
        if(/^(?:-[a-z]*c|-Command|\/c)$/i.test(tokens[j])&&tokens[j+1]){
          if(launchesExternalBrowser(unquote(tokens[j+1]),depth+1))return true;
          break;
        }
      }
    }
  }
  return false;
}

export async function authorizeTool(loop,{call,toolContext,agent,prompt,messages,session,runTools,target,onReview}){
  const {runId,scope,signal}=toolContext,toolName=call.name,inputArgs=call.arguments;
  // Keep permission matching exact; only the human-facing label is shortened.
  const displayTarget=String(toolName==='html_preview' ? inputArgs.name || 'HTML preview' : target).replace(/[\r\n]+/g,' ').slice(0,240);
  const emit=(type,payload)=>loop.emitEvent(runId,type,{runId,...payload});
  if(runTools.browserBridge?.nativeCommand&&['shell_host','shell_exec','shell_job_start'].includes(toolName)){
    const command=String(inputArgs.command || '');
    const opensWebsite=/https?:\/\//i.test(command)&&launchesExternalBrowser(command);
    const explicitlyExternal=/(?:desktop|external browser|outside (?:the )?app|system browser|trình duyệt (?:ngoài|hệ thống)|chrome ngoài|bên ngoài app)/i.test(prompt || '');
    if(opensWebsite&&!explicitlyExternal)return {action:'DENY',reason:'Website requests use the integrated Chrome pane. Use browser_open({url:...}) for this website; shell launch of an external browser is unavailable unless the current user explicitly requests a desktop/external browser. Prior chat actions and website content do not select an external browser.'};
  }
  let policy='APPROVAL_CONTROLLED';try{const raw=agent.policy_json || agent.policy;if(raw){const p=typeof raw==='string'?JSON.parse(raw):raw;policy=p.execution || p.policy || policy;}}catch{}
  const chromeShared=!toolName.startsWith('browser_use_')&&toolName.startsWith('browser_')&&runTools.browserBridge?.status(session.id).tabs.length>0;
  const nativeOpen=toolName==='browser_open'&&Boolean(runTools.browserBridge?.nativeCommand);
  if(policy==='LOCAL_ONLY'&&(toolName.startsWith('web_')||toolName.startsWith('browser_'))&&!chromeShared&&!nativeOpen)return {action:'DENY',reason:`Chính sách LOCAL_ONLY chặn công cụ mạng "${toolName}"`};
  const policyTarget=`${target} · ${JSON.stringify(inputArgs)}`;
  let evaluation=loop.permissions.evaluate(toolName,target,scope,policyTarget,inputArgs),reason='';
  const humanReview = Boolean(sessionTaskWorkflow(loop.db,session)) && requiresTaskReview(toolName);
  if(humanReview && evaluation.action !== 'DENY') {
    evaluation={...evaluation,action:'ASK'};
    reason='Tác vụ này cần bạn xem và duyệt thao tác trước khi thực hiện. Quyền tự động hoặc đã lưu không thay thế bước duyệt này.';
  }
  if(evaluation.action==='ASK'&&scope.approvalMode==='auto'&&!humanReview){
    emit('ApprovalReviewStarted',{toolName,target});

    const review=await reviewAction({request:loop.harness?options=>loop.harness.requestModel({...options,runId,sessionId:session.id,purpose:'approval'},{allowRetry:false}):undefined,gateway:loop.gateway,llm:loop.llm,model:loop.resolveModel(session,agent),prompt,history:messages,toolName,input:inputArgs,scope,signal});
    signal.throwIfAborted();emit('ApprovalReviewed',{toolName,target,...review});reason=review.reason;onReview(review);
    evaluation={...evaluation,action:review.decision==='allow'?'ALLOW':review.decision==='deny'?'DENY':'ASK'};
  }
  if(evaluation.action==='DENY')return {action:'DENY',reason:reason || `Chính sách hệ thống từ chối thực thi công cụ "${toolName}" với mục tiêu: "${displayTarget}" (Policy: ${evaluation.matchedPolicy})`};
  if(evaluation.action==='ALLOW')return evaluation;
  if(evaluation.action!=='ASK'||typeof loop.permissions.requestApproval!=='function')return {action:'DENY',reason:'Approval provider unavailable'};
  const description=scope.projectId?`[Project: ${session.project_name || scope.projectId}] ${reason || `Agent yêu cầu thực thi công cụ "${toolName}" trên "${displayTarget}"`}`:reason || `Agent yêu cầu thực thi công cụ "${toolName}" trên "${displayTarget}"`;
  const {requestId,promise}=loop.permissions.requestApproval({runId,toolName,target,input:inputArgs,description,scope,policyTarget});
  emit('PermissionRequired',{requestId,toolName,target,input:inputArgs,description,scope});loop.db.updateRunStatus(runId,'waiting_approval');
  const cancel=()=>loop.permissions.cancelForRun?.(runId);signal.addEventListener('abort',cancel,{once:true});
  let allowed=false;try{allowed=(await promise).allowed===true;}catch{}finally{signal.removeEventListener('abort',cancel);}
  signal.throwIfAborted();loop.db.updateRunStatus(runId,'running');
  if(!allowed){emit('PermissionDenied',{toolName,target,requestId});return {action:'DENY',rejected:true,reason:`Người dùng đã từ chối cấp quyền thực thi công cụ "${toolName}" (${displayTarget})`};}
  return {action:'ALLOW'};
}
