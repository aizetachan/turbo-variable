export async function processVariableValue(variable: Variable): Promise<any> {
  if (variable.valuesByMode && typeof variable.valuesByMode === 'object') {
    const modeIds = Object.keys(variable.valuesByMode);

    for (const modeId of modeIds) {
      const value = variable.valuesByMode[modeId];

      if (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'VARIABLE_ALIAS' &&
        value.id
      ) {
        const originalVariable = await figma.variables.getVariableByIdAsync(value.id);
        if (originalVariable) {
          const resolvedValue = await resolveVariableValue(originalVariable);
          if (resolvedValue !== undefined) return resolvedValue;
        }
      } else {
        if (variable.resolvedType === 'COLOR' && typeof value === 'object' && 'r' in value) {
          return { r: value.r, g: value.g, b: value.b };
        } else if (variable.resolvedType === 'FLOAT' && typeof value === 'number') {
          return value;
        }
      }
    }
  }
  return null;
}

async function resolveVariableValue(variable: Variable): Promise<any> {
  return processVariableValue(variable);
}
