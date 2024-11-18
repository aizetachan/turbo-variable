import React from "react";
import VariableItem from "./VariableItem";
import StyleItem from "./StyleItem";
import styles from "./ColorList.module.scss";
import { VariableData, StyleData } from "@ui/types";

interface ColorListProps {
  items: VariableData[] | StyleData[];
  activeTab: "variables" | "styles";
}

const ColorList: React.FC<ColorListProps> = ({ items, activeTab }) => {
  if (items.length === 0) {
    return (
      <div className={styles.emptyMessage}>
        {activeTab === "variables"
          ? "No variables found in the document."
          : "No styles found in the document."}
      </div>
    );
  }

  let groupedItems: Record<
    string,
    Record<string, VariableData[] | StyleData[]>
  > = {};

  if (activeTab === "variables") {
    const variables = items as VariableData[];

    variables.forEach((variable) => {
      const libraryName = variable.libraryName;
      const groupPath = variable.alias.includes("/")
        ? variable.alias.split("/").slice(0, -1).join("/")
        : "General";

      if (!groupedItems[libraryName]) {
        groupedItems[libraryName] = {};
      }
      if (!groupedItems[libraryName][groupPath]) {
        groupedItems[libraryName][groupPath] = [];
      }
      groupedItems[libraryName][groupPath].push(variable as any);
    });
  } else {
    const stylesItems = items as StyleData[];

    stylesItems.forEach((style) => {
      const libraryName = "Local Styles";
      const groupPath = style.name.includes("/")
        ? style.name.split("/").slice(0, -1).join("/")
        : "General";

      if (!groupedItems[libraryName]) {
        groupedItems[libraryName] = {};
      }
      if (!groupedItems[libraryName][groupPath]) {
        groupedItems[libraryName][groupPath] = [];
      }
      groupedItems[libraryName][groupPath].push(style as any);
    });
  }

  return (
    <div className={styles.colorList}>
      {Object.keys(groupedItems).map((libraryName) => (
        <div key={libraryName}>
          {Object.keys(groupedItems[libraryName]).map((groupName) => (
            <div key={groupName}>
              <div className={styles.libraryHeader}>
                {groupName !== "General" && (
                  <span className={styles.libGroup}>{groupName}</span>
                )}
                <span className={styles.libName}>
                  {groupName !== "General" ? `(${libraryName})` : libraryName}
                </span>
              </div>
              {(
                groupedItems[libraryName][groupName] as Array<
                  VariableData | StyleData
                >
              ).map((item) =>
                activeTab === "variables" ? (
                  <VariableItem
                    key={(item as VariableData).id}
                    item={item as VariableData}
                  />
                ) : (
                  <StyleItem
                    key={(item as StyleData).id}
                    item={item as StyleData}
                  />
                )
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default ColorList;
