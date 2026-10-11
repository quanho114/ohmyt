import type {ReactNode} from 'react';
export type ClientSlot='settings.section'|'activity.renderer'|'artifact.renderer'|'sidepanel.view';
export interface Contribution {id:string;slot:ClientSlot;priority:number;render:(data:unknown)=>ReactNode;matches?:(data:unknown)=>boolean;owner?:string}
export class ClientRegistry {
  private contributions=new Map<string,Contribution>();
  registerContribution(owner:string,definition:Contribution){if(!owner||!definition.id||!['settings.section','activity.renderer','artifact.renderer','sidepanel.view'].includes(definition.slot)||this.contributions.has(definition.id)||typeof definition.render!=='function')throw new Error('Invalid or duplicate client contribution');const item={...definition,owner};this.contributions.set(item.id,item);return ()=>{if(this.contributions.get(item.id)===item)this.contributions.delete(item.id);};}
  list(slot:ClientSlot){return [...this.contributions.values()].filter(item=>item.slot===slot).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));}
}
export const clientRegistry=new ClientRegistry();
