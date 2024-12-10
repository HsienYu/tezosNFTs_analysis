<script lang="ts">
  import { onMount } from "svelte";
  import { globalLoading } from "./stores/loading";
  import TezosNFTChart from "./TezosNFTChart.svelte";
  import TezosNFTCollectors from "./TezosNFTCollectors.svelte";
  import TezosCollectorAnalysis from "./TezosCollectorAnalysis.svelte";
  import Dashboard from "./Dashboard.svelte";

  /** @type {string} */
  let selectedTab = "dashboard"; // Set default tab to dashboard
  let isLoading = false; // Don't start with loading state
  let sharedTokens = null;
  let sharedCategories = [];

  async function handleNavClick(tab, e) {
    e.preventDefault();
    if (tab === selectedTab) return; // Skip if same tab

    selectedTab = tab; // Change tab immediately
    isLoading = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      isLoading = false;
    }
  }

  function handleCollectorSelect(collector) {
    selectedTab = "collectors";
  }

  onMount(() => {
    globalLoading.set(false); // Just set global loading to false immediately
  });
</script>

<main>
  <header>
    <div class="header-content">
      <h1>
        <a
          href="https://kairos-mint.art"
          target="_blank"
          rel="noopener noreferrer"
        >
          Kairos NFTs Analysis - NoUI/UX implementation
        </a>
      </h1>
      <nav>
        <ul>
          <li>
            <a
              href="#dashboard"
              class:active={selectedTab === "dashboard"}
              on:click={(e) => handleNavClick("dashboard", e)}
            >
              <i class="fas fa-chart-line"></i>
              Dashboard
            </a>
          </li>
          <li>
            <a
              href="#general"
              class:active={selectedTab === "general"}
              on:click={(e) => handleNavClick("general", e)}
            >
              <i class="fas fa-chart-bar"></i>
              NFT Status
            </a>
          </li>
          <li>
            <a
              href="#collections"
              class:active={selectedTab === "collections"}
              on:click={(e) => handleNavClick("collections", e)}
            >
              <i class="fas fa-images"></i>
              Collections
            </a>
          </li>
          <li>
            <a
              href="#collectors"
              class:active={selectedTab === "collectors"}
              on:click={(e) => handleNavClick("collectors", e)}
            >
              <i class="fas fa-users"></i>
              Collectors
            </a>
          </li>
        </ul>
      </nav>
    </div>
  </header>

  <div class="content-wrapper">
    {#if isLoading}
      <div class="loading">
        <div class="progress-bar">
          <div class="progress-bar-inner" style="width: 100%"></div>
        </div>
        <p>Loading content...</p>
      </div>
    {:else if selectedTab === "dashboard"}
      <div class="dashboard-wrapper">
        <Dashboard />
      </div>
    {:else if selectedTab === "collectors"}
      <TezosCollectorAnalysis
        preloadedTokens={sharedTokens}
        preloadedCategories={sharedCategories}
      />
    {:else if selectedTab === "collections"}
      <TezosNFTCollectors
        bind:tokens={sharedTokens}
        bind:categories={sharedCategories}
        onCollectorSelect={handleCollectorSelect}
      />
    {:else if selectedTab === "general"}
      <TezosNFTChart />
    {/if}
  </div>
</main>

<style>
  main {
    text-align: center;
    max-width: 100%;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #f5f7fa;
  }

  header {
    background-color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-content {
    max-width: 1400px;
    margin: 0 auto;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
    color: #2c3e50;
    font-weight: 600;
  }

  nav ul {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 2rem;
  }

  nav a {
    text-decoration: none;
    color: #6c757d;
    font-weight: 500;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 6px;
  }

  nav a:hover {
    color: #4bc0c0;
    background-color: #f8f9fa;
  }

  nav a.active {
    color: #4bc0c0;
    background-color: #e6f7f7;
    font-weight: 600;
  }

  .content-wrapper {
    flex: 1;
    max-width: 1400px;
    margin: 2rem auto;
    padding: 0 2rem;
    width: 100%;
    box-sizing: border-box;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .progress-bar {
    width: 100%;
    max-width: 300px;
    height: 4px;
    background-color: #f0f0f0;
    border-radius: 2px;
    margin: 1rem auto;
    overflow: hidden;
  }

  .progress-bar-inner {
    height: 100%;
    background-color: #4bc0c0;
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  @keyframes progress {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }

  .loading p {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .dashboard-wrapper {
    width: 100%;
    min-height: 500px;
    background: #f5f7fa;
    padding: 1rem;
  }
</style>
