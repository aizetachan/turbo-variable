import { isValidScopeForProperty } from '@plugin/isValidScopeForProperty';

export async function applyNumberVariable(
  nodes: ReadonlyArray<SceneNode>,
  variable: Variable,
  action: string
) {
  let applied = false;

  for (const node of nodes) {
    const isValidScope = await isValidScopeForProperty(variable, action, node);

    if (isValidScope) {
      if ('setBoundVariable' in node) {
        applied = true;
        if (action === 'spaceBetween' && node.type === 'FRAME') {
          node.setBoundVariable('itemSpacing', variable);
        } else if (action === 'borderRadius' && 'cornerRadius' in node) {
          node.setBoundVariable('topLeftRadius', variable);
          node.setBoundVariable('topRightRadius', variable);
          node.setBoundVariable('bottomLeftRadius', variable);
          node.setBoundVariable('bottomRightRadius', variable);
        } else if (action === 'paddingVertical' && node.type === 'FRAME') {
          node.setBoundVariable('paddingTop', variable);
          node.setBoundVariable('paddingBottom', variable);
        } else if (action === 'paddingHorizontal' && node.type === 'FRAME') {
          node.setBoundVariable('paddingLeft', variable);
          node.setBoundVariable('paddingRight', variable);
        } else if (action === 'strokeWidth' && 'strokeWeight' in node) {
          node.setBoundVariable('strokeWeight', variable);
        }
      } else {
        console.warn(`Node does not support variable binding.`);
      }
    }
  }

  if (applied) {
    figma.notify('✅ Variable applied correctly.');
  } else {
    figma.notify('🚫 Scope limitation.');
  }
}
