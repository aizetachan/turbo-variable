import { loadAllData } from '@plugin/loadAllData';
import { applyColorVariable } from '@plugin/applyColorVariable';
import { applyNumberVariable } from '@plugin/applyNumberVariable';
import { confirmationManager } from '@plugin/confirmationManager';
import { historyManager } from '@plugin/historyManager';

figma.showUI(__html__, { width: 240, height: 664 });

async function handleApplyColorVariable(variableId: string, action: string) {
  const nodes = figma.currentPage.selection;

  if (nodes.length > 0 && variableId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        figma.notify('Error: Could not obtain the variable.');
        return;
      }

      await applyColorVariable(nodes, variable, action);
    } catch (error) {
      console.error('Error when applying the variable:', error);
      figma.notify('🚨 It was not possible to apply the variable.');
    }
  } else {
    figma.notify('😺 Oops! There is nothing selected.');
  }
}

async function handleApplyNumberVariable(variableId: string, action: string) {
  const nodes = figma.currentPage.selection;

  if (nodes.length > 0 && variableId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        figma.notify('Error: Could not obtain the variable.');
        return;
      }

      await applyNumberVariable(nodes, variable, action);
    } catch (error) {
      console.error('Error when applying the variable:', error);
      figma.notify('🚨 It was not possible to apply the variable.');
    }
  } else {
    figma.notify('😺 Oops! There is nothing selected.');
  }
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'apply-variable') {
    const variableId = msg.variableId;
    const variableType = msg.variableType;
    const action = msg.action;
    if (variableType === 'color') {
      await handleApplyColorVariable(variableId, action);
    } else if (variableType === 'number') {
      await handleApplyNumberVariable(variableId, action);
    }
  } else if (msg.type === 'reload-variables') {
    await loadAllData();
    figma.notify('🔄 Variables reloaded.');
  } else if (msg.type === 'confirmation-response') {
    confirmationManager.handleResponse(msg.id, msg.confirmed);
  } else if (msg.type === 'undo') {
    await historyManager.undo();
  } else if (msg.type === 'redo') {
    await historyManager.redo();
  } else if (msg.type === 'get-full-history') {
    const historyInfo = historyManager.getFullHistoryInfo();
    figma.ui.postMessage({
      type: 'full-history-response',
      historyInfo
    });
  } else if (msg.type === 'jump-to-action') {
    const success = await historyManager.jumpToAction(msg.index);
    if (success) {
      if (msg.index === -1) {
        figma.notify('⭐ Jumped to initial state');
      } else {
        figma.notify(`↶ Jumped to action ${msg.index + 1}`);
      }
    } else {
      figma.notify('⚠️ Failed to jump to action');
    }
  }
};

loadAllData();
