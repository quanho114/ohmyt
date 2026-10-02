export class PermissionEngine {
  constructor(db) {
    this.db = db;
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, details }
  }

  // Convert pattern with wildcards (*) to RegExp
  patternToRegex(pattern) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
  }

  evaluate(toolName, target = '') {
    const fullTarget = `${toolName}:${target}`.trim();
    const policies = this.db.getPolicies();

    let matchedAction = null;

    // Check DENY first
    for (const pol of policies) {
      if (pol.action === 'DENY') {
        const rx = this.patternToRegex(pol.pattern);
        if (rx.test(fullTarget) || rx.test(toolName)) {
          return { action: 'DENY', matchedPolicy: pol.pattern, target: fullTarget };
        }
      }
    }

    // Check ASK next
    for (const pol of policies) {
      if (pol.action === 'ASK') {
        const rx = this.patternToRegex(pol.pattern);
        if (rx.test(fullTarget) || rx.test(toolName)) {
          matchedAction = 'ASK';
          return { action: 'ASK', matchedPolicy: pol.pattern, target: fullTarget };
        }
      }
    }

    // Check ALLOW
    for (const pol of policies) {
      if (pol.action === 'ALLOW') {
        const rx = this.patternToRegex(pol.pattern);
        if (rx.test(fullTarget) || rx.test(toolName)) {
          matchedAction = 'ALLOW';
          return { action: 'ALLOW', matchedPolicy: pol.pattern, target: fullTarget };
        }
      }
    }

    // Default fallback: ASK for any unspecified mutation/tool
    return { action: 'ASK', matchedPolicy: 'default_fallback', target: fullTarget };
  }

  requestApproval({ runId, toolName, target, input, description }) {
    const requestId = 'req_' + Math.random().toString(36).substring(2, 10);
    let resolver, rejecter;
    const promise = new Promise((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
    });

    const timeout = setTimeout(() => {
      if (this.pendingRequests.has(requestId)) {
        this.pendingRequests.delete(requestId);
        rejecter(new Error(`Permission request ${requestId} timed out after 120s`));
      }
    }, 120000);

    this.pendingRequests.set(requestId, {
      requestId,
      runId,
      toolName,
      target,
      input,
      description,
      timeout,
      resolve: resolver,
      reject: rejecter
    });

    return { requestId, promise };
  }

  resolveApproval(requestId, decision) {
    const req = this.pendingRequests.get(requestId);
    if (!req) {
      throw new Error(`Permission request ${requestId} not found or expired`);
    }

    clearTimeout(req.timeout);
    this.pendingRequests.delete(requestId);

    if (decision === 'ALLOW_ALWAYS') {
      // Persist rule to database
      const pattern = `${req.toolName}:*`;
      this.db.setPolicy(pattern, 'ALLOW');
      req.resolve({ allowed: true, decision: 'ALLOW_ALWAYS' });
    } else if (decision === 'ALLOW_ONCE') {
      req.resolve({ allowed: true, decision: 'ALLOW_ONCE' });
    } else {
      req.resolve({ allowed: false, decision: 'DENY' });
    }
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
