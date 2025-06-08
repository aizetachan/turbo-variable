import React, { useState, useEffect, useRef } from 'react';
import Tabs from './components/Tabs';
import FilterInput from './components/FilterInput';
import CollectionsSelector from './components/CollectionsSelector';
import VariableList from './components/VariableList';
import LoadingSpinner from './components/LoadingSpinner';
import { ConfirmationModal } from './components/ConfirmationModal';
import { VariableData, ConfirmationRequest, ConfirmationResponse } from '@ui/types';
import './App.css';

const App: React.FC = () => {
  const [variablesData, setVariablesData] = useState<VariableData[]>([]);
  const [filteredVariables, setFilteredVariables] = useState<VariableData[]>([]);
  const [activeTab, setActiveTab] = useState<'color' | 'number'>('color');
  const [filterValue, setFilterValue] = useState('');
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('All collections');
  const [loading, setLoading] = useState(false);
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  const [historyInfo, setHistoryInfo] = useState({ canUndo: false, canRedo: false });

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

  const handleConfirmation = (confirmed: boolean) => {
    if (confirmationRequest) {
      const response: ConfirmationResponse = {
        id: confirmationRequest.id,
        confirmed
      };

      parent.postMessage({ pluginMessage: { type: 'confirmation-response', ...response } }, '*');
      setConfirmationRequest(null);
    }
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

      if (pluginMessage.type === 'show-confirmation') {
        setConfirmationRequest(pluginMessage as ConfirmationRequest);
      }

      if (pluginMessage.type === 'history-changed') {
        setHistoryInfo(pluginMessage.historyInfo);
      }
    };
  }, [activeTab]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = mediaQuery.matches;
    function handleThemeChange(e: MediaQueryListEvent) {
      if (e.matches) {
        document.body.classList.add('dark');
        document.body.classList.remove('light');
      } else {
        document.body.classList.add('light');
        document.body.classList.remove('dark');
      }
    }

    document.body.classList.add(isDark ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleThemeChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (historyInfo.canUndo) {
          parent.postMessage({ pluginMessage: { type: 'undo' } }, '*');
        }
      } else if (ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (historyInfo.canRedo) {
          parent.postMessage({ pluginMessage: { type: 'redo' } }, '*');
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [historyInfo]);

  return (
    <div id="app-root">
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
      <ConfirmationModal
        isOpen={!!confirmationRequest}
        title={confirmationRequest?.title || ''}
        message={confirmationRequest?.message || ''}
        confirmText={confirmationRequest?.confirmText}
        cancelText={confirmationRequest?.cancelText}
        onConfirm={() => handleConfirmation(true)}
        onCancel={() => handleConfirmation(false)}
      />
    </div>
  );
};

export default App;
