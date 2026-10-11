// Conservative estimate, not a provider tokenizer. Image payload bytes are not
// text tokens; reserve a fixed estimate for each image instead of base64 length.
export function estimateTokens(value) {
  let images = 0;
  const text = JSON.stringify(value, (_key, item) => {
    if (item?.type === 'image_url') { images++; return {type:'image_url',image_url:'[image]'}; }
    return item;
  });
  return Math.ceil(text.length / 3) + images * 2048;
}

export function selectHistory(messages, { contextTokens = 24000, reserveTokens = 4000, fixed = [] } = {}) {
  const budget = Math.max(1, contextTokens - reserveTokens - estimateTokens(fixed));
  // Keep each user turn and its tools together; never leave orphaned tool results.
  const turns = [];
  for (const message of messages) {
    if (message.role === 'user' && !message.browserScreenshot && !String(message.content).startsWith('[TOOL_')) turns.push([]);
    if (!turns.length) turns.push([]);
    turns.at(-1).push(message);
  }
  const selected = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const cost = estimateTokens(turns[i]);
    if (selected.length && used + cost > budget) break;
    selected.unshift(...turns[i]);
    used += cost;
  }
  return { messages: selected, omitted: messages.length - selected.length, estimatedTokens: used };
}

export function limitToolContent(content, tokens) {
  const maxChars = tokens * 3;
  return content.length <= maxChars ? content : content.slice(0, Math.max(0,maxChars - 150)) + '\n[Tool output truncated for model context. Full output remains in run activity. Do not infer omitted facts.]';
}

export function fitRequest(messages, tools, config) {
  const fixed = messages.filter(message=>message.role === 'system');
  const history = messages.filter(message=>message.role !== 'system');
  let selection;
  if(Number.isSafeInteger(config.currentTurnStart)){const pinned=history.slice(config.currentTurnStart),older=history.slice(0,config.currentTurnStart);const remaining=config.contextTokens-config.reserveTokens-estimateTokens([...fixed,pinned,tools]);const oldSelection=remaining>0?selectHistory(older,{contextTokens:remaining,reserveTokens:0}):{messages:[]};const kept=estimateTokens(oldSelection.messages)>remaining?[]:oldSelection.messages;selection={messages:[...kept,...pinned],omitted:older.length-kept.length};}else selection=selectHistory(history, {...config,fixed:[...fixed,tools]});
  const selected = selection.messages.map(message=>({...message}));
  const budget = config.contextTokens - config.reserveTokens;
  const cost = () => estimateTokens([...fixed,...selected]) + estimateTokens(tools);
  let shortened = 0;
  // Preserve call identities and current user input; shorten oldest tool observations
  // explicitly when the current turn itself grows beyond the request estimate.
  for (const message of selected) {
    if (cost() <= budget) break;
    if (message.role === 'tool' && typeof message.content === 'string' && message.content.length > 600) {
      message.content = limitToolContent(message.content,200); shortened++;
    }
  }
  if (cost() > budget) throw new Error('Estimated model context exceeds the configured budget. Increase contextTokens or shorten the request. No further tools were executed.');
  return {messages:[...fixed,...selected],omitted:selection.omitted,shortened,estimatedTokens:cost()};
}
