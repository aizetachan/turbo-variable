export async function importRemoteVariables() {
  try {
    const libraryCollections =
      await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();

    for (const collection of libraryCollections) {
      const variablesInCollection = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(
        collection.key
      );
      for (const variable of variablesInCollection) {
        if (variable.resolvedType === 'COLOR' || variable.resolvedType === 'FLOAT') {
          await figma.variables.importVariableByKeyAsync(variable.key);
        }
      }
    }
    figma.notify('✅ Variables imported correctly.');
  } catch (error) {
    console.error('Error when importing remote variables:', error);
    figma.notify('🚨 Error when importing remote variables.');
  }
}
