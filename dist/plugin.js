async function processVariableValue(variable) {
  if (variable.valuesByMode && typeof variable.valuesByMode === "object") {
    const modeIds = Object.keys(variable.valuesByMode);
    for (const modeId of modeIds) {
      const value = variable.valuesByMode[modeId];
      if (value && typeof value === "object" && "type" in value && value.type === "VARIABLE_ALIAS" && value.id) {
        const originalVariable = await figma.variables.getVariableByIdAsync(value.id);
        if (originalVariable) {
          const resolvedValue = await resolveVariableValue(originalVariable);
          if (resolvedValue !== void 0) return resolvedValue;
        }
      } else {
        if (variable.resolvedType === "COLOR" && typeof value === "object" && "r" in value) {
          const colorToReturn = {
            r: value.r,
            g: value.g,
            b: value.b
          };
          if ("a" in value) {
            colorToReturn.a = value.a;
          }
          return colorToReturn;
        } else if (variable.resolvedType === "FLOAT" && typeof value === "number") {
          return value;
        }
      }
    }
  }
  return null;
}
async function resolveVariableValue(variable) {
  return processVariableValue(variable);
}
function processVariablesInChunks(allGroupedVariables, chunkSize, callback) {
  return new Promise((resolve, reject) => {
    const allVariables = allGroupedVariables.flatMap((group) => group.variables);
    const validVariables = allVariables.filter((v) => v.scopes && v.scopes.length > 0);
    let currentIndex = 0;
    const variablesData = [];
    function processNextChunk() {
      const chunk = validVariables.slice(currentIndex, currentIndex + chunkSize);
      Promise.all(
        chunk.map(async (variable) => {
          const variableValue = await processVariableValue(variable);
          variablesData.push({
            alias: variable.name || "No alias",
            id: variable.id,
            value: variableValue,
            type: variable.resolvedType === "COLOR" ? "color" : "number",
            isRemote: variable.remote,
            libraryName: allGroupedVariables.find((group) => group.variables.includes(variable)).libraryName,
            scopes: variable.scopes || [],
            collectionName: allGroupedVariables.find((group) => group.variables.includes(variable)).collectionName
          });
        })
      ).then(() => {
        currentIndex += chunkSize;
        if (currentIndex < validVariables.length) {
          setTimeout(processNextChunk, 0);
        } else {
          callback(variablesData);
          resolve();
        }
      }).catch(reject);
    }
    processNextChunk();
  });
}
async function importRemoteVariables() {
  try {
    const libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    for (const collection of libraryCollections) {
      const variablesInCollection = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(
        collection.key
      );
      for (const variable of variablesInCollection) {
        if (variable.resolvedType === "COLOR" || variable.resolvedType === "FLOAT") {
          await figma.variables.importVariableByKeyAsync(variable.key);
        }
      }
    }
    figma.notify("✅ Variables imported correctly.");
  } catch (error) {
    console.error("Error when importing remote variables:", error);
    figma.notify("🚨 Error when importing remote variables.");
  }
}
async function loadAllData() {
  try {
    figma.ui.postMessage({ type: "loading-start" });
    await importRemoteVariables();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const localEnrichedVariables = [];
    for (const collection of collections) {
      const localVariables = [];
      for (const variable of collection.variableIds) {
        const awaitedVar = await figma.variables.getVariableByIdAsync(variable);
        if ((awaitedVar == null ? void 0 : awaitedVar.resolvedType) === "COLOR" || (awaitedVar == null ? void 0 : awaitedVar.resolvedType) === "FLOAT") {
          localVariables.push(awaitedVar);
        }
      }
      localEnrichedVariables.push({
        variables: localVariables,
        libraryName: "Local",
        collectionName: collection.name
      });
    }
    const libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    const libraryVariables = [];
    for (const collection of libraryCollections) {
      const variablesInCollection = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(
        collection.key
      );
      const mapped = {
        variables: [],
        libraryName: collection.libraryName,
        collectionName: collection.name
      };
      for (const variable of variablesInCollection) {
        if (variable.resolvedType === "COLOR" || variable.resolvedType === "FLOAT") {
          const awaitedVar = await figma.variables.importVariableByKeyAsync(variable.key);
          mapped.variables.push(awaitedVar);
        }
      }
      libraryVariables.push(mapped);
    }
    const allVariables = [...localEnrichedVariables, ...libraryVariables];
    await processVariablesInChunks(allVariables, 50, async (variablesData) => {
      figma.ui.postMessage({
        type: "all-data",
        variables: variablesData
      });
    });
  } catch (error) {
    console.error("Error loading all variables :", error);
    figma.notify("🚨 Error loading all variables.");
  } finally {
    figma.ui.postMessage({ type: "loading-end" });
  }
}
const isValidScopeForProperty = async (variable, action, node) => {
  const { scopes } = variable;
  if (scopes.includes("ALL_SCOPES")) {
    return true;
  }
  if (variable.resolvedType === "COLOR") {
    if (action === "fill" && "fills" in node) {
      if (scopes.includes("ALL_FILLS")) return true;
      if (scopes.includes("FRAME_FILL") && node.type === "FRAME") return true;
      if (scopes.includes("SHAPE_FILL") && ["RECTANGLE", "ELLIPSE", "POLYGON", "STAR"].includes(node.type))
        return true;
      return scopes.includes("TEXT_FILL") && node.type === "TEXT";
    }
    if (action === "stroke" && "strokes" in node) {
      return scopes.includes("STROKE_COLOR");
    }
  } else if (variable.resolvedType === "FLOAT") {
    if (action === "spaceBetween" && node.type === "FRAME") {
      return scopes.includes("GAP");
    }
    if (action === "borderRadius" && "cornerRadius" in node) {
      return scopes.includes("CORNER_RADIUS");
    }
    if (action.includes("padding") && node.type === "FRAME") {
      return scopes.includes("GAP");
    }
    if (action === "strokeWidth" && "strokeWeight" in node) {
      return scopes.includes("STROKE_FLOAT");
    }
  }
  return false;
};
async function applyColorVariable(nodes, variable, action) {
  if (nodes.length > 0 && variable) {
    try {
      let applied = false;
      for (const node of nodes) {
        const isValidScope = await isValidScopeForProperty(variable, action, node);
        if (isValidScope) {
          if (action === "fill" && "fills" in node) {
            applied = true;
            if (Array.isArray(node.fills) && node.fills.length > 0) {
              const fillsCopy = [...node.fills];
              fillsCopy[0] = figma.variables.setBoundVariableForPaint(
                fillsCopy[0],
                "color",
                variable
              );
              node.fills = fillsCopy;
            } else {
              node.fills = [
                figma.variables.setBoundVariableForPaint(
                  {
                    type: "SOLID",
                    color: { r: 0, g: 0, b: 0 },
                    opacity: 1,
                    visible: true,
                    blendMode: "NORMAL"
                  },
                  "color",
                  variable
                )
              ];
            }
          } else if (action === "stroke" && "strokes" in node) {
            applied = true;
            if (Array.isArray(node.strokes) && node.strokes.length > 0) {
              const strokesCopy = [...node.strokes];
              strokesCopy[0] = figma.variables.setBoundVariableForPaint(
                strokesCopy[0],
                "color",
                variable
              );
              node.strokes = strokesCopy;
            } else {
              node.strokes = [
                figma.variables.setBoundVariableForPaint(
                  {
                    type: "SOLID",
                    color: { r: 0, g: 0, b: 0 },
                    opacity: 1,
                    visible: true,
                    blendMode: "NORMAL"
                  },
                  "color",
                  variable
                )
              ];
            }
          }
        }
      }
      if (applied) {
        figma.notify("✅ Variable applied correctly.");
      } else {
        figma.notify("🚫 Scope limitation.");
      }
    } catch (error) {
      console.error("Error when applying the variable:", error);
      figma.notify("🚨 It was not possible to apply the variable.");
    }
  } else {
    figma.notify("😺 Oops! There is nothing selected.");
  }
}
const setAutolayout = (node) => {
  node.layoutMode = "HORIZONTAL";
  node.layoutSizingHorizontal = "HUG";
  node.layoutSizingVertical = "HUG";
};
const ensureFrameHasAutoLayout = (node) => {
  if ("layoutMode" in node) {
    if (node.layoutMode === "NONE") {
      setAutolayout(node);
      return { ok: true, message: "\n⚠️ Layout mode set to horizontal." };
    }
    return { ok: true, message: "" };
  }
  return { ok: false, message: "🚨 Node must be a frame to apply spacing." };
};
const applyPadding = (node, variable, type) => {
  if (type === "vertical") {
    node.setBoundVariable("paddingTop", variable);
    node.setBoundVariable("paddingBottom", variable);
  } else if (type === "horizontal") {
    node.setBoundVariable("paddingLeft", variable);
    node.setBoundVariable("paddingRight", variable);
  } else if (type === "general") {
    node.setBoundVariable("paddingTop", variable);
    node.setBoundVariable("paddingBottom", variable);
    node.setBoundVariable("paddingLeft", variable);
    node.setBoundVariable("paddingRight", variable);
  }
};
const applyStrokeWeight = (node, variable) => {
  if ("strokes" in node && (!Array.isArray(node.strokes) || node.strokes.length === 0)) {
    node.strokes = [
      {
        type: "SOLID",
        color: { r: 0, g: 0, b: 0 },
        opacity: 1,
        visible: true,
        blendMode: "NORMAL"
      }
    ];
  }
  node.setBoundVariable("strokeWeight", variable);
  node.setBoundVariable("strokeTopWeight", variable);
  node.setBoundVariable("strokeRightWeight", variable);
  node.setBoundVariable("strokeBottomWeight", variable);
  node.setBoundVariable("strokeLeftWeight", variable);
};
const applyBorderRadius = (node, variable) => {
  node.setBoundVariable("topLeftRadius", variable);
  node.setBoundVariable("topRightRadius", variable);
  node.setBoundVariable("bottomLeftRadius", variable);
  node.setBoundVariable("bottomRightRadius", variable);
};
const applyNumberVariable = async (nodes, variable, action) => {
  let resultMessage = "";
  for (const node of nodes) {
    const isValidScope = await isValidScopeForProperty(variable, action, node);
    if (!isValidScope) {
      resultMessage = "🚫 Scope limitation.";
      continue;
    }
    if (!("setBoundVariable" in node)) {
      resultMessage = "🚨 Node does not support variable binding.";
      continue;
    }
    if (["spaceBetween", "paddingVertical", "paddingHorizontal", "paddingGeneral"].includes(action)) {
      const { ok, message } = ensureFrameHasAutoLayout(node);
      if (!ok) {
        figma.notify(message);
        return;
      }
      resultMessage += message;
    }
    switch (action) {
      case "spaceBetween":
        node.setBoundVariable("itemSpacing", variable);
        resultMessage = "✅ Variable applied correctly.";
        break;
      case "borderRadius":
        applyBorderRadius(node, variable);
        resultMessage = "✅ Variable applied correctly.";
        break;
      case "paddingVertical":
        if (node.type === "FRAME") {
          applyPadding(node, variable, "vertical");
          resultMessage = "✅ Variable applied correctly.";
        }
        break;
      case "paddingHorizontal":
        if (node.type === "FRAME") {
          applyPadding(node, variable, "horizontal");
          resultMessage = "✅ Variable applied correctly.";
        }
        break;
      case "paddingGeneral":
        if (node.type === "FRAME") {
          applyPadding(node, variable, "general");
          resultMessage = "✅ Variable applied correctly.";
        }
        break;
      case "strokeWidth":
        if ("strokes" in node) {
          applyStrokeWeight(node, variable);
          resultMessage = "✅ Variable applied correctly.";
        }
        break;
      default:
        resultMessage = "🚨 Unknown action.";
    }
  }
  figma.notify(resultMessage);
};
figma.showUI(__html__, { width: 240, height: 664 });
async function handleApplyColorVariable(variableId, action) {
  const nodes = figma.currentPage.selection;
  if (nodes.length > 0 && variableId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        figma.notify("Error: Could not obtain the variable.");
        return;
      }
      await applyColorVariable(nodes, variable, action);
    } catch (error) {
      console.error("Error when applying the variable:", error);
      figma.notify("🚨 It was not possible to apply the variable.");
    }
  } else {
    figma.notify("😺 Oops! There is nothing selected.");
  }
}
async function handleApplyNumberVariable(variableId, action) {
  const nodes = figma.currentPage.selection;
  if (nodes.length > 0 && variableId) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) {
        figma.notify("Error: Could not obtain the variable.");
        return;
      }
      await applyNumberVariable(nodes, variable, action);
    } catch (error) {
      console.error("Error when applying the variable:", error);
      figma.notify("🚨 It was not possible to apply the variable.");
    }
  } else {
    figma.notify("😺 Oops! There is nothing selected.");
  }
}
figma.ui.onmessage = async (msg) => {
  if (msg.type === "apply-variable") {
    const variableId = msg.variableId;
    const variableType = msg.variableType;
    const action = msg.action;
    if (variableType === "color") {
      await handleApplyColorVariable(variableId, action);
    } else if (variableType === "number") {
      await handleApplyNumberVariable(variableId, action);
    }
  } else if (msg.type === "reload-variables") {
    await loadAllData();
    figma.notify("🔄 Variables reloaded.");
  }
};
loadAllData();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luLmpzIiwic291cmNlcyI6WyIuLi9zcmMvcGx1Z2luL3Byb2Nlc3NWYXJpYWJsZVZhbHVlLnRzIiwiLi4vc3JjL3BsdWdpbi9wcm9jZXNzVmFyaWFibGVzSW5DaHVua3MudHMiLCIuLi9zcmMvcGx1Z2luL2ltcG9ydFJlbW90ZVZhcmlhYmxlcy50cyIsIi4uL3NyYy9wbHVnaW4vbG9hZEFsbERhdGEudHMiLCIuLi9zcmMvcGx1Z2luL2lzVmFsaWRTY29wZUZvclByb3BlcnR5LnRzIiwiLi4vc3JjL3BsdWdpbi9hcHBseUNvbG9yVmFyaWFibGUudHMiLCIuLi9zcmMvcGx1Z2luL2FwcGx5TnVtYmVyVmFyaWFibGUudHMiLCIuLi9zcmMvcGx1Z2luL3BsdWdpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZhcmlhYmxlVmFsdWUodmFyaWFibGU6IFZhcmlhYmxlKTogUHJvbWlzZTxhbnk+IHtcbiAgaWYgKHZhcmlhYmxlLnZhbHVlc0J5TW9kZSAmJiB0eXBlb2YgdmFyaWFibGUudmFsdWVzQnlNb2RlID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG1vZGVJZHMgPSBPYmplY3Qua2V5cyh2YXJpYWJsZS52YWx1ZXNCeU1vZGUpO1xuXG4gICAgZm9yIChjb25zdCBtb2RlSWQgb2YgbW9kZUlkcykge1xuICAgICAgY29uc3QgdmFsdWUgPSB2YXJpYWJsZS52YWx1ZXNCeU1vZGVbbW9kZUlkXTtcblxuICAgICAgaWYgKFxuICAgICAgICB2YWx1ZSAmJlxuICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgICd0eXBlJyBpbiB2YWx1ZSAmJlxuICAgICAgICB2YWx1ZS50eXBlID09PSAnVkFSSUFCTEVfQUxJQVMnICYmXG4gICAgICAgIHZhbHVlLmlkXG4gICAgICApIHtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxWYXJpYWJsZSA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRWYXJpYWJsZUJ5SWRBc3luYyh2YWx1ZS5pZCk7XG4gICAgICAgIGlmIChvcmlnaW5hbFZhcmlhYmxlKSB7XG4gICAgICAgICAgY29uc3QgcmVzb2x2ZWRWYWx1ZSA9IGF3YWl0IHJlc29sdmVWYXJpYWJsZVZhbHVlKG9yaWdpbmFsVmFyaWFibGUpO1xuICAgICAgICAgIGlmIChyZXNvbHZlZFZhbHVlICE9PSB1bmRlZmluZWQpIHJldHVybiByZXNvbHZlZFZhbHVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnQ09MT1InICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3InIGluIHZhbHVlKSB7XG4gICAgICAgICAgY29uc3QgY29sb3JUb1JldHVybjogUmVjb3JkPHN0cmluZywgbnVtYmVyIHwgdW5kZWZpbmVkPiA9IHtcbiAgICAgICAgICAgIHI6IHZhbHVlLnIsXG4gICAgICAgICAgICBnOiB2YWx1ZS5nLFxuICAgICAgICAgICAgYjogdmFsdWUuYlxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKCdhJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgY29sb3JUb1JldHVybi5hID0gdmFsdWUuYTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGNvbG9yVG9SZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnRkxPQVQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVWYXJpYWJsZVZhbHVlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IFByb21pc2U8YW55PiB7XG4gIHJldHVybiBwcm9jZXNzVmFyaWFibGVWYWx1ZSh2YXJpYWJsZSk7XG59XG4iLCJpbXBvcnQgeyBWYXJpYWJsZURhdGEsIFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGUgfSBmcm9tICdAdWkvdHlwZXMnO1xuaW1wb3J0IHsgcHJvY2Vzc1ZhcmlhYmxlVmFsdWUgfSBmcm9tICdAcGx1Z2luL3Byb2Nlc3NWYXJpYWJsZVZhbHVlJztcblxuZXhwb3J0IGZ1bmN0aW9uIHByb2Nlc3NWYXJpYWJsZXNJbkNodW5rcyhcbiAgYWxsR3JvdXBlZFZhcmlhYmxlczogVmFyaWFibGVzV2l0aE1ldGFJbmZvVHlwZVtdLFxuICBjaHVua1NpemU6IG51bWJlcixcbiAgY2FsbGJhY2s6ICh2YXJpYWJsZXNEYXRhOiBWYXJpYWJsZURhdGFbXSkgPT4gdm9pZFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgLy8gZmxhdHRlblxuICAgIGNvbnN0IGFsbFZhcmlhYmxlcyA9IGFsbEdyb3VwZWRWYXJpYWJsZXMuZmxhdE1hcCgoZ3JvdXApID0+IGdyb3VwLnZhcmlhYmxlcyk7XG5cbiAgICAvLyAqKkZpbHRlciBvdXQqKiBhbnkgdGhhdCBoYXZlIHNjb3BlcyA9PT0gW10gb3Igbm8gc2NvcGVzOlxuICAgIGNvbnN0IHZhbGlkVmFyaWFibGVzID0gYWxsVmFyaWFibGVzLmZpbHRlcigodikgPT4gdi5zY29wZXMgJiYgdi5zY29wZXMubGVuZ3RoID4gMCk7XG5cbiAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICBjb25zdCB2YXJpYWJsZXNEYXRhOiBWYXJpYWJsZURhdGFbXSA9IFtdO1xuXG4gICAgZnVuY3Rpb24gcHJvY2Vzc05leHRDaHVuaygpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gdmFsaWRWYXJpYWJsZXMuc2xpY2UoY3VycmVudEluZGV4LCBjdXJyZW50SW5kZXggKyBjaHVua1NpemUpO1xuICAgICAgUHJvbWlzZS5hbGwoXG4gICAgICAgIGNodW5rLm1hcChhc3luYyAodmFyaWFibGUpID0+IHtcbiAgICAgICAgICBjb25zdCB2YXJpYWJsZVZhbHVlID0gYXdhaXQgcHJvY2Vzc1ZhcmlhYmxlVmFsdWUodmFyaWFibGUpO1xuXG4gICAgICAgICAgdmFyaWFibGVzRGF0YS5wdXNoKHtcbiAgICAgICAgICAgIGFsaWFzOiB2YXJpYWJsZS5uYW1lIHx8ICdObyBhbGlhcycsXG4gICAgICAgICAgICBpZDogdmFyaWFibGUuaWQsXG4gICAgICAgICAgICB2YWx1ZTogdmFyaWFibGVWYWx1ZSxcbiAgICAgICAgICAgIHR5cGU6IHZhcmlhYmxlLnJlc29sdmVkVHlwZSA9PT0gJ0NPTE9SJyA/ICdjb2xvcicgOiAnbnVtYmVyJyxcbiAgICAgICAgICAgIGlzUmVtb3RlOiB2YXJpYWJsZS5yZW1vdGUsXG4gICAgICAgICAgICBsaWJyYXJ5TmFtZTogYWxsR3JvdXBlZFZhcmlhYmxlcy5maW5kKChncm91cCkgPT4gZ3JvdXAudmFyaWFibGVzLmluY2x1ZGVzKHZhcmlhYmxlKSkhXG4gICAgICAgICAgICAgIC5saWJyYXJ5TmFtZSxcbiAgICAgICAgICAgIHNjb3BlczogdmFyaWFibGUuc2NvcGVzIHx8IFtdLFxuICAgICAgICAgICAgY29sbGVjdGlvbk5hbWU6IGFsbEdyb3VwZWRWYXJpYWJsZXMuZmluZCgoZ3JvdXApID0+IGdyb3VwLnZhcmlhYmxlcy5pbmNsdWRlcyh2YXJpYWJsZSkpIVxuICAgICAgICAgICAgICAuY29sbGVjdGlvbk5hbWVcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGN1cnJlbnRJbmRleCArPSBjaHVua1NpemU7XG4gICAgICAgICAgaWYgKGN1cnJlbnRJbmRleCA8IHZhbGlkVmFyaWFibGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgc2V0VGltZW91dChwcm9jZXNzTmV4dENodW5rLCAwKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2sodmFyaWFibGVzRGF0YSk7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2gocmVqZWN0KTtcbiAgICB9XG5cbiAgICBwcm9jZXNzTmV4dENodW5rKCk7XG4gIH0pO1xufVxuIiwiZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGltcG9ydFJlbW90ZVZhcmlhYmxlcygpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBsaWJyYXJ5Q29sbGVjdGlvbnMgPVxuICAgICAgYXdhaXQgZmlnbWEudGVhbUxpYnJhcnkuZ2V0QXZhaWxhYmxlTGlicmFyeVZhcmlhYmxlQ29sbGVjdGlvbnNBc3luYygpO1xuXG4gICAgZm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGxpYnJhcnlDb2xsZWN0aW9ucykge1xuICAgICAgY29uc3QgdmFyaWFibGVzSW5Db2xsZWN0aW9uID0gYXdhaXQgZmlnbWEudGVhbUxpYnJhcnkuZ2V0VmFyaWFibGVzSW5MaWJyYXJ5Q29sbGVjdGlvbkFzeW5jKFxuICAgICAgICBjb2xsZWN0aW9uLmtleVxuICAgICAgKTtcbiAgICAgIGZvciAoY29uc3QgdmFyaWFibGUgb2YgdmFyaWFibGVzSW5Db2xsZWN0aW9uKSB7XG4gICAgICAgIGlmICh2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdDT0xPUicgfHwgdmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnRkxPQVQnKSB7XG4gICAgICAgICAgYXdhaXQgZmlnbWEudmFyaWFibGVzLmltcG9ydFZhcmlhYmxlQnlLZXlBc3luYyh2YXJpYWJsZS5rZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGZpZ21hLm5vdGlmeSgn4pyFIFZhcmlhYmxlcyBpbXBvcnRlZCBjb3JyZWN0bHkuJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hlbiBpbXBvcnRpbmcgcmVtb3RlIHZhcmlhYmxlczonLCBlcnJvcik7XG4gICAgZmlnbWEubm90aWZ5KCfwn5qoIEVycm9yIHdoZW4gaW1wb3J0aW5nIHJlbW90ZSB2YXJpYWJsZXMuJyk7XG4gIH1cbn1cbiIsImltcG9ydCB7IHByb2Nlc3NWYXJpYWJsZXNJbkNodW5rcyB9IGZyb20gJ0BwbHVnaW4vcHJvY2Vzc1ZhcmlhYmxlc0luQ2h1bmtzJztcbmltcG9ydCB7IGltcG9ydFJlbW90ZVZhcmlhYmxlcyB9IGZyb20gJ0BwbHVnaW4vaW1wb3J0UmVtb3RlVmFyaWFibGVzJztcbmltcG9ydCB7IFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGUgfSBmcm9tICdAdWkvdHlwZXMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZEFsbERhdGEoKSB7XG4gIHRyeSB7XG4gICAgZmlnbWEudWkucG9zdE1lc3NhZ2UoeyB0eXBlOiAnbG9hZGluZy1zdGFydCcgfSk7XG4gICAgYXdhaXQgaW1wb3J0UmVtb3RlVmFyaWFibGVzKCk7XG5cbiAgICBjb25zdCBjb2xsZWN0aW9ucyA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRMb2NhbFZhcmlhYmxlQ29sbGVjdGlvbnNBc3luYygpO1xuICAgIGNvbnN0IGxvY2FsRW5yaWNoZWRWYXJpYWJsZXM6IFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGVbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGNvbGxlY3Rpb25zKSB7XG4gICAgICBjb25zdCBsb2NhbFZhcmlhYmxlcyA9IFtdO1xuXG4gICAgICBmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGNvbGxlY3Rpb24udmFyaWFibGVJZHMpIHtcbiAgICAgICAgY29uc3QgYXdhaXRlZFZhciA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRWYXJpYWJsZUJ5SWRBc3luYyh2YXJpYWJsZSk7XG5cbiAgICAgICAgaWYgKGF3YWl0ZWRWYXI/LnJlc29sdmVkVHlwZSA9PT0gJ0NPTE9SJyB8fCBhd2FpdGVkVmFyPy5yZXNvbHZlZFR5cGUgPT09ICdGTE9BVCcpIHtcbiAgICAgICAgICBsb2NhbFZhcmlhYmxlcy5wdXNoKGF3YWl0ZWRWYXIpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvY2FsRW5yaWNoZWRWYXJpYWJsZXMucHVzaCh7XG4gICAgICAgIHZhcmlhYmxlczogbG9jYWxWYXJpYWJsZXMsXG4gICAgICAgIGxpYnJhcnlOYW1lOiAnTG9jYWwnLFxuICAgICAgICBjb2xsZWN0aW9uTmFtZTogY29sbGVjdGlvbi5uYW1lXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBsaWJyYXJ5Q29sbGVjdGlvbnMgPVxuICAgICAgYXdhaXQgZmlnbWEudGVhbUxpYnJhcnkuZ2V0QXZhaWxhYmxlTGlicmFyeVZhcmlhYmxlQ29sbGVjdGlvbnNBc3luYygpO1xuICAgIGNvbnN0IGxpYnJhcnlWYXJpYWJsZXM6IFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGVbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgY29sbGVjdGlvbiBvZiBsaWJyYXJ5Q29sbGVjdGlvbnMpIHtcbiAgICAgIGNvbnN0IHZhcmlhYmxlc0luQ29sbGVjdGlvbiA9IGF3YWl0IGZpZ21hLnRlYW1MaWJyYXJ5LmdldFZhcmlhYmxlc0luTGlicmFyeUNvbGxlY3Rpb25Bc3luYyhcbiAgICAgICAgY29sbGVjdGlvbi5rZXlcbiAgICAgICk7XG4gICAgICBjb25zdCBtYXBwZWQ6IFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGUgPSB7XG4gICAgICAgIHZhcmlhYmxlczogW10sXG4gICAgICAgIGxpYnJhcnlOYW1lOiBjb2xsZWN0aW9uLmxpYnJhcnlOYW1lLFxuICAgICAgICBjb2xsZWN0aW9uTmFtZTogY29sbGVjdGlvbi5uYW1lXG4gICAgICB9O1xuICAgICAgZm9yIChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXNJbkNvbGxlY3Rpb24pIHtcbiAgICAgICAgaWYgKHZhcmlhYmxlLnJlc29sdmVkVHlwZSA9PT0gJ0NPTE9SJyB8fCB2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdGTE9BVCcpIHtcbiAgICAgICAgICBjb25zdCBhd2FpdGVkVmFyID0gYXdhaXQgZmlnbWEudmFyaWFibGVzLmltcG9ydFZhcmlhYmxlQnlLZXlBc3luYyh2YXJpYWJsZS5rZXkpO1xuICAgICAgICAgIG1hcHBlZC52YXJpYWJsZXMucHVzaChhd2FpdGVkVmFyKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbGlicmFyeVZhcmlhYmxlcy5wdXNoKG1hcHBlZCk7XG4gICAgfVxuXG4gICAgY29uc3QgYWxsVmFyaWFibGVzID0gWy4uLmxvY2FsRW5yaWNoZWRWYXJpYWJsZXMsIC4uLmxpYnJhcnlWYXJpYWJsZXNdO1xuXG4gICAgYXdhaXQgcHJvY2Vzc1ZhcmlhYmxlc0luQ2h1bmtzKGFsbFZhcmlhYmxlcywgNTAsIGFzeW5jICh2YXJpYWJsZXNEYXRhKSA9PiB7XG4gICAgICBmaWdtYS51aS5wb3N0TWVzc2FnZSh7XG4gICAgICAgIHR5cGU6ICdhbGwtZGF0YScsXG4gICAgICAgIHZhcmlhYmxlczogdmFyaWFibGVzRGF0YVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgbG9hZGluZyBhbGwgdmFyaWFibGVzIDonLCBlcnJvcik7XG4gICAgZmlnbWEubm90aWZ5KCfwn5qoIEVycm9yIGxvYWRpbmcgYWxsIHZhcmlhYmxlcy4nKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBmaWdtYS51aS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdsb2FkaW5nLWVuZCcgfSk7XG4gIH1cbn1cbiIsImV4cG9ydCBjb25zdCBpc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSA9IGFzeW5jICh2YXJpYWJsZTogVmFyaWFibGUsIGFjdGlvbjogYW55LCBub2RlOiBTY2VuZU5vZGUpID0+IHtcbiAgY29uc3QgeyBzY29wZXMgfSA9IHZhcmlhYmxlO1xuXG4gIGlmIChzY29wZXMuaW5jbHVkZXMoJ0FMTF9TQ09QRVMnKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKHZhcmlhYmxlLnJlc29sdmVkVHlwZSA9PT0gJ0NPTE9SJykge1xuICAgIGlmIChhY3Rpb24gPT09ICdmaWxsJyAmJiAnZmlsbHMnIGluIG5vZGUpIHtcbiAgICAgIGlmIChzY29wZXMuaW5jbHVkZXMoJ0FMTF9GSUxMUycpKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChzY29wZXMuaW5jbHVkZXMoJ0ZSQU1FX0ZJTEwnKSAmJiBub2RlLnR5cGUgPT09ICdGUkFNRScpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKFxuICAgICAgICBzY29wZXMuaW5jbHVkZXMoJ1NIQVBFX0ZJTEwnKSAmJlxuICAgICAgICBbJ1JFQ1RBTkdMRScsICdFTExJUFNFJywgJ1BPTFlHT04nLCAnU1RBUiddLmluY2x1ZGVzKG5vZGUudHlwZSlcbiAgICAgIClcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICByZXR1cm4gc2NvcGVzLmluY2x1ZGVzKCdURVhUX0ZJTEwnKSAmJiBub2RlLnR5cGUgPT09ICdURVhUJztcbiAgICB9XG4gICAgaWYgKGFjdGlvbiA9PT0gJ3N0cm9rZScgJiYgJ3N0cm9rZXMnIGluIG5vZGUpIHtcbiAgICAgIHJldHVybiBzY29wZXMuaW5jbHVkZXMoJ1NUUk9LRV9DT0xPUicpO1xuICAgIH1cbiAgfSBlbHNlIGlmICh2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdGTE9BVCcpIHtcbiAgICBpZiAoYWN0aW9uID09PSAnc3BhY2VCZXR3ZWVuJyAmJiBub2RlLnR5cGUgPT09ICdGUkFNRScpIHtcbiAgICAgIHJldHVybiBzY29wZXMuaW5jbHVkZXMoJ0dBUCcpO1xuICAgIH1cbiAgICBpZiAoYWN0aW9uID09PSAnYm9yZGVyUmFkaXVzJyAmJiAnY29ybmVyUmFkaXVzJyBpbiBub2RlKSB7XG4gICAgICByZXR1cm4gc2NvcGVzLmluY2x1ZGVzKCdDT1JORVJfUkFESVVTJyk7XG4gICAgfVxuICAgIGlmIChhY3Rpb24uaW5jbHVkZXMoJ3BhZGRpbmcnKSAmJiBub2RlLnR5cGUgPT09ICdGUkFNRScpIHtcbiAgICAgIHJldHVybiBzY29wZXMuaW5jbHVkZXMoJ0dBUCcpO1xuICAgIH1cbiAgICBpZiAoYWN0aW9uID09PSAnc3Ryb2tlV2lkdGgnICYmICdzdHJva2VXZWlnaHQnIGluIG5vZGUpIHtcbiAgICAgIHJldHVybiBzY29wZXMuaW5jbHVkZXMoJ1NUUk9LRV9GTE9BVCcpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn07XG4iLCJpbXBvcnQgeyBpc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSB9IGZyb20gJ0BwbHVnaW4vaXNWYWxpZFNjb3BlRm9yUHJvcGVydHknO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlDb2xvclZhcmlhYmxlKFxuICBub2RlczogUmVhZG9ubHlBcnJheTxTY2VuZU5vZGU+LFxuICB2YXJpYWJsZTogVmFyaWFibGUsXG4gIGFjdGlvbjogc3RyaW5nXG4pIHtcbiAgaWYgKG5vZGVzLmxlbmd0aCA+IDAgJiYgdmFyaWFibGUpIHtcbiAgICB0cnkge1xuICAgICAgbGV0IGFwcGxpZWQgPSBmYWxzZTtcblxuICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgIGNvbnN0IGlzVmFsaWRTY29wZSA9IGF3YWl0IGlzVmFsaWRTY29wZUZvclByb3BlcnR5KHZhcmlhYmxlLCBhY3Rpb24sIG5vZGUpO1xuXG4gICAgICAgIGlmIChpc1ZhbGlkU2NvcGUpIHtcbiAgICAgICAgICBpZiAoYWN0aW9uID09PSAnZmlsbCcgJiYgJ2ZpbGxzJyBpbiBub2RlKSB7XG4gICAgICAgICAgICBhcHBsaWVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZS5maWxscykgJiYgbm9kZS5maWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpbGxzQ29weSA9IFsuLi5ub2RlLmZpbGxzXTtcbiAgICAgICAgICAgICAgZmlsbHNDb3B5WzBdID0gZmlnbWEudmFyaWFibGVzLnNldEJvdW5kVmFyaWFibGVGb3JQYWludChcbiAgICAgICAgICAgICAgICBmaWxsc0NvcHlbMF0sXG4gICAgICAgICAgICAgICAgJ2NvbG9yJyxcbiAgICAgICAgICAgICAgICB2YXJpYWJsZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBub2RlLmZpbGxzID0gZmlsbHNDb3B5O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbm9kZS5maWxscyA9IFtcbiAgICAgICAgICAgICAgICBmaWdtYS52YXJpYWJsZXMuc2V0Qm91bmRWYXJpYWJsZUZvclBhaW50KFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnU09MSUQnLFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogeyByOiAwLCBnOiAwLCBiOiAwIH0sXG4gICAgICAgICAgICAgICAgICAgIG9wYWNpdHk6IDEsXG4gICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGJsZW5kTW9kZTogJ05PUk1BTCdcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAnY29sb3InLFxuICAgICAgICAgICAgICAgICAgdmFyaWFibGVcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChhY3Rpb24gPT09ICdzdHJva2UnICYmICdzdHJva2VzJyBpbiBub2RlKSB7XG4gICAgICAgICAgICBhcHBsaWVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZS5zdHJva2VzKSAmJiBub2RlLnN0cm9rZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zdCBzdHJva2VzQ29weSA9IFsuLi5ub2RlLnN0cm9rZXNdO1xuICAgICAgICAgICAgICBzdHJva2VzQ29weVswXSA9IGZpZ21hLnZhcmlhYmxlcy5zZXRCb3VuZFZhcmlhYmxlRm9yUGFpbnQoXG4gICAgICAgICAgICAgICAgc3Ryb2tlc0NvcHlbMF0sXG4gICAgICAgICAgICAgICAgJ2NvbG9yJyxcbiAgICAgICAgICAgICAgICB2YXJpYWJsZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBub2RlLnN0cm9rZXMgPSBzdHJva2VzQ29weTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5vZGUuc3Ryb2tlcyA9IFtcbiAgICAgICAgICAgICAgICBmaWdtYS52YXJpYWJsZXMuc2V0Qm91bmRWYXJpYWJsZUZvclBhaW50KFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnU09MSUQnLFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogeyByOiAwLCBnOiAwLCBiOiAwIH0sXG4gICAgICAgICAgICAgICAgICAgIG9wYWNpdHk6IDEsXG4gICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGJsZW5kTW9kZTogJ05PUk1BTCdcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAnY29sb3InLFxuICAgICAgICAgICAgICAgICAgdmFyaWFibGVcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChhcHBsaWVkKSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeSgn4pyFIFZhcmlhYmxlIGFwcGxpZWQgY29ycmVjdGx5LicpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZmlnbWEubm90aWZ5KCfwn5qrIFNjb3BlIGxpbWl0YXRpb24uJyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gYXBwbHlpbmcgdGhlIHZhcmlhYmxlOicsIGVycm9yKTtcbiAgICAgIGZpZ21hLm5vdGlmeSgn8J+aqCBJdCB3YXMgbm90IHBvc3NpYmxlIHRvIGFwcGx5IHRoZSB2YXJpYWJsZS4nKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZmlnbWEubm90aWZ5KCfwn5i6IE9vcHMhIFRoZXJlIGlzIG5vdGhpbmcgc2VsZWN0ZWQuJyk7XG4gIH1cbn1cbiIsImltcG9ydCB7IGlzVmFsaWRTY29wZUZvclByb3BlcnR5IH0gZnJvbSAnQHBsdWdpbi9pc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSc7XG5cbmNvbnN0IHNldEF1dG9sYXlvdXQgPSAobm9kZTogRnJhbWVOb2RlKSA9PiB7XG4gIG5vZGUubGF5b3V0TW9kZSA9ICdIT1JJWk9OVEFMJztcbiAgbm9kZS5sYXlvdXRTaXppbmdIb3Jpem9udGFsID0gJ0hVRyc7XG4gIG5vZGUubGF5b3V0U2l6aW5nVmVydGljYWwgPSAnSFVHJztcbn07XG5cbmNvbnN0IGVuc3VyZUZyYW1lSGFzQXV0b0xheW91dCA9IChub2RlOiBTY2VuZU5vZGUpOiB7IG9rOiBib29sZWFuOyBtZXNzYWdlOiBzdHJpbmcgfSA9PiB7XG4gIGlmICgnbGF5b3V0TW9kZScgaW4gbm9kZSkge1xuICAgIGlmIChub2RlLmxheW91dE1vZGUgPT09ICdOT05FJykge1xuICAgICAgc2V0QXV0b2xheW91dChub2RlIGFzIEZyYW1lTm9kZSk7XG4gICAgICByZXR1cm4geyBvazogdHJ1ZSwgbWVzc2FnZTogJ1xcbuKaoO+4jyBMYXlvdXQgbW9kZSBzZXQgdG8gaG9yaXpvbnRhbC4nIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlLCBtZXNzYWdlOiAnJyB9O1xuICB9XG4gIHJldHVybiB7IG9rOiBmYWxzZSwgbWVzc2FnZTogJ/CfmqggTm9kZSBtdXN0IGJlIGEgZnJhbWUgdG8gYXBwbHkgc3BhY2luZy4nIH07XG59O1xuXG5jb25zdCBhcHBseVBhZGRpbmcgPSAoXG4gIG5vZGU6IEZyYW1lTm9kZSxcbiAgdmFyaWFibGU6IFZhcmlhYmxlLFxuICB0eXBlOiAndmVydGljYWwnIHwgJ2hvcml6b250YWwnIHwgJ2dlbmVyYWwnXG4pOiB2b2lkID0+IHtcbiAgaWYgKHR5cGUgPT09ICd2ZXJ0aWNhbCcpIHtcbiAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3BhZGRpbmdUb3AnLCB2YXJpYWJsZSk7XG4gICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdwYWRkaW5nQm90dG9tJywgdmFyaWFibGUpO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdob3Jpem9udGFsJykge1xuICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgncGFkZGluZ0xlZnQnLCB2YXJpYWJsZSk7XG4gICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdwYWRkaW5nUmlnaHQnLCB2YXJpYWJsZSk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ2dlbmVyYWwnKSB7XG4gICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdwYWRkaW5nVG9wJywgdmFyaWFibGUpO1xuICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgncGFkZGluZ0JvdHRvbScsIHZhcmlhYmxlKTtcbiAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3BhZGRpbmdMZWZ0JywgdmFyaWFibGUpO1xuICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgncGFkZGluZ1JpZ2h0JywgdmFyaWFibGUpO1xuICB9XG59O1xuXG5jb25zdCBhcHBseVN0cm9rZVdlaWdodCA9IChub2RlOiBTY2VuZU5vZGUsIHZhcmlhYmxlOiBWYXJpYWJsZSk6IHZvaWQgPT4ge1xuICBpZiAoJ3N0cm9rZXMnIGluIG5vZGUgJiYgKCFBcnJheS5pc0FycmF5KG5vZGUuc3Ryb2tlcykgfHwgbm9kZS5zdHJva2VzLmxlbmd0aCA9PT0gMCkpIHtcbiAgICBub2RlLnN0cm9rZXMgPSBbXG4gICAgICB7XG4gICAgICAgIHR5cGU6ICdTT0xJRCcsXG4gICAgICAgIGNvbG9yOiB7IHI6IDAsIGc6IDAsIGI6IDAgfSxcbiAgICAgICAgb3BhY2l0eTogMSxcbiAgICAgICAgdmlzaWJsZTogdHJ1ZSxcbiAgICAgICAgYmxlbmRNb2RlOiAnTk9STUFMJ1xuICAgICAgfVxuICAgIF07XG4gIH1cbiAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdzdHJva2VXZWlnaHQnLCB2YXJpYWJsZSk7XG4gIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgnc3Ryb2tlVG9wV2VpZ2h0JywgdmFyaWFibGUpO1xuICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3N0cm9rZVJpZ2h0V2VpZ2h0JywgdmFyaWFibGUpO1xuICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3N0cm9rZUJvdHRvbVdlaWdodCcsIHZhcmlhYmxlKTtcbiAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdzdHJva2VMZWZ0V2VpZ2h0JywgdmFyaWFibGUpO1xufTtcblxuY29uc3QgYXBwbHlCb3JkZXJSYWRpdXMgPSAobm9kZTogU2NlbmVOb2RlLCB2YXJpYWJsZTogVmFyaWFibGUpOiB2b2lkID0+IHtcbiAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCd0b3BMZWZ0UmFkaXVzJywgdmFyaWFibGUpO1xuICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3RvcFJpZ2h0UmFkaXVzJywgdmFyaWFibGUpO1xuICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ2JvdHRvbUxlZnRSYWRpdXMnLCB2YXJpYWJsZSk7XG4gIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgnYm90dG9tUmlnaHRSYWRpdXMnLCB2YXJpYWJsZSk7XG59O1xuXG5leHBvcnQgY29uc3QgYXBwbHlOdW1iZXJWYXJpYWJsZSA9IGFzeW5jIChcbiAgbm9kZXM6IFJlYWRvbmx5QXJyYXk8U2NlbmVOb2RlPixcbiAgdmFyaWFibGU6IFZhcmlhYmxlLFxuICBhY3Rpb246IHN0cmluZ1xuKSA9PiB7XG4gIGxldCByZXN1bHRNZXNzYWdlID0gJyc7XG5cbiAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgY29uc3QgaXNWYWxpZFNjb3BlID0gYXdhaXQgaXNWYWxpZFNjb3BlRm9yUHJvcGVydHkodmFyaWFibGUsIGFjdGlvbiwgbm9kZSk7XG5cbiAgICBpZiAoIWlzVmFsaWRTY29wZSkge1xuICAgICAgcmVzdWx0TWVzc2FnZSA9ICfwn5qrIFNjb3BlIGxpbWl0YXRpb24uJztcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICghKCdzZXRCb3VuZFZhcmlhYmxlJyBpbiBub2RlKSkge1xuICAgICAgcmVzdWx0TWVzc2FnZSA9ICfwn5qoIE5vZGUgZG9lcyBub3Qgc3VwcG9ydCB2YXJpYWJsZSBiaW5kaW5nLic7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoXG4gICAgICBbJ3NwYWNlQmV0d2VlbicsICdwYWRkaW5nVmVydGljYWwnLCAncGFkZGluZ0hvcml6b250YWwnLCAncGFkZGluZ0dlbmVyYWwnXS5pbmNsdWRlcyhhY3Rpb24pXG4gICAgKSB7XG4gICAgICBjb25zdCB7IG9rLCBtZXNzYWdlIH0gPSBlbnN1cmVGcmFtZUhhc0F1dG9MYXlvdXQobm9kZSk7XG4gICAgICBpZiAoIW9rKSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeShtZXNzYWdlKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgcmVzdWx0TWVzc2FnZSArPSBtZXNzYWdlO1xuICAgIH1cblxuICAgIHN3aXRjaCAoYWN0aW9uKSB7XG4gICAgICBjYXNlICdzcGFjZUJldHdlZW4nOlxuICAgICAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ2l0ZW1TcGFjaW5nJywgdmFyaWFibGUpO1xuICAgICAgICByZXN1bHRNZXNzYWdlID0gJ+KchSBWYXJpYWJsZSBhcHBsaWVkIGNvcnJlY3RseS4nO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2JvcmRlclJhZGl1cyc6XG4gICAgICAgIGFwcGx5Qm9yZGVyUmFkaXVzKG5vZGUsIHZhcmlhYmxlKTtcbiAgICAgICAgcmVzdWx0TWVzc2FnZSA9ICfinIUgVmFyaWFibGUgYXBwbGllZCBjb3JyZWN0bHkuJztcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwYWRkaW5nVmVydGljYWwnOlxuICAgICAgICBpZiAobm9kZS50eXBlID09PSAnRlJBTUUnKSB7XG4gICAgICAgICAgYXBwbHlQYWRkaW5nKG5vZGUgYXMgRnJhbWVOb2RlLCB2YXJpYWJsZSwgJ3ZlcnRpY2FsJyk7XG4gICAgICAgICAgcmVzdWx0TWVzc2FnZSA9ICfinIUgVmFyaWFibGUgYXBwbGllZCBjb3JyZWN0bHkuJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BhZGRpbmdIb3Jpem9udGFsJzpcbiAgICAgICAgaWYgKG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykge1xuICAgICAgICAgIGFwcGx5UGFkZGluZyhub2RlIGFzIEZyYW1lTm9kZSwgdmFyaWFibGUsICdob3Jpem9udGFsJyk7XG4gICAgICAgICAgcmVzdWx0TWVzc2FnZSA9ICfinIUgVmFyaWFibGUgYXBwbGllZCBjb3JyZWN0bHkuJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3BhZGRpbmdHZW5lcmFsJzpcbiAgICAgICAgaWYgKG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykge1xuICAgICAgICAgIGFwcGx5UGFkZGluZyhub2RlIGFzIEZyYW1lTm9kZSwgdmFyaWFibGUsICdnZW5lcmFsJyk7XG4gICAgICAgICAgcmVzdWx0TWVzc2FnZSA9ICfinIUgVmFyaWFibGUgYXBwbGllZCBjb3JyZWN0bHkuJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3N0cm9rZVdpZHRoJzpcbiAgICAgICAgaWYgKCdzdHJva2VzJyBpbiBub2RlKSB7XG4gICAgICAgICAgYXBwbHlTdHJva2VXZWlnaHQobm9kZSwgdmFyaWFibGUpO1xuICAgICAgICAgIHJlc3VsdE1lc3NhZ2UgPSAn4pyFIFZhcmlhYmxlIGFwcGxpZWQgY29ycmVjdGx5Lic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXN1bHRNZXNzYWdlID0gJ/CfmqggVW5rbm93biBhY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBmaWdtYS5ub3RpZnkocmVzdWx0TWVzc2FnZSk7XG59O1xuIiwiaW1wb3J0IHsgbG9hZEFsbERhdGEgfSBmcm9tICdAcGx1Z2luL2xvYWRBbGxEYXRhJztcbmltcG9ydCB7IGFwcGx5Q29sb3JWYXJpYWJsZSB9IGZyb20gJ0BwbHVnaW4vYXBwbHlDb2xvclZhcmlhYmxlJztcbmltcG9ydCB7IGFwcGx5TnVtYmVyVmFyaWFibGUgfSBmcm9tICdAcGx1Z2luL2FwcGx5TnVtYmVyVmFyaWFibGUnO1xuXG5maWdtYS5zaG93VUkoX19odG1sX18sIHsgd2lkdGg6IDI0MCwgaGVpZ2h0OiA2NjQgfSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFwcGx5Q29sb3JWYXJpYWJsZSh2YXJpYWJsZUlkOiBzdHJpbmcsIGFjdGlvbjogc3RyaW5nKSB7XG4gIGNvbnN0IG5vZGVzID0gZmlnbWEuY3VycmVudFBhZ2Uuc2VsZWN0aW9uO1xuXG4gIGlmIChub2Rlcy5sZW5ndGggPiAwICYmIHZhcmlhYmxlSWQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFyaWFibGUgPSBhd2FpdCBmaWdtYS52YXJpYWJsZXMuZ2V0VmFyaWFibGVCeUlkQXN5bmModmFyaWFibGVJZCk7XG4gICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeSgnRXJyb3I6IENvdWxkIG5vdCBvYnRhaW4gdGhlIHZhcmlhYmxlLicpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGFwcGx5Q29sb3JWYXJpYWJsZShub2RlcywgdmFyaWFibGUsIGFjdGlvbik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gYXBwbHlpbmcgdGhlIHZhcmlhYmxlOicsIGVycm9yKTtcbiAgICAgIGZpZ21hLm5vdGlmeSgn8J+aqCBJdCB3YXMgbm90IHBvc3NpYmxlIHRvIGFwcGx5IHRoZSB2YXJpYWJsZS4nKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZmlnbWEubm90aWZ5KCfwn5i6IE9vcHMhIFRoZXJlIGlzIG5vdGhpbmcgc2VsZWN0ZWQuJyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQXBwbHlOdW1iZXJWYXJpYWJsZSh2YXJpYWJsZUlkOiBzdHJpbmcsIGFjdGlvbjogc3RyaW5nKSB7XG4gIGNvbnN0IG5vZGVzID0gZmlnbWEuY3VycmVudFBhZ2Uuc2VsZWN0aW9uO1xuXG4gIGlmIChub2Rlcy5sZW5ndGggPiAwICYmIHZhcmlhYmxlSWQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFyaWFibGUgPSBhd2FpdCBmaWdtYS52YXJpYWJsZXMuZ2V0VmFyaWFibGVCeUlkQXN5bmModmFyaWFibGVJZCk7XG4gICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeSgnRXJyb3I6IENvdWxkIG5vdCBvYnRhaW4gdGhlIHZhcmlhYmxlLicpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGFwcGx5TnVtYmVyVmFyaWFibGUobm9kZXMsIHZhcmlhYmxlLCBhY3Rpb24pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGVuIGFwcGx5aW5nIHRoZSB2YXJpYWJsZTonLCBlcnJvcik7XG4gICAgICBmaWdtYS5ub3RpZnkoJ/CfmqggSXQgd2FzIG5vdCBwb3NzaWJsZSB0byBhcHBseSB0aGUgdmFyaWFibGUuJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZpZ21hLm5vdGlmeSgn8J+YuiBPb3BzISBUaGVyZSBpcyBub3RoaW5nIHNlbGVjdGVkLicpO1xuICB9XG59XG5cbmZpZ21hLnVpLm9ubWVzc2FnZSA9IGFzeW5jIChtc2cpID0+IHtcbiAgaWYgKG1zZy50eXBlID09PSAnYXBwbHktdmFyaWFibGUnKSB7XG4gICAgY29uc3QgdmFyaWFibGVJZCA9IG1zZy52YXJpYWJsZUlkO1xuICAgIGNvbnN0IHZhcmlhYmxlVHlwZSA9IG1zZy52YXJpYWJsZVR5cGU7XG4gICAgY29uc3QgYWN0aW9uID0gbXNnLmFjdGlvbjtcbiAgICBpZiAodmFyaWFibGVUeXBlID09PSAnY29sb3InKSB7XG4gICAgICBhd2FpdCBoYW5kbGVBcHBseUNvbG9yVmFyaWFibGUodmFyaWFibGVJZCwgYWN0aW9uKTtcbiAgICB9IGVsc2UgaWYgKHZhcmlhYmxlVHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIGF3YWl0IGhhbmRsZUFwcGx5TnVtYmVyVmFyaWFibGUodmFyaWFibGVJZCwgYWN0aW9uKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICdyZWxvYWQtdmFyaWFibGVzJykge1xuICAgIGF3YWl0IGxvYWRBbGxEYXRhKCk7XG4gICAgZmlnbWEubm90aWZ5KCfwn5SEIFZhcmlhYmxlcyByZWxvYWRlZC4nKTtcbiAgfVxufTtcblxubG9hZEFsbERhdGEoKTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxlQUFzQixxQkFBcUIsVUFBa0M7QUFDM0UsTUFBSSxTQUFTLGdCQUFnQixPQUFPLFNBQVMsaUJBQWlCLFVBQVU7QUFDdEUsVUFBTSxVQUFVLE9BQU8sS0FBSyxTQUFTLFlBQVk7QUFFakQsZUFBVyxVQUFVLFNBQVM7QUFDdEIsWUFBQSxRQUFRLFNBQVMsYUFBYSxNQUFNO0FBR3hDLFVBQUEsU0FDQSxPQUFPLFVBQVUsWUFDakIsVUFBVSxTQUNWLE1BQU0sU0FBUyxvQkFDZixNQUFNLElBQ047QUFDQSxjQUFNLG1CQUFtQixNQUFNLE1BQU0sVUFBVSxxQkFBcUIsTUFBTSxFQUFFO0FBQzVFLFlBQUksa0JBQWtCO0FBQ2QsZ0JBQUEsZ0JBQWdCLE1BQU0scUJBQXFCLGdCQUFnQjtBQUM3RCxjQUFBLGtCQUFrQixPQUFrQixRQUFBO0FBQUEsUUFBQTtBQUFBLE1BQzFDLE9BQ0s7QUFDTCxZQUFJLFNBQVMsaUJBQWlCLFdBQVcsT0FBTyxVQUFVLFlBQVksT0FBTyxPQUFPO0FBQ2xGLGdCQUFNLGdCQUFvRDtBQUFBLFlBQ3hELEdBQUcsTUFBTTtBQUFBLFlBQ1QsR0FBRyxNQUFNO0FBQUEsWUFDVCxHQUFH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
