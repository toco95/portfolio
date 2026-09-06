export interface CanvasElementBase {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface ViewportElement extends CanvasElementBase {
  type: 'viewport';
  id: string;
  label?: string;
}

export interface ProjectCanvasElement extends CanvasElementBase {
  type: 'project';
  slug: string;
}

export interface ImageCanvasElement extends CanvasElementBase {
  type: 'image';
  path: string;
  category?: string;
}

export interface TextCanvasElement extends CanvasElementBase {
  type: 'text' | 'note' | 'subtitle';
  text: string;
}

export interface GroupCanvasElement extends CanvasElementBase {
  type: 'group';
  text: string;
}

export interface LinkCanvasElement extends CanvasElementBase {
  type: 'link';
  url: string;
  text: string;
}

export interface TitleCanvasElement extends CanvasElementBase {
  type: 'title';
  text: string;
  icon?: string;
}

export type CanvasElement =
  | ViewportElement
  | ProjectCanvasElement
  | ImageCanvasElement
  | TextCanvasElement
  | GroupCanvasElement
  | LinkCanvasElement
  | TitleCanvasElement;
