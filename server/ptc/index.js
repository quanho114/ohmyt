import {NodePtcRuntime} from './node.js';

// Trusted boot-time provider. RPC must use the host's scoped invocation callback.
export class PtcService {
  constructor(provider) {
    for(const method of ['probe','execute','cancel','dispose'])if(typeof provider?.[method]!=='function')throw new Error(`PTC provider requires ${method}()`);
    this.provider=provider;
    this.closed=false;
  }
  async probe() {
    if(this.closed)return {available:false,reason:'PTC disposed'};
    const status=await this.provider.probe();
    return this.closed ? {available:false,reason:'PTC disposed'} : status;
  }
  async execute({code,signal,wallTimeMs=30000,maxSubcalls=20,context}={}) {
    if(this.closed)throw new Error('PTC disposed');
    signal?.throwIfAborted();
    if(typeof code!=='string'||Buffer.byteLength(code)>100000||!Number.isSafeInteger(wallTimeMs)||wallTimeMs<1||wallTimeMs>30000||!Number.isSafeInteger(maxSubcalls)||maxSubcalls<1||maxSubcalls>20)throw new Error('Invalid PTC limits or program');
    const status=await this.probe();
    if(status.available!==true)throw new Error(`PTC unavailable: ${status.reason || 'provider not ready'}`);
    if(this.closed)throw new Error('PTC disposed');
    signal?.throwIfAborted();
    return this.provider.execute({code,signal,wallTimeMs,maxSubcalls,context});
  }
  cancel(runId) { return this.provider.cancel(runId); }
  dispose() {
    this.closed=true;
    return this.disposeTask ||= Promise.resolve().then(()=>this.provider.dispose());
  }
}

export function ptcRuntimePlugin({call,providerFactory=options=>new NodePtcRuntime(options)}) {
  return {name:'core/ptcRuntime',apply:ctx=>{
    const service=new PtcService(providerFactory({call}));
    ctx.provide('ptcRuntime',service);
    ctx.effect(()=>()=>service.dispose());
  }};
}
