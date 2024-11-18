import React, { useState } from "react";
import UpdateIcon from "../assets/update.svg?component";
import ChevronIcon from "../assets/chevron.svg?component";
import styles from "./CollectionsSelector.module.scss";

interface CollectionsSelectorProps {
  collections: string[];
  selectedCollection: string;
  setSelectedCollection: (value: string) => void;
  handleUpdateClick: () => void;
}

const CollectionsSelector: React.FC<CollectionsSelectorProps> = ({
  collections,
  selectedCollection,
  setSelectedCollection,
  handleUpdateClick,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOptionClick = (collectionName: string) => {
    setSelectedCollection(collectionName);
    setIsOpen(false);
  };

  return (
    <div className={styles.collectionsUpdateActions}>
      <div
        className={styles.collectionSelectorWrapper}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={styles.collectionSelector}>
          <span className={styles.selectedCollection}>
            {selectedCollection}
          </span>
          <div
            className={`${styles.downChevronWrapper} ${
              isOpen ? styles.rotated : ""
            }`}
          >
            <ChevronIcon />
          </div>
        </div>
        {isOpen && (
          <div className={styles.collectionOptionsList}>
            {collections.map((collectionName) => (
              <span
                key={collectionName}
                className={styles.collectionOption}
                onClick={() => handleOptionClick(collectionName)}
              >
                {collectionName}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={styles.updateButtonWrapper}>
        <button className={styles.updateButton} onClick={handleUpdateClick}>
          <UpdateIcon className={styles.updateIcon} />
        </button>
      </div>
    </div>
  );
};

export default CollectionsSelector;
