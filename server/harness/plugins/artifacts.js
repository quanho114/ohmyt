export function artifactsPlugin({artifacts,sessions}){
  return {name:'artifacts/store',inject:['tools','artifacts'],apply:ctx=>ctx.effect(()=>ctx.tools.register({name:'artifact_save',scopes:['standalone','project'],description:'Save a generated text document as a scoped downloadable artifact.',parameters:{type:'object',properties:{title:{type:'string',maxLength:200},mime:{type:'string',enum:['text/plain','text/markdown','text/html','application/json','image/svg+xml']},content:{type:'string'}},required:['title','mime','content'],additionalProperties:false},execute:async(args,context)=>{
      const artifact=artifacts.save({...args,userMessageId:sessions.get(context.runId)?.user_message_id,sessionId:context.sessionId,scopeId:context.scopeId});
      sessions.record(context.runId,{eventId:`${artifact.artifactId}:saved`,type:'artifact/update',payload:{turnId:context.runId,...artifact}});return {artifact,sessionId:context.sessionId};
    }}))};
}
