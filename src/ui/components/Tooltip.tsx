import React, { useState, PropsWithChildren, useRef, useEffect } from 'react';
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
  const mouseEventRef = useRef<React.MouseEvent | null>(null);

  const calculatePosition = (event: React.MouseEvent) => {
    const tooltipWidth = tooltipRef.current?.offsetWidth || 0;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 0;

    let x = event.clientX;
    let y = event.clientY - 6;

    const margin = 8;

    if (x + tooltipWidth / 2 + margin > window.innerWidth) {
      x = window.innerWidth - tooltipWidth / 2 - margin;
    }

    if (x - tooltipWidth / 2 - margin < 0) {
      x = tooltipWidth / 2 + margin;
    }

    if (y - tooltipHeight - margin < 0) {
      y = event.clientY + tooltipHeight + margin + 12;
    }

    setCoords({ x, y });
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (trigger === 'hover') {
      mouseEventRef.current = e;
      setVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (trigger === 'hover') {
      mouseEventRef.current = null;
      setVisible(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (visible) {
      calculatePosition(e);
    }
  };

  const formattedText = text.replace(/\//g, '/\u200B');

  const handleMouseDown = (e: React.MouseEvent) => {
    if (trigger === 'click') {
      mouseEventRef.current = e;
      setVisible(true);
    }
  };

  const handleMouseUp = () => {
    if (trigger === 'click') {
      mouseEventRef.current = null;
      setVisible(false);
    }
  };

  const handleMouseLeaveForClick = () => {
    if (trigger === 'click') {
      mouseEventRef.current = null;
      setVisible(false);
    }
  };

  useEffect(() => {
    if (visible && mouseEventRef.current) {
      calculatePosition(mouseEventRef.current);
    }
  }, [visible]);

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
