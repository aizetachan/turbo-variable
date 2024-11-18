import React from 'react';
import styles from './ColorItem.module.scss';
import FillActionButtonIcon from '../assets/fillActionButton.svg?component';
import StrokeActionButtonIcon from '../assets/strokeActionButton.svg?component';
import { StyleData } from '@ui/types';

interface StyleItemProps {
  item: StyleData;
}

const StyleItem: React.FC<StyleItemProps> = ({ item }) => {
  const paint = item.paints[0];
  const color = (paint as SolidPaint)?.color;

  const handleFillClick = () => {
    parent.postMessage(
      {
        pluginMessage: {
          type: 'apply-style',
          action: 'fill',
          styleId: item.id
        }
      },
      '*'
    );
  };

  const handleStrokeClick = () => {
    parent.postMessage(
      {
        pluginMessage: {
          type: 'apply-style',
          action: 'stroke',
          styleId: item.id
        }
      },
      '*'
    );
  };

  return (
    <div className={styles.colorRow}>
      <div
        className={styles.colorSwatch}
        style={{
          backgroundColor: color
            ? `rgb(${Math.round(color.r * 255)}, ${Math.round(
                color.g * 255
              )}, ${Math.round(color.b * 255)})`
            : '#ccc'
        }}
      ></div>
      <div className={styles.alias}>{item.name || 'No name'}</div>
      <div className={styles.actionButtons}>
        <div className={styles.actionButton} data-tooltip="Fill" onClick={handleFillClick}>
          <FillActionButtonIcon />
        </div>
        <div className={styles.actionButton} data-tooltip="Stroke" onClick={handleStrokeClick}>
          <StrokeActionButtonIcon />
        </div>
      </div>
    </div>
  );
};

export default StyleItem;
