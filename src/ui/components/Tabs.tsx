import React from 'react';
import styles from './Tabs.module.scss';

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
      <div
        className={`${styles.tab} ${activeTab === 'number' ? styles.active : ''}`}
        onClick={() => setActiveTab('number')}>
        Numbers
      </div>
    </div>
  );
};

export default Tabs;
