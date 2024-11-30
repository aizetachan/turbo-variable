import React, { useState, PropsWithChildren, useRef } from 'react';
import ReactDOM from 'react-dom';
import styles from './Tooltip.module.scss';

type TooltipProps = {
  text: string;
  trigger?: 'hover' | 'click';
};

const Tooltip = ({ text, children, trigger = 'hover' }: PropsWithChildren<TooltipProps>) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0
  });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (trigger === 'hover') {
      setVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (trigger === 'hover') {
      setVisible(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const tooltipWidth = tooltipRef.current?.offsetWidth || 0;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 0;

    let x = e.clientX;
    let y = e.clientY - 6;

    const margin = 8;

    if (x + tooltipWidth / 2 + margin > window.innerWidth) {
      x = window.innerWidth - tooltipWidth / 2 - margin;
    }

    if (x - tooltipWidth / 2 - margin < 0) {
      x = tooltipWidth / 2 + margin;
    }

    if (y - tooltipHeight - margin < 0) {
      y = tooltipHeight + margin;
    }

    setCoords({ x, y });
  };

  const formattedText = text.replace(/\//g, '/\u200B');

  const handleMouseDown = () => {
    if (trigger === 'click') {
      setVisible(true);
    }
  };

  const handleMouseUp = () => {
    if (trigger === 'click') {
      setVisible(false);
    }
  };

  const handleMouseLeaveForClick = () => {
    if (trigger === 'click') {
      setVisible(false);
    }
  };

  const childWithTooltip = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement, {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: trigger === 'click' ? handleMouseLeaveForClick : handleMouseLeave,
        onMouseMove: handleMouseMove,
        onMouseDown: handleMouseDown,
        onMouseUp: handleMouseUp
      })
    : children;

  return (
    <>
      {childWithTooltip}
      {visible &&
        ReactDOM.createPortal(
          <div
            className={styles.tooltip}
            ref={tooltipRef}
            style={{ left: coords.x, top: coords.y }}>
            {formattedText}
          </div>,
          document.body
        )}
    </>
  );
};

export default Tooltip;
