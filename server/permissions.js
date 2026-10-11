export class PermissionEngine {
  constructor(db) {
    this.db = db;
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, details }
  }

  // Convert pattern with wildcards (*) to RegExp
  patternToRegex(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'is');
  }

  evaluate(toolName, target = '', scope = null, policyTarget = target, input = null) {
    const fullTarget = `${toolName}:${target}`.trim();
    // Coordinate mutations must respect explicit denials for their DOM equivalents.
    let equivalentTool;
    if(toolName==='browser_open')equivalentTool='browser_navigate';
    if (toolName === 'browser_act') {
      equivalentTool = {click:'browser_click',drag:'browser_click',type:'browser_type',keypress:'browser_type',scroll:'browser_scroll'}[input?.action];
    }
    const equivalentTarget = equivalentTool ? `${equivalentTool}:${target}` : null;
    const actionTarget = `${toolName}:${policyTarget}`.trim();
    let policies = this.db.getPolicies();
    policies = [...policies, {pattern:'skill_load:*',action:'ALLOW'},{pattern:'subagent_wait:*',action:'ALLOW'},{pattern:'subagent_cancel:*',action:'ALLOW'}];
    if (scope?.projectId) {
      if (this.extensionCapabilities?.has(toolName)&&this.extensionCapabilities.get(toolName)!==scope.scopeId)return {action:'DENY',matchedPolicy:'connector-scope'};
      if (!this.extensionCapabilities?.has(toolName)&&!['fs_read','fs_list','fs_write','shell_exec','shell_host','memory_save','memory_search','skill_load','artifact_save','ptc_execute','subagent_spawn','subagent_wait','subagent_cancel','runtime_info','browser_open','browser_tabs','browser_read','browser_click','browser_type','browser_scroll','browser_navigate','browser_observe','browser_act', 'web_search'].includes(toolName)) return {action:'DENY', matchedPolicy:'project-boundary'};
      const defaults = [{pattern:'subagent_wait:*',action:'ALLOW'},{pattern:'subagent_cancel:*',action:'ALLOW'},{pattern:'fs_read:*',action:'ALLOW'},{pattern:'fs_list:*',action:'ALLOW'},{pattern:'fs_write:*',action:'ALLOW'},{pattern:'memory_*:*',action:'ALLOW'},{pattern:'runtime_info:*',action:'ALLOW'},{pattern:'skill_load:*',action:'ALLOW'}];
      policies = [...policies.filter(p => p.action === 'DENY'), ...this.db.getScopedPolicies(scope.scopeId).map(p=>({...p,literal:true})), ...defaults];
    } else if (scope) {
      const scoped = this.db.getScopedPolicies ? this.db.getScopedPolicies(scope.scopeId).map(p => ({ ...p, literal: true })) : [];
      policies = [...scoped, ...policies];
    }

    let matchedAction = null;

    // Check DENY first
    for (const pol of policies) {
      if (pol.action === 'DENY') {
        const rx = this.patternToRegex(pol.pattern);
        if (pol.literal ? (pol.pattern === fullTarget || equivalentTarget && pol.pattern === equivalentTarget) : (rx.test(fullTarget) || rx.test(toolName) || equivalentTool && (rx.test(equivalentTarget) || rx.test(equivalentTool)))) {
          return { action: 'DENY', matchedPolicy: pol.pattern, target: fullTarget };
        }
      }
    }

    // Check ASK next
    if (scope?.approvalMode === 'full') return { action: 'ALLOW', matchedPolicy: 'full-access', target: fullTarget };
    if (policies.some(pol => pol.literal && pol.action === 'ALLOW' && pol.pattern === actionTarget)) return { action: 'ALLOW', matchedPolicy: 'exact-scoped-grant', target: fullTarget };
    if (scope?.approvalMode && toolName.startsWith('web_') && !policies.some(pol => pol.literal && pol.action === 'ALLOW' && pol.pattern === actionTarget)) return { action: 'ASK', matchedPolicy: 'network-access', target: fullTarget };
    for (const pol of policies) {
      if (pol.action === 'ASK') {
        const rx = this.patternToRegex(pol.pattern);
        if (pol.literal ? pol.pattern === fullTarget : (rx.test(fullTarget) || rx.test(toolName))) {
          matchedAction = 'ASK';
          return { action: 'ASK', matchedPolicy: pol.pattern, target: fullTarget };
        }
      }
    }

    // Check ALLOW
    for (const pol of policies) {
      if (pol.action === 'ALLOW') {
        const rx = this.patternToRegex(pol.pattern);
        if (pol.literal ? pol.pattern === actionTarget : (rx.test(fullTarget) || rx.test(toolName))) {
          matchedAction = 'ALLOW';
          return { action: 'ALLOW', matchedPolicy: pol.pattern, target: fullTarget };
        }
      }
    }

    // Default fallback: ASK for any unspecified mutation/tool
    return { action: 'ASK', matchedPolicy: 'default_fallback', target: fullTarget };
  }

  requestApproval({ runId, toolName, target, input, description, scope = null, policyTarget = target }) {
    const requestId = 'req_' + Math.random().toString(36).substring(2, 10);
    let resolver;
    const promise = new Promise(resolve => {
      resolver = resolve;
    });
    this.pendingRequests.set(requestId, {
      requestId,
      scope,
      runId,
      toolName,
      target,
      policyTarget,
      input,
      description,
      resolve: resolver,
    });

    return { requestId, promise };
  }

  resolveApproval(requestId, decision) {
    const req = this.pendingRequests.get(requestId);
    if (!req) {
      throw new Error(`Permission request ${requestId} not found or expired`);
    }

    this.pendingRequests.delete(requestId);

    if (decision === 'ALLOW_ALWAYS') {
      // Persist rule to database
      const pattern = `${req.toolName}:*`;
      if (req.scope) this.db.setScopedPolicy(req.scope.scopeId, `${req.toolName}:${req.policyTarget}`, 'ALLOW');
      else this.db.setPolicy(pattern, 'ALLOW');
      req.resolve({ allowed: true, decision: 'ALLOW_ALWAYS' });
    } else if (decision === 'ALLOW_ONCE') {
      req.resolve({ allowed: true, decision: 'ALLOW_ONCE' });
    } else {
      req.resolve({ allowed: false, decision: 'DENY' });
    }
  }

  cancelForRun(runId) {
    for (const [id, req] of this.pendingRequests) if (req.runId === runId) { this.pendingRequests.delete(id); req.resolve({allowed:false, decision:'DENY'}); }
  }

  getPendingRequests(runId = null) {
    const list = [];
    for (const [id, req] of this.pendingRequests.entries()) {
      if (!runId || req.runId === runId) {
        list.push({
          requestId: id,
          runId: req.runId,
          toolName: req.toolName,
          target: req.target,
          input: req.input,
          description: req.description
        });
      }
    }
    return list;
  }
}
