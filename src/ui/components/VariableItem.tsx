import React from "react";
import styles from "./ColorItem.module.scss";
import Tooltip from "./Tooltip";
import FillActionButtonIcon from "../assets/fillActionButton.svg?component";
import StrokeActionButtonIcon from "../assets/strokeActionButton.svg?component";
import { VariableData } from "@ui/types";

interface VariableItemProps {
  item: VariableData;
}

const VariableItem: React.FC<VariableItemProps> = ({ item }) => {
  const color = item.color;

  const handleFillClick = () => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "apply-color",
          action: "fill",
          variableId: item.id,
        },
      },
      "*"
    );
  };

  const handleStrokeClick = () => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "apply-color",
          action: "stroke",
          variableId: item.id,
        },
      },
      "*"
    );
  };

  return (
    <div className={styles.colorRow}>
      <div
        className={`${styles.colorSwatch} ${
          item.isAlias ? styles.aliasBorder : ""
        }`}
        style={{
          backgroundColor: color
            ? `rgb(${Math.round(color.r * 255)}, ${Math.round(
                color.g * 255
              )}, ${Math.round(color.b * 255)})`
            : "#ccc",
        }}
      />
      <Tooltip text={`${item.collectionName}/${item.alias}`}>
        <div className={styles.alias}>
          {item.alias.split("/").pop() || "No alias"}
        </div>
      </Tooltip>
      <div className={styles.actionButtons}>
        <Tooltip text="Fill">
          <div
            className={styles.actionButton}
            data-tooltip="Fill"
            onClick={handleFillClick}
          >
            <FillActionButtonIcon />
          </div>
        </Tooltip>
        <Tooltip text="Stroke">
          <div
            className={styles.actionButton}
            data-tooltip="Stroke"
            onClick={handleStrokeClick}
          >
            <StrokeActionButtonIcon />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default VariableItem;
