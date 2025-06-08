export interface NodeState {
  nodeId: string;
  properties: Record<string, any>;
  boundVariables?: Record<string, any>;
  parentId?: string;
  index?: number;
  frameCreated?: boolean;
  originalNodeId?: string;
}

export interface HistoryAction {
  id: string;
  type: 'apply-variable';
  timestamp: number;
  description: string;
  variableId: string;
  variableType: 'color' | 'number';
  action: string;
  beforeState: NodeState[];
  afterState: NodeState[];
}

export interface HistoryState {
  actions: HistoryAction[];
  currentIndex: number;
}
