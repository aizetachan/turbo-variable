figma.showUI(__html__, { width: 240, height: 600 });

// Función para cargar variables y estilos
async function loadAllData() {
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

// Procesar variables en chunks para mejorar el rendimiento
function processVariablesInChunks(
  allGroupedVariables: VariablesWithMetaInfoType[],
  chunkSize: number,
  callback: (variablesData: VariableData[]) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const allVariables = allGroupedVariables.flatMap((group) => group.variables);
    let currentIndex = 0;
    const variablesData = [] as VariableData[];

    function processNextChunk() {
      const chunk = allVariables.slice(currentIndex, currentIndex + chunkSize);
      Promise.all(
        chunk.map(async (variable) => {
          const color = await processColorValues(variable);

          variablesData.push({
            alias: variable.name || 'Sin alias',
            id: variable.id,
            color: color,
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

// Procesar los valores de color, manejando variables alias
async function processColorValues(variable: Variable) {
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

// Resolver los valores de color para variables alias
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

// Importar variables remotas desde las bibliotecas
async function importRemoteVariables() {
  try {
    const libraryCollections =
      await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();

    for (const collection of libraryCollections) {
      const variablesInCollection = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(
        collection.key
      );
      for (const variable of variablesInCollection) {
        if (variable.resolvedType === 'COLOR') {
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

// Recibir mensajes de la UI y aplicar la variable o estilo si es válido
figma.ui.onmessage = async (msg) => {
  const nodes = figma.currentPage.selection;

  // Aplicar variables de color (con validación de scopes)
  if (msg.type === 'apply-color') {
    const variableId = msg.variableId;
    const action = msg.action;

    if (nodes.length > 0 && variableId) {
      try {
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable) {
          figma.notify('Error: Could not obtain the variable.');
          return;
        }

        let applied = false;
        for (const node of nodes) {
          // Aquí sí validamos los scopes para las variables
          const isValidScope = await isValidScopeForProperty(variable, action, node);
          if (isValidScope) {
            applied = true;
            if (
              action === 'fill' &&
              'fills' in node &&
              Array.isArray(node.fills) &&
              node.fills.length > 0
            ) {
              const fillsCopy = [...node.fills];
              fillsCopy[0] = figma.variables.setBoundVariableForPaint(
                fillsCopy[0],
                'color',
                variable
              );
              node.fills = fillsCopy;
            } else if (action === 'stroke' && 'strokes' in node && Array.isArray(node.strokes)) {
              const strokesCopy = [...node.strokes];

              // Check if stroke is present and is a solid paint
              if (strokesCopy.length === 0 || strokesCopy[0].type !== 'SOLID') {
                strokesCopy[0] = {
                  type: 'SOLID',
                  color: { r: 0, g: 0, b: 0 }, // just base color
                  opacity: 1,
                  visible: true,
                  blendMode: 'NORMAL'
                };
              }
              strokesCopy[0] = figma.variables.setBoundVariableForPaint(
                <SolidPaint>strokesCopy[0],
                'color',
                variable
              );
              node.strokes = strokesCopy;
            }
          }
        }

        if (applied) {
          figma.notify('✅ Variable applied correctly.');
        } else {
          figma.notify('🚫 Scope limitation.');
        }
      } catch (error) {
        console.error('Error when applying the variable:', error);
        figma.notify('🚨 It was not possible to apply the variable.');
      }
    } else {
      figma.notify('😺 Oops! There is nothing selected.');
    }
  }

  // Aplicar estilos de color (sin validación de scopes)
  if (msg.type === 'apply-style') {
    const styleId = msg.styleId;
    const action = msg.action;

    if (nodes.length > 0 && styleId) {
      try {
        let applied = false;
        for (const node of nodes) {
          // Obtener los valores de color del estilo de forma asíncrona
          const style = await figma.getStyleByIdAsync(styleId); // Usamos getStyleByIdAsync
          if (style && 'paints' in style) {
            const paints = style.paints; // Obtiene los valores de color del estilo
            if (paints && paints.length > 0) {
              const paint = paints[0]; // Usamos el primer valor de la lista de colores

              if (
                action === 'fill' &&
                'fills' in node &&
                Array.isArray(node.fills) &&
                node.fills.length > 0
              ) {
                const fillsCopy = [...node.fills];
                fillsCopy[0] = paint; // Aplicamos el color del estilo al fill
                node.fills = fillsCopy;
                applied = true;
              } else if (action === 'stroke' && 'strokes' in node) {
                const strokesCopy = [...node.strokes];
                strokesCopy[0] = paint; // Aplicamos el color del estilo al stroke
                node.strokes = strokesCopy;
                applied = true;
              }
            }
          }
        }

        if (applied) {
          figma.notify('✅ Style correctly applied.');
        } else {
          figma.notify('🚫 The style could not be applied.');
        }
      } catch (error) {
        console.error('Error when applying the style:', error);
        figma.notify('🚨 The style could not be applied.');
      }
    } else {
      figma.notify('😺 Oops! There is nothing selected.');
    }
  }

  if (msg.type === 'reload-variables') {
    await loadAllData();
    figma.notify('🔄 Variables reloaded.');
  }
};

// Validar si la variable es compatible con la acción y el tipo de nodo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isValidScopeForProperty(variable: Variable, action: any, node: SceneNode) {
  const { scopes } = variable;

  // TODO - find another way to get aliasOfVariableId
  // if (variable.aliasOfVariableId) {
  //   variable = await figma.variables.getVariableByIdAsync(variable.aliasOfVariableId);
  // }

  if (scopes.includes('ALL_SCOPES')) {
    return true;
  }

  if (action === 'fill' && 'fills' in node) {
    if (scopes.includes('ALL_FILLS')) return true;
    if (scopes.includes('FRAME_FILL') && node.type === 'FRAME') return true;
    if (
      scopes.includes('SHAPE_FILL') &&
      ['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR'].includes(node.type)
    )
      return true;
    return scopes.includes('TEXT_FILL') && node.type === 'TEXT';
  }

  if (action === 'stroke' && 'strokes' in node) {
    return scopes.includes('STROKE_COLOR');
  }

  return false;
}

// Cargar los datos al iniciar el plugin
loadAllData();

interface VariableData {
  alias: string;
  id: string;
  color: { r: number; g: number; b: number } | null;
  isAlias?: boolean;
  isRemote: boolean;
  scopes: string[];
  libraryName: string;
  collectionName: string;
}

interface VariablesWithMetaInfoType {
  libraryName: string;
  collectionName: string;
  variables: Variable[];
}
