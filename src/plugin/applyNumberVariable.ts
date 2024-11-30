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
          // Bind variable to itemSpacing
          node.setBoundVariable('itemSpacing', variable);
        } else if (action === 'borderRadius' && 'cornerRadius' in node) {
          // Bind variable to cornerRadius
          node.setBoundVariable('topLeftRadius', variable);
          node.setBoundVariable('topRightRadius', variable);
          node.setBoundVariable('bottomLeftRadius', variable);
          node.setBoundVariable('bottomRightRadius', variable);
        } else if (action === 'padding' && node.type === 'FRAME') {
          // Bind variable to padding properties
          node.setBoundVariable('paddingLeft', variable);
          node.setBoundVariable('paddingRight', variable);
          node.setBoundVariable('paddingTop', variable);
          node.setBoundVariable('paddingBottom', variable);
        } else if (action === 'strokeWidth' && 'strokeWeight' in node) {
          // Bind variable to strokeWeight
          node.setBoundVariable('strokeWeight', variable);
        }
        // ... add other actions as needed
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
