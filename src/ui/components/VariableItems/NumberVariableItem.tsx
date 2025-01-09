import React from 'react';
import styles from './NumberVariableItem.module.scss';
import Tooltip from '../Tooltip';
import SpaceIcon from '../../assets/spaceIcon.svg?component';
import BorderRadiusIcon from '../../assets/borderRadiusIcon.svg?component';
import PaddingGeneralIcon from '../../assets/paddingGeneral.svg?component';
import StrokeWidthIcon from '../../assets/strokeWidthIcon.svg?component';
import { VariableData } from '@ui/types';

interface NumberVariableItemProps {
  item: VariableData;
}

const NumberVariableItem: React.FC<NumberVariableItemProps> = ({ item }) => {
  const handleApplyVariable = (action: string) => {
    parent.postMessage(
      {
        pluginMessage: {
          type: 'apply-variable',
          variableId: item.id,
          variableType: item.type,
          action: action
        }
      },
      '*'
    );
  };

  return (
    <div className={styles.variableItem}>
      <Tooltip trigger={'click'} text={`${item.collectionName}/${item.alias}`}>
        <div className={styles.variableInfo}>
          <div className={styles.variableName} title={item.alias}>
            {item.alias.split('/').pop() || 'No alias'}
          </div>
          <div className={styles.variableValue}> ({item.value?.toString()}px)</div>
        </div>
      </Tooltip>
      <div className={styles.actionButtons}>
        <Tooltip text="Space Between">
          <div className={styles.actionButton} onClick={() => handleApplyVariable('spaceBetween')}>
            <SpaceIcon />
          </div>
        </Tooltip>
        <Tooltip text="Border Radius">
          <div className={styles.actionButton} onClick={() => handleApplyVariable('borderRadius')}>
            <BorderRadiusIcon />
          </div>
        </Tooltip>
        <Tooltip text="Padding">
          <div
            className={styles.actionButton}
            onClick={() => handleApplyVariable('paddingGeneral')}>
            <PaddingGeneralIcon />
          </div>
        </Tooltip>

        <Tooltip text="Stroke Width">
          <div className={styles.actionButton} onClick={() => handleApplyVariable('strokeWidth')}>
            <StrokeWidthIcon />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default NumberVariableItem;
