import React from "react";
import styles from "./Tabs.module.scss";

interface TabsProps {
  activeTab: "variables" | "styles";
  setActiveTab: (tab: "variables" | "styles") => void;
}

const Tabs: React.FC<TabsProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className={styles.tabs}>
      <div
        className={`${styles.tab} ${
          activeTab === "variables" ? styles.active : ""
        }`}
        onClick={() => setActiveTab("variables")}
      >
        Variables
      </div>
      <div
        className={`${styles.tab} ${
          activeTab === "styles" ? styles.active : ""
        } ${styles.disabled}`}
        data-tooltip="Coming soon"
        onClick={() => setActiveTab("styles")}
      >
        Styles
      </div>
    </div>
  );
};

export default Tabs;
