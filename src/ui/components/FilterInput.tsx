import React from 'react';
import styles from './FilterInput.module.scss';

interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
}

const FilterInput: React.FC<FilterInputProps> = ({ value, onChange }) => {
  return (
    <input
      type="text"
      className={styles.filterInput}
      placeholder="Filter..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};

export default FilterInput;
