import React from 'react';
import styles from './HistoryPanel.module.scss';

interface HistoryAction {
  id: string;
  type: string;
  timestamp: number;
  description: string;
  variableId: string;
  variableType: 'color' | 'number';
  action: string;
  beforeState: any[];
  afterState: any[];
}

interface HistoryInfo {
  actions: HistoryAction[];
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  totalActions: number;
}

interface HistoryPanelProps {
  isOpen: boolean;
  historyInfo: HistoryInfo;
  onClose: () => void;
  onJumpToAction: (index: number) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  isOpen,
  historyInfo,
  onClose,
  onJumpToAction
}) => {
  if (!isOpen) return null;

  const formatDuration = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  };

  const getActionIcon = (variableType: string, action: string) => {
    if (variableType === 'color') {
      return action === 'fill' ? '🎨' : '🖌️';
    }

    switch (action) {
      case 'spaceBetween':
        return '↔️';
      case 'paddingVertical':
        return '⬆️⬇️';
      case 'paddingHorizontal':
        return '↔️';
      case 'paddingGeneral':
        return '📦';
      case 'borderRadius':
        return '◯';
      case 'strokeWidth':
        return '🖊️';
      default:
        return '⚡';
    }
  };

  const getStateInfo = (beforeState: any[], afterState: any[]) => {
    const frameCreated = afterState.some((state) => state.frameCreated);
    const nodesCount = beforeState.length;

    return `${nodesCount}${frameCreated ? '+F' : ''}`;
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            🕒 History ({historyInfo.currentIndex === -1 ? 'Start' : historyInfo.currentIndex + 1}/
            {historyInfo.totalActions})
          </h3>
          <button className={styles.closeButton} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {historyInfo.actions.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>📝</div>
              <p>No actions yet</p>
            </div>
          ) : (
            <div className={styles.actionsList}>
              <div
                className={`${styles.actionItem} ${styles.initial} ${
                  historyInfo.currentIndex === -1 ? styles.current : ''
                }`}
                onClick={() => onJumpToAction(-1)}>
                <div className={styles.actionHeader}>
                  <div className={styles.actionIcon}>⭐</div>
                  <div className={styles.actionInfo}>
                    <div className={styles.actionDescription}>Initial state</div>
                    <div className={styles.actionMeta}>
                      <span className={styles.actionType}>reset • original</span>
                      <span className={styles.actionStates}>clean</span>
                    </div>
                  </div>
                  <div className={styles.actionTime}>
                    <div className={styles.duration}>start</div>
                  </div>
                </div>

                {historyInfo.currentIndex === -1 && (
                  <div className={styles.currentIndicator}>
                    <span>Current</span>
                  </div>
                )}
              </div>

              {historyInfo.actions.map((action, index) => {
                const isCurrent = index === historyInfo.currentIndex;
                const isFuture = index > historyInfo.currentIndex;

                return (
                  <div
                    key={action.id}
                    className={`${styles.actionItem} ${
                      isCurrent ? styles.current : ''
                    } ${isFuture ? styles.future : ''}`}
                    onClick={() => onJumpToAction(index)}>
                    <div className={styles.actionHeader}>
                      <div className={styles.actionIcon}>
                        {getActionIcon(action.variableType, action.action)}
                      </div>
                      <div className={styles.actionInfo}>
                        <div className={styles.actionDescription}>{action.description}</div>
                        <div className={styles.actionMeta}>
                          <span className={styles.actionType}>
                            {action.variableType} • {action.action}
                          </span>
                          <span className={styles.actionStates}>
                            {getStateInfo(action.beforeState, action.afterState)}
                          </span>
                        </div>
                      </div>
                      <div className={styles.actionTime}>
                        <div className={styles.duration}>{formatDuration(action.timestamp)}</div>
                      </div>
                    </div>

                    {isCurrent && (
                      <div className={styles.currentIndicator}>
                        <span>Current</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.legend}>
            <div className={styles.legendItem}>
              <div className={`${styles.legendColor} ${styles.past}`}></div>
              <span>Past actions</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendColor} ${styles.current}`}></div>
              <span>Current position</span>
            </div>
            <div className={styles.legendItem}>
              <div className={`${styles.legendColor} ${styles.future}`}></div>
              <span>Future actions</span>
            </div>
          </div>
          <div className={styles.shortcuts}>
            <kbd>Cmd+Z</kbd> Undo • <kbd>Cmd+Y</kbd> Redo • <kbd>5×Tab</kbd> Toggle
          </div>
        </div>
      </div>
    </div>
  );
};
