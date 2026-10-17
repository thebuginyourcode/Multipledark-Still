import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Layer, Project } from './types';
import { migrateProject } from './factory';

const INDEX_KEY = 'projects:index';
const projectKey = (id: string) => `projects:${id}`;

export async function listProjects(): Promise<Project[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const items = await AsyncStorage.multiGet(ids.map(projectKey));
  return items
    .map(([, v]) => (v ? migrateProject(JSON.parse(v) as Project) : null))
    .filter((p): p is Project => p !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProject(p: Project) {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(p.id)) {
    ids.push(p.id);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  }
  await AsyncStorage.setItem(projectKey(p.id), JSON.stringify(p));
}

export async function deleteProject(id: string) {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const ids: string[] = raw ? JSON.parse(raw) : [];
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids.filter((x) => x !== id)));
  await AsyncStorage.removeItem(projectKey(id));
}

// ---------------------------------------------------------------- elements

/** A layer saved for reuse across projects. */
export interface SavedElement {
  id: string;
  name: string;
  layer: Layer;
  createdAt: number;
}

const ELEMENTS_KEY = 'elements';

export async function listElements(): Promise<SavedElement[]> {
  const raw = await AsyncStorage.getItem(ELEMENTS_KEY);
  const items: SavedElement[] = raw ? JSON.parse(raw) : [];
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveElement(el: SavedElement) {
  const items = await listElements();
  await AsyncStorage.setItem(ELEMENTS_KEY, JSON.stringify([el, ...items.filter((x) => x.id !== el.id)]));
}

export async function deleteElement(id: string) {
  const items = await listElements();
  await AsyncStorage.setItem(ELEMENTS_KEY, JSON.stringify(items.filter((x) => x.id !== id)));
}
