import { isValidScopeForProperty } from '@plugin/isValidScopeForProperty';

const setAutolayout = (node: FrameNode) => {
  node.layoutMode = 'HORIZONTAL';
  node.layoutSizingHorizontal = 'HUG';
  node.layoutSizingVertical = 'HUG';
};

const ensureFrameHasAutoLayout = (node: SceneNode): { ok: boolean; message: string } => {
  if ('layoutMode' in node) {
    if (node.layoutMode === 'NONE') {
      setAutolayout(node as FrameNode);
      return { ok: true, message: '\n⚠️ Layout mode set to horizontal.' };
    }
    return { ok: true, message: '' };
  }
  return { ok: false, message: '🚨 Node must be a frame to apply spacing.' };
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
  if ('strokes' in node && (!Array.isArray(node.strokes) || node.strokes.length === 0)) {
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
      const { ok, message } = ensureFrameHasAutoLayout(node);
      if (!ok) {
        figma.notify(message);
        return;
      }
      resultMessage += message;
    }

    switch (action) {
      case 'spaceBetween':
        node.setBoundVariable('itemSpacing', variable);
        resultMessage = '✅ Variable applied correctly.';
        break;
      case 'borderRadius':
        applyBorderRadius(node, variable);
        resultMessage = '✅ Variable applied correctly.';
        break;
      case 'paddingVertical':
        if (node.type === 'FRAME') {
          applyPadding(node as FrameNode, variable, 'vertical');
          resultMessage = '✅ Variable applied correctly.';
        }
        break;
      case 'paddingHorizontal':
        if (node.type === 'FRAME') {
          applyPadding(node as FrameNode, variable, 'horizontal');
          resultMessage = '✅ Variable applied correctly.';
        }
        break;
      case 'paddingGeneral':
        if (node.type === 'FRAME') {
          applyPadding(node as FrameNode, variable, 'general');
          resultMessage = '✅ Variable applied correctly.';
        }
        break;
      case 'strokeWidth':
        if ('strokes' in node) {
          applyStrokeWeight(node, variable);
          resultMessage = '✅ Variable applied correctly.';
        }
        break;
      default:
        resultMessage = '🚨 Unknown action.';
    }
  }

  figma.notify(resultMessage);
};
