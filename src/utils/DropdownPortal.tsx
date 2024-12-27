import React, { useEffect, useRef, useCallback, useState, ReactNode, FC } from 'react';
import ReactDOM from 'react-dom';
import styles from './DropdownPortal.module.scss';

interface DropdownPortalProps {
  triggerRef: React.RefObject<HTMLElement>;
  isOpen: boolean;
  onClickAway: () => void;
  children: ReactNode;
}

const DropdownPortal: FC<DropdownPortalProps> = ({ triggerRef, isOpen, onClickAway, children }) => {
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
  }, [triggerRef]);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onClickAway();
  };

  const handleDropdownClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
  };

  return ReactDOM.createPortal(
    <div className={styles.portalRoot} onClick={handleBackdropClick}>
      <div
        ref={dropdownRef}
        className={styles.dropdownContainer}
        style={{
          position: 'absolute',
          top: coords.top,
          left: coords.left
        }}
        onClick={handleDropdownClick}>
        {children}
      </div>
    </div>,
    document.body
  );
};

export default DropdownPortal;
