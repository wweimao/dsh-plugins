// These six tools use only primitive fields. Register ordinary JSON Schema
// without importing a second copy of the Host's Cordis/services into a linked
// workspace package. This preserves dsh-tools' open parameter-root contract.
export function defineTool(definition) {
  const properties = {}, required = [];
  for (const [name, field] of Object.entries(definition.parameters)) {
    const { required: mandatory, ...schema } = field;
    if (!['string', 'number'].includes(schema.type)) throw new TypeError('Unsupported local tool field');
    properties[name] = schema;
    if (mandatory) required.push(name);
  }
  return {
    ...definition,
    parameters: { type: 'object', properties, ...(required.length ? { required } : {}) },
    async execute(args, exec) {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('Tool arguments must be an object.');
      for (const [name, schema] of Object.entries(properties)) {
        const value = args[name];
        if (value === undefined && !required.includes(name)) continue;
        if (typeof value !== schema.type || (schema.type === 'number' && !Number.isFinite(value))) throw new TypeError(`Invalid argument: ${name}`);
      }
      return definition.execute(args, exec);
    },
  };
}
