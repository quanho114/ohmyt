// MIT, Copyright (c) 2026 DeepSeek. Adapted runtime outlet; see LICENSE.
export const GOAL_CHANGE_VERSION = 1;
export const GoalId = id => id;
export class GoalError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
