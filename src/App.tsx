import Chat from "./components/Chat";
import ModelPanel from "./components/ModelPanel";
import CostTracker from "./components/CostTracker";
import "./App.css";

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>InnoLink</h1>
        <span className="subtitle">AI Workspace Agent</span>
      </header>

      <div className="app-layout">
        <aside className="sidebar">
          <ModelPanel />
          <CostTracker />
        </aside>
        <section className="main-content">
          <Chat />
        </section>
      </div>
    </main>
  );
}

export default App;
