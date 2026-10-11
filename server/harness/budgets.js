export class RunBudget {
  constructor({requests=21,tools=100}={}){this.limits={requests,tools};this.used={requests:0,tools:0};}
  consume(kind){if(!(kind in this.limits)||this.used[kind]>=this.limits[kind])throw new Error(`Shared ${kind} budget exhausted`);this.used[kind]++;}
}
