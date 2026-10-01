import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import theme from './theme';
import { AppProvider } from './context/AppContext';
import NavBar from './components/NavBar';
import BrandFooter from './components/BrandFooter';
import ApiErrorToast from './components/ApiErrorToast';
import './App.css';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <AppProvider>
        <NavBar />
        <BrandFooter />
        <ApiErrorToast />
      </AppProvider>
    </ThemeProvider>
  );
}
