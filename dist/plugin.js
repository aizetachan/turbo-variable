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
          return { r: value.r, g: value.g, b: value.b };
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
    let currentIndex = 0;
    const variablesData = [];
    function processNextChunk() {
      const chunk = allVariables.slice(currentIndex, currentIndex + chunkSize);
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
        if (currentIndex < allVariables.length) {
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
          if ((awaitedVar == null ? void 0 : awaitedVar.resolvedType) === "FLOAT") {
            console.log("FLOAT", awaitedVar);
          }
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
async function isValidScopeForProperty(variable, action, node) {
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
    if (action === "padding" && node.type === "FRAME") {
      return scopes.includes("GAP");
    }
    if (action === "strokeWidth" && "strokeWeight" in node) {
      return scopes.includes("STROKE_FLOAT");
    }
  }
  return false;
}
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
async function applyNumberVariable(nodes, variable, action) {
  let applied = false;
  for (const node of nodes) {
    const isValidScope = await isValidScopeForProperty(variable, action, node);
    if (isValidScope) {
      if ("setBoundVariable" in node) {
        applied = true;
        if (action === "spaceBetween" && node.type === "FRAME") {
          node.setBoundVariable("itemSpacing", variable);
        } else if (action === "borderRadius" && "cornerRadius" in node) {
          node.setBoundVariable("topLeftRadius", variable);
          node.setBoundVariable("topRightRadius", variable);
          node.setBoundVariable("bottomLeftRadius", variable);
          node.setBoundVariable("bottomRightRadius", variable);
        } else if (action === "paddingVertical" && node.type === "FRAME") {
          node.setBoundVariable("paddingTop", variable);
          node.setBoundVariable("paddingBottom", variable);
        } else if (action === "paddingHorizontal" && node.type === "FRAME") {
          node.setBoundVariable("paddingLeft", variable);
          node.setBoundVariable("paddingRight", variable);
        } else if (action === "strokeWidth" && "strokeWeight" in node) {
          node.setBoundVariable("strokeWeight", variable);
        }
      } else {
        console.warn(`Node does not support variable binding.`);
      }
    }
  }
  if (applied) {
    figma.notify("✅ Variable applied correctly.");
  } else {
    figma.notify("🚫 Scope limitation.");
  }
}
figma.showUI(__html__, { width: 240, height: 600 });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luLmpzIiwic291cmNlcyI6WyIuLi9zcmMvcGx1Z2luL3Byb2Nlc3NWYXJpYWJsZVZhbHVlLnRzIiwiLi4vc3JjL3BsdWdpbi9wcm9jZXNzVmFyaWFibGVzSW5DaHVua3MudHMiLCIuLi9zcmMvcGx1Z2luL2ltcG9ydFJlbW90ZVZhcmlhYmxlcy50cyIsIi4uL3NyYy9wbHVnaW4vbG9hZEFsbERhdGEudHMiLCIuLi9zcmMvcGx1Z2luL2lzVmFsaWRTY29wZUZvclByb3BlcnR5LnRzIiwiLi4vc3JjL3BsdWdpbi9hcHBseUNvbG9yVmFyaWFibGUudHMiLCIuLi9zcmMvcGx1Z2luL2FwcGx5TnVtYmVyVmFyaWFibGUudHMiLCIuLi9zcmMvcGx1Z2luL3BsdWdpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZhcmlhYmxlVmFsdWUodmFyaWFibGU6IFZhcmlhYmxlKTogUHJvbWlzZTxhbnk+IHtcbiAgaWYgKHZhcmlhYmxlLnZhbHVlc0J5TW9kZSAmJiB0eXBlb2YgdmFyaWFibGUudmFsdWVzQnlNb2RlID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG1vZGVJZHMgPSBPYmplY3Qua2V5cyh2YXJpYWJsZS52YWx1ZXNCeU1vZGUpO1xuXG4gICAgZm9yIChjb25zdCBtb2RlSWQgb2YgbW9kZUlkcykge1xuICAgICAgY29uc3QgdmFsdWUgPSB2YXJpYWJsZS52YWx1ZXNCeU1vZGVbbW9kZUlkXTtcblxuICAgICAgaWYgKFxuICAgICAgICB2YWx1ZSAmJlxuICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgICd0eXBlJyBpbiB2YWx1ZSAmJlxuICAgICAgICB2YWx1ZS50eXBlID09PSAnVkFSSUFCTEVfQUxJQVMnICYmXG4gICAgICAgIHZhbHVlLmlkXG4gICAgICApIHtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxWYXJpYWJsZSA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRWYXJpYWJsZUJ5SWRBc3luYyh2YWx1ZS5pZCk7XG4gICAgICAgIGlmIChvcmlnaW5hbFZhcmlhYmxlKSB7XG4gICAgICAgICAgY29uc3QgcmVzb2x2ZWRWYWx1ZSA9IGF3YWl0IHJlc29sdmVWYXJpYWJsZVZhbHVlKG9yaWdpbmFsVmFyaWFibGUpO1xuICAgICAgICAgIGlmIChyZXNvbHZlZFZhbHVlICE9PSB1bmRlZmluZWQpIHJldHVybiByZXNvbHZlZFZhbHVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnQ09MT1InICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3InIGluIHZhbHVlKSB7XG4gICAgICAgICAgcmV0dXJuIHsgcjogdmFsdWUuciwgZzogdmFsdWUuZywgYjogdmFsdWUuYiB9O1xuICAgICAgICB9IGVsc2UgaWYgKHZhcmlhYmxlLnJlc29sdmVkVHlwZSA9PT0gJ0ZMT0FUJyAmJiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG5hc3luYyBmdW5jdGlvbiByZXNvbHZlVmFyaWFibGVWYWx1ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBQcm9taXNlPGFueT4ge1xuICByZXR1cm4gcHJvY2Vzc1ZhcmlhYmxlVmFsdWUodmFyaWFibGUpO1xufVxuIiwiaW1wb3J0IHsgVmFyaWFibGVEYXRhLCBWYXJpYWJsZXNXaXRoTWV0YUluZm9UeXBlIH0gZnJvbSAnQHVpL3R5cGVzJztcbmltcG9ydCB7IHByb2Nlc3NWYXJpYWJsZVZhbHVlIH0gZnJvbSAnQHBsdWdpbi9wcm9jZXNzVmFyaWFibGVWYWx1ZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm9jZXNzVmFyaWFibGVzSW5DaHVua3MoXG4gIGFsbEdyb3VwZWRWYXJpYWJsZXM6IFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGVbXSxcbiAgY2h1bmtTaXplOiBudW1iZXIsXG4gIGNhbGxiYWNrOiAodmFyaWFibGVzRGF0YTogVmFyaWFibGVEYXRhW10pID0+IHZvaWRcbik6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IGFsbFZhcmlhYmxlcyA9IGFsbEdyb3VwZWRWYXJpYWJsZXMuZmxhdE1hcCgoZ3JvdXApID0+IGdyb3VwLnZhcmlhYmxlcyk7XG4gICAgbGV0IGN1cnJlbnRJbmRleCA9IDA7XG4gICAgY29uc3QgdmFyaWFibGVzRGF0YTogVmFyaWFibGVEYXRhW10gPSBbXTtcblxuICAgIGZ1bmN0aW9uIHByb2Nlc3NOZXh0Q2h1bmsoKSB7XG4gICAgICBjb25zdCBjaHVuayA9IGFsbFZhcmlhYmxlcy5zbGljZShjdXJyZW50SW5kZXgsIGN1cnJlbnRJbmRleCArIGNodW5rU2l6ZSk7XG4gICAgICBQcm9taXNlLmFsbChcbiAgICAgICAgY2h1bmsubWFwKGFzeW5jICh2YXJpYWJsZSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHZhcmlhYmxlVmFsdWUgPSBhd2FpdCBwcm9jZXNzVmFyaWFibGVWYWx1ZSh2YXJpYWJsZSk7XG5cbiAgICAgICAgICB2YXJpYWJsZXNEYXRhLnB1c2goe1xuICAgICAgICAgICAgYWxpYXM6IHZhcmlhYmxlLm5hbWUgfHwgJ05vIGFsaWFzJyxcbiAgICAgICAgICAgIGlkOiB2YXJpYWJsZS5pZCxcbiAgICAgICAgICAgIHZhbHVlOiB2YXJpYWJsZVZhbHVlLFxuICAgICAgICAgICAgdHlwZTogdmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnQ09MT1InID8gJ2NvbG9yJyA6ICdudW1iZXInLFxuICAgICAgICAgICAgaXNSZW1vdGU6IHZhcmlhYmxlLnJlbW90ZSxcbiAgICAgICAgICAgIGxpYnJhcnlOYW1lOiBhbGxHcm91cGVkVmFyaWFibGVzLmZpbmQoKGdyb3VwKSA9PiBncm91cC52YXJpYWJsZXMuaW5jbHVkZXModmFyaWFibGUpKSFcbiAgICAgICAgICAgICAgLmxpYnJhcnlOYW1lLFxuICAgICAgICAgICAgc2NvcGVzOiB2YXJpYWJsZS5zY29wZXMgfHwgW10sXG4gICAgICAgICAgICBjb2xsZWN0aW9uTmFtZTogYWxsR3JvdXBlZFZhcmlhYmxlcy5maW5kKChncm91cCkgPT4gZ3JvdXAudmFyaWFibGVzLmluY2x1ZGVzKHZhcmlhYmxlKSkhXG4gICAgICAgICAgICAgIC5jb2xsZWN0aW9uTmFtZVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgY3VycmVudEluZGV4ICs9IGNodW5rU2l6ZTtcbiAgICAgICAgICBpZiAoY3VycmVudEluZGV4IDwgYWxsVmFyaWFibGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgc2V0VGltZW91dChwcm9jZXNzTmV4dENodW5rLCAwKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2sodmFyaWFibGVzRGF0YSk7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2gocmVqZWN0KTtcbiAgICB9XG5cbiAgICBwcm9jZXNzTmV4dENodW5rKCk7XG4gIH0pO1xufVxuIiwiZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGltcG9ydFJlbW90ZVZhcmlhYmxlcygpIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBsaWJyYXJ5Q29sbGVjdGlvbnMgPVxuICAgICAgYXdhaXQgZmlnbWEudGVhbUxpYnJhcnkuZ2V0QXZhaWxhYmxlTGlicmFyeVZhcmlhYmxlQ29sbGVjdGlvbnNBc3luYygpO1xuXG4gICAgZm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGxpYnJhcnlDb2xsZWN0aW9ucykge1xuICAgICAgY29uc3QgdmFyaWFibGVzSW5Db2xsZWN0aW9uID0gYXdhaXQgZmlnbWEudGVhbUxpYnJhcnkuZ2V0VmFyaWFibGVzSW5MaWJyYXJ5Q29sbGVjdGlvbkFzeW5jKFxuICAgICAgICBjb2xsZWN0aW9uLmtleVxuICAgICAgKTtcbiAgICAgIGZvciAoY29uc3QgdmFyaWFibGUgb2YgdmFyaWFibGVzSW5Db2xsZWN0aW9uKSB7XG4gICAgICAgIGlmICh2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdDT0xPUicgfHwgdmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnRkxPQVQnKSB7XG4gICAgICAgICAgYXdhaXQgZmlnbWEudmFyaWFibGVzLmltcG9ydFZhcmlhYmxlQnlLZXlBc3luYyh2YXJpYWJsZS5rZXkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGZpZ21hLm5vdGlmeSgn4pyFIFZhcmlhYmxlcyBpbXBvcnRlZCBjb3JyZWN0bHkuJyk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hlbiBpbXBvcnRpbmcgcmVtb3RlIHZhcmlhYmxlczonLCBlcnJvcik7XG4gICAgZmlnbWEubm90aWZ5KCfwn5qoIEVycm9yIHdoZW4gaW1wb3J0aW5nIHJlbW90ZSB2YXJpYWJsZXMuJyk7XG4gIH1cbn1cbiIsImltcG9ydCB7IHByb2Nlc3NWYXJpYWJsZXNJbkNodW5rcyB9IGZyb20gJ0BwbHVnaW4vcHJvY2Vzc1ZhcmlhYmxlc0luQ2h1bmtzJztcbmltcG9ydCB7IGltcG9ydFJlbW90ZVZhcmlhYmxlcyB9IGZyb20gJ0BwbHVnaW4vaW1wb3J0UmVtb3RlVmFyaWFibGVzJztcbmltcG9ydCB7IFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGUgfSBmcm9tICdAdWkvdHlwZXMnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbG9hZEFsbERhdGEoKSB7XG4gIHRyeSB7XG4gICAgZmlnbWEudWkucG9zdE1lc3NhZ2UoeyB0eXBlOiAnbG9hZGluZy1zdGFydCcgfSk7XG4gICAgYXdhaXQgaW1wb3J0UmVtb3RlVmFyaWFibGVzKCk7XG5cbiAgICBjb25zdCBjb2xsZWN0aW9ucyA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRMb2NhbFZhcmlhYmxlQ29sbGVjdGlvbnNBc3luYygpO1xuICAgIGNvbnN0IGxvY2FsRW5yaWNoZWRWYXJpYWJsZXM6IFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGVbXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGNvbGxlY3Rpb25zKSB7XG4gICAgICBjb25zdCBsb2NhbFZhcmlhYmxlcyA9IFtdO1xuXG4gICAgICBmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGNvbGxlY3Rpb24udmFyaWFibGVJZHMpIHtcbiAgICAgICAgY29uc3QgYXdhaXRlZFZhciA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRWYXJpYWJsZUJ5SWRBc3luYyh2YXJpYWJsZSk7XG5cbiAgICAgICAgaWYgKGF3YWl0ZWRWYXI/LnJlc29sdmVkVHlwZSA9PT0gJ0NPTE9SJyB8fCBhd2FpdGVkVmFyPy5yZXNvbHZlZFR5cGUgPT09ICdGTE9BVCcpIHtcbiAgICAgICAgICBpZiAoYXdhaXRlZFZhcj8ucmVzb2x2ZWRUeXBlID09PSAnRkxPQVQnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnRkxPQVQnLCBhd2FpdGVkVmFyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgbG9jYWxWYXJpYWJsZXMucHVzaChhd2FpdGVkVmFyKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBsb2NhbEVucmljaGVkVmFyaWFibGVzLnB1c2goe1xuICAgICAgICB2YXJpYWJsZXM6IGxvY2FsVmFyaWFibGVzLFxuICAgICAgICBsaWJyYXJ5TmFtZTogJ0xvY2FsJyxcbiAgICAgICAgY29sbGVjdGlvbk5hbWU6IGNvbGxlY3Rpb24ubmFtZVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgbGlicmFyeUNvbGxlY3Rpb25zID1cbiAgICAgIGF3YWl0IGZpZ21hLnRlYW1MaWJyYXJ5LmdldEF2YWlsYWJsZUxpYnJhcnlWYXJpYWJsZUNvbGxlY3Rpb25zQXN5bmMoKTtcbiAgICBjb25zdCBsaWJyYXJ5VmFyaWFibGVzOiBWYXJpYWJsZXNXaXRoTWV0YUluZm9UeXBlW10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IGNvbGxlY3Rpb24gb2YgbGlicmFyeUNvbGxlY3Rpb25zKSB7XG4gICAgICBjb25zdCB2YXJpYWJsZXNJbkNvbGxlY3Rpb24gPSBhd2FpdCBmaWdtYS50ZWFtTGlicmFyeS5nZXRWYXJpYWJsZXNJbkxpYnJhcnlDb2xsZWN0aW9uQXN5bmMoXG4gICAgICAgIGNvbGxlY3Rpb24ua2V5XG4gICAgICApO1xuICAgICAgY29uc3QgbWFwcGVkOiBWYXJpYWJsZXNXaXRoTWV0YUluZm9UeXBlID0ge1xuICAgICAgICB2YXJpYWJsZXM6IFtdLFxuICAgICAgICBsaWJyYXJ5TmFtZTogY29sbGVjdGlvbi5saWJyYXJ5TmFtZSxcbiAgICAgICAgY29sbGVjdGlvbk5hbWU6IGNvbGxlY3Rpb24ubmFtZVxuICAgICAgfTtcbiAgICAgIGZvciAoY29uc3QgdmFyaWFibGUgb2YgdmFyaWFibGVzSW5Db2xsZWN0aW9uKSB7XG4gICAgICAgIGlmICh2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdDT0xPUicgfHwgdmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnRkxPQVQnKSB7XG4gICAgICAgICAgY29uc3QgYXdhaXRlZFZhciA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5pbXBvcnRWYXJpYWJsZUJ5S2V5QXN5bmModmFyaWFibGUua2V5KTtcbiAgICAgICAgICBtYXBwZWQudmFyaWFibGVzLnB1c2goYXdhaXRlZFZhcik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxpYnJhcnlWYXJpYWJsZXMucHVzaChtYXBwZWQpO1xuICAgIH1cblxuICAgIGNvbnN0IGFsbFZhcmlhYmxlcyA9IFsuLi5sb2NhbEVucmljaGVkVmFyaWFibGVzLCAuLi5saWJyYXJ5VmFyaWFibGVzXTtcblxuICAgIGF3YWl0IHByb2Nlc3NWYXJpYWJsZXNJbkNodW5rcyhhbGxWYXJpYWJsZXMsIDUwLCBhc3luYyAodmFyaWFibGVzRGF0YSkgPT4ge1xuICAgICAgZmlnbWEudWkucG9zdE1lc3NhZ2Uoe1xuICAgICAgICB0eXBlOiAnYWxsLWRhdGEnLFxuICAgICAgICB2YXJpYWJsZXM6IHZhcmlhYmxlc0RhdGFcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGxvYWRpbmcgYWxsIHZhcmlhYmxlcyA6JywgZXJyb3IpO1xuICAgIGZpZ21hLm5vdGlmeSgn8J+aqCBFcnJvciBsb2FkaW5nIGFsbCB2YXJpYWJsZXMuJyk7XG4gIH0gZmluYWxseSB7XG4gICAgZmlnbWEudWkucG9zdE1lc3NhZ2UoeyB0eXBlOiAnbG9hZGluZy1lbmQnIH0pO1xuICB9XG59XG4iLCJleHBvcnQgYXN5bmMgZnVuY3Rpb24gaXNWYWxpZFNjb3BlRm9yUHJvcGVydHkodmFyaWFibGU6IFZhcmlhYmxlLCBhY3Rpb246IGFueSwgbm9kZTogU2NlbmVOb2RlKSB7XG4gIGNvbnN0IHsgc2NvcGVzIH0gPSB2YXJpYWJsZTtcblxuICBpZiAoc2NvcGVzLmluY2x1ZGVzKCdBTExfU0NPUEVTJykpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGlmICh2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdDT0xPUicpIHtcbiAgICBpZiAoYWN0aW9uID09PSAnZmlsbCcgJiYgJ2ZpbGxzJyBpbiBub2RlKSB7XG4gICAgICBpZiAoc2NvcGVzLmluY2x1ZGVzKCdBTExfRklMTFMnKSkgcmV0dXJuIHRydWU7XG4gICAgICBpZiAoc2NvcGVzLmluY2x1ZGVzKCdGUkFNRV9GSUxMJykgJiYgbm9kZS50eXBlID09PSAnRlJBTUUnKSByZXR1cm4gdHJ1ZTtcbiAgICAgIGlmIChcbiAgICAgICAgc2NvcGVzLmluY2x1ZGVzKCdTSEFQRV9GSUxMJykgJiZcbiAgICAgICAgWydSRUNUQU5HTEUnLCAnRUxMSVBTRScsICdQT0xZR09OJywgJ1NUQVInXS5pbmNsdWRlcyhub2RlLnR5cGUpXG4gICAgICApXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgcmV0dXJuIHNjb3Blcy5pbmNsdWRlcygnVEVYVF9GSUxMJykgJiYgbm9kZS50eXBlID09PSAnVEVYVCc7XG4gICAgfVxuICAgIGlmIChhY3Rpb24gPT09ICdzdHJva2UnICYmICdzdHJva2VzJyBpbiBub2RlKSB7XG4gICAgICByZXR1cm4gc2NvcGVzLmluY2x1ZGVzKCdTVFJPS0VfQ09MT1InKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnRkxPQVQnKSB7XG4gICAgaWYgKGFjdGlvbiA9PT0gJ3NwYWNlQmV0d2VlbicgJiYgbm9kZS50eXBlID09PSAnRlJBTUUnKSB7XG4gICAgICByZXR1cm4gc2NvcGVzLmluY2x1ZGVzKCdHQVAnKTtcbiAgICB9XG4gICAgaWYgKGFjdGlvbiA9PT0gJ2JvcmRlclJhZGl1cycgJiYgJ2Nvcm5lclJhZGl1cycgaW4gbm9kZSkge1xuICAgICAgcmV0dXJuIHNjb3Blcy5pbmNsdWRlcygnQ09STkVSX1JBRElVUycpO1xuICAgIH1cbiAgICBpZiAoYWN0aW9uID09PSAncGFkZGluZycgJiYgbm9kZS50eXBlID09PSAnRlJBTUUnKSB7XG4gICAgICByZXR1cm4gc2NvcGVzLmluY2x1ZGVzKCdHQVAnKTtcbiAgICB9XG4gICAgaWYgKGFjdGlvbiA9PT0gJ3N0cm9rZVdpZHRoJyAmJiAnc3Ryb2tlV2VpZ2h0JyBpbiBub2RlKSB7XG4gICAgICByZXR1cm4gc2NvcGVzLmluY2x1ZGVzKCdTVFJPS0VfRkxPQVQnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG4iLCJpbXBvcnQgeyBpc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSB9IGZyb20gJ0BwbHVnaW4vaXNWYWxpZFNjb3BlRm9yUHJvcGVydHknO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlDb2xvclZhcmlhYmxlKFxuICBub2RlczogUmVhZG9ubHlBcnJheTxTY2VuZU5vZGU+LFxuICB2YXJpYWJsZTogVmFyaWFibGUsXG4gIGFjdGlvbjogc3RyaW5nXG4pIHtcbiAgaWYgKG5vZGVzLmxlbmd0aCA+IDAgJiYgdmFyaWFibGUpIHtcbiAgICB0cnkge1xuICAgICAgbGV0IGFwcGxpZWQgPSBmYWxzZTtcblxuICAgICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgIGNvbnN0IGlzVmFsaWRTY29wZSA9IGF3YWl0IGlzVmFsaWRTY29wZUZvclByb3BlcnR5KHZhcmlhYmxlLCBhY3Rpb24sIG5vZGUpO1xuXG4gICAgICAgIGlmIChpc1ZhbGlkU2NvcGUpIHtcbiAgICAgICAgICBpZiAoYWN0aW9uID09PSAnZmlsbCcgJiYgJ2ZpbGxzJyBpbiBub2RlKSB7XG4gICAgICAgICAgICBhcHBsaWVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZS5maWxscykgJiYgbm9kZS5maWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpbGxzQ29weSA9IFsuLi5ub2RlLmZpbGxzXTtcbiAgICAgICAgICAgICAgZmlsbHNDb3B5WzBdID0gZmlnbWEudmFyaWFibGVzLnNldEJvdW5kVmFyaWFibGVGb3JQYWludChcbiAgICAgICAgICAgICAgICBmaWxsc0NvcHlbMF0sXG4gICAgICAgICAgICAgICAgJ2NvbG9yJyxcbiAgICAgICAgICAgICAgICB2YXJpYWJsZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBub2RlLmZpbGxzID0gZmlsbHNDb3B5O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbm9kZS5maWxscyA9IFtcbiAgICAgICAgICAgICAgICBmaWdtYS52YXJpYWJsZXMuc2V0Qm91bmRWYXJpYWJsZUZvclBhaW50KFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnU09MSUQnLFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogeyByOiAwLCBnOiAwLCBiOiAwIH0sXG4gICAgICAgICAgICAgICAgICAgIG9wYWNpdHk6IDEsXG4gICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGJsZW5kTW9kZTogJ05PUk1BTCdcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAnY29sb3InLFxuICAgICAgICAgICAgICAgICAgdmFyaWFibGVcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChhY3Rpb24gPT09ICdzdHJva2UnICYmICdzdHJva2VzJyBpbiBub2RlKSB7XG4gICAgICAgICAgICBhcHBsaWVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkobm9kZS5zdHJva2VzKSAmJiBub2RlLnN0cm9rZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zdCBzdHJva2VzQ29weSA9IFsuLi5ub2RlLnN0cm9rZXNdO1xuICAgICAgICAgICAgICBzdHJva2VzQ29weVswXSA9IGZpZ21hLnZhcmlhYmxlcy5zZXRCb3VuZFZhcmlhYmxlRm9yUGFpbnQoXG4gICAgICAgICAgICAgICAgc3Ryb2tlc0NvcHlbMF0sXG4gICAgICAgICAgICAgICAgJ2NvbG9yJyxcbiAgICAgICAgICAgICAgICB2YXJpYWJsZVxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICBub2RlLnN0cm9rZXMgPSBzdHJva2VzQ29weTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5vZGUuc3Ryb2tlcyA9IFtcbiAgICAgICAgICAgICAgICBmaWdtYS52YXJpYWJsZXMuc2V0Qm91bmRWYXJpYWJsZUZvclBhaW50KFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICB0eXBlOiAnU09MSUQnLFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogeyByOiAwLCBnOiAwLCBiOiAwIH0sXG4gICAgICAgICAgICAgICAgICAgIG9wYWNpdHk6IDEsXG4gICAgICAgICAgICAgICAgICAgIHZpc2libGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGJsZW5kTW9kZTogJ05PUk1BTCdcbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAnY29sb3InLFxuICAgICAgICAgICAgICAgICAgdmFyaWFibGVcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChhcHBsaWVkKSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeSgn4pyFIFZhcmlhYmxlIGFwcGxpZWQgY29ycmVjdGx5LicpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZmlnbWEubm90aWZ5KCfwn5qrIFNjb3BlIGxpbWl0YXRpb24uJyk7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gYXBwbHlpbmcgdGhlIHZhcmlhYmxlOicsIGVycm9yKTtcbiAgICAgIGZpZ21hLm5vdGlmeSgn8J+aqCBJdCB3YXMgbm90IHBvc3NpYmxlIHRvIGFwcGx5IHRoZSB2YXJpYWJsZS4nKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZmlnbWEubm90aWZ5KCfwn5i6IE9vcHMhIFRoZXJlIGlzIG5vdGhpbmcgc2VsZWN0ZWQuJyk7XG4gIH1cbn1cbiIsImltcG9ydCB7IGlzVmFsaWRTY29wZUZvclByb3BlcnR5IH0gZnJvbSAnQHBsdWdpbi9pc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseU51bWJlclZhcmlhYmxlKFxuICBub2RlczogUmVhZG9ubHlBcnJheTxTY2VuZU5vZGU+LFxuICB2YXJpYWJsZTogVmFyaWFibGUsXG4gIGFjdGlvbjogc3RyaW5nXG4pIHtcbiAgbGV0IGFwcGxpZWQgPSBmYWxzZTtcblxuICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICBjb25zdCBpc1ZhbGlkU2NvcGUgPSBhd2FpdCBpc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSh2YXJpYWJsZSwgYWN0aW9uLCBub2RlKTtcblxuICAgIGlmIChpc1ZhbGlkU2NvcGUpIHtcbiAgICAgIGlmICgnc2V0Qm91bmRWYXJpYWJsZScgaW4gbm9kZSkge1xuICAgICAgICBhcHBsaWVkID0gdHJ1ZTtcbiAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ3NwYWNlQmV0d2VlbicgJiYgbm9kZS50eXBlID09PSAnRlJBTUUnKSB7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdpdGVtU3BhY2luZycsIHZhcmlhYmxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChhY3Rpb24gPT09ICdib3JkZXJSYWRpdXMnICYmICdjb3JuZXJSYWRpdXMnIGluIG5vZGUpIHtcbiAgICAgICAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3RvcExlZnRSYWRpdXMnLCB2YXJpYWJsZSk7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCd0b3BSaWdodFJhZGl1cycsIHZhcmlhYmxlKTtcbiAgICAgICAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ2JvdHRvbUxlZnRSYWRpdXMnLCB2YXJpYWJsZSk7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdib3R0b21SaWdodFJhZGl1cycsIHZhcmlhYmxlKTtcbiAgICAgICAgfSBlbHNlIGlmIChhY3Rpb24gPT09ICdwYWRkaW5nVmVydGljYWwnICYmIG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykge1xuICAgICAgICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgncGFkZGluZ1RvcCcsIHZhcmlhYmxlKTtcbiAgICAgICAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3BhZGRpbmdCb3R0b20nLCB2YXJpYWJsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSAncGFkZGluZ0hvcml6b250YWwnICYmIG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykge1xuICAgICAgICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgncGFkZGluZ0xlZnQnLCB2YXJpYWJsZSk7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdwYWRkaW5nUmlnaHQnLCB2YXJpYWJsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSAnc3Ryb2tlV2lkdGgnICYmICdzdHJva2VXZWlnaHQnIGluIG5vZGUpIHtcbiAgICAgICAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3N0cm9rZVdlaWdodCcsIHZhcmlhYmxlKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBOb2RlIGRvZXMgbm90IHN1cHBvcnQgdmFyaWFibGUgYmluZGluZy5gKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoYXBwbGllZCkge1xuICAgIGZpZ21hLm5vdGlmeSgn4pyFIFZhcmlhYmxlIGFwcGxpZWQgY29ycmVjdGx5LicpO1xuICB9IGVsc2Uge1xuICAgIGZpZ21hLm5vdGlmeSgn8J+aqyBTY29wZSBsaW1pdGF0aW9uLicpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBsb2FkQWxsRGF0YSB9IGZyb20gJ0BwbHVnaW4vbG9hZEFsbERhdGEnO1xuaW1wb3J0IHsgYXBwbHlDb2xvclZhcmlhYmxlIH0gZnJvbSAnQHBsdWdpbi9hcHBseUNvbG9yVmFyaWFibGUnO1xuaW1wb3J0IHsgYXBwbHlOdW1iZXJWYXJpYWJsZSB9IGZyb20gJ0BwbHVnaW4vYXBwbHlOdW1iZXJWYXJpYWJsZSc7XG5cbmZpZ21hLnNob3dVSShfX2h0bWxfXywgeyB3aWR0aDogMjQwLCBoZWlnaHQ6IDYwMCB9KTtcblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQXBwbHlDb2xvclZhcmlhYmxlKHZhcmlhYmxlSWQ6IHN0cmluZywgYWN0aW9uOiBzdHJpbmcpIHtcbiAgY29uc3Qgbm9kZXMgPSBmaWdtYS5jdXJyZW50UGFnZS5zZWxlY3Rpb247XG5cbiAgaWYgKG5vZGVzLmxlbmd0aCA+IDAgJiYgdmFyaWFibGVJZCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YXJpYWJsZSA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRWYXJpYWJsZUJ5SWRBc3luYyh2YXJpYWJsZUlkKTtcbiAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgZmlnbWEubm90aWZ5KCdFcnJvcjogQ291bGQgbm90IG9idGFpbiB0aGUgdmFyaWFibGUuJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgYXBwbHlDb2xvclZhcmlhYmxlKG5vZGVzLCB2YXJpYWJsZSwgYWN0aW9uKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3Igd2hlbiBhcHBseWluZyB0aGUgdmFyaWFibGU6JywgZXJyb3IpO1xuICAgICAgZmlnbWEubm90aWZ5KCfwn5qoIEl0IHdhcyBub3QgcG9zc2libGUgdG8gYXBwbHkgdGhlIHZhcmlhYmxlLicpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmaWdtYS5ub3RpZnkoJ/CfmLogT29wcyEgVGhlcmUgaXMgbm90aGluZyBzZWxlY3RlZC4nKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVBcHBseU51bWJlclZhcmlhYmxlKHZhcmlhYmxlSWQ6IHN0cmluZywgYWN0aW9uOiBzdHJpbmcpIHtcbiAgY29uc3Qgbm9kZXMgPSBmaWdtYS5jdXJyZW50UGFnZS5zZWxlY3Rpb247XG5cbiAgaWYgKG5vZGVzLmxlbmd0aCA+IDAgJiYgdmFyaWFibGVJZCkge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YXJpYWJsZSA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRWYXJpYWJsZUJ5SWRBc3luYyh2YXJpYWJsZUlkKTtcbiAgICAgIGlmICghdmFyaWFibGUpIHtcbiAgICAgICAgZmlnbWEubm90aWZ5KCdFcnJvcjogQ291bGQgbm90IG9idGFpbiB0aGUgdmFyaWFibGUuJyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgYXBwbHlOdW1iZXJWYXJpYWJsZShub2RlcywgdmFyaWFibGUsIGFjdGlvbik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gYXBwbHlpbmcgdGhlIHZhcmlhYmxlOicsIGVycm9yKTtcbiAgICAgIGZpZ21hLm5vdGlmeSgn8J+aqCBJdCB3YXMgbm90IHBvc3NpYmxlIHRvIGFwcGx5IHRoZSB2YXJpYWJsZS4nKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZmlnbWEubm90aWZ5KCfwn5i6IE9vcHMhIFRoZXJlIGlzIG5vdGhpbmcgc2VsZWN0ZWQuJyk7XG4gIH1cbn1cblxuZmlnbWEudWkub25tZXNzYWdlID0gYXN5bmMgKG1zZykgPT4ge1xuICBpZiAobXNnLnR5cGUgPT09ICdhcHBseS12YXJpYWJsZScpIHtcbiAgICBjb25zdCB2YXJpYWJsZUlkID0gbXNnLnZhcmlhYmxlSWQ7XG4gICAgY29uc3QgdmFyaWFibGVUeXBlID0gbXNnLnZhcmlhYmxlVHlwZTtcbiAgICBjb25zdCBhY3Rpb24gPSBtc2cuYWN0aW9uO1xuICAgIGlmICh2YXJpYWJsZVR5cGUgPT09ICdjb2xvcicpIHtcbiAgICAgIGF3YWl0IGhhbmRsZUFwcGx5Q29sb3JWYXJpYWJsZSh2YXJpYWJsZUlkLCBhY3Rpb24pO1xuICAgIH0gZWxzZSBpZiAodmFyaWFibGVUeXBlID09PSAnbnVtYmVyJykge1xuICAgICAgYXdhaXQgaGFuZGxlQXBwbHlOdW1iZXJWYXJpYWJsZSh2YXJpYWJsZUlkLCBhY3Rpb24pO1xuICAgIH1cbiAgfSBlbHNlIGlmIChtc2cudHlwZSA9PT0gJ3JlbG9hZC12YXJpYWJsZXMnKSB7XG4gICAgYXdhaXQgbG9hZEFsbERhdGEoKTtcbiAgICBmaWdtYS5ub3RpZnkoJ/CflIQgVmFyaWFibGVzIHJlbG9h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
