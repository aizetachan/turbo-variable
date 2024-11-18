import { loadAllData } from "@plugin/loadAllData";
import { isValidScopeForProperty } from "@plugin/isValidScopeForProperty";

figma.showUI(__html__, { width: 240, height: 600 });

figma.ui.onmessage = async (msg) => {
  const nodes = figma.currentPage.selection;

  // Aplicar variables de color (con validación de scopes)
  if (msg.type === "apply-color") {
    const variableId = msg.variableId;
    const action = msg.action;

    if (nodes.length > 0 && variableId) {
      try {
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable) {
          figma.notify("Error: Could not obtain the variable.");
          return;
        }

        let applied = false;
        for (const node of nodes) {
          // Aquí sí validamos los scopes para las variables
          const isValidScope = await isValidScopeForProperty(
            variable,
            action,
            node
          );
          if (isValidScope) {
            applied = true;
            console.log({ variable, action, node });
            if ("fills" in node &&
              action === "fill"
            ) {
              if(
                  Array.isArray(node.fills) &&
                  node.fills.length > 0) {
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
                        blendMode: "NORMAL",
                      },
                      "color",
                      variable
                  ),
                ];
              }
            } else if (
              action === "stroke" &&
              "strokes" in node &&
              Array.isArray(node.strokes)
            ) {
              const strokesCopy = [...node.strokes];

              // Check if stroke is present and is a solid paint
              if (strokesCopy.length === 0 || strokesCopy[0].type !== "SOLID") {
                strokesCopy[0] = {
                  type: "SOLID",
                  color: { r: 0, g: 0, b: 0 },
                  opacity: 1,
                  visible: true,
                  blendMode: "NORMAL",
                };
              }
              strokesCopy[0] = figma.variables.setBoundVariableForPaint(
                <SolidPaint>strokesCopy[0],
                "color",
                variable
              );
              node.strokes = strokesCopy;
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

  // Aplicar estilos de color (sin validación de scopes)
  if (msg.type === "apply-style") {
    const styleId = msg.styleId;
    const action = msg.action;

    if (nodes.length > 0 && styleId) {
      try {
        let applied = false;
        for (const node of nodes) {
          // Obtener los valores de color del estilo de forma asíncrona
          const style = await figma.getStyleByIdAsync(styleId); // Usamos getStyleByIdAsync
          if (style && "paints" in style) {
            const paints = style.paints; // Obtiene los valores de color del estilo
            if (paints && paints.length > 0) {
              const paint = paints[0]; // Usamos el primer valor de la lista de colores

              if (
                action === "fill" &&
                "fills" in node &&
                Array.isArray(node.fills) &&
                node.fills.length > 0
              ) {
                const fillsCopy = [...node.fills];
                fillsCopy[0] = paint; // Aplicamos el color del estilo al fill
                node.fills = fillsCopy;
                applied = true;
              } else if (action === "stroke" && "strokes" in node) {
                const strokesCopy = [...node.strokes];
                strokesCopy[0] = paint; // Aplicamos el color del estilo al stroke
                node.strokes = strokesCopy;
                applied = true;
              }
            }
          }
        }

        if (applied) {
          figma.notify("✅ Style correctly applied.");
        } else {
          figma.notify("🚫 The style could not be applied.");
        }
      } catch (error) {
        console.error("Error when applying the style:", error);
        figma.notify("🚨 The style could not be applied.");
      }
    } else {
      figma.notify("😺 Oops! There is nothing selected.");
    }
  }

  if (msg.type === "reload-variables") {
    await loadAllData();
    figma.notify("🔄 Variables reloaded.");
  }
};

loadAllData();
