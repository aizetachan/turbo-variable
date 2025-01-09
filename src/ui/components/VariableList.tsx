import React from 'react';
import ColorVariableItem from './VariableItems/ColorVariableItem';
import styles from './ColorList.module.scss';
import { VariableData } from '@ui/types';
import NumberVariableItem from '@ui/components/VariableItems/NumberVariableItem';
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';

interface ColorListProps {
  items: VariableData[];
  activeTab: 'color' | 'number';
  collection?: string;
}

const VariableList: React.FC<ColorListProps> = ({ items, activeTab, collection }) => {
  if (items.length === 0) {
    return (
      <div className={styles.emptyMessage}>
        No {activeTab} variables found in {collection}
      </div>
    );
  }

  const groupedItems: Record<string, Record<string, VariableData[]>> = {};

  items.forEach((variable) => {
    const libraryName = variable.libraryName;
    const groupPath = variable.alias.includes('/')
      ? variable.alias.split('/').slice(0, -1).join('/')
      : 'General';

    if (!groupedItems[libraryName]) {
      groupedItems[libraryName] = {};
    }
    if (!groupedItems[libraryName][groupPath]) {
      groupedItems[libraryName][groupPath] = [];
    }
    groupedItems[libraryName][groupPath].push(variable);
  });

  return (
    <OverlayScrollbarsComponent
      className={styles.colorList}
      defer
      options={{ scrollbars: { autoHide: 'scroll' } }}>
      {Object.keys(groupedItems).map((libraryName) => (
        <div key={libraryName}>
          {Object.keys(groupedItems[libraryName]).map((groupName) => (
            <div key={groupName}>
              <div className={styles.libraryHeader}>
                {groupName !== 'General' && <span className={styles.libGroup}>{groupName}</span>}
                <span className={styles.libName}>
                  {groupName !== 'General' ? `(${libraryName})` : libraryName}
                </span>
              </div>
              {groupedItems[libraryName][groupName].map((item) =>
                item.type === 'color' ? (
                  <ColorVariableItem key={item.id} item={item} />
                ) : (
                  <NumberVariableItem key={item.id} item={item} />
                )
              )}
            </div>
          ))}
        </div>
      ))}
    </OverlayScrollbarsComponent>
  );
};

export default VariableList;
