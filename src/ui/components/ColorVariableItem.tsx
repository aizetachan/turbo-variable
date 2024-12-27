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

  const rgbaString = color
    ? `rgba(${(color.r * 255).toFixed(0)}, ${(color.g * 255).toFixed(0)}, ${(color.b * 255).toFixed(
        0
      )}, ${color.a !== undefined ? color.a : 1})`
    : '#ccc';
  const rgbString = color
    ? `rgb(${(color.r * 255).toFixed(0)}, ${(color.g * 255).toFixed(0)}, ${(color.b * 255).toFixed(
        0
      )}`
    : `#ccc`;

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
      <div className={styles.colorSwatch}>
        <div className={styles.checkerboard} />
        <div className={styles.colorWithoutAlphaOverlay} style={{ backgroundColor: rgbString }} />
        <div
          className={`${styles.colorOverlay} ${item.isAlias ? styles.aliasBorder : ''}`}
          style={{ backgroundColor: rgbaString }}
        />
      </div>
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
