import { useState } from "react";
import Chat from "./components/Chat";
import ModelPanel from "./components/ModelPanel";
import CostTracker from "./components/CostTracker";
import AddModelPage from "./components/AddModelPage";
import "./App.css";

function App() {
  const [currentPage, setCurrentPage] = useState<"chat" | "add-model">("chat");

  return (
    <main className="app">
      <header className="app-header">
        <img src="/innolink.png" alt="InnoLink" className="app-logo" />
        <span className="subtitle">AI Workspace Agent</span>
      </header>

      {currentPage === "chat" && (
        <div className="app-layout">
          <aside className="sidebar">
            <ModelPanel onAddModel={() => setCurrentPage("add-model")} />
            <CostTracker />
          </aside>
          <section className="main-content">
            <Chat />
          </section>
        </div>
      )}

      {currentPage === "add-model" && (
        <AddModelPage onBack={() => setCurrentPage("chat")} />
      )}
    </main>
  );
}

export default App;
