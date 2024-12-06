<script>
  import { onMount, tick } from "svelte";
  import Chart from "chart.js/auto";
  import { globalLoading } from "./stores/loading";

  let loading = true;
  let chart;
  let tokens = [];
  let selectedTokenId = "all";
  let selectedToken = null; // Add this line to store token metadata
  let collectorsData = [];
  let canvasElement; // Add this line for canvas reference
  const BurnedAddress = "tz1burnburnburnburnburnburnburjAYjjX";
  const ExcludedAddress = "tz1XBEMJfYoMoMMZafjYv3Q5V9u3QKv1xuBR"; // Add this line
  const AkaDropAddress = "KT1GyHsoewbUGk4wpAVZFUYpP2VjZPqo1qBf";

  let excludedAddresses = new Set([ExcludedAddress, AkaDropAddress]);
  let excludedAmounts = {};

  let selectedLocation = "all";
  let selectedCategory = "all";
  let locations = [];
  let categories = [];
  let filteredTokens = [];

  let cardCharts = new Map(); // Store charts for all tokens
  let cardData = new Map(); // Store collectors data for all tokens
  let canvasElements = new Map(); // Add this line to store canvas elements

  let showAllTokens = false; // Add this line

  let pageSize = 8;
  let currentPage = 1;
  let totalPages = 0;
  let visibleData = [];
  let isFiltering = false;

  // Add batch size for data loading
  const BATCH_SIZE = 5;
  let loadingProgress = 0;

  $: {
    if (filteredTokens) {
      totalPages = Math.ceil(filteredTokens.length / pageSize);
      updateVisibleData();
    }
  }

  function updateVisibleData() {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    visibleData = filteredTokens.slice(start, end);
    if (showAllTokens) {
      fetchPageData();
    }
  }

  async function fetchPageData() {
    loading = true;
    loadingProgress = 0;

    cardCharts.forEach((chart) => chart.destroy());
    cardCharts.clear();
    cardData.clear();

    try {
      const totalItems = visibleData.length;
      for (let i = 0; i < visibleData.length; i++) {
        const token = visibleData[i];
        const response = await fetch(
          `https://api.tzkt.io/v1/tokens/balances?token.contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW&token.tokenId=${token.tokenId}`
        );
        const data = await response.json();

        const collectors = data
          .filter(
            (item) =>
              item.balance > 0 &&
              item.account.address !== BurnedAddress &&
              !excludedAddresses.has(item.account.address)
          )
          .sort((a, b) => b.balance - a.balance);

        cardData.set(token.tokenId, {
          collectors,
          token,
          excludedAmounts: {
            [ExcludedAddress]:
              data.find((item) => item.account.address === ExcludedAddress)
                ?.balance || 0,
            [AkaDropAddress]:
              data.find((item) => item.account.address === AkaDropAddress)
                ?.balance || 0,
          },
        });

        loadingProgress = ((i + 1) / totalItems) * 100;
      }
    } catch (error) {
      console.error("Error loading page data:", error);
    }
    loading = false;
  }

  function toggleAllTokens() {
    showAllTokens = !showAllTokens;
    if (showAllTokens) {
      selectedTokenId = "all";
      currentPage = 1;
      filterTokens();
      fetchPageData();
    } else {
      cardCharts.forEach((chart) => chart.destroy());
      cardCharts.clear();
      cardData.clear();
      selectedTokenId = "all";
    }
  }

  onMount(async () => {
    try {
      // Fetch burned tokens first
      const burnedTokensResponse = await fetch(
        `https://api.tzkt.io/v1/tokens/transfers?to.eq=${BurnedAddress}&token.contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW`
      );
      const burnedTokens = await burnedTokensResponse.json();
      const burnedTokenIds = new Set(
        burnedTokens.map((token) => token.token.tokenId)
      );

      // Fetch all tokens
      const response = await fetch(
        "https://api.tzkt.io/v1/tokens?contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW"
      );
      const allTokens = await response.json();

      // Filter out burned tokens
      tokens = allTokens.filter((token) => !burnedTokenIds.has(token.tokenId));

      // Extract unique locations and categories
      locations = [
        "all",
        ...new Set(
          tokens.map((t) => t.metadata?.event_location).filter(Boolean)
        ),
      ];
      categories = [
        "all",
        ...new Set(tokens.map((t) => t.metadata?.category).filter(Boolean)),
      ];

      filteredTokens = tokens;
      loading = false;
    } catch (error) {
      console.error("Error loading tokens:", error);
      loading = false;
    }
  });

  async function fetchCollectorsData(tokenId) {
    loading = true;
    try {
      // First get the token metadata
      selectedToken = tokens.find((t) => t.tokenId === tokenId);

      const response = await fetch(
        `https://api.tzkt.io/v1/tokens/balances?token.contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW&token.tokenId=${tokenId}`
      );
      const data = await response.json();

      // Store amounts for excluded addresses before filtering
      excludedAmounts = {
        [ExcludedAddress]:
          data.find((item) => item.account.address === ExcludedAddress)
            ?.balance || 0,
        [AkaDropAddress]:
          data.find((item) => item.account.address === AkaDropAddress)
            ?.balance || 0,
      };

      // Filter out zero balances, burned addresses, and excluded address
      collectorsData = data
        .filter(
          (item) =>
            item.balance > 0 &&
            item.account.address !== BurnedAddress &&
            !excludedAddresses.has(item.account.address)
        )
        .sort((a, b) => b.balance - a.balance);

      if (chart) {
        chart.destroy();
      }
      await tick();
      requestAnimationFrame(() => createChart());
    } catch (error) {
      console.error("Error loading collectors:", error);
    }
    loading = false;
  }

  async function fetchAllTokensData() {
    loading = true;
    cardCharts.forEach((chart) => chart.destroy());
    cardCharts.clear();
    cardData.clear();

    try {
      // Load data in batches
      const batches = [];
      for (let i = 0; i < filteredTokens.length; i += BATCH_SIZE) {
        batches.push(filteredTokens.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        await Promise.all(
          batch.map(async (token) => {
            const response = await fetch(
              `https://api.tzkt.io/v1/tokens/balances?token.contract=KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW&token.tokenId=${token.tokenId}`
            );
            const data = await response.json();

            const collectors = data
              .filter(
                (item) =>
                  item.balance > 0 &&
                  item.account.address !== BurnedAddress &&
                  !excludedAddresses.has(item.account.address)
              )
              .sort((a, b) => b.balance - a.balance);

            cardData.set(token.tokenId, {
              collectors,
              token,
              excludedAmounts: {
                [ExcludedAddress]:
                  data.find((item) => item.account.address === ExcludedAddress)
                    ?.balance || 0,
                [AkaDropAddress]:
                  data.find((item) => item.account.address === AkaDropAddress)
                    ?.balance || 0,
              },
            });

            loadingProgress =
              (((i + 1) * BATCH_SIZE) / filteredTokens.length) * 100;
            await tick(); // Allow UI to update
          })
        );
      }
    } catch (error) {
      console.error("Error loading all tokens:", error);
    }
    loading = false;
    loadingProgress = 0;
  }

  function handleTokenSelect(event) {
    const tokenId = event.target.value;
    if (tokenId === "all") {
      if (chart) {
        chart.destroy();
        chart = null;
      }
      collectorsData = [];
    } else {
      fetchCollectorsData(tokenId);
    }
  }

  function filterTokens() {
    filteredTokens = tokens.filter((token) => {
      const matchesLocation =
        selectedLocation === "all" ||
        token.metadata?.event_location === selectedLocation;
      const matchesCategory =
        selectedCategory === "all" ||
        token.metadata?.category === selectedCategory;
      return matchesLocation && matchesCategory;
    });
  }

  async function handleLocationChange() {
    isFiltering = true;
    filterTokens();
    currentPage = 1;
    if (showAllTokens) {
      await fetchPageData();
    }
    isFiltering = false;
  }

  function handleCategoryChange() {
    filterTokens();
    if (showAllTokens) {
      fetchAllTokensData();
    } else if (selectedTokenId !== "all") {
      const tokenStillExists = filteredTokens.some(
        (t) => t.tokenId === selectedTokenId
      );
      if (!tokenStillExists) {
        selectedTokenId = "all";
        if (chart) {
          chart.destroy();
          chart = null;
        }
        collectorsData = [];
      }
    }
  }

  function createChart() {
    if (!canvasElement) return;

    const ctx = canvasElement.getContext("2d");
    chart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: collectorsData.map(
          (item) => `${item.account.address.substr(0, 8)}...`
        ),
        datasets: [
          {
            data: collectorsData.map((item) => item.balance),
            backgroundColor: collectorsData.map(
              (_, i) =>
                `hsl(${(i * 360) / Math.min(collectorsData.length, 20)}, 70%, 60%)`
            ),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: {
            right: 150, // Add padding for legend
          },
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const collector = collectorsData[index];
            window.open(
              `https://kairos-mint.art/wallet/${collector.account.address}`,
              "_blank"
            );
          }
        },
        plugins: {
          legend: {
            position: "right",
            display: true, // Always show legend
            align: "center",
            onClick: function (e, legendItem, legend) {
              const index = legendItem.index;
              const ci = legend.chart;
              const meta = ci.getDatasetMeta(0);

              // Toggle visibility
              const alreadyHidden = meta.data[index].hidden;
              meta.data[index].hidden = !alreadyHidden;

              // Toggle strikethrough text
              legendItem.hidden = !alreadyHidden;

              // Update the chart
              ci.update();
            },
            labels: {
              boxWidth: 15,
              padding: 15,
              font: {
                size: 10,
              },
              generateLabels: function (chart) {
                const data = chart.data;
                const meta = chart.getDatasetMeta(0);
                if (data.labels.length && data.datasets.length) {
                  return data.labels.map((label, i) => {
                    const hidden = meta.data[i] ? meta.data[i].hidden : false;
                    return {
                      text: `${label} (${data.datasets[0].data[i]})`,
                      fillStyle: data.datasets[0].backgroundColor[i],
                      strokeStyle: data.datasets[0].backgroundColor[i],
                      lineWidth: 1,
                      hidden: hidden,
                      index: i,
                    };
                  });
                }
                return [];
              },
            },
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const collector = collectorsData[context.dataIndex];
                const totalBalance = collectorsData.reduce(
                  (a, b) => a + b.balance,
                  0
                );
                const percentage = (
                  (collector.balance / totalBalance) *
                  100
                ).toFixed(2);
                return [
                  `Address: ${collector.account.address}`,
                  `Amount: ${collector.balance} (${percentage}%)`,
                  `Rank: #${context.dataIndex + 1} of ${collectorsData.length}`,
                  `Click to view wallet →`,
                ];
              },
            },
          },
        },
      },
    });
  }

  function createCardChart(node, tokenId) {
    if (!cardData.has(tokenId)) return;

    canvasElements.set(tokenId, node);
    const data = cardData.get(tokenId);
    const ctx = node.getContext("2d");

    const newChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: data.collectors.map(
          (item) => `${item.account.address.substr(0, 8)}...`
        ),
        datasets: [
          {
            data: data.collectors.map((item) => item.balance),
            backgroundColor: data.collectors.map(
              (_, i) =>
                `hsl(${(i * 360) / Math.min(data.collectors.length, 20)}, 70%, 60%)`
            ),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const collector = data.collectors[context.dataIndex];
                return [
                  `Address: ${collector.account.address}`,
                  `Amount: ${collector.balance}`,
                ];
              },
            },
          },
        },
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const index = elements[0].index;
            const collector = data.collectors[index];
            window.open(
              `https://kairos-mint.art/wallet/${collector.account.address}`,
              "_blank"
            );
          }
        },
      },
    });

    cardCharts.set(tokenId, newChart);

    return {
      destroy() {
        if (cardCharts.has(tokenId)) {
          cardCharts.get(tokenId).destroy();
          cardCharts.delete(tokenId);
          canvasElements.delete(tokenId);
        }
      },
    };
  }

  function toggleAddress(address) {
    if (excludedAddresses.has(address)) {
      excludedAddresses.delete(address);
    } else {
      excludedAddresses.add(address);
    }
    excludedAddresses = excludedAddresses; // Trigger reactivity
    if (selectedTokenId !== "all") {
      fetchCollectorsData(selectedTokenId);
    }
  }

  // Update loading indicator to show progress
  $: loadingMessage =
    loadingProgress > 0
      ? `Loading data... ${Math.min(Math.round(loadingProgress), 100)}%`
      : "Loading data...";

  // Export tokens and categories for other components
  export let onCollectorSelect = () => {};

  function handleCollectorClick(collector) {
    onCollectorSelect(collector);
  }
</script>

<div class="collectors-container">
  <div class="filter-section">
    <div class="filter-item">
      <label for="location">Filter by Location:</label>
      <select
        id="location"
        bind:value={selectedLocation}
        on:change={handleLocationChange}
      >
        {#each locations as location}
          <option value={location}>{location}</option>
        {/each}
      </select>
    </div>

    <div class="filter-item">
      <label for="category">Filter by Category:</label>
      <select
        id="category"
        bind:value={selectedCategory}
        on:change={handleCategoryChange}
      >
        {#each categories as category}
          <option value={category}>{category}</option>
        {/each}
      </select>
    </div>

    <div class="filter-item actions">
      {#if !showAllTokens}
        <div class="select-wrapper">
          <label for="token">Select Token:</label>
          <select
            id="token"
            bind:value={selectedTokenId}
            on:change={handleTokenSelect}
          >
            <option value="all">Please select a token</option>
            {#each filteredTokens as token}
              <option value={token.tokenId}>
                {token.metadata?.name || `Token ${token.tokenId}`}
              </option>
            {/each}
          </select>
        </div>
      {/if}
      <button
        class="show-all-btn"
        class:active={showAllTokens}
        on:click={toggleAllTokens}
      >
        {showAllTokens ? "Hide All Tokens" : "Show All Tokens"}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="loading">
      <div class="progress-bar">
        <div class="progress-bar-inner" style="width: {loadingProgress}%"></div>
      </div>
      <p>Loading data... {Math.round(loadingProgress)}%</p>
    </div>
  {:else if selectedTokenId === "all" && showAllTokens}
    <div class="cards-grid">
      {#each [...cardData] as [tokenId, data]}
        <div class="token-card">
          <div class="card-header">
            <h3>{data.token.metadata?.name || `Token ${tokenId}`}</h3>
            <div class="card-stats">
              <span>Supply: {data.token.totalSupply}</span>
              <span>Holders: {data.collectors.length}</span>
            </div>
            {#if data.token.metadata?.category}
              <span class="category-tag">{data.token.metadata.category}</span>
            {/if}
          </div>
          <div class="chart-container">
            <canvas use:createCardChart={tokenId} height="200"></canvas>
          </div>
        </div>
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="pagination">
        <button
          disabled={currentPage === 1 || loading || isFiltering}
          on:click={() => {
            currentPage--;
            updateVisibleData();
          }}>Previous</button
        >
        <span>{currentPage} / {totalPages}</span>
        <button
          disabled={currentPage === totalPages || loading || isFiltering}
          on:click={() => {
            currentPage++;
            updateVisibleData();
          }}>Next</button
        >
      </div>
    {/if}
  {:else if selectedTokenId !== "all" && collectorsData.length > 0}
    <div class="address-toggles">
      <button
        class="toggle-btn"
        class:active={!excludedAddresses.has(ExcludedAddress)}
        on:click={() => toggleAddress(ExcludedAddress)}
      >
        Kairos Owner {excludedAddresses.has(ExcludedAddress)
          ? "(Hidden)"
          : "(Shown)"}
        {#if excludedAmounts[ExcludedAddress]}
          <span class="amount-badge">{excludedAmounts[ExcludedAddress]}</span>
        {/if}
      </button>
      <button
        class="toggle-btn"
        class:active={!excludedAddresses.has(AkaDropAddress)}
        on:click={() => toggleAddress(AkaDropAddress)}
      >
        AKADrop Contract {excludedAddresses.has(AkaDropAddress)
          ? "(Hidden)"
          : "(Shown)"}
        {#if excludedAmounts[AkaDropAddress]}
          <span class="amount-badge">{excludedAmounts[AkaDropAddress]}</span>
        {/if}
      </button>
    </div>

    <div class="stats-summary">
      <p>Total Collectors: {collectorsData.length}</p>
      <p>Total Supply: {selectedToken?.totalSupply || 0}</p>
      {#if selectedToken?.metadata?.name}
        <p>Token Name: {selectedToken.metadata.name}</p>
      {/if}
    </div>
    <div class="chart-wrapper" style="max-width: 1200px;">
      <canvas bind:this={canvasElement}></canvas>
    </div>
  {:else}
    <p class="select-prompt">Please select a token to view collectors data</p>
  {/if}
</div>

<style>
  .collectors-container {
    padding: 1rem;
  }

  .filter-section {
    margin-bottom: 1rem;
    text-align: left;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  select {
    padding: 0.25rem;
    border-radius: 4px;
    min-width: 200px;
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

  @keyframes progress {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }

  .select-prompt {
    text-align: center;
    color: #666;
    font-size: 1.1rem;
  }

  .chart-wrapper {
    height: 600px;
    position: relative;
    margin: 0 auto;
    width: 100%;
  }

  canvas {
    max-width: 100%;
  }

  .stats-summary {
    margin-bottom: 1rem;
    display: flex;
    gap: 2rem;
    justify-content: center;
  }

  .stats-summary p {
    margin: 0;
    font-size: 0.9rem;
    color: #666;
  }

  .address-toggles {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .toggle-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f8f9fa;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-btn:hover {
    background: #e9ecef;
  }

  .toggle-btn.active {
    background: #4bc0c0;
    color: white;
    border-color: #4bc0c0;
  }

  .amount-badge {
    display: inline-block;
    background: #e9ecef;
    padding: 0.2rem 0.5rem;
    border-radius: 12px;
    margin-left: 0.5rem;
    font-size: 0.8rem;
    color: #666;
  }

  .toggle-btn.active .amount-badge {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(
      2,
      1fr
    ); /* Changed from auto-fill to 2 columns */
    gap: 1.5rem; /* Increased gap for better spacing */
    padding: 1rem;
    max-width: 1400px; /* Added max-width to control overall width */
    margin: 0 auto; /* Center the grid */
  }

  .token-card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 300px; /* Added minimum width */
    height: 400px; /* Add fixed height */
  }

  .chart-container {
    flex: 1;
    position: relative;
    height: 250px; /* Fixed height for chart container */
    width: 100%;
  }

  canvas {
    max-width: 100%;
    max-height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .card-header {
    text-align: left;
  }

  .card-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #333;
  }

  .card-stats {
    display: flex;
    gap: 1rem;
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
  }

  .category-tag {
    display: inline-block;
    background: #e9ecef;
    padding: 0.2rem 0.5rem;
    border-radius: 12px;
    font-size: 0.8rem;
    color: #666;
    margin-top: 0.5rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .select-wrapper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .show-all-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #4bc0c0;
    border-radius: 4px;
    background: white;
    color: #4bc0c0;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .show-all-btn:hover {
    background: #4bc0c0;
    color: white;
  }

  .show-all-btn.active {
    background: #4bc0c0;
    color: white;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
  }

  .pagination button {
    padding: 0.5rem 1rem;
    border: 1px solid #4bc0c0;
    border-radius: 4px;
    background: white;
    color: #4bc0c0;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination button:hover:not(:disabled) {
    background: #4bc0c0;
    color: white;
  }
</style>
