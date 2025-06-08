import React, { useState, useRef, useEffect } from 'react';
import styles from './Tabs.module.scss';

interface TabsProps {
  activeTab: 'color' | 'number';
  setActiveTab: (tab: 'color' | 'number') => void;
  onSecretTrigger?: () => void;
}

const Tabs: React.FC<TabsProps> = ({ setActiveTab, activeTab, onSecretTrigger }) => {
  const [clickCount, setClickCount] = useState(0);
  const clickTimeoutRef = useRef<number | null>(null);

  const handleTabClick = (tab: 'color' | 'number') => {
    if (tab === activeTab) {
      const newCount = clickCount + 1;
      setClickCount(newCount);

      if (newCount >= 5) {
        setClickCount(0);
        if (onSecretTrigger) {
          onSecretTrigger();
        }
        return;
      }

      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = setTimeout(() => {
        setClickCount(0);
      }, 2000);
    } else {
      setClickCount(0);
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.tabs}>
      <div
        className={`${styles.tab} ${activeTab === 'color' ? styles.active : ''}`}
        onClick={() => handleTabClick('color')}>
        Colors
      </div>
      <div
        className={`${styles.tab} ${activeTab === 'number' ? styles.active : ''}`}
        onClick={() => handleTabClick('number')}>
        Numbers
      </div>
    </div>
  );
};

export default Tabs;
