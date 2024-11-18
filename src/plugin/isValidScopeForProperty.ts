export async function isValidScopeForProperty(variable: Variable, action: any, node: SceneNode) {
  const { scopes } = variable;

  if (scopes.includes('ALL_SCOPES')) {
    return true;
  }

  if (action === 'fill' && 'fills' in node) {
    if (scopes.includes('ALL_FILLS')) return true;
    if (scopes.includes('FRAME_FILL') && node.type === 'FRAME') return true;
    if (
      scopes.includes('SHAPE_FILL') &&
      ['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR'].includes(node.type)
    )
      return true;
    return scopes.includes('TEXT_FILL') && node.type === 'TEXT';
  }

  if (action === 'stroke' && 'strokes' in node) {
    return scopes.includes('STROKE_COLOR');
  }

  return false;
}
