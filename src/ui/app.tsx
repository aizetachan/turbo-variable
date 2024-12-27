import React, { useState, useEffect, useRef } from 'react';
import Tabs from './components/Tabs';
import FilterInput from './components/FilterInput';
import CollectionsSelector from './components/CollectionsSelector';
import VariableList from './components/VariableList';
import LoadingSpinner from './components/LoadingSpinner';
import { VariableData } from '@ui/types';
import './App.css';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [variablesData, setVariablesData] = useState<VariableData[]>([]);
  const [filteredVariables, setFilteredVariables] = useState<VariableData[]>([]);
  const [activeTab, setActiveTab] = useState<'color' | 'number'>('color');
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

  const filterVariables = (
    variables: VariableData[],
    collection: string,
    inputValue: string,
    type: 'color' | 'number'
  ) => {
    let filtered = variables.filter((v) => v.type === type);

    if (collection !== 'All collections') {
      filtered = filtered.filter((v) => v.collectionName === collection);
    }

    if (inputValue.trim().length > 0) {
      const words = inputValue.toLowerCase().split(/\s+/).filter(Boolean);

      filtered = filtered.filter((v) => {
        const combined = `${v.alias.toLowerCase()} ${v.collectionName.toLowerCase()}`;
        return words.every((word) => combined.includes(word));
      });
    }

    setFilteredVariables(filtered);
  };

  const handleFilterValueChange = (inputValue: string) => {
    setFilterValue(inputValue);

    if (activeTab === 'color') {
      filterVariables(variablesData, selectedCollection, inputValue, 'color');
    } else if (activeTab === 'number') {
      filterVariables(variablesData, selectedCollection, inputValue, 'number');
    }
  };

  const handleSelectedCollectionChange = (collection: string) => {
    setSelectedCollection(collection);
    filterVariables(variablesData, collection, filterValue, activeTab);
  };

  const handleActiveTabChange = (tab: 'color' | 'number') => {
    setActiveTab(tab);

    if (tab === 'color') {
      filterVariables(variablesData, selectedCollection, filterValue, 'color');
    } else if (tab === 'number') {
      filterVariables(variablesData, selectedCollection, filterValue, 'number');
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
        setCollections(extractCollections(pluginMessage.variables));
        filterVariables(
          pluginMessage.variables,
          selectedCollectionRef.current,
          filterValueRef.current,
          activeTab
        );
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setTheme(mediaQuery.matches ? 'dark' : 'light');
    function handleThemeChange(e: MediaQueryListEvent) {
      if (e.matches) {
        setTheme('dark');
      } else {
        setTheme('light');
      }
    }

    mediaQuery.addEventListener('change', handleThemeChange);
  }, []);

  return (
    <div className={theme} id="app-root">
      <div className={'stickyHeader'}>
        <Tabs activeTab={activeTab} setActiveTab={handleActiveTabChange} />
        <CollectionsSelector
          collections={collections}
          selectedCollection={selectedCollection}
          setSelectedCollection={handleSelectedCollectionChange}
          handleUpdateClick={handleUpdateClick}
        />
        <FilterInput value={filterValue} onChange={handleFilterValueChange} />
      </div>
      <VariableList
        items={filteredVariables}
        activeTab={activeTab}
        collection={selectedCollection}
      />
      {loading && <LoadingSpinner />}
    </div>
  );
};

export default App;
