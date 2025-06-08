import { isValidScopeForProperty } from '@plugin/isValidScopeForProperty';
import { historyManager } from '@plugin/historyManager';
import { HistoryAction } from '@plugin/historyTypes';

export async function applyColorVariable(
  nodes: ReadonlyArray<SceneNode>,
  variable: Variable,
  action: string
) {
  if (nodes.length > 0 && variable) {
    try {
      let applied = false;

      // Захватываем состояние до изменения для истории
      const beforeStates = nodes.map((node) => historyManager.captureNodeState(node));

      for (const node of nodes) {
        const isValidScope = await isValidScopeForProperty(variable, action, node);

        if (isValidScope) {
          if (action === 'fill' && 'fills' in node) {
            applied = true;

            if (Array.isArray(node.fills) && node.fills.length > 0) {
              const fillsCopy = [...node.fills];
              fillsCopy[0] = figma.variables.setBoundVariableForPaint(
                fillsCopy[0],
                'color',
                variable
              );
              node.fills = fillsCopy;
            } else {
              node.fills = [
                figma.variables.setBoundVariableForPaint(
                  {
                    type: 'SOLID',
                    color: { r: 0, g: 0, b: 0 },
                    opacity: 1,
                    visible: true,
                    blendMode: 'NORMAL'
                  },
                  'color',
                  variable
                )
              ];
            }
          } else if (action === 'stroke' && 'strokes' in node) {
            applied = true;

            if (Array.isArray(node.strokes) && node.strokes.length > 0) {
              const strokesCopy = [...node.strokes];
              strokesCopy[0] = figma.variables.setBoundVariableForPaint(
                strokesCopy[0],
                'color',
                variable
              );
              node.strokes = strokesCopy;
            } else {
              node.strokes = [
                figma.variables.setBoundVariableForPaint(
                  {
                    type: 'SOLID',
                    color: { r: 0, g: 0, b: 0 },
                    opacity: 1,
                    visible: true,
                    blendMode: 'NORMAL'
                  },
                  'color',
                  variable
                )
              ];
            }
          }
        }
      }

      if (applied) {
        // Захватываем состояние после изменения и сохраняем в историю
        const afterStates = nodes.map((node) => historyManager.captureNodeState(node));

        const actionDescription = `Apply ${variable.name} (${action})`;

        const historyAction: HistoryAction = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          type: 'apply-variable',
          timestamp: Date.now(),
          description: actionDescription,
          variableId: variable.id,
          variableType: 'color',
          action,
          beforeState: beforeStates,
          afterState: afterStates
        };

        historyManager.addAction(historyAction);
        figma.notify('✅ Variable applied correctly.');
      } else {
        figma.notify('🚫 Scope limitation.');
      }
    } catch (error) {
      console.error('Error when applying the variable:', error);
      figma.notify('🚨 It was not possible to apply the variable.');
    }
  } else {
    figma.notify('😺 Oops! There is nothing selected.');
  }
}
