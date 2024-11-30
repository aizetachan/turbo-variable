import React from 'react';
import styles from './ColorItem.module.scss';
import Tooltip from './Tooltip';
import FillActionButtonIcon from '../assets/fillActionButton.svg?component';
import StrokeActionButtonIcon from '../assets/strokeActionButton.svg?component';
import { Color, VariableData } from '@ui/types';

interface VariableItemProps {
  item: VariableData;
}

const ColorVariableItem: React.FC<VariableItemProps> = ({ item }) => {
  const color = item.value as Color;

  const handleFillClick = (action: 'fill' | 'stroke') => {
    parent.postMessage(
      {
        pluginMessage: {
          type: 'apply-variable',
          action: action,
          variableId: item.id,
          variableType: item.type
        }
      },
      '*'
    );
  };

  return (
    <div className={styles.colorRow}>
      <div
        className={`${styles.colorSwatch} ${item.isAlias ? styles.aliasBorder : ''}`}
        style={{
          backgroundColor: color
            ? `rgb(${Math.round(color.r * 255)}, ${Math.round(
                color.g * 255
              )}, ${Math.round(color.b * 255)})`
            : '#ccc'
        }}
      />
      <Tooltip trigger={'click'} text={`${item.collectionName}/${item.alias}`}>
        <div className={styles.alias}>{item.alias.split('/').pop() || 'No alias'}</div>
      </Tooltip>
      <div className={styles.actionButtons}>
        <Tooltip text="Fill">
          <div
            className={styles.actionButton}
            data-tooltip="Fill"
            onClick={() => handleFillClick('fill')}>
            <FillActionButtonIcon />
          </div>
        </Tooltip>
        <Tooltip text="Stroke">
          <div
            className={styles.actionButton}
            data-tooltip="Stroke"
            onClick={() => handleFillClick('stroke')}>
            <StrokeActionButtonIcon />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default ColorVariableItem;
