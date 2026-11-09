/** Collapse pi-ai 1.x transcript updates into the legacy Google transport shape.
 * No auth/IO, no tool grants: only declarations present in the supplied context.
 * Mirrors pi-ai getCurrentSystemPrompt/getCurrentTools, including removals.
 */
export function toLegacyContext(context) {
  if (!context || !Array.isArray(context.messages)) throw new Error('Anti Gravity received an invalid transcript');
  const textOf = content => {
    if (content === undefined) return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) throw new Error('Anti Gravity received invalid system content');
    return content.filter(block => block.type === 'text').map(block => {
      if (typeof block.text !== 'string') throw new Error('Anti Gravity received invalid system text');
      return block.text;
    }).join('\n');
  };
  const content = [], sections = new Map(), tools = new Map();
  const addTools = values => {
    if (!Array.isArray(values)) throw new Error('Anti Gravity received invalid tool declarations');
    for (const tool of values) {
      if (!tool || typeof tool.name !== 'string' || !tool.name) throw new Error('Anti Gravity received an invalid tool declaration');
      tools.set(tool.name, tool);
    }
  };
  if (context.systemPrompt !== undefined) {
    if (typeof context.systemPrompt !== 'string') throw new Error('Anti Gravity received invalid system text');
    if (context.systemPrompt.length) content.push(context.systemPrompt);
  }
  if (context.tools !== undefined) addTools(context.tools);
  for (const message of context.messages) {
    if (message.role !== 'system') continue;
    const text = textOf(message.content);
    if (text.length) content.push(text);
    for (const [name, value] of Object.entries(message.sections ?? {})) {
      if (value === null) sections.delete(name);
      else if (typeof value === 'string') sections.set(name, value);
      else throw new Error('Anti Gravity received an invalid system section');
    }
    if (message.toolsRemoved !== undefined) {
      if (!Array.isArray(message.toolsRemoved)) throw new Error('Anti Gravity received invalid tool removals');
      for (const tool of message.toolsRemoved) {
        if (!tool || typeof tool.name !== 'string' || !tool.name) throw new Error('Anti Gravity received an invalid tool removal');
        tools.delete(tool.name);
      }
    }
    if (message.toolsAdded !== undefined) addTools(message.toolsAdded);
  }
  const systemPrompt = [content.join('\n\n'), ...Object.values(Object.fromEntries(sections))].filter(text => text.length).join('\n\n');
  return {
    ...context,
    messages: context.messages.filter(message => message.role !== 'system'),
    systemPrompt: systemPrompt.length ? systemPrompt : undefined,
    tools: [...tools.values()],
  };
}
