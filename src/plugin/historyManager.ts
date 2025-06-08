import { HistoryAction, HistoryState, NodeState } from './historyTypes';

class HistoryManager {
  private history: HistoryState = {
    actions: [],
    currentIndex: -1
  };

  private maxHistorySize = 50; // Максимальное количество действий в истории

  // Захватить состояние нода до изменения
  captureNodeState(node: SceneNode): NodeState {
    const state: NodeState = {
      nodeId: node.id,
      properties: {},
      boundVariables: {}
    };

    // Сохраняем основные свойства в зависимости от типа нода
    if ('fills' in node) {
      state.properties.fills = node.fills ? JSON.parse(JSON.stringify(node.fills)) : [];
    }
    if ('strokes' in node) {
      state.properties.strokes = node.strokes ? JSON.parse(JSON.stringify(node.strokes)) : [];
      state.properties.strokeWeight = node.strokeWeight;
      if ('strokeTopWeight' in node) state.properties.strokeTopWeight = node.strokeTopWeight;
      if ('strokeRightWeight' in node) state.properties.strokeRightWeight = node.strokeRightWeight;
      if ('strokeBottomWeight' in node)
        state.properties.strokeBottomWeight = node.strokeBottomWeight;
      if ('strokeLeftWeight' in node) state.properties.strokeLeftWeight = node.strokeLeftWeight;
    }
    if ('topLeftRadius' in node) {
      state.properties.topLeftRadius = node.topLeftRadius;
      state.properties.topRightRadius = node.topRightRadius;
      state.properties.bottomLeftRadius = node.bottomLeftRadius;
      state.properties.bottomRightRadius = node.bottomRightRadius;
    }
    if ('layoutMode' in node) {
      state.properties.layoutMode = node.layoutMode;
      state.properties.itemSpacing = node.itemSpacing;
      state.properties.paddingTop = node.paddingTop;
      state.properties.paddingBottom = node.paddingBottom;
      state.properties.paddingLeft = node.paddingLeft;
      state.properties.paddingRight = node.paddingRight;
    }

    // Сохраняем привязанные переменные
    if ('boundVariables' in node && node.boundVariables) {
      state.boundVariables = JSON.parse(JSON.stringify(node.boundVariables));
    }

    return state;
  }

  // Восстановить состояние нода
  async restoreNodeState(nodeState: NodeState): Promise<boolean> {
    try {
      const node = await figma.getNodeByIdAsync(nodeState.nodeId);
      if (!node) return false;

      // Восстанавливаем основные свойства
      const props = nodeState.properties;

      if ('fills' in node && props.fills !== undefined) {
        node.fills = props.fills;
      }
      if ('strokes' in node) {
        if (props.strokes !== undefined) node.strokes = props.strokes;
        if (props.strokeWeight !== undefined) node.strokeWeight = props.strokeWeight;
        if (props.strokeTopWeight !== undefined && 'strokeTopWeight' in node)
          (node as any).strokeTopWeight = props.strokeTopWeight;
        if (props.strokeRightWeight !== undefined && 'strokeRightWeight' in node)
          (node as any).strokeRightWeight = props.strokeRightWeight;
        if (props.strokeBottomWeight !== undefined && 'strokeBottomWeight' in node)
          (node as any).strokeBottomWeight = props.strokeBottomWeight;
        if (props.strokeLeftWeight !== undefined && 'strokeLeftWeight' in node)
          (node as any).strokeLeftWeight = props.strokeLeftWeight;
      }
      if ('topLeftRadius' in node) {
        if (props.topLeftRadius !== undefined) (node as any).topLeftRadius = props.topLeftRadius;
        if (props.topRightRadius !== undefined) (node as any).topRightRadius = props.topRightRadius;
        if (props.bottomLeftRadius !== undefined)
          (node as any).bottomLeftRadius = props.bottomLeftRadius;
        if (props.bottomRightRadius !== undefined)
          (node as any).bottomRightRadius = props.bottomRightRadius;
      }
      if ('layoutMode' in node) {
        if (props.layoutMode !== undefined) node.layoutMode = props.layoutMode;
        if (props.itemSpacing !== undefined) node.itemSpacing = props.itemSpacing;
        if (props.paddingTop !== undefined) node.paddingTop = props.paddingTop;
        if (props.paddingBottom !== undefined) node.paddingBottom = props.paddingBottom;
        if (props.paddingLeft !== undefined) node.paddingLeft = props.paddingLeft;
        if (props.paddingRight !== undefined) node.paddingRight = props.paddingRight;
      }

      // Восстанавливаем привязанные переменные
      if ('setBoundVariable' in node && nodeState.boundVariables) {
        const boundVars = nodeState.boundVariables;

        // Очищаем все привязки
        for (const key in boundVars) {
          try {
            if (boundVars[key] === null) {
              (node as any).setBoundVariable(key, null);
            } else if (boundVars[key]?.id) {
              const variable = await figma.variables.getVariableByIdAsync(boundVars[key].id);
              if (variable) {
                (node as any).setBoundVariable(key, variable);
              }
            }
          } catch (error) {
            console.warn(`Failed to restore bound variable ${key}:`, error);
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to restore node state:', error);
      return false;
    }
  }

  // Добавить действие в историю
  addAction(action: HistoryAction): void {
    // Удаляем все действия после текущего индекса (для случая когда мы были в середине истории)
    this.history.actions = this.history.actions.slice(0, this.history.currentIndex + 1);

    // Добавляем новое действие
    this.history.actions.push(action);
    this.history.currentIndex = this.history.actions.length - 1;

    // Ограничиваем размер истории
    if (this.history.actions.length > this.maxHistorySize) {
      this.history.actions.shift();
      this.history.currentIndex--;
    }

    this.notifyHistoryChanged();
  }

  // Отменить последнее действие
  async undo(): Promise<boolean> {
    if (!this.canUndo()) return false;

    const action = this.history.actions[this.history.currentIndex];
    let success = true;

    // Восстанавливаем состояние до изменения
    for (const nodeState of action.beforeState) {
      const restored = await this.restoreNodeState(nodeState);
      if (!restored) success = false;
    }

    if (success) {
      this.history.currentIndex--;
      this.notifyHistoryChanged();
      figma.notify(`↶ Undone: ${action.description}`);
    } else {
      figma.notify('⚠️ Failed to undo some changes');
    }

    return success;
  }

  // Повторить следующее действие
  async redo(): Promise<boolean> {
    if (!this.canRedo()) return false;

    const action = this.history.actions[this.history.currentIndex + 1];
    let success = true;

    // Восстанавливаем состояние после изменения
    for (const nodeState of action.afterState) {
      const restored = await this.restoreNodeState(nodeState);
      if (!restored) success = false;
    }

    if (success) {
      this.history.currentIndex++;
      this.notifyHistoryChanged();
      figma.notify(`↷ Redone: ${action.description}`);
    } else {
      figma.notify('⚠️ Failed to redo some changes');
    }

    return success;
  }

  // Проверить возможность отмены
  canUndo(): boolean {
    return this.history.currentIndex >= 0;
  }

  // Проверить возможность повтора
  canRedo(): boolean {
    return this.history.currentIndex < this.history.actions.length - 1;
  }

  // Получить информацию о состоянии истории
  getHistoryInfo() {
    return {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      currentAction:
        this.history.currentIndex >= 0
          ? this.history.actions[this.history.currentIndex]?.description
          : null,
      nextAction: this.canRedo()
        ? this.history.actions[this.history.currentIndex + 1]?.description
        : null,
      totalActions: this.history.actions.length
    };
  }

  // Очистить историю
  clearHistory(): void {
    this.history.actions = [];
    this.history.currentIndex = -1;
    this.notifyHistoryChanged();
  }

  // Уведомить UI об изменении истории
  private notifyHistoryChanged(): void {
    figma.ui.postMessage({
      type: 'history-changed',
      historyInfo: this.getHistoryInfo()
    });
  }
}

export const historyManager = new HistoryManager();
