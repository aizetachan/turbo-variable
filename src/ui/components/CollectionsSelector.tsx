import React, { useRef, useState } from 'react';
import UpdateIcon from '../assets/update.svg?component';
import ChevronIcon from '../assets/chevron.svg?component';
import styles from './CollectionsSelector.module.scss';
import DropdownPortal from '../../utils/DropdownPortal';

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
  handleUpdateClick
}) => {
  const [isOpen, setIsOpen] = useState(false);

  /** We use a ref for the wrapper so we can measure boundingRect for the portal. */
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const handleOptionClick = (collectionName: string) => {
    setSelectedCollection(collectionName);
    setIsOpen(false);
  };

  return (
    <div className={styles.collectionsUpdateActions}>
      <div
        className={styles.collectionSelectorWrapper}
        ref={wrapperRef}
        onClick={() => setIsOpen(!isOpen)}>
        <div className={styles.collectionSelector}>
          <span className={styles.selectedCollection}>{selectedCollection}</span>
          <div className={`${styles.downChevronWrapper} ${isOpen ? styles.rotated : ''}`}>
            <ChevronIcon />
          </div>
        </div>
      </div>
      <DropdownPortal isOpen={isOpen} triggerRef={wrapperRef} onClickAway={() => setIsOpen(false)}>
        {collections.map((collectionName) => (
          <span
            key={collectionName}
            className={styles.collectionOption}
            onClick={() => handleOptionClick(collectionName)}>
            {collectionName}
          </span>
        ))}
      </DropdownPortal>

      <div className={styles.updateButtonWrapper}>
        <button className={styles.updateButton} onClick={handleUpdateClick}>
          <UpdateIcon className={styles.updateIcon} />
        </button>
      </div>
    </div>
  );
};

export default CollectionsSelector;
