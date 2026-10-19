import {randomUUID} from 'node:crypto';
import {GoalError,GoalId,GOAL_CHANGE_VERSION} from './runtime.js';
import {goalChangeRef} from './fold.js';
const SessionSeq = value => value;
const agentEvents = (ctx, agent) => ({emit:(type,payload)=>ctx.emit(type,{agent,...payload})});
/** Validate a caller-visible positive safe-integer round cap. */
function resolveMaxGoalRounds(value        )         {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new GoalError('maxGoalRounds must be a positive safe integer', 'GOAL_INVALID_MAX_ROUNDS')
  }
  return value
}

/** Validate and normalize an objective at the domain boundary. */
function resolveObjective(value        )         {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GoalError('goal objective must be a non-empty string', 'GOAL_INVALID_OBJECTIVE')
  }
  return value.trim()
}

/** Materialize deployment defaults and validate one create request. */
function resolveCreateGoal(request                   , defaultMaxGoalRounds        )                     {
  return {
    objective: resolveObjective(request.objective),
    maxGoalRounds: resolveMaxGoalRounds(request.maxGoalRounds ?? defaultMaxGoalRounds),
  }
}

/** Validate and detach one policy-owned blocker explanation. */
function resolveBlockReason(reason         )                  {
  const record = typeof reason === 'object' && reason !== null && !Array.isArray(reason)
    ? reason                           
    : undefined
  const code = record?.['code']
  const message = record?.['message']
  if (typeof code !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(code)
    || typeof message !== 'string' || message.trim().length === 0) {
    throw new GoalError(
      'goal block reason requires a lower-kebab-case code and a non-empty message',
      'GOAL_INVALID_BLOCK_REASON',
    )
  }
  return { code, message: message.trim() }
}

/** Goal service (`ctx.goals`) backed exclusively by the owning session log. */
export class GoalService  {
  static inject = ['agents', 'sessionProjections']



                   resolved                
                   runtimeStates = new WeakMap                           ()

  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.resolved = { defaultMaxGoalRounds: resolveMaxGoalRounds(config.defaultMaxGoalRounds ?? 256) };
  }

  /**
   * Read the current goal for one exact live agent.
   * @param agent - owning live agent.
   * @returns a fresh view or `undefined` when no goal is current.
   * @throws {@link GoalError} when the agent is not the registry's live instance.
   */
  get(agent       )                       {
    this.assertLive(agent)
    return this.view(this.state(agent.session), this.runtimeState(agent.session))
  }

  /**
   * Remove process-local continuation authority without changing durable goal
   * phase or revision. Lifecycle owners use this before unloading a driver;
   * a later human-authorized {@link resume} records the new activation edge.
   * @param agent - owning live agent.
   * @returns a fresh disarmed view, or `undefined` when no goal is current.
   */
  disarm(agent       )                       {
    this.assertLive(agent)
    this.setActivation(agent.session, 'disarmed')
    const runtime = this.runtimeState(agent.session)
    return this.view(this.state(agent.session), runtime)
  }

  /**
   * Create and arm a goal. A completed goal may be replaced; every other
   * current phase must be cleared or resumed instead.
   * @param agent - owning live agent.
   * @param request - objective and optional round cap.
   * @returns the created live view.
   */
  create(agent       , request                   )           {
    const spec = resolveCreateGoal(request, this.resolved.defaultMaxGoalRounds)
    const [state, runtime] = this.prepareMutation(agent)
    const current = state?.goal
    if (current !== undefined && current.phase !== 'complete') {
      throw new GoalError(`goal "${current.id}" already exists with phase "${current.phase}"`, 'GOAL_ALREADY_EXISTS')
    }
    const now = Date.now()
    const goal               = {
      id: GoalId(`goal-${randomUUID()}`),
      revision: 1,
      objective: spec.objective,
      phase: 'active',
      maxGoalRounds: spec.maxGoalRounds,
    }
    return this.commitSnapshot(agent, runtime, 'create', goal, 0, now, now, 'armed')
  }

  /**
   * Edit objective and/or round cap without changing phase.
   * @param agent - owning live agent.
   * @param ref - expected current revision.
   * @param request - at least one replacement field.
   * @returns the edited view.
   */
  edit(agent       , ref         , request                 )           {
    const [state, runtime] = this.prepareMutation(agent)
    const currentState = this.expectCurrent(state, ref)
    const current = currentState.goal
    if (request.objective === undefined && request.maxGoalRounds === undefined) {
      throw new GoalError('goal edit requires objective and/or maxGoalRounds', 'GOAL_INVALID_EDIT')
    }
    const goal               = {
      ...current,
      revision: current.revision + 1,
      ...request.objective === undefined ? {} : { objective: resolveObjective(request.objective) },
      ...request.maxGoalRounds === undefined ? {} : { maxGoalRounds: resolveMaxGoalRounds(request.maxGoalRounds) },
    }
    return this.commitCurrent(agent, currentState, runtime, 'edit', goal, runtime.activation)
  }

  /**
   * Pause an active goal and disarm automatic continuation.
   * @param agent - owning live agent.
   * @param ref - expected current revision.
   * @returns the paused view.
   */
  pause(agent       , ref         )           {
    return this.transition(agent, ref, 'pause', ['active'], 'paused', 'disarmed')
  }

  /**
   * Resume and arm a stopped goal, or rearm an active goal after a
   * session-start edge, while its round budget still has capacity.
   * @param agent - owning live agent.
   * @param ref - expected current revision.
   * @returns the active view.
   */
  resume(agent       , ref         )           {
    const [state, runtime] = this.prepareMutation(agent)
    const currentState = this.expectCurrent(state, ref)
    const current = currentState.goal
    const resumable                       = ['active', 'paused', 'blocked']
    if (!resumable.includes(current.phase)) {
      throw this.transitionError(current, 'resume', resumable)
    }
    if (current.phase === 'active' && runtime.activation === 'armed') {
      throw new GoalError(`goal "${current.id}" is already active and armed`, 'GOAL_INVALID_TRANSITION')
    }
    if (currentState.roundsStarted >= current.maxGoalRounds) {
      throw new GoalError(
        `goal "${current.id}" exhausted ${current.maxGoalRounds} goal rounds; increase maxGoalRounds before resuming`,
        'GOAL_INVALID_TRANSITION',
      )
    }
    return this.commitCurrent(agent, currentState, runtime, 'resume', this.withPhase(current, 'active'), 'armed')
  }

  /**
   * Mark a current non-complete goal complete and disarm it.
   * @param agent - owning live agent.
   * @param ref - expected current revision.
   * @returns the completed view.
   */
  complete(agent       , ref         )           {
    return this.transition(
      agent,
      ref,
      'complete',
      ['active', 'paused', 'blocked'],
      'complete',
      'disarmed',
    )
  }

  /**
   * Mark an active goal blocked and disarm it.
   * @param agent - owning live agent.
   * @param ref - expected current revision.
   * @param reason - policy-owned stable code and human-readable explanation.
   * @returns the blocked view with its durable reason.
   */
  block(agent       , ref         , reason                 )           {
    const [state, runtime] = this.prepareMutation(agent)
    const currentState = this.expectCurrent(state, ref)
    const current = currentState.goal
    if (current.phase !== 'active') {
      throw this.transitionError(current, 'block', ['active'])
    }
    return this.commitCurrent(
      agent,
      currentState,
      runtime,
      'block',
      { ...this.withPhase(current, 'blocked'), blockedReason: resolveBlockReason(reason) },
      'disarmed',
    )
  }

  /**
   * Clear the current goal while retaining a durable tombstone and history.
   * @param agent - owning live agent.
   * @param ref - expected current revision.
   * @returns the tombstone ref whose revision is one past the cleared snapshot.
   */
  clear(agent       , ref         )          {
    const [state, runtime] = this.prepareMutation(agent)
    const currentState = this.expectCurrent(state, ref)
    const current = currentState.goal
    const tombstone          = { id: current.id, revision: current.revision + 1 }
    const change                      = {
      kind: 'goal/change',
      version: GOAL_CHANGE_VERSION,
      operation: 'clear',
      cleared: tombstone,
      clearedAt: this.nextMutationTime(currentState),
    }
    this.commit(agent, runtime, change, 'disarmed')
    return { ...tombstone }
  }

  /** Resolve the durable and process-local state used by a mutation. */
          prepareMutation(agent       )                                                     {
    this.assertLive(agent)
    return [this.state(agent.session), this.runtimeState(agent.session)]
  }

  /** Reject stale or missing current-state refs. */
          expectCurrent(state                       , ref         )                 {
    if (state === null) throw new GoalError('no current goal', 'GOAL_NOT_FOUND')
    const current = state.goal
    if (ref.id !== current.id || ref.revision !== current.revision) {
      throw new GoalError(
        `stale goal ref "${ref.id}" revision ${ref.revision}; current is "${current.id}" revision ${current.revision}`,
        'GOAL_STALE_REVISION',
      )
    }
    return state
  }

  /** Enforce exact live-agent identity rather than trusting a matching id. */
          assertLive(agent       )       {
    if (this.ctx.agents.get(agent.id) !== agent) {
      throw new GoalError(`agent "${agent.id}" is not live in this registry`, 'GOAL_AGENT_NOT_LIVE')
    }
  }

  /** Read the current durable projection maintained by the registry. */
          state(session         )                        {
    const state = this.ctx.sessionProjections.stateOf(session, 'goal')
    if (state === undefined) throw new Error('goal projection is not registered')
    if (state.failure !== null) throw new Error(state.failure)
    return state.current
  }

  /** Return the process-local activation state, initially disarmed. */
          runtimeState(session         )                   {
    let runtime = this.runtimeStates.get(session)
    if (runtime !== undefined) return runtime
    runtime = {
      activation: 'disarmed',
      pendingActivation: undefined,
    }
    this.runtimeStates.set(session, runtime)
    return runtime
  }

  /** Publish one process-local activation edge when it actually changes. */
          setActivation(session         , activation                )       {
    const runtime = this.runtimeState(session)
    if (runtime.activation === activation) return
    runtime.activation = activation
    const state = this.ctx.sessionProjections.stateOf(session, 'goal')
    /* v8 ignore next -- static inject requires the projection registry before this service activates. */
    if (state === undefined) return
    if (state.failure !== null) return
    const goal = this.view(state.current, runtime)
    this.ctx.emit('goal/activation-changed', {
      sessionId: session.id,
      ...goal === undefined ? {} : {
        goal: {
          id: goal.id,
          revision: goal.revision,
          activation: goal.activation,
        },
      },
    })
  }

  /** Build a new revision with one replacement phase. */
          withPhase(current              , phase           )               {
    return {
      id: current.id,
      revision: current.revision + 1,
      objective: current.objective,
      phase,
      maxGoalRounds: current.maxGoalRounds,
    }
  }

  /** Shared validated phase transition. */
          transition(
    agent       ,
    ref         ,
    operation                                                     ,
    allowed                      ,
    phase           ,
    activation                ,
  )           {
    const [state, runtime] = this.prepareMutation(agent)
    const currentState = this.expectCurrent(state, ref)
    const current = currentState.goal
    if (!allowed.includes(current.phase)) throw this.transitionError(current, operation, allowed)
    return this.commitCurrent(agent, currentState, runtime, operation, this.withPhase(current, phase), activation)
  }

  /** Render a stable invalid-transition error. */
          transitionError(current              , operation               , allowed                      )            {
    return new GoalError(
      `cannot ${operation} goal "${current.id}" from phase "${current.phase}"; expected ${allowed.join(' or ')}`,
      'GOAL_INVALID_TRANSITION',
    )
  }

  /** Commit a mutation that retains the current goal's derived counters/times. */
          commitCurrent(
    agent       ,
    state                ,
    runtime                  ,
    operation                                            ,
    goal              ,
    activation                ,
  )           {
    return this.commitSnapshot(
      agent,
      runtime,
      operation,
      goal,
      state.roundsStarted,
      state.createdAt,
      this.nextMutationTime(state),
      activation,
    )
  }

  /** Clamp a current goal's next timestamp across backward wall-clock movement. */
          nextMutationTime(state                )         {
    return Math.max(Date.now(), state.updatedAt)
  }

  /** Build and commit one full-snapshot mutation. */
          commitSnapshot(
    agent       ,
    runtime                  ,
    operation                                 ,
    goal              ,
    roundsStarted        ,
    createdAt        ,
    updatedAt        ,
    activation                ,
  )           {
    const change                         = {
      kind: 'goal/change',
      version: GOAL_CHANGE_VERSION,
      operation,
      goal,
      roundsStarted,
      createdAt,
      updatedAt,
    }
    this.commit(agent, runtime, change, activation)
    return {
      ...goal,
      roundsStarted,
      createdAt,
      updatedAt,
      activation: runtime.activation,
    }
  }

  /** Commit one mutation into the goal log and live event stream. */
          commit(agent       , runtime                  , change                , activation                )       {
    const ref = goalChangeRef(change)
    runtime.pendingActivation = { offset: agent.session.seq, activation }
    try {
      const event = agent.session.append('goal/change', change)
      /* v8 ignore next -- Session.append returns the event committed at the pre-append seq. */
      if (SessionSeq(runtime.pendingActivation.offset) === event.seq) runtime.activation = activation
    } finally {
      runtime.pendingActivation = undefined
    }
    const goal = this.view(this.state(agent.session), runtime)
    const notification              = {
      operation: change.operation,
      ref: { ...ref },
      ...goal === undefined ? {} : { goal },
    }
    agentEvents(this.ctx, agent).emit('goal/changed', { change: notification })
  }

  /** Build a detached current view. */
          view(state                       , runtime                  )                       {
    if (state === null) return undefined
    return {
      ...state.goal,
      roundsStarted: state.roundsStarted,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      activation: runtime.activation,
    }
  }

  /**
   * Create one Goal through the remote boundary.
   * @param agent - exact live Agent resolved from the wire identity.
   * @param request - objective and optional round cap.
   * @returns the created Goal identity.
   */
  remoteExportCreate(agent       , request                   )                   {
    const view = this.create(agent, request)
    return { ref: { id: view.id, revision: view.revision } }
  }
}

