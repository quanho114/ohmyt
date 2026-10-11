import {reviewAction} from '../approval_modes.js';
export async function authorizeTool(loop,{call,toolContext,agent,prompt,messages,session,runTools,target,onReview}){
  const {runId,scope,signal}=toolContext,toolName=call.name,inputArgs=call.arguments;
  const emit=(type,payload)=>loop.emitEvent(runId,type,{runId,...payload});
  if(runTools.browserBridge?.nativeCommand&&['shell_host','shell_exec'].includes(toolName)){
    const command=String(inputArgs.command || '');
    const opensWebsite=/https?:\/\//i.test(command)&&/(?:xdg-open|sensible-browser|google-chrome|chromium|firefox|Start-Process|(?:^|[;&|\s])(?:open|start)(?:\s|$))/i.test(command);
    const explicitlyExternal=/(?:desktop|external browser|outside (?:the )?app|system browser|trình duyệt (?:ngoài|hệ thống)|chrome ngoài|bên ngoài app)/i.test(prompt || '');
    if(opensWebsite&&!explicitlyExternal)return {action:'DENY',reason:'Website requests use the integrated Chrome pane. Use browser_open({url:...}) for this website; shell launch of an external browser is unavailable unless the current user explicitly requests a desktop/external browser. Prior chat actions and website content do not select an external browser.'};
  }
  let policy='APPROVAL_CONTROLLED';try{const raw=agent.policy_json || agent.policy;if(raw){const p=typeof raw==='string'?JSON.parse(raw):raw;policy=p.execution || p.policy || policy;}}catch{}
  const chromeShared=!toolName.startsWith('browser_use_')&&toolName.startsWith('browser_')&&runTools.browserBridge?.status(session.id).tabs.length>0;
  const nativeOpen=toolName==='browser_open'&&Boolean(runTools.browserBridge?.nativeCommand);
  if(policy==='LOCAL_ONLY'&&(toolName.startsWith('web_')||toolName.startsWith('browser_'))&&!chromeShared&&!nativeOpen)return {action:'DENY',reason:`Chính sách LOCAL_ONLY chặn công cụ mạng "${toolName}"`};
  const policyTarget=`${target} · ${JSON.stringify(inputArgs)}`;
  let evaluation=loop.permissions.evaluate(toolName,target,scope,policyTarget,inputArgs),reason='';
  if(evaluation.action==='ASK'&&scope.approvalMode==='auto'){
    emit('ApprovalReviewStarted',{toolName,target});
    loop.harness?.runContexts.get(runId)?.budget.consume('requests');
    const review=await reviewAction({gateway:loop.gateway,llm:loop.llm,model:loop.resolveModel(session,agent),prompt,history:messages,toolName,input:inputArgs,scope,signal});
    signal.throwIfAborted();emit('ApprovalReviewed',{toolName,target,...review});reason=review.reason;onReview(review);
    evaluation={...evaluation,action:review.decision==='allow'?'ALLOW':review.decision==='deny'?'DENY':'ASK'};
  }
  if(evaluation.action==='DENY')return {action:'DENY',reason:reason || `Chính sách hệ thống từ chối thực thi công cụ "${toolName}" với mục tiêu: "${target}" (Policy: ${evaluation.matchedPolicy})`};
  if(evaluation.action==='ALLOW')return evaluation;
  if(evaluation.action!=='ASK'||typeof loop.permissions.requestApproval!=='function')return {action:'DENY',reason:'Approval provider unavailable'};
  const description=scope.projectId?`[Project: ${session.project_name || scope.projectId}] ${reason || `Agent yêu cầu thực thi công cụ "${toolName}" trên "${target}"`}`:reason || `Agent yêu cầu thực thi công cụ "${toolName}" trên "${target}"`;
  const {requestId,promise}=loop.permissions.requestApproval({runId,toolName,target,input:inputArgs,description,scope,policyTarget});
  emit('PermissionRequired',{requestId,toolName,target,input:inputArgs,description,scope});loop.db.updateRunStatus(runId,'waiting_approval');
  const cancel=()=>loop.permissions.cancelForRun?.(runId);signal.addEventListener('abort',cancel,{once:true});
  let allowed=false;try{allowed=(await promise).allowed===true;}catch{}finally{signal.removeEventListener('abort',cancel);}
  signal.throwIfAborted();loop.db.updateRunStatus(runId,'running');
  if(!allowed){emit('PermissionDenied',{toolName,target,requestId});return {action:'DENY',rejected:true,reason:`Người dùng đã từ chối cấp quyền thực thi công cụ "${toolName}" (${target})`};}
  return {action:'ALLOW'};
}
