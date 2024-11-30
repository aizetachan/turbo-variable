import { VariableData, VariablesWithMetaInfoType } from '@ui/types';
import { processVariableValue } from '@plugin/processVariableValue';

export function processVariablesInChunks(
  allGroupedVariables: VariablesWithMetaInfoType[],
  chunkSize: number,
  callback: (variablesData: VariableData[]) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const allVariables = allGroupedVariables.flatMap((group) => group.variables);
    let currentIndex = 0;
    const variablesData: VariableData[] = [];

    function processNextChunk() {
      const chunk = allVariables.slice(currentIndex, currentIndex + chunkSize);
      Promise.all(
        chunk.map(async (variable) => {
          const variableValue = await processVariableValue(variable);

          variablesData.push({
            alias: variable.name || 'No alias',
            id: variable.id,
            value: variableValue,
            type: variable.resolvedType === 'COLOR' ? 'color' : 'number',
            isRemote: variable.remote,
            libraryName: allGroupedVariables.find((group) => group.variables.includes(variable))!
              .libraryName,
            scopes: variable.scopes || [],
            collectionName: allGroupedVariables.find((group) => group.variables.includes(variable))!
              .collectionName
          });
        })
      )
        .then(() => {
          currentIndex += chunkSize;
          if (currentIndex < allVariables.length) {
            setTimeout(processNextChunk, 0);
          } else {
            callback(variablesData);
            resolve();
          }
        })
        .catch(reject);
    }

    processNextChunk();
  });
}
