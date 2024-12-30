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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luLmpzIiwic291cmNlcyI6WyIuLi9zcmMvcGx1Z2luL3Byb2Nlc3NWYXJpYWJsZVZhbHVlLnRzIiwiLi4vc3JjL3BsdWdpbi9wcm9jZXNzVmFyaWFibGVzSW5DaHVua3MudHMiLCIuLi9zcmMvcGx1Z2luL2ltcG9ydFJlbW90ZVZhcmlhYmxlcy50cyIsIi4uL3NyYy9wbHVnaW4vbG9hZEFsbERhdGEudHMiLCIuLi9zcmMvcGx1Z2luL2lzVmFsaWRTY29wZUZvclByb3BlcnR5LnRzIiwiLi4vc3JjL3BsdWdpbi9hcHBseUNvbG9yVmFyaWFibGUudHMiLCIuLi9zcmMvcGx1Z2luL2FwcGx5TnVtYmVyVmFyaWFibGUudHMiLCIuLi9zcmMvcGx1Z2luL3BsdWdpbi50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc1ZhcmlhYmxlVmFsdWUodmFyaWFibGU6IFZhcmlhYmxlKTogUHJvbWlzZTxhbnk+IHtcbiAgaWYgKHZhcmlhYmxlLnZhbHVlc0J5TW9kZSAmJiB0eXBlb2YgdmFyaWFibGUudmFsdWVzQnlNb2RlID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG1vZGVJZHMgPSBPYmplY3Qua2V5cyh2YXJpYWJsZS52YWx1ZXNCeU1vZGUpO1xuXG4gICAgZm9yIChjb25zdCBtb2RlSWQgb2YgbW9kZUlkcykge1xuICAgICAgY29uc3QgdmFsdWUgPSB2YXJpYWJsZS52YWx1ZXNCeU1vZGVbbW9kZUlkXTtcblxuICAgICAgaWYgKFxuICAgICAgICB2YWx1ZSAmJlxuICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgICd0eXBlJyBpbiB2YWx1ZSAmJlxuICAgICAgICB2YWx1ZS50eXBlID09PSAnVkFSSUFCTEVfQUxJQVMnICYmXG4gICAgICAgIHZhbHVlLmlkXG4gICAgICApIHtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxWYXJpYWJsZSA9IGF3YWl0IGZpZ21hLnZhcmlhYmxlcy5nZXRWYXJpYWJsZUJ5SWRBc3luYyh2YWx1ZS5pZCk7XG4gICAgICAgIGlmIChvcmlnaW5hbFZhcmlhYmxlKSB7XG4gICAgICAgICAgY29uc3QgcmVzb2x2ZWRWYWx1ZSA9IGF3YWl0IHJlc29sdmVWYXJpYWJsZVZhbHVlKG9yaWdpbmFsVmFyaWFibGUpO1xuICAgICAgICAgIGlmIChyZXNvbHZlZFZhbHVlICE9PSB1bmRlZmluZWQpIHJldHVybiByZXNvbHZlZFZhbHVlO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnQ09MT1InICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3InIGluIHZhbHVlKSB7XG4gICAgICAgICAgY29uc3QgY29sb3JUb1JldHVybjogUmVjb3JkPHN0cmluZywgbnVtYmVyIHwgdW5kZWZpbmVkPiA9IHtcbiAgICAgICAgICAgIHI6IHZhbHVlLnIsXG4gICAgICAgICAgICBnOiB2YWx1ZS5nLFxuICAgICAgICAgICAgYjogdmFsdWUuYlxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKCdhJyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgY29sb3JUb1JldHVybi5hID0gdmFsdWUuYTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGNvbG9yVG9SZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnRkxPQVQnICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVWYXJpYWJsZVZhbHVlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IFByb21pc2U8YW55PiB7XG4gIHJldHVybiBwcm9jZXNzVmFyaWFibGVWYWx1ZSh2YXJpYWJsZSk7XG59XG4iLCJpbXBvcnQgeyBWYXJpYWJsZURhdGEsIFZhcmlhYmxlc1dpdGhNZXRhSW5mb1R5cGUgfSBmcm9tICdAdWkvdHlwZXMnO1xuaW1wb3J0IHsgcHJvY2Vzc1ZhcmlhYmxlVmFsdWUgfSBmcm9tICdAcGx1Z2luL3Byb2Nlc3NWYXJpYWJsZVZhbHVlJztcblxuZXhwb3J0IGZ1bmN0aW9uIHByb2Nlc3NWYXJpYWJsZXNJbkNodW5rcyhcbiAgYWxsR3JvdXBlZFZhcmlhYmxlczogVmFyaWFibGVzV2l0aE1ldGFJbmZvVHlwZVtdLFxuICBjaHVua1NpemU6IG51bWJlcixcbiAgY2FsbGJhY2s6ICh2YXJpYWJsZXNEYXRhOiBWYXJpYWJsZURhdGFbXSkgPT4gdm9pZFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgYWxsVmFyaWFibGVzID0gYWxsR3JvdXBlZFZhcmlhYmxlcy5mbGF0TWFwKChncm91cCkgPT4gZ3JvdXAudmFyaWFibGVzKTtcbiAgICBsZXQgY3VycmVudEluZGV4ID0gMDtcbiAgICBjb25zdCB2YXJpYWJsZXNEYXRhOiBWYXJpYWJsZURhdGFbXSA9IFtdO1xuXG4gICAgZnVuY3Rpb24gcHJvY2Vzc05leHRDaHVuaygpIHtcbiAgICAgIGNvbnN0IGNodW5rID0gYWxsVmFyaWFibGVzLnNsaWNlKGN1cnJlbnRJbmRleCwgY3VycmVudEluZGV4ICsgY2h1bmtTaXplKTtcbiAgICAgIFByb21pc2UuYWxsKFxuICAgICAgICBjaHVuay5tYXAoYXN5bmMgKHZhcmlhYmxlKSA9PiB7XG4gICAgICAgICAgY29uc3QgdmFyaWFibGVWYWx1ZSA9IGF3YWl0IHByb2Nlc3NWYXJpYWJsZVZhbHVlKHZhcmlhYmxlKTtcblxuICAgICAgICAgIHZhcmlhYmxlc0RhdGEucHVzaCh7XG4gICAgICAgICAgICBhbGlhczogdmFyaWFibGUubmFtZSB8fCAnTm8gYWxpYXMnLFxuICAgICAgICAgICAgaWQ6IHZhcmlhYmxlLmlkLFxuICAgICAgICAgICAgdmFsdWU6IHZhcmlhYmxlVmFsdWUsXG4gICAgICAgICAgICB0eXBlOiB2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdDT0xPUicgPyAnY29sb3InIDogJ251bWJlcicsXG4gICAgICAgICAgICBpc1JlbW90ZTogdmFyaWFibGUucmVtb3RlLFxuICAgICAgICAgICAgbGlicmFyeU5hbWU6IGFsbEdyb3VwZWRWYXJpYWJsZXMuZmluZCgoZ3JvdXApID0+IGdyb3VwLnZhcmlhYmxlcy5pbmNsdWRlcyh2YXJpYWJsZSkpIVxuICAgICAgICAgICAgICAubGlicmFyeU5hbWUsXG4gICAgICAgICAgICBzY29wZXM6IHZhcmlhYmxlLnNjb3BlcyB8fCBbXSxcbiAgICAgICAgICAgIGNvbGxlY3Rpb25OYW1lOiBhbGxHcm91cGVkVmFyaWFibGVzLmZpbmQoKGdyb3VwKSA9PiBncm91cC52YXJpYWJsZXMuaW5jbHVkZXModmFyaWFibGUpKSFcbiAgICAgICAgICAgICAgLmNvbGxlY3Rpb25OYW1lXG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBjdXJyZW50SW5kZXggKz0gY2h1bmtTaXplO1xuICAgICAgICAgIGlmIChjdXJyZW50SW5kZXggPCBhbGxWYXJpYWJsZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KHByb2Nlc3NOZXh0Q2h1bmssIDApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjYWxsYmFjayh2YXJpYWJsZXNEYXRhKTtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaChyZWplY3QpO1xuICAgIH1cblxuICAgIHByb2Nlc3NOZXh0Q2h1bmsoKTtcbiAgfSk7XG59XG4iLCJleHBvcnQgYXN5bmMgZnVuY3Rpb24gaW1wb3J0UmVtb3RlVmFyaWFibGVzKCkge1xuICB0cnkge1xuICAgIGNvbnN0IGxpYnJhcnlDb2xsZWN0aW9ucyA9XG4gICAgICBhd2FpdCBmaWdtYS50ZWFtTGlicmFyeS5nZXRBdmFpbGFibGVMaWJyYXJ5VmFyaWFibGVDb2xsZWN0aW9uc0FzeW5jKCk7XG5cbiAgICBmb3IgKGNvbnN0IGNvbGxlY3Rpb24gb2YgbGlicmFyeUNvbGxlY3Rpb25zKSB7XG4gICAgICBjb25zdCB2YXJpYWJsZXNJbkNvbGxlY3Rpb24gPSBhd2FpdCBmaWdtYS50ZWFtTGlicmFyeS5nZXRWYXJpYWJsZXNJbkxpYnJhcnlDb2xsZWN0aW9uQXN5bmMoXG4gICAgICAgIGNvbGxlY3Rpb24ua2V5XG4gICAgICApO1xuICAgICAgZm9yIChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXNJbkNvbGxlY3Rpb24pIHtcbiAgICAgICAgaWYgKHZhcmlhYmxlLnJlc29sdmVkVHlwZSA9PT0gJ0NPTE9SJyB8fCB2YXJpYWJsZS5yZXNvbHZlZFR5cGUgPT09ICdGTE9BVCcpIHtcbiAgICAgICAgICBhd2FpdCBmaWdtYS52YXJpYWJsZXMuaW1wb3J0VmFyaWFibGVCeUtleUFzeW5jKHZhcmlhYmxlLmtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZmlnbWEubm90aWZ5KCfinIUgVmFyaWFibGVzIGltcG9ydGVkIGNvcnJlY3RseS4nKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGVuIGltcG9ydGluZyByZW1vdGUgdmFyaWFibGVzOicsIGVycm9yKTtcbiAgICBmaWdtYS5ub3RpZnkoJ/CfmqggRXJyb3Igd2hlbiBpbXBvcnRpbmcgcmVtb3RlIHZhcmlhYmxlcy4nKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgcHJvY2Vzc1ZhcmlhYmxlc0luQ2h1bmtzIH0gZnJvbSAnQHBsdWdpbi9wcm9jZXNzVmFyaWFibGVzSW5DaHVua3MnO1xuaW1wb3J0IHsgaW1wb3J0UmVtb3RlVmFyaWFibGVzIH0gZnJvbSAnQHBsdWdpbi9pbXBvcnRSZW1vdGVWYXJpYWJsZXMnO1xuaW1wb3J0IHsgVmFyaWFibGVzV2l0aE1ldGFJbmZvVHlwZSB9IGZyb20gJ0B1aS90eXBlcyc7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkQWxsRGF0YSgpIHtcbiAgdHJ5IHtcbiAgICBmaWdtYS51aS5wb3N0TWVzc2FnZSh7IHR5cGU6ICdsb2FkaW5nLXN0YXJ0JyB9KTtcbiAgICBhd2FpdCBpbXBvcnRSZW1vdGVWYXJpYWJsZXMoKTtcblxuICAgIGNvbnN0IGNvbGxlY3Rpb25zID0gYXdhaXQgZmlnbWEudmFyaWFibGVzLmdldExvY2FsVmFyaWFibGVDb2xsZWN0aW9uc0FzeW5jKCk7XG4gICAgY29uc3QgbG9jYWxFbnJpY2hlZFZhcmlhYmxlczogVmFyaWFibGVzV2l0aE1ldGFJbmZvVHlwZVtdID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGNvbGxlY3Rpb24gb2YgY29sbGVjdGlvbnMpIHtcbiAgICAgIGNvbnN0IGxvY2FsVmFyaWFibGVzID0gW107XG5cbiAgICAgIGZvciAoY29uc3QgdmFyaWFibGUgb2YgY29sbGVjdGlvbi52YXJpYWJsZUlkcykge1xuICAgICAgICBjb25zdCBhd2FpdGVkVmFyID0gYXdhaXQgZmlnbWEudmFyaWFibGVzLmdldFZhcmlhYmxlQnlJZEFzeW5jKHZhcmlhYmxlKTtcblxuICAgICAgICBpZiAoYXdhaXRlZFZhcj8ucmVzb2x2ZWRUeXBlID09PSAnQ09MT1InIHx8IGF3YWl0ZWRWYXI/LnJlc29sdmVkVHlwZSA9PT0gJ0ZMT0FUJykge1xuICAgICAgICAgIGxvY2FsVmFyaWFibGVzLnB1c2goYXdhaXRlZFZhcik7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbG9jYWxFbnJpY2hlZFZhcmlhYmxlcy5wdXNoKHtcbiAgICAgICAgdmFyaWFibGVzOiBsb2NhbFZhcmlhYmxlcyxcbiAgICAgICAgbGlicmFyeU5hbWU6ICdMb2NhbCcsXG4gICAgICAgIGNvbGxlY3Rpb25OYW1lOiBjb2xsZWN0aW9uLm5hbWVcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGxpYnJhcnlDb2xsZWN0aW9ucyA9XG4gICAgICBhd2FpdCBmaWdtYS50ZWFtTGlicmFyeS5nZXRBdmFpbGFibGVMaWJyYXJ5VmFyaWFibGVDb2xsZWN0aW9uc0FzeW5jKCk7XG4gICAgY29uc3QgbGlicmFyeVZhcmlhYmxlczogVmFyaWFibGVzV2l0aE1ldGFJbmZvVHlwZVtdID0gW107XG4gICAgZm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGxpYnJhcnlDb2xsZWN0aW9ucykge1xuICAgICAgY29uc3QgdmFyaWFibGVzSW5Db2xsZWN0aW9uID0gYXdhaXQgZmlnbWEudGVhbUxpYnJhcnkuZ2V0VmFyaWFibGVzSW5MaWJyYXJ5Q29sbGVjdGlvbkFzeW5jKFxuICAgICAgICBjb2xsZWN0aW9uLmtleVxuICAgICAgKTtcbiAgICAgIGNvbnN0IG1hcHBlZDogVmFyaWFibGVzV2l0aE1ldGFJbmZvVHlwZSA9IHtcbiAgICAgICAgdmFyaWFibGVzOiBbXSxcbiAgICAgICAgbGlicmFyeU5hbWU6IGNvbGxlY3Rpb24ubGlicmFyeU5hbWUsXG4gICAgICAgIGNvbGxlY3Rpb25OYW1lOiBjb2xsZWN0aW9uLm5hbWVcbiAgICAgIH07XG4gICAgICBmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIHZhcmlhYmxlc0luQ29sbGVjdGlvbikge1xuICAgICAgICBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnQ09MT1InIHx8IHZhcmlhYmxlLnJlc29sdmVkVHlwZSA9PT0gJ0ZMT0FUJykge1xuICAgICAgICAgIGNvbnN0IGF3YWl0ZWRWYXIgPSBhd2FpdCBmaWdtYS52YXJpYWJsZXMuaW1wb3J0VmFyaWFibGVCeUtleUFzeW5jKHZhcmlhYmxlLmtleSk7XG4gICAgICAgICAgbWFwcGVkLnZhcmlhYmxlcy5wdXNoKGF3YWl0ZWRWYXIpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBsaWJyYXJ5VmFyaWFibGVzLnB1c2gobWFwcGVkKTtcbiAgICB9XG5cbiAgICBjb25zdCBhbGxWYXJpYWJsZXMgPSBbLi4ubG9jYWxFbnJpY2hlZFZhcmlhYmxlcywgLi4ubGlicmFyeVZhcmlhYmxlc107XG5cbiAgICBhd2FpdCBwcm9jZXNzVmFyaWFibGVzSW5DaHVua3MoYWxsVmFyaWFibGVzLCA1MCwgYXN5bmMgKHZhcmlhYmxlc0RhdGEpID0+IHtcbiAgICAgIGZpZ21hLnVpLnBvc3RNZXNzYWdlKHtcbiAgICAgICAgdHlwZTogJ2FsbC1kYXRhJyxcbiAgICAgICAgdmFyaWFibGVzOiB2YXJpYWJsZXNEYXRhXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBsb2FkaW5nIGFsbCB2YXJpYWJsZXMgOicsIGVycm9yKTtcbiAgICBmaWdtYS5ub3RpZnkoJ/CfmqggRXJyb3IgbG9hZGluZyBhbGwgdmFyaWFibGVzLicpO1xuICB9IGZpbmFsbHkge1xuICAgIGZpZ21hLnVpLnBvc3RNZXNzYWdlKHsgdHlwZTogJ2xvYWRpbmctZW5kJyB9KTtcbiAgfVxufVxuIiwiZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGlzVmFsaWRTY29wZUZvclByb3BlcnR5KHZhcmlhYmxlOiBWYXJpYWJsZSwgYWN0aW9uOiBhbnksIG5vZGU6IFNjZW5lTm9kZSkge1xuICBjb25zdCB7IHNjb3BlcyB9ID0gdmFyaWFibGU7XG5cbiAgaWYgKHNjb3Blcy5pbmNsdWRlcygnQUxMX1NDT1BFUycpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAodmFyaWFibGUucmVzb2x2ZWRUeXBlID09PSAnQ09MT1InKSB7XG4gICAgaWYgKGFjdGlvbiA9PT0gJ2ZpbGwnICYmICdmaWxscycgaW4gbm9kZSkge1xuICAgICAgaWYgKHNjb3Blcy5pbmNsdWRlcygnQUxMX0ZJTExTJykpIHJldHVybiB0cnVlO1xuICAgICAgaWYgKHNjb3Blcy5pbmNsdWRlcygnRlJBTUVfRklMTCcpICYmIG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykgcmV0dXJuIHRydWU7XG4gICAgICBpZiAoXG4gICAgICAgIHNjb3Blcy5pbmNsdWRlcygnU0hBUEVfRklMTCcpICYmXG4gICAgICAgIFsnUkVDVEFOR0xFJywgJ0VMTElQU0UnLCAnUE9MWUdPTicsICdTVEFSJ10uaW5jbHVkZXMobm9kZS50eXBlKVxuICAgICAgKVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIHJldHVybiBzY29wZXMuaW5jbHVkZXMoJ1RFWFRfRklMTCcpICYmIG5vZGUudHlwZSA9PT0gJ1RFWFQnO1xuICAgIH1cbiAgICBpZiAoYWN0aW9uID09PSAnc3Ryb2tlJyAmJiAnc3Ryb2tlcycgaW4gbm9kZSkge1xuICAgICAgcmV0dXJuIHNjb3Blcy5pbmNsdWRlcygnU1RST0tFX0NPTE9SJyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHZhcmlhYmxlLnJlc29sdmVkVHlwZSA9PT0gJ0ZMT0FUJykge1xuICAgIGlmIChhY3Rpb24gPT09ICdzcGFjZUJldHdlZW4nICYmIG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykge1xuICAgICAgcmV0dXJuIHNjb3Blcy5pbmNsdWRlcygnR0FQJyk7XG4gICAgfVxuICAgIGlmIChhY3Rpb24gPT09ICdib3JkZXJSYWRpdXMnICYmICdjb3JuZXJSYWRpdXMnIGluIG5vZGUpIHtcbiAgICAgIHJldHVybiBzY29wZXMuaW5jbHVkZXMoJ0NPUk5FUl9SQURJVVMnKTtcbiAgICB9XG4gICAgaWYgKGFjdGlvbiA9PT0gJ3BhZGRpbmcnICYmIG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykge1xuICAgICAgcmV0dXJuIHNjb3Blcy5pbmNsdWRlcygnR0FQJyk7XG4gICAgfVxuICAgIGlmIChhY3Rpb24gPT09ICdzdHJva2VXaWR0aCcgJiYgJ3N0cm9rZVdlaWdodCcgaW4gbm9kZSkge1xuICAgICAgcmV0dXJuIHNjb3Blcy5pbmNsdWRlcygnU1RST0tFX0ZMT0FUJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuIiwiaW1wb3J0IHsgaXNWYWxpZFNjb3BlRm9yUHJvcGVydHkgfSBmcm9tICdAcGx1Z2luL2lzVmFsaWRTY29wZUZvclByb3BlcnR5JztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5Q29sb3JWYXJpYWJsZShcbiAgbm9kZXM6IFJlYWRvbmx5QXJyYXk8U2NlbmVOb2RlPixcbiAgdmFyaWFibGU6IFZhcmlhYmxlLFxuICBhY3Rpb246IHN0cmluZ1xuKSB7XG4gIGlmIChub2Rlcy5sZW5ndGggPiAwICYmIHZhcmlhYmxlKSB7XG4gICAgdHJ5IHtcbiAgICAgIGxldCBhcHBsaWVkID0gZmFsc2U7XG5cbiAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgICBjb25zdCBpc1ZhbGlkU2NvcGUgPSBhd2FpdCBpc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSh2YXJpYWJsZSwgYWN0aW9uLCBub2RlKTtcblxuICAgICAgICBpZiAoaXNWYWxpZFNjb3BlKSB7XG4gICAgICAgICAgaWYgKGFjdGlvbiA9PT0gJ2ZpbGwnICYmICdmaWxscycgaW4gbm9kZSkge1xuICAgICAgICAgICAgYXBwbGllZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUuZmlsbHMpICYmIG5vZGUuZmlsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBjb25zdCBmaWxsc0NvcHkgPSBbLi4ubm9kZS5maWxsc107XG4gICAgICAgICAgICAgIGZpbGxzQ29weVswXSA9IGZpZ21hLnZhcmlhYmxlcy5zZXRCb3VuZFZhcmlhYmxlRm9yUGFpbnQoXG4gICAgICAgICAgICAgICAgZmlsbHNDb3B5WzBdLFxuICAgICAgICAgICAgICAgICdjb2xvcicsXG4gICAgICAgICAgICAgICAgdmFyaWFibGVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgbm9kZS5maWxscyA9IGZpbGxzQ29weTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG5vZGUuZmlsbHMgPSBbXG4gICAgICAgICAgICAgICAgZmlnbWEudmFyaWFibGVzLnNldEJvdW5kVmFyaWFibGVGb3JQYWludChcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ1NPTElEJyxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IHsgcjogMCwgZzogMCwgYjogMCB9LFxuICAgICAgICAgICAgICAgICAgICBvcGFjaXR5OiAxLFxuICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBibGVuZE1vZGU6ICdOT1JNQUwnXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgJ2NvbG9yJyxcbiAgICAgICAgICAgICAgICAgIHZhcmlhYmxlXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSAnc3Ryb2tlJyAmJiAnc3Ryb2tlcycgaW4gbm9kZSkge1xuICAgICAgICAgICAgYXBwbGllZCA9IHRydWU7XG5cbiAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KG5vZGUuc3Ryb2tlcykgJiYgbm9kZS5zdHJva2VzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgY29uc3Qgc3Ryb2tlc0NvcHkgPSBbLi4ubm9kZS5zdHJva2VzXTtcbiAgICAgICAgICAgICAgc3Ryb2tlc0NvcHlbMF0gPSBmaWdtYS52YXJpYWJsZXMuc2V0Qm91bmRWYXJpYWJsZUZvclBhaW50KFxuICAgICAgICAgICAgICAgIHN0cm9rZXNDb3B5WzBdLFxuICAgICAgICAgICAgICAgICdjb2xvcicsXG4gICAgICAgICAgICAgICAgdmFyaWFibGVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgbm9kZS5zdHJva2VzID0gc3Ryb2tlc0NvcHk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBub2RlLnN0cm9rZXMgPSBbXG4gICAgICAgICAgICAgICAgZmlnbWEudmFyaWFibGVzLnNldEJvdW5kVmFyaWFibGVGb3JQYWludChcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgdHlwZTogJ1NPTElEJyxcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IHsgcjogMCwgZzogMCwgYjogMCB9LFxuICAgICAgICAgICAgICAgICAgICBvcGFjaXR5OiAxLFxuICAgICAgICAgICAgICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBibGVuZE1vZGU6ICdOT1JNQUwnXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgJ2NvbG9yJyxcbiAgICAgICAgICAgICAgICAgIHZhcmlhYmxlXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICBdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoYXBwbGllZCkge1xuICAgICAgICBmaWdtYS5ub3RpZnkoJ+KchSBWYXJpYWJsZSBhcHBsaWVkIGNvcnJlY3RseS4nKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeSgn8J+aqyBTY29wZSBsaW1pdGF0aW9uLicpO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGVuIGFwcGx5aW5nIHRoZSB2YXJpYWJsZTonLCBlcnJvcik7XG4gICAgICBmaWdtYS5ub3RpZnkoJ/CfmqggSXQgd2FzIG5vdCBwb3NzaWJsZSB0byBhcHBseSB0aGUgdmFyaWFibGUuJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZpZ21hLm5vdGlmeSgn8J+YuiBPb3BzISBUaGVyZSBpcyBub3RoaW5nIHNlbGVjdGVkLicpO1xuICB9XG59XG4iLCJpbXBvcnQgeyBpc1ZhbGlkU2NvcGVGb3JQcm9wZXJ0eSB9IGZyb20gJ0BwbHVnaW4vaXNWYWxpZFNjb3BlRm9yUHJvcGVydHknO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlOdW1iZXJWYXJpYWJsZShcbiAgbm9kZXM6IFJlYWRvbmx5QXJyYXk8U2NlbmVOb2RlPixcbiAgdmFyaWFibGU6IFZhcmlhYmxlLFxuICBhY3Rpb246IHN0cmluZ1xuKSB7XG4gIGxldCBhcHBsaWVkID0gZmFsc2U7XG5cbiAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG4gICAgY29uc3QgaXNWYWxpZFNjb3BlID0gYXdhaXQgaXNWYWxpZFNjb3BlRm9yUHJvcGVydHkodmFyaWFibGUsIGFjdGlvbiwgbm9kZSk7XG5cbiAgICBpZiAoaXNWYWxpZFNjb3BlKSB7XG4gICAgICBpZiAoJ3NldEJvdW5kVmFyaWFibGUnIGluIG5vZGUpIHtcbiAgICAgICAgYXBwbGllZCA9IHRydWU7XG4gICAgICAgIGlmIChhY3Rpb24gPT09ICdzcGFjZUJldHdlZW4nICYmIG5vZGUudHlwZSA9PT0gJ0ZSQU1FJykge1xuICAgICAgICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgnaXRlbVNwYWNpbmcnLCB2YXJpYWJsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSAnYm9yZGVyUmFkaXVzJyAmJiAnY29ybmVyUmFkaXVzJyBpbiBub2RlKSB7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCd0b3BMZWZ0UmFkaXVzJywgdmFyaWFibGUpO1xuICAgICAgICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgndG9wUmlnaHRSYWRpdXMnLCB2YXJpYWJsZSk7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdib3R0b21MZWZ0UmFkaXVzJywgdmFyaWFibGUpO1xuICAgICAgICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgnYm90dG9tUmlnaHRSYWRpdXMnLCB2YXJpYWJsZSk7XG4gICAgICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSAncGFkZGluZ1ZlcnRpY2FsJyAmJiBub2RlLnR5cGUgPT09ICdGUkFNRScpIHtcbiAgICAgICAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3BhZGRpbmdUb3AnLCB2YXJpYWJsZSk7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdwYWRkaW5nQm90dG9tJywgdmFyaWFibGUpO1xuICAgICAgICB9IGVsc2UgaWYgKGFjdGlvbiA9PT0gJ3BhZGRpbmdIb3Jpem9udGFsJyAmJiBub2RlLnR5cGUgPT09ICdGUkFNRScpIHtcbiAgICAgICAgICBub2RlLnNldEJvdW5kVmFyaWFibGUoJ3BhZGRpbmdMZWZ0JywgdmFyaWFibGUpO1xuICAgICAgICAgIG5vZGUuc2V0Qm91bmRWYXJpYWJsZSgncGFkZGluZ1JpZ2h0JywgdmFyaWFibGUpO1xuICAgICAgICB9IGVsc2UgaWYgKGFjdGlvbiA9PT0gJ3N0cm9rZVdpZHRoJyAmJiAnc3Ryb2tlV2VpZ2h0JyBpbiBub2RlKSB7XG4gICAgICAgICAgbm9kZS5zZXRCb3VuZFZhcmlhYmxlKCdzdHJva2VXZWlnaHQnLCB2YXJpYWJsZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgTm9kZSBkb2VzIG5vdCBzdXBwb3J0IHZhcmlhYmxlIGJpbmRpbmcuYCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKGFwcGxpZWQpIHtcbiAgICBmaWdtYS5ub3RpZnkoJ+KchSBWYXJpYWJsZSBhcHBsaWVkIGNvcnJlY3RseS4nKTtcbiAgfSBlbHNlIHtcbiAgICBmaWdtYS5ub3RpZnkoJ/CfmqsgU2NvcGUgbGltaXRhdGlvbi4nKTtcbiAgfVxufVxuIiwiaW1wb3J0IHsgbG9hZEFsbERhdGEgfSBmcm9tICdAcGx1Z2luL2xvYWRBbGxEYXRhJztcbmltcG9ydCB7IGFwcGx5Q29sb3JWYXJpYWJsZSB9IGZyb20gJ0BwbHVnaW4vYXBwbHlDb2xvclZhcmlhYmxlJztcbmltcG9ydCB7IGFwcGx5TnVtYmVyVmFyaWFibGUgfSBmcm9tICdAcGx1Z2luL2FwcGx5TnVtYmVyVmFyaWFibGUnO1xuXG5maWdtYS5zaG93VUkoX19odG1sX18sIHsgd2lkdGg6IDI0MCwgaGVpZ2h0OiA2NjQgfSk7XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUFwcGx5Q29sb3JWYXJpYWJsZSh2YXJpYWJsZUlkOiBzdHJpbmcsIGFjdGlvbjogc3RyaW5nKSB7XG4gIGNvbnN0IG5vZGVzID0gZmlnbWEuY3VycmVudFBhZ2Uuc2VsZWN0aW9uO1xuXG4gIGlmIChub2Rlcy5sZW5ndGggPiAwICYmIHZhcmlhYmxlSWQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFyaWFibGUgPSBhd2FpdCBmaWdtYS52YXJpYWJsZXMuZ2V0VmFyaWFibGVCeUlkQXN5bmModmFyaWFibGVJZCk7XG4gICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeSgnRXJyb3I6IENvdWxkIG5vdCBvYnRhaW4gdGhlIHZhcmlhYmxlLicpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGFwcGx5Q29sb3JWYXJpYWJsZShub2RlcywgdmFyaWFibGUsIGFjdGlvbik7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoZW4gYXBwbHlpbmcgdGhlIHZhcmlhYmxlOicsIGVycm9yKTtcbiAgICAgIGZpZ21hLm5vdGlmeSgn8J+aqCBJdCB3YXMgbm90IHBvc3NpYmxlIHRvIGFwcGx5IHRoZSB2YXJpYWJsZS4nKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgZmlnbWEubm90aWZ5KCfwn5i6IE9vcHMhIFRoZXJlIGlzIG5vdGhpbmcgc2VsZWN0ZWQuJyk7XG4gIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gaGFuZGxlQXBwbHlOdW1iZXJWYXJpYWJsZSh2YXJpYWJsZUlkOiBzdHJpbmcsIGFjdGlvbjogc3RyaW5nKSB7XG4gIGNvbnN0IG5vZGVzID0gZmlnbWEuY3VycmVudFBhZ2Uuc2VsZWN0aW9uO1xuXG4gIGlmIChub2Rlcy5sZW5ndGggPiAwICYmIHZhcmlhYmxlSWQpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFyaWFibGUgPSBhd2FpdCBmaWdtYS52YXJpYWJsZXMuZ2V0VmFyaWFibGVCeUlkQXN5bmModmFyaWFibGVJZCk7XG4gICAgICBpZiAoIXZhcmlhYmxlKSB7XG4gICAgICAgIGZpZ21hLm5vdGlmeSgnRXJyb3I6IENvdWxkIG5vdCBvYnRhaW4gdGhlIHZhcmlhYmxlLicpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IGFwcGx5TnVtYmVyVmFyaWFibGUobm9kZXMsIHZhcmlhYmxlLCBhY3Rpb24pO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB3aGVuIGFwcGx5aW5nIHRoZSB2YXJpYWJsZTonLCBlcnJvcik7XG4gICAgICBmaWdtYS5ub3RpZnkoJ/CfmqggSXQgd2FzIG5vdCBwb3NzaWJsZSB0byBhcHBseSB0aGUgdmFyaWFibGUuJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGZpZ21hLm5vdGlmeSgn8J+YuiBPb3BzISBUaGVyZSBpcyBub3RoaW5nIHNlbGVjdGVkLicpO1xuICB9XG59XG5cbmZpZ21hLnVpLm9ubWVzc2FnZSA9IGFzeW5jIChtc2cpID0+IHtcbiAgaWYgKG1zZy50eXBlID09PSAnYXBwbHktdmFyaWFibGUnKSB7XG4gICAgY29uc3QgdmFyaWFibGVJZCA9IG1zZy52YXJpYWJsZUlkO1xuICAgIGNvbnN0IHZhcmlhYmxlVHlwZSA9IG1zZy52YXJpYWJsZVR5cGU7XG4gICAgY29uc3QgYWN0aW9uID0gbXNnLmFjdGlvbjtcbiAgICBpZiAodmFyaWFibGVUeXBlID09PSAnY29sb3InKSB7XG4gICAgICBhd2FpdCBoYW5kbGVBcHBseUNvbG9yVmFyaWFibGUodmFyaWFibGVJZCwgYWN0aW9uKTtcbiAgICB9IGVsc2UgaWYgKHZhcmlhYmxlVHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIGF3YWl0IGhhbmRsZUFwcGx5TnVtYmVyVmFyaWFibGUodmFyaWFibGVJZCwgYWN0aW9uKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICdyZWxvYWQtdmFyaWFibGVzJykge1xuICAgIGF3YWl0IGxvYWRBbGxEYXRhKCk7XG4gICAgZmlnbWEubm90aWZ5KCfwn5SEIFZhcmlhYmxlcyByZWxvYWRlZC4nKTtcbiAgfVxufTtcblxubG9hZEFsbERhdGEoKTtcbiJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxlQUFzQixxQkFBcUIsVUFBa0M7QUFDM0UsTUFBSSxTQUFTLGdCQUFnQixPQUFPLFNBQVMsaUJBQWlCLFVBQVU7QUFDdEUsVUFBTSxVQUFVLE9BQU8sS0FBSyxTQUFTLFlBQVk7QUFFakQsZUFBVyxVQUFVLFNBQVM7QUFDdEIsWUFBQSxRQUFRLFNBQVMsYUFBYSxNQUFNO0FBR3hDLFVBQUEsU0FDQSxPQUFPLFVBQVUsWUFDakIsVUFBVSxTQUNWLE1BQU0sU0FBUyxvQkFDZixNQUFNLElBQ047QUFDQSxjQUFNLG1CQUFtQixNQUFNLE1BQU0sVUFBVSxxQkFBcUIsTUFBTSxFQUFFO0FBQzVFLFlBQUksa0JBQWtCO0FBQ2QsZ0JBQUEsZ0JBQWdCLE1BQU0scUJBQXFCLGdCQUFnQjtBQUM3RCxjQUFBLGtCQUFrQixPQUFrQixRQUFBO0FBQUEsUUFBQTtBQUFBLE1BQzFDLE9BQ0s7QUFDTCxZQUFJLFNBQVMsaUJBQWlCLFdBQVcsT0FBTyxVQUFVLFlBQVksT0FBTyxPQUFPO0FBQ2xGLGdCQUFNLGdCQUFvRDtBQUFBLFlBQ3hELEdBQUcsTUFBTTtBQUFBLFlBQ1QsR0FBRyxNQUFNO0FBQUEsWUFDVCxHQUFHLE1BQU07QUFBQSxVQUNYO0FBQ0EsY0FBSSxPQUFPLE9BQU87QUFDaEIsMEJBQWMsSUFBSSxNQUFNO0FBQUEsVUFBQTtBQUVuQixpQkFBQTtBQUFBLFFBQUEsV0FDRSxTQUFTLGlCQUFpQixXQUFXLE9BQU8sVUFBVSxVQUFVO0FBQ2xFLGlCQUFBO0FBQUEsUUFBQTtBQUFBLE1BQ1Q7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUVLLFNBQUE7QUFDVDtBQUVBLGVBQWUscUJBQXFCLFVBQWtDO0FBQ3BFLFNB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
