<script>
  import { onMount } from "svelte";
  import Chart from "chart.js/auto";

  const BurnedAddress = "tz1burnburnburnburnburnburnburjAYjjX";
  const ExcludedAddress = "tz1XBEMJfYoMoMMZafjYv3Q5V9u3QKv1xuBR";
  const AkaDropAddress = "KT1GyHsoewbUGk4wpAVZFUYpP2VjZPqo1qBf";

  let loading = true;
  let tokens = [];
  let collectors = new Map(); // Map to store collector data
  let selectedCollector = null;
  let searchTerm = "";
  let radarChart;
  let canvasElement;
  let searchInput = ""; // For filtering the select options
  let showDropdown = false;
  let dropdownRef;
  let loadingProgress = 0;
  let processedTokens = 0;
  let viewMode = "category"; // Add this near other state variables
  let allEventLocations = new Set(); // Add this near allCategories declaration

  // Modified filtering logic
  $: filteredAddresses = Array.from(collectors.values())
    .filter(
      (c) =>
        c.address.toLowerCase().includes(searchInput.toLowerCase()) ||
        c.totalNFTs.toString().includes(searchInput)
    )
    .sort((a, b) => b.totalNFTs - a.totalNFTs)
    .slice(0, 50); // Show top 50 matches

  // Handle click outside dropdown
  function handleClickOutside(event) {
    if (dropdownRef && !dropdownRef.contains(event.target)) {
      showDropdown = false;
    }
  }

  // Add event listener for click outside
  onMount(() => {
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });

  // Add props to receive data from parent
  export let preloadedTokens = null;
  export let preloadedCategories = [];

  let allCategories = new Set();

  // Add debug logging utility
  const DEBUG = true;
  function debugLog(message, data) {
    if (DEBUG) {
      console.log(`[Debug] ${message}:`, data);
    }
  }

  onMount(async () => {
    try {
      if (preloadedTokens) {
        tokens = preloadedTokens.filter(
          (token) => token.metadata?.symbol === "Kairos NFTs"
        );
      } else {
        const response = await fetch(
          "https://api.tzkt.io/v1/tokens?contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW"
        );
        const allTokens = await response.json();
        tokens = allTokens.filter(
          (token) => token.metadata?.symbol === "Kairos NFTs"
        );
      }

      // Initialize categories and event locations
      if (preloadedCategories.length > 0) {
        allCategories = new Set(preloadedCategories);
      } else {
        // First get all active token balances
        const activeTokens = new Set();
        for (const token of tokens) {
          const response = await fetch(
            `https://api.tzkt.io/v1/tokens/balances?token.contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW&token.tokenId=${token.tokenId}`
          );
          const balances = await response.json();

          // Check if token has any active balance (not burned)
          const isActive = balances.some(
            (b) =>
              b.balance > 0 &&
              b.account.address !== BurnedAddress &&
              b.account.address !== ExcludedAddress &&
              b.account.address !== AkaDropAddress
          );

          if (isActive) {
            activeTokens.add(token.tokenId);
            if (token.metadata?.category) {
              allCategories.add(token.metadata.category);
            }
            if (token.metadata?.event_location) {
              allEventLocations.add(token.metadata.event_location);
            }
          }
        }

        // Update tokens array to only include active tokens
        tokens = tokens.filter((token) => activeTokens.has(token.tokenId));
      }

      // Process tokens with all possible categories
      await processTokens();
      loading = false;
    } catch (error) {
      console.error("Error loading data:", error);
      loading = false;
    }
  });

  async function processTokens() {
    collectors.clear();
    processedTokens = 0;
    const totalTokens = tokens.length;

    debugLog("Processing tokens", tokens.length);
    debugLog("All categories", Array.from(allCategories));

    for (const token of tokens) {
      try {
        const response = await fetch(
          `https://api.tzkt.io/v1/tokens/balances?token.contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW&token.tokenId=${token.tokenId}`
        );
        const balances = await response.json();

        balances
          .filter(
            (b) =>
              b.balance > 0 &&
              b.account.address !== BurnedAddress &&
              b.account.address !== ExcludedAddress &&
              b.account.address !== AkaDropAddress
          )
          .forEach((balance) => {
            const address = balance.account.address;
            const category = token.metadata?.category || "Uncategorized";
            const event_location = token.metadata?.event_location || "Unknown";
            // Convert balance to number
            const balanceAmount = parseInt(balance.balance, 10);

            debugLog(`Token ${token.tokenId}`, {
              category,
              balance: balanceAmount,
              address,
              metadata: token.metadata,
            });

            if (!collectors.has(address)) {
              collectors.set(address, {
                address,
                categories: {},
                event_locations: {}, // Add this
                totalNFTs: 0,
                uniqueTokens: 0,
                tokenIds: new Set(), // Add this line
                rank: 0,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`,
              });
            }

            const collector = collectors.get(address);
            // Convert existing category balance to number if it exists
            const currentCategoryAmount = parseInt(
              collector.categories[category] || 0,
              10
            );
            collector.categories[category] =
              currentCategoryAmount + balanceAmount;
            collector.event_locations[event_location] =
              (collector.event_locations[event_location] || 0) + balanceAmount;
            collector.totalNFTs =
              parseInt(collector.totalNFTs || 0, 10) + balanceAmount;
            collector.uniqueTokens++;
            collector.tokenIds.add(token.tokenId); // Add this line

            debugLog(`Updated collector ${address}`, {
              categories: collector.categories,
              totalNFTs: collector.totalNFTs,
              rawBalance: balance.balance,
              parsedBalance: balanceAmount,
            });
          });

        processedTokens++;
        loadingProgress = (processedTokens / totalTokens) * 100;
      } catch (error) {
        console.error(`Error processing token ${token.tokenId}:`, error);
      }
    }

    // Update rankings based on totalNFTs
    const sortedCollectors = Array.from(collectors.values()).sort(
      (a, b) => b.totalNFTs - a.totalNFTs
    );

    sortedCollectors.forEach((collector, index) => {
      collector.rank = index + 1;
    });

    collectors = new Map(sortedCollectors.map((c) => [c.address, c]));

    debugLog("Final collectors data", Array.from(collectors.entries()));
  }

  // Update reactive statements
  $: sortedCollectors = Array.from(collectors.values()).sort(
    (a, b) => b.totalNFTs - a.totalNFTs
  );

  $: rankedCollectors = Array.from(collectors.values()).sort(
    (a, b) => b.totalBalance - a.totalBalance
  );

  // Add this reactive statement
  $: if (selectedCollector && canvasElement) {
    createRadarChart(selectedCollector);
  }

  function createRadarChart(collector) {
    // Add a guard clause to prevent execution if canvas is not ready
    if (!canvasElement) return;

    if (radarChart) {
      radarChart.destroy();
    }

    // Use categories or event_locations based on viewMode
    const items =
      viewMode === "category"
        ? Array.from(allCategories)
        : Array.from(allEventLocations);

    const values = items.map((item) =>
      viewMode === "category"
        ? collector.categories[item] || 0
        : collector.event_locations[item] || 0
    );

    debugLog("Creating radar chart", {
      collector: collector.address,
      categories: items,
      values,
      collectorCategories: collector.categories,
    });

    const ctx = canvasElement.getContext("2d");
    radarChart = new Chart(ctx, {
      type: "radar",
      data: {
        labels: items,
        datasets: [
          {
            label:
              viewMode === "category"
                ? "NFT Holdings by Category"
                : "NFT Holdings by Event Location",
            data: values,
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            borderColor: "rgba(75, 192, 192, 1)",
            borderWidth: 1,
            fill: true,
          },
        ],
      },
      options: {
        scales: {
          r: {
            beginAtZero: true,
            angleLines: {
              display: true,
            },
            ticks: {
              stepSize: 1,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const category = context.label;
                const value = context.raw;
                return `${category}: ${value} NFTs`;
              },
            },
          },
        },
      },
    });
  }

  function selectCollector(collector) {
    selectedCollector = collector;
    // Remove the direct call to createRadarChart here
    // The reactive statement above will handle it
  }

  // Add function to handle view mode change
  function toggleViewMode() {
    viewMode = viewMode === "category" ? "event_location" : "category";
    if (selectedCollector) {
      createRadarChart(selectedCollector);
    }
  }

  // Remove the existing search input and replace with a select dropdown
  let selectedAddress = "";

  $: sortedCollectors = Array.from(collectors.values()).sort(
    (a, b) => b.totalBalance - a.totalBalance
  );

  $: filteredCollectors = Array.from(collectors.values())
    .filter((c) => c.address.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => b.totalNFTs - a.totalNFTs)
    .slice(0, 10);

  // Replace the collectors list section with a ranking table
  $: rankedCollectors = Array.from(collectors.values()).sort(
    (a, b) => b.totalBalance - a.totalBalance
  ); // Removed .slice(0, 20)

  function handleKeyDown(event, collector) {
    if (event.key === "Enter" || event.key === " ") {
      // Handle the click event
      selectCollector(collector);
    }
  }
</script>

<div class="analysis-container">
  <div class="left-panel">
    <div class="search-section">
      <div class="select-wrapper">
        <select
          bind:value={selectedAddress}
          on:change={() => {
            const collector = collectors.get(selectedAddress);
            if (collector) {
              selectCollector(collector);
            }
          }}
        >
          <option value="">Select a collector</option>
          {#each sortedCollectors as collector}
            <option value={collector.address}>
              {collector.address.substring(0, 12)}... ({collector.totalNFTs} Kairos
              NFTs)
            </option>
          {/each}
        </select>
      </div>
    </div>

    {#if !loading}
      <div class="collectors-ranking">
        <h3>Collectors Ranking ({rankedCollectors.length} total)</h3>
        <div class="ranking-table">
          {#each rankedCollectors as collector}
            <div
              class="ranking-row"
              class:selected={selectedCollector?.address === collector.address}
              role="button"
              tabindex="0"
              on:click={() => selectCollector(collector)}
              on:keydown={(event) => handleKeyDown(event, collector)}
              style="border-left: 4px solid {collector.color}"
            >
              <div class="rank">#{collector.rank}</div>
              <div class="collector-info">
                <div class="address">
                  <a
                    href={`https://tzkt.io/${collector.address}/balances`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {collector.address.substring(
                      0,
                      10
                    )}...{collector.address.substring(
                      collector.address.length - 4
                    )}
                  </a>
                </div>
                <div class="nft-count">
                  Kairos NFTs: {collector.totalNFTs.toLocaleString()}
                </div>
                <div class="token-ids">
                  Token IDs: {#each Array.from(collector.tokenIds) as tokenId}
                    <a
                      href={`https://kairos-mint.art/claimsToken/KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW/${tokenId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="token-link"
                    >
                      {tokenId}
                    </a>
                    {#if tokenId !== Array.from(collector.tokenIds).slice(-1)[0]},&nbsp;{/if}
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="right-panel">
    {#if loading}
      <div class="loading">
        <div class="progress-bar">
          <div
            class="progress-bar-inner"
            style="width: {loadingProgress}%"
          ></div>
        </div>
        <p>Loading collector data... {Math.round(loadingProgress)}%</p>
      </div>
    {:else if selectedCollector}
      <div class="chart-section">
        <div class="chart-header">
          <h3>
            {viewMode === "category" ? "Category" : "Event Location"} Analysis for
            {selectedCollector.address.substring(0, 12)}...
          </h3>
          <button class="view-toggle" on:click={toggleViewMode}>
            Switch to {viewMode === "category" ? "Event Location" : "Category"} View
          </button>
        </div>
        <div class="chart-container">
          <canvas bind:this={canvasElement}></canvas>
        </div>
      </div>
    {:else}
      <div class="no-selection">
        <p>Select a collector to view their interests</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .analysis-container {
    display: grid;
    grid-template-columns: 450px 1fr; /* Increased left panel width to prevent horizontal scroll */
    gap: 2.5rem; /* Increased gap between panels */
    padding: 2rem; /* Increased overall padding */
    max-width: 1600px; /* Increased max-width */
    margin: 0 auto;
    height: calc(100vh - 80px); /* Increased container height */
  }

  .left-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem; /* Increased gap between elements */
    height: 100%; /* Make left panel full height */
    max-width: 450px; /* Match grid column width */
    width: 100%;
    min-height: 0; /* Allow panel to shrink */
    padding: 0 1rem; /* Add padding to contain children */
  }

  .search-section {
    background: white;
    padding: 1.5rem; /* Increased padding */
    border-radius: 12px; /* Increased border radius */
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    margin-bottom: 1rem; /* Added margin bottom */
    width: 100%; /* Ensure full width */
    flex-shrink: 0; /* Prevent search from shrinking */
    box-sizing: border-box; /* Ensure padding is included in width */
    margin: 0; /* Remove margin */
  }

  .collectors-ranking {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    flex: 1; /* Take remaining space */
    overflow: hidden; /* Hide overflow */
    display: flex;
    flex-direction: column;
    width: 100%; /* Ensure full width */
    max-width: none; /* Remove fixed width constraint */
    min-height: 0; /* Allow container to shrink */
    box-sizing: border-box; /* Ensure padding is included in width */
  }

  .collectors-ranking h3 {
    padding: 1.5rem 1.5rem 1rem; /* Added padding */
    margin: 0;
    border-bottom: 1px solid #eee;
  }

  .ranking-table {
    overflow-y: auto; /* Vertical scroll only */
    overflow-x: hidden; /* Hide horizontal scroll */
    padding: 1.5rem; /* Increased padding */
    flex: 1; /* Take remaining space */
    min-height: 0; /* Allow table to shrink */
    gap: 1rem; /* Increased gap between ranking rows */
  }

  .ranking-row {
    margin: 0.75rem 0; /* Adjusted margin */
    padding: 1.25rem; /* Increased padding */
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid transparent;
    transition: all 0.2s;
    width: 100%;
    box-sizing: border-box; /* Include padding in width calculation */
    min-width: 0; /* Allow content to shrink */
  }

  .ranking-row:hover {
    transform: translateX(4px);
    background: #f0f0f0;
  }

  .ranking-row.selected {
    background: #e3f2fd;
    border-left-color: #4bc0c0;
  }

  .collector-info {
    min-width: 0; /* Allow content to shrink */
    overflow: hidden; /* Hide overflow content */
  }

  .token-ids {
    overflow-wrap: break-word;
    word-break: break-all;
    white-space: normal;
    padding-right: 1rem; /* Add padding to prevent text touching edge */
    max-width: 100%; /* Limit width to prevent horizontal scroll */
  }

  .right-panel {
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 2rem; /* Increased padding */
    height: 100%; /* Make right panel full height */
    display: flex;
    flex-direction: column;
    min-height: 0; /* Allow panel to shrink */
    overflow: hidden; /* Prevent overflow */
    gap: 1.5rem; /* Added gap */
  }

  .chart-section {
    flex: 1; /* Take remaining space */
    display: flex;
    flex-direction: column;
    min-height: 0; /* Allow section to shrink */
    gap: 1.5rem; /* Added gap */
  }

  .chart-container {
    flex: 1; /* Take remaining space */
    position: relative;
    width: 100%;
    min-height: 0; /* Allow chart to shrink */
    padding: 1rem; /* Added padding */
  }

  .no-selection {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
    font-size: 1.1rem;
  }

  .search-section {
    position: sticky;
    top: 0;
    background: white;
    padding: 1rem;
    z-index: 10;
    border-bottom: 1px solid #eee;
  }

  select {
    width: 100%;
    padding: 0.875rem;
    margin-bottom: 0.5rem;
    border-radius: 8px;
    font-size: 1rem;
    border: 1px solid #e0e0e0;
    background-color: white;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition: all 0.2s;
  }

  select:focus {
    outline: none;
    border-color: #4bc0c0;
    box-shadow: 0 0 0 3px rgba(75, 192, 192, 0.2);
  }

  input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }

  .content {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 2rem;
    align-items: start;
  }

  .collectors-list {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    max-height: 600px;
    overflow-y: auto;
  }

  .collector-item {
    padding: 0.5rem;
    border-bottom: 1px solid #eee;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .collector-item:hover {
    background-color: #f5f5f5;
  }

  .collector-item.selected {
    background-color: #e3f2fd;
  }

  .address {
    font-family: monospace;
    color: #666;
    text-align: left;
  }

  .total {
    font-size: 0.9rem;
    color: #888;
  }

  .chart-section {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .chart-container {
    height: 500px;
    position: relative;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  h3 {
    margin: 0 0 1rem 0;
    color: #333;
  }

  .custom-select {
    position: relative;
    width: 100%;
  }

  .select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    margin-top: 4px;
    max-height: 300px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .select-option {
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #eee;
  }

  .select-option:last-child {
    border-bottom: none;
  }

  .select-option:hover {
    background-color: #f5f5f5;
  }

  .select-option.selected {
    background-color: #e3f2fd;
  }

  .address {
    font-family: monospace;
    color: #666;
    text-align: left;
  }

  .nft-count {
    color: #4bc0c0;
    font-weight: 500;
    font-size: 0.9rem;
    text-align: left;
  }

  /* Ensure the dropdown scrolls properly */
  :global(body) {
    overflow-x: hidden;
  }

  .select-wrapper {
    width: 100%;
    margin-bottom: 1rem;
  }

  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
    background-color: white;
  }

  select:focus {
    outline: none;
    border-color: #4bc0c0;
    box-shadow: 0 0 0 2px rgba(75, 192, 192, 0.2);
  }

  .collectors-ranking {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    max-height: none; /* Remove fixed height */
    width: auto; /* Let it fill container */
  }

  .ranking-table {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ranking-row {
    display: flex;
    align-items: flex-start; /* Align items to top */
    padding: 0.75rem;
    background: #f8f9fa;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    gap: 1rem;
    width: 100%;
  }

  .ranking-row:hover {
    transform: translateX(4px);
    background: #f0f0f0;
  }

  .ranking-row.selected {
    background: #e3f2fd;
    transform: translateX(4px);
  }

  .rank {
    font-weight: bold;
    font-size: 1.1rem;
    color: #444;
    min-width: 40px;
  }

  .collector-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-align: left;
    min-width: 0; /* Allow content to shrink */
  }

  .address a {
    color: #4bc0c0;
    text-decoration: none;
  }

  .address a:hover {
    text-decoration: underline;
  }

  .nft-count {
    font-size: 0.9rem;
    color: #666;
    text-align: left;
  }

  .token-ids {
    font-size: 0.8rem;
    color: #888;
    text-align: left;
    word-wrap: break-word;
    word-break: break-all;
    white-space: normal;
  }

  .token-link {
    color: #4bc0c0;
    text-decoration: none;
    display: inline-block;
  }

  .token-link:hover {
    text-decoration: underline;
  }

  .total {
    font-size: 0.8rem;
    color: #888;
    margin-top: 0.2rem;
    display: flex;
    gap: 0.5rem;
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

  .loading {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  .loading p {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 1rem; /* Added padding */
    border-bottom: 1px solid #eee;
  }

  .view-toggle {
    padding: 0.5rem 1rem;
    background-color: #4bc0c0;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .view-toggle:hover {
    background-color: #3aa0a0;
  }
</style>
