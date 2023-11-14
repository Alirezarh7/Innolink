import React from 'react';
import Navbar from '../Component/Header/Navbar/Link/Router';
import './App.css';
import { BrowserRouter } from 'react-router-dom';
function App() {
  return (
    <BrowserRouter> 
      <Navbar/>
    </BrowserRouter> 
  )
}

export default App;
