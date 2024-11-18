export interface VariableData {
  alias: string;
  id: string;
  color: { r: number; g: number; b: number } | null;
  isAlias?: boolean;
  isRemote: boolean;
  scopes: string[];
  libraryName: string;
  collectionName: string;
}

export interface StyleData {
  name: string;
  id: string;
  paints: Paint[];
}

export interface VariablesWithMetaInfoType {
  libraryName: string;
  collectionName: string;
  variables: Variable[];
}
