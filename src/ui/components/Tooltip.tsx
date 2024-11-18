import React, { useState, PropsWithChildren, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import styles from "./Tooltip.module.scss";

type TooltipProps = {
  text: string;
};

const Tooltip = ({ text, children }: PropsWithChildren<TooltipProps>) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setVisible(true);
  };

  const handleMouseLeave = () => {
    setVisible(false);
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

  const childWithTooltip = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement, {
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        onMouseMove: handleMouseMove,
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
            style={{ left: coords.x, top: coords.y }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
};

export default Tooltip;
