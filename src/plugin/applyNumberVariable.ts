import { isValidScopeForProperty } from '@plugin/isValidScopeForProperty';

/**
 * Apply number variables to Figma nodes with enhanced functionality:
 * - For stroke: Always creates a visible dark stroke if none exists
 * - For spacing/gap: Checks for Auto Layout and notifies user if not present
 */

const checkAutoLayoutRequired = (
  node: SceneNode,
  action: string
): { hasAutoLayout: boolean; message: string } => {
  if ('layoutMode' in node) {
    if (node.layoutMode === 'NONE') {
      let actionName = '';
      switch (action) {
        case 'spaceBetween':
          actionName = 'spacing';
          break;
        case 'paddingVertical':
        case 'paddingHorizontal':
        case 'paddingGeneral':
          actionName = 'padding';
          break;
        default:
          actionName = 'this property';
      }
      return {
        hasAutoLayout: false,
        message: `🚨 Auto Layout required for ${actionName}. Please enable Auto Layout on this frame manually.`
      };
    }
    return { hasAutoLayout: true, message: '' };
  }
  return { hasAutoLayout: false, message: '🚨 Node must be a frame to apply spacing properties.' };
};

const applyPadding = (
  node: FrameNode,
  variable: Variable,
  type: 'vertical' | 'horizontal' | 'general'
): void => {
  if (type === 'vertical') {
    node.setBoundVariable('paddingTop', variable);
    node.setBoundVariable('paddingBottom', variable);
  } else if (type === 'horizontal') {
    node.setBoundVariable('paddingLeft', variable);
    node.setBoundVariable('paddingRight', variable);
  } else if (type === 'general') {
    node.setBoundVariable('paddingTop', variable);
    node.setBoundVariable('paddingBottom', variable);
    node.setBoundVariable('paddingLeft', variable);
    node.setBoundVariable('paddingRight', variable);
  }
};

const applyStrokeWeight = (node: SceneNode, variable: Variable): void => {
  if ('strokes' in node) {
    const hasVisibleStroke =
      Array.isArray(node.strokes) &&
      node.strokes.length > 0 &&
      node.strokes.some((stroke) => stroke.visible !== false);

    if (!hasVisibleStroke) {
      node.strokes = [
        {
          type: 'SOLID',
          color: { r: 0, g: 0, b: 0 },
          opacity: 1,
          visible: true,
          blendMode: 'NORMAL'
        }
      ];
    }
  }

  node.setBoundVariable('strokeWeight', variable);
  node.setBoundVariable('strokeTopWeight', variable);
  node.setBoundVariable('strokeRightWeight', variable);
  node.setBoundVariable('strokeBottomWeight', variable);
  node.setBoundVariable('strokeLeftWeight', variable);
};

const applyBorderRadius = (node: SceneNode, variable: Variable): void => {
  node.setBoundVariable('topLeftRadius', variable);
  node.setBoundVariable('topRightRadius', variable);
  node.setBoundVariable('bottomLeftRadius', variable);
  node.setBoundVariable('bottomRightRadius', variable);
};

const checkScopeCompatibility = (
  variable: Variable,
  action: string
): { isCompatible: boolean; warning: string } => {
  const scopes = variable.scopes;

  // Если есть ALL_SCOPES, то все совместимо
  if (scopes.includes('ALL_SCOPES')) {
    return { isCompatible: true, warning: '' };
  }

  // Для spacing это нормально
  if (action === 'spaceBetween' && scopes.includes('GAP')) {
    return { isCompatible: true, warning: '' };
  }

  // Для padding с GAP scope - предупреждение
  if (action.includes('padding') && scopes.includes('GAP')) {
    return {
      isCompatible: true,
      warning:
        "Note: This variable uses GAP scope which is primarily for spacing. If padding doesn't apply correctly, create a variable with ALL_SCOPES."
    };
  }

  return { isCompatible: true, warning: '' };
};

export const applyNumberVariable = async (
  nodes: ReadonlyArray<SceneNode>,
  variable: Variable,
  action: string
) => {
  let resultMessage = '';

  for (const node of nodes) {
    const isValidScope = await isValidScopeForProperty(variable, action, node);

    if (!isValidScope) {
      resultMessage = '🚫 Scope limitation.';
      continue;
    }

    if (!('setBoundVariable' in node)) {
      resultMessage = '🚨 Node does not support variable binding.';
      continue;
    }

    if (
      ['spaceBetween', 'paddingVertical', 'paddingHorizontal', 'paddingGeneral'].includes(action)
    ) {
      const { hasAutoLayout, message } = checkAutoLayoutRequired(node, action);
      if (!hasAutoLayout) {
        figma.notify(message);
        return;
      }
      resultMessage += message;
    }

    const { isCompatible, warning } = checkScopeCompatibility(variable, action);
    if (!isCompatible) {
      resultMessage += warning;
    }

    switch (action) {
      case 'spaceBetween':
        node.setBoundVariable('itemSpacing', variable);
        resultMessage = '✅ Spacing variable applied correctly.';
        break;
      case 'borderRadius':
        applyBorderRadius(node, variable);
        resultMessage = '✅ Border radius variable applied correctly.';
        break;
      case 'paddingVertical':
        if (node.type === 'FRAME') {
          const frameNode = node as FrameNode;

          if (frameNode.layoutMode === 'NONE') {
            resultMessage =
              '🚨 Auto Layout required for padding. Please enable Auto Layout on this frame manually.';
            break;
          }

          try {
            applyPadding(frameNode, variable, 'vertical');

            const boundVars = frameNode.boundVariables;
            if (
              boundVars?.paddingTop?.id === variable.id ||
              boundVars?.paddingBottom?.id === variable.id
            ) {
              resultMessage = '✅ Vertical padding variable applied correctly.';
              if (warning) resultMessage += '\n💡 ' + warning;
            } else {
              resultMessage =
                '🚨 Failed to apply padding variable. Check variable scope - padding requires ALL_SCOPES or may not work with GAP scope.';
            }
          } catch (error) {
            resultMessage =
              '🚨 Failed to apply padding variable. Variable scope may not support padding.';
          }
        }
        break;
      case 'paddingHorizontal':
        if (node.type === 'FRAME') {
          const frameNode = node as FrameNode;

          if (frameNode.layoutMode === 'NONE') {
            resultMessage =
              '🚨 Auto Layout required for padding. Please enable Auto Layout on this frame manually.';
            break;
          }

          try {
            applyPadding(frameNode, variable, 'horizontal');

            const boundVars = frameNode.boundVariables;
            if (
              boundVars?.paddingLeft?.id === variable.id ||
              boundVars?.paddingRight?.id === variable.id
            ) {
              resultMessage = '✅ Horizontal padding variable applied correctly.';
              if (warning) resultMessage += '\n💡 ' + warning;
            } else {
              resultMessage =
                '🚨 Failed to apply padding variable. Check variable scope - padding requires ALL_SCOPES or may not work with GAP scope.';
            }
          } catch (error) {
            resultMessage =
              '🚨 Failed to apply padding variable. Variable scope may not support padding.';
          }
        }
        break;
      case 'paddingGeneral':
        if (node.type === 'FRAME') {
          const frameNode = node as FrameNode;

          if (frameNode.layoutMode === 'NONE') {
            resultMessage =
              '🚨 Auto Layout required for padding. Please enable Auto Layout on this frame manually.';
            break;
          }

          try {
            applyPadding(frameNode, variable, 'general');

            const boundVars = frameNode.boundVariables;
            if (
              boundVars?.paddingTop?.id === variable.id ||
              boundVars?.paddingBottom?.id === variable.id ||
              boundVars?.paddingLeft?.id === variable.id ||
              boundVars?.paddingRight?.id === variable.id
            ) {
              resultMessage = '✅ Padding variable applied to all sides correctly.';
              if (warning) resultMessage += '\n💡 ' + warning;
            } else {
              resultMessage =
                '🚨 Failed to apply padding variable. Check variable scope - padding requires ALL_SCOPES or may not work with GAP scope.';
            }
          } catch (error) {
            resultMessage =
              '🚨 Failed to apply padding variable. Variable scope may not support padding.';
          }
        }
        break;
      case 'strokeWidth':
        if ('strokes' in node) {
          applyStrokeWeight(node, variable);
          resultMessage = '✅ Stroke variable applied with dark border.';
        }
        break;
      default:
        resultMessage = '🚨 Unknown action.';
    }
  }

  figma.notify(resultMessage);
};
