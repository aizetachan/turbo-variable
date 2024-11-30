import { processVariablesInChunks } from '@plugin/processVariablesInChunks';
import { importRemoteVariables } from '@plugin/importRemoteVariables';
import { VariablesWithMetaInfoType } from '@ui/types';

export async function loadAllData() {
  try {
    figma.ui.postMessage({ type: 'loading-start' });
    await importRemoteVariables();

    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const localEnrichedVariables: VariablesWithMetaInfoType[] = [];

    for (const collection of collections) {
      const localVariables = [];

      for (const variable of collection.variableIds) {
        const awaitedVar = await figma.variables.getVariableByIdAsync(variable);

        if (awaitedVar?.resolvedType === 'COLOR' || awaitedVar?.resolvedType === 'FLOAT') {
          if (awaitedVar?.resolvedType === 'FLOAT') {
            console.log('FLOAT', awaitedVar);
          }
          localVariables.push(awaitedVar);
        }
      }

      localEnrichedVariables.push({
        variables: localVariables,
        libraryName: 'Local',
        collectionName: collection.name
      });
    }

    const libraryCollections =
      await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    const libraryVariables: VariablesWithMetaInfoType[] = [];
    for (const collection of libraryCollections) {
      const variablesInCollection = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(
        collection.key
      );
      const mapped: VariablesWithMetaInfoType = {
        variables: [],
        libraryName: collection.libraryName,
        collectionName: collection.name
      };
      for (const variable of variablesInCollection) {
        if (variable.resolvedType === 'COLOR' || variable.resolvedType === 'FLOAT') {
          const awaitedVar = await figma.variables.importVariableByKeyAsync(variable.key);
          mapped.variables.push(awaitedVar);
        }
      }
      libraryVariables.push(mapped);
    }

    const allVariables = [...localEnrichedVariables, ...libraryVariables];

    await processVariablesInChunks(allVariables, 50, async (variablesData) => {
      figma.ui.postMessage({
        type: 'all-data',
        variables: variablesData
      });
    });
  } catch (error) {
    console.error('Error loading all variables :', error);
    figma.notify('🚨 Error loading all variables.');
  } finally {
    figma.ui.postMessage({ type: 'loading-end' });
  }
}
