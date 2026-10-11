import {EventEmitter} from 'node:events';
export class BrowserTrace extends EventEmitter {
  constructor(limit=200){super();this.limit=limit;this.runs=new Map();}
  initialize(db){this.db=db.db;this.db.exec('CREATE TABLE IF NOT EXISTS browser_use_events (run_id TEXT NOT NULL, session_id TEXT NOT NULL, sequence INTEGER NOT NULL, event_json TEXT NOT NULL, PRIMARY KEY(run_id,sequence))');}
  record(runId,sessionId,type,details={}){
    let history=this.runs.get(runId);if(!history){if(this.runs.size>=1000)this.runs.delete(this.runs.keys().next().value);history={sessionId,sequence:this.db?.prepare('SELECT COALESCE(MAX(sequence),0) AS n FROM browser_use_events WHERE run_id=?').get(runId).n||0,events:[]};this.runs.set(runId,history);}
    // Only explicit metadata is admitted. Never record tool arguments, DOM, URLs,
    // screenshots, cookies, output or third-party exception messages.
    const event={runId,sessionId,sequence:++history.sequence,type,time:Date.now()};
    for(const key of ['action','durationMs','code','success','state','inputTokens','outputTokens'])if(details[key]!==undefined && (!['inputTokens','outputTokens','durationMs'].includes(key)||(typeof details[key]==='number'&&Number.isFinite(details[key])&&details[key]>=0)))event[key]=details[key];
    history.events.push(event);if(history.events.length>this.limit)history.events.shift();
    if(this.db){this.db.prepare('INSERT INTO browser_use_events VALUES (?,?,?,?)').run(runId,sessionId,event.sequence,JSON.stringify(event));this.db.prepare('DELETE FROM browser_use_events WHERE run_id=? AND sequence<=?').run(runId,event.sequence-this.limit);this.db.exec('DELETE FROM browser_use_events WHERE rowid NOT IN (SELECT rowid FROM browser_use_events ORDER BY rowid DESC LIMIT 10000)');}
    this.emit('event',event);return event;
  }
  read(runId,sessionId,after=0){if(this.db){const rows=this.db.prepare('SELECT event_json FROM browser_use_events WHERE run_id=? AND session_id=? AND sequence>? ORDER BY sequence').all(runId,sessionId,after);if(!rows.length&&!this.db.prepare('SELECT 1 FROM browser_use_events WHERE run_id=? AND session_id=?').get(runId,sessionId))throw Error('Unknown browser run');return rows.map(row=>JSON.parse(row.event_json));}const entry=this.runs.get(runId);if(!entry||entry.sessionId!==sessionId)throw Error('Unknown browser run');return entry.events.filter(event=>event.sequence>after);}
}
