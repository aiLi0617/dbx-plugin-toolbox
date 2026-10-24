export function matchesObject(tool, object) {
  const kind = tool.category === 'image' ? 'image' : tool.category === 'document' && tool.id !== 'json' && tool.id !== 'data-convert' ? 'document' : 'text';
  return object === 'all' || kind === object;
}
