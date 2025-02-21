export const isValidScopeForProperty = async (variable: Variable, action: any, node: SceneNode) => {
  const { scopes } = variable;

  if (scopes.includes('ALL_SCOPES')) {
    return true;
  }

  if (variable.resolvedType === 'COLOR') {
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
  } else if (variable.resolvedType === 'FLOAT') {
    if (action === 'spaceBetween' && node.type === 'FRAME') {
      return scopes.includes('GAP');
    }
    if (action === 'borderRadius' && 'cornerRadius' in node) {
      return scopes.includes('CORNER_RADIUS');
    }
    if (action.includes('padding') && node.type === 'FRAME') {
      return scopes.includes('GAP');
    }
    if (action === 'strokeWidth' && 'strokeWeight' in node) {
      return scopes.includes('STROKE_FLOAT');
    }
  }

  return false;
};
