import React from 'react';
import styles from './Tabs.module.scss';
import Tooltip from '@ui/components/Tooltip';

interface TabsProps {
  activeTab: 'color' | 'number';
  setActiveTab: (tab: 'color' | 'number') => void;
}

const Tabs: React.FC<TabsProps> = ({ setActiveTab, activeTab }) => {
  return (
    <div className={styles.tabs}>
      <div
        className={`${styles.tab} ${activeTab === 'color' ? styles.active : ''}`}
        onClick={() => setActiveTab('color')}>
        Colors
      </div>
      <Tooltip text={'coming soon'} trigger={'click'}>
        <div className={`${styles.tab} ${styles.disabled}`}> Numbers</div>
      </Tooltip>
    </div>
  );
};

export default Tabs;
