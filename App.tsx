import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Project } from './src/model/types';
import { ProjectsScreen } from './src/projects/ProjectsScreen';
import { EditorScreen } from './src/editor/EditorScreen';

export default function App() {
  const [open, setOpen] = useState<Project | null>(null);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {open ? (
        <EditorScreen key={open.id} initial={open} onClose={() => setOpen(null)} />
      ) : (
        <ProjectsScreen onOpen={setOpen} />
      )}
    </SafeAreaProvider>
  );
}
