export interface VariableData {
  alias: string;
  id: string;
  value: Color | number | null;
  isAlias?: boolean;
  isRemote: boolean;
  scopes: string[];
  libraryName: string;
  collectionName: string;
  type: 'color' | 'number';
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface VariablesWithMetaInfoType {
  libraryName: string;
  collectionName: string;
  variables: Variable[];
}
