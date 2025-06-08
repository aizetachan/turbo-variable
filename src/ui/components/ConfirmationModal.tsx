import React from 'react';
import styles from './ConfirmationModal.module.scss';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Yes, proceed',
  cancelText = 'Cancel',
  onConfirm,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onCancel}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>{title}</h3>
        </div>

        <div className={styles.modalBody}>
          <p className={styles.modalMessage}>{message}</p>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelButton} onClick={onCancel} type="button">
            {cancelText}
          </button>
          <button className={styles.confirmButton} onClick={onConfirm} type="button">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
