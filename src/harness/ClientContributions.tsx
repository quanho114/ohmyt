import React from 'react';
import {clientRegistry,type ClientSlot} from './clientRegistry.ts';
export function ClientContributions({slot,data}:{slot:ClientSlot;data:unknown}){
 return <>{clientRegistry.list(slot).filter(c=>!c.matches||c.matches(data)).map(c=><ContributionBoundary key={c.id}>{c.render(data)}</ContributionBoundary>)}</>;
}
class ContributionBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?null:this.props.children;}}
