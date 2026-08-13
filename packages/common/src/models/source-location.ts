export interface Location {
  line: number;
  column: number;
}

export type LocationMap = Record<string, Location>;
