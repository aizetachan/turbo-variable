import React, { useState, useEffect, useRef } from 'react';
import Tabs from './components/Tabs';
import FilterInput from './components/FilterInput';
import CollectionsSelector from './components/CollectionsSelector';
import ColorList from './components/ColorList';
import LoadingSpinner from './components/LoadingSpinner';
import { VariableData, StyleData } from '@ui/types';
import './App.css';

const App: React.FC = () => {
  const [variablesData, setVariablesData] = useState<VariableData[]>([]);
  const [filteredVariables, setFilteredVariables] = useState<VariableData[]>([]);
  const [stylesData, setStylesData] = useState<StyleData[]>([]);
  const [filteredStyles, setFilteredStyles] = useState<StyleData[]>([]);
  const [activeTab, setActiveTab] = useState<'variables' | 'styles'>('variables');
  const [filterValue, setFilterValue] = useState('');
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('All collections');
  const [loading, setLoading] = useState(false);

  const filterValueRef = useRef(filterValue);
  const selectedCollectionRef = useRef(selectedCollection);

  useEffect(() => {
    filterValueRef.current = filterValue;
  }, [filterValue]);

  useEffect(() => {
    selectedCollectionRef.current = selectedCollection;
  }, [selectedCollection]);

  const extractCollections = (variables: VariableData[]) => {
    const collectionNames = Array.from(new Set(variables.map((v) => v.collectionName)));
    return ['All collections', ...collectionNames];
  };

  const filterVariables = (variables: VariableData[], collection: string, filter: string) => {
    let filtered = variables;

    if (collection !== 'All collections') {
      filtered = filtered.filter((v) => v.collectionName === collection);
    }

    if (filter) {
      filtered = filtered.filter((v) => v.alias.toLowerCase().includes(filter.toLowerCase()));
    }

    setFilteredVariables(filtered);
  };

  const filterStyles = (styles: StyleData[], filter: string) => {
    let filtered = styles;

    if (filter) {
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));
    }

    setFilteredStyles(filtered);
  };

  const handleFilterValueChange = (value: string) => {
    setFilterValue(value);

    if (activeTab === 'variables') {
      filterVariables(variablesData, selectedCollection, value);
    } else if (activeTab === 'styles') {
      filterStyles(stylesData, value);
    }
  };

  const handleSelectedCollectionChange = (collection: string) => {
    setSelectedCollection(collection);
    filterVariables(variablesData, collection, filterValue);
  };

  const handleActiveTabChange = (tab: 'variables' | 'styles') => {
    setActiveTab(tab);

    if (tab === 'variables') {
      filterVariables(variablesData, selectedCollection, filterValue);
    } else if (tab === 'styles') {
      filterStyles(stylesData, filterValue);
    }
  };

  const handleUpdateClick = () => {
    parent.postMessage({ pluginMessage: { type: 'reload-variables' } }, '*');
  };

  useEffect(() => {
    window.onmessage = (event) => {
      const { pluginMessage } = event.data;

      if (pluginMessage.type === 'loading-start') {
        setLoading(true);
      } else if (pluginMessage.type === 'loading-end') {
        setLoading(false);
      }

      if (pluginMessage.type === 'all-data') {
        setVariablesData(pluginMessage.variables);
        setStylesData(pluginMessage.styles);
        setCollections(extractCollections(pluginMessage.variables));

        if (activeTab === 'variables') {
          filterVariables(
            pluginMessage.variables,
            selectedCollectionRef.current,
            filterValueRef.current
          );
        } else if (activeTab === 'styles') {
          filterStyles(pluginMessage.styles, filterValueRef.current);
        }
      }
    };
  }, [activeTab]);

  return (
    <div>
      <Tabs activeTab={activeTab} setActiveTab={handleActiveTabChange} />
      {activeTab === 'variables' && (
        <CollectionsSelector
          collections={collections}
          selectedCollection={selectedCollection}
          setSelectedCollection={handleSelectedCollectionChange}
          handleUpdateClick={handleUpdateClick}
        />
      )}
      <FilterInput value={filterValue} onChange={handleFilterValueChange} />
      {activeTab === 'variables' ? (
        <ColorList items={filteredVariables} activeTab="variables" />
      ) : (
        <ColorList items={filteredStyles} activeTab="styles" />
      )}
      {loading && <LoadingSpinner />}
    </div>
  );
};

export default App;
