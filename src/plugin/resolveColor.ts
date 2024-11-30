export async function processColorValues(variable: Variable) {
  if (variable.valuesByMode && typeof variable.valuesByMode === 'object') {
    const modeIds = Object.keys(variable.valuesByMode);

    for (const modeId of modeIds) {
      const colorValue = variable.valuesByMode[modeId];
      if (
        colorValue &&
        typeof colorValue === 'object' &&
        'type' in colorValue &&
        colorValue.type === 'VARIABLE_ALIAS' &&
        colorValue.id
      ) {
        const originalVariable = await figma.variables.getVariableByIdAsync(colorValue.id);
        if (originalVariable) {
          const resolvedColor = await resolveColor(originalVariable);
          if (resolvedColor) return resolvedColor;
        }
      } else if (
        colorValue &&
        typeof colorValue === 'object' &&
        'r' in colorValue &&
        colorValue.r !== undefined &&
        colorValue.g !== undefined &&
        colorValue.b !== undefined
      ) {
        return { r: colorValue.r, g: colorValue.g, b: colorValue.b };
      }
    }
  }
  return null;
}

async function resolveColor(variable: Variable) {
  if (variable.valuesByMode && typeof variable.valuesByMode === 'object') {
    const modeIds = Object.keys(variable.valuesByMode);
    if (modeIds.length > 0) {
      const colorValue = variable.valuesByMode[modeIds[0]];
      if (
        colorValue &&
        typeof colorValue === 'object' &&
        'r' in colorValue &&
        colorValue.r !== undefined &&
        colorValue.g !== undefined &&
        colorValue.b !== undefined
      ) {
        return { r: colorValue.r, g: colorValue.g, b: colorValue.b };
      }
    }
  }
  return null;
}
