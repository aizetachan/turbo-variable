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

        if (awaitedVar?.resolvedType !== 'COLOR') continue;
        localVariables.push(awaitedVar);
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
        const awaitedVar = await figma.variables.importVariableByKeyAsync(variable.key);
        mapped.variables.push(awaitedVar);
      }
      libraryVariables.push(mapped);
    }

    const allVariables = [...localEnrichedVariables, ...libraryVariables];
    const colorStyles = await figma.getLocalPaintStylesAsync();

    await processVariablesInChunks(allVariables, 50, async (variablesData) => {
      const stylesData = colorStyles.map((style) => ({
        name: style.name,
        id: style.id,
        paints: style.paints
      }));

      figma.ui.postMessage({
        type: 'all-data',
        variables: variablesData,
        styles: stylesData
      });
    });

    figma.ui.postMessage({ type: 'loading-end' });
  } catch (error) {
    console.error('Error al cargar los datos:', error);
    figma.notify('Error al cargar todas las variables y estilos.');
    figma.ui.postMessage({ type: 'loading-end' });
  }
}
