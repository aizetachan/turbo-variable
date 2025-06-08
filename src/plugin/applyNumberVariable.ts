import { isValidScopeForProperty } from '@plugin/isValidScopeForProperty';
import { confirmationManager } from '@plugin/confirmationManager';

/**
 * Apply number variables to Figma nodes with enhanced functionality:
 * - For stroke: Always creates a visible dark stroke if none exists
 * - For spacing/gap: Checks for Auto Layout and offers solutions
 * - Smart frame creation and Auto Layout enabling
 */

const createFrameFromNode = (node: SceneNode): FrameNode => {
  const frame = figma.createFrame();
  frame.name = `${node.name} Frame`;

  frame.x = node.x;
  frame.y = node.y;
  frame.resize(node.width, node.height);

  const parent = node.parent;
  const nodeIndex = parent?.children.indexOf(node) ?? 0;

  if (parent) {
    parent.insertChild(nodeIndex, frame);
  }

  frame.appendChild(node);
  node.x = 0;
  node.y = 0;

  frame.layoutMode = 'HORIZONTAL';
  frame.layoutSizingHorizontal = 'HUG';
  frame.layoutSizingVertical = 'HUG';
  frame.paddingTop = 0;
  frame.paddingBottom = 0;
  frame.paddingLeft = 0;
  frame.paddingRight = 0;

  return frame;
};

const enableAutoLayout = (frame: FrameNode): void => {
  let layoutDirection: 'HORIZONTAL' | 'VERTICAL' = 'HORIZONTAL';

  if (frame.children.length >= 2) {
    const firstChild = frame.children[0];
    const secondChild = frame.children[1];

    const horizontalDistance = Math.abs(firstChild.x - secondChild.x);
    const verticalDistance = Math.abs(firstChild.y - secondChild.y);

    layoutDirection = horizontalDistance > verticalDistance ? 'HORIZONTAL' : 'VERTICAL';
  }

  frame.layoutMode = layoutDirection;
  frame.layoutSizingHorizontal = 'HUG';
  frame.layoutSizingVertical = 'HUG';
};

const checkAndFixNodeRequirements = async (
  node: SceneNode,
  action: string
): Promise<{ success: boolean; node: SceneNode; message: string }> => {
  if (['spaceBetween', 'paddingVertical', 'paddingHorizontal', 'paddingGeneral'].includes(action)) {
    if (!('layoutMode' in node)) {
      const actionName = action.includes('padding') ? 'padding' : 'spacing';

      const confirmed = await confirmationManager.showConfirmation(
        `Create Frame for ${actionName}?`,
        `This element needs to be wrapped in a frame to apply ${actionName} variables. Should I create a frame and move this element inside?`,
        'Yes, create frame',
        'Cancel'
      );

      if (!confirmed) {
        return {
          success: false,
          node,
          message: `❌ ${actionName} requires a frame. Operation cancelled.`
        };
      }

      try {
        const newFrame = createFrameFromNode(node);
        figma.currentPage.selection = [newFrame];

        return {
          success: true,
          node: newFrame,
          message: `✨ Created frame with Auto Layout for ${actionName}. Original node moved inside.`
        };
      } catch (error) {
        return {
          success: false,
          node,
          message: `🚨 Failed to create frame. Please manually wrap this element in a frame and enable Auto Layout.`
        };
      }
    }

    const frameNode = node as FrameNode;
    if (frameNode.layoutMode === 'NONE') {
      const actionName = action.includes('padding') ? 'padding' : 'spacing';

      const confirmed = await confirmationManager.showConfirmation(
        `Enable Auto Layout for ${actionName}?`,
        `This frame needs Auto Layout to apply ${actionName} variables. Should I enable Auto Layout?`,
        'Yes, enable Auto Layout',
        'Cancel'
      );

      if (!confirmed) {
        return {
          success: false,
          node,
          message: `❌ ${actionName} requires Auto Layout. Operation cancelled.`
        };
      }

      try {
        enableAutoLayout(frameNode);

        return {
          success: true,
          node: frameNode,
          message: `✨ Auto Layout enabled for ${actionName}.`
        };
      } catch (error) {
        return {
          success: false,
          node,
          message: `🚨 Could not enable Auto Layout. Please enable it manually for ${actionName}.`
        };
      }
    }

    return {
      success: true,
      node,
      message: ''
    };
  }

  return {
    success: true,
    node,
    message: ''
  };
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

  if (scopes.includes('ALL_SCOPES')) {
    return { isCompatible: true, warning: '' };
  }

  if (action === 'spaceBetween' && scopes.includes('GAP')) {
    return { isCompatible: true, warning: '' };
  }

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

    const { success, node: updatedNode, message } = await checkAndFixNodeRequirements(node, action);
    if (!success) {
      resultMessage = message;
      continue;
    }

    const { isCompatible, warning } = checkScopeCompatibility(variable, action);
    if (!isCompatible) {
      resultMessage += warning;
    }

    switch (action) {
      case 'spaceBetween':
        updatedNode.setBoundVariable('itemSpacing', variable);
        resultMessage = message
          ? `✅ Spacing variable applied correctly. ${message}`
          : '✅ Spacing variable applied correctly.';
        break;
      case 'borderRadius':
        applyBorderRadius(updatedNode, variable);
        resultMessage = '✅ Border radius variable applied correctly.';
        break;
      case 'paddingVertical':
        if (updatedNode.type === 'FRAME') {
          const frameNode = updatedNode as FrameNode;

          try {
            applyPadding(frameNode, variable, 'vertical');

            const boundVars = frameNode.boundVariables;
            if (
              boundVars?.paddingTop?.id === variable.id ||
              boundVars?.paddingBottom?.id === variable.id
            ) {
              resultMessage = message
                ? `✅ Vertical padding variable applied correctly. ${message}`
                : '✅ Vertical padding variable applied correctly.';
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
        if (updatedNode.type === 'FRAME') {
          const frameNode = updatedNode as FrameNode;

          try {
            applyPadding(frameNode, variable, 'horizontal');

            const boundVars = frameNode.boundVariables;
            if (
              boundVars?.paddingLeft?.id === variable.id ||
              boundVars?.paddingRight?.id === variable.id
            ) {
              resultMessage = message
                ? `✅ Horizontal padding variable applied correctly. ${message}`
                : '✅ Horizontal padding variable applied correctly.';
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
        if (updatedNode.type === 'FRAME') {
          const frameNode = updatedNode as FrameNode;

          try {
            applyPadding(frameNode, variable, 'general');

            const boundVars = frameNode.boundVariables;
            if (
              boundVars?.paddingTop?.id === variable.id ||
              boundVars?.paddingBottom?.id === variable.id ||
              boundVars?.paddingLeft?.id === variable.id ||
              boundVars?.paddingRight?.id === variable.id
            ) {
              resultMessage = message
                ? `✅ Padding variable applied to all sides correctly. ${message}`
                : '✅ Padding variable applied to all sides correctly.';
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
        if ('strokes' in updatedNode) {
          applyStrokeWeight(updatedNode, variable);
          resultMessage = '✅ Stroke variable applied with dark border.';
        }
        break;
      default:
        resultMessage = '🚨 Unknown action.';
    }
  }

  figma.notify(resultMessage);
};
