<script>
  import { onMount, afterUpdate, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  let nftData = [];
  let chart;
  let loading = true;
  let loadingProgress = 0;
  let loadingStatus = "Initializing...";
  let retryCount = 0;
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 30000; // 30 seconds timeout

  const contractAddress = "KT1GyHsoewbUGk4wpAVZFUYpP2VjZPqo1qBf";
  const kairosAddress = "KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW";
  const BurnedAddress = "tz1burnburnburnburnburnburnburjAYjjX";
  const AkaDropAddress = "KT1GyHsoewbUGk4wpAVZFUYpP2VjZPqo1qBf";

  let selectedLocation = "all";
  let locations = [];
  let filteredData = [];
  let selectedCategory = "all";
  let categories = [];

  // Add request queue management
  const requestQueue = [];
  const requestCache = new Map();
  let isProcessingQueue = false;

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, timeout = TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async function fetchBatchWithRetry(url, attempt = 0) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.status === 429) {
        if (attempt >= MAX_RETRIES) throw new Error("Max retries reached");
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await sleep(delay);
        return fetchBatchWithRetry(url, attempt + 1);
      }
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      await sleep(1000 * Math.pow(2, attempt));
      return fetchBatchWithRetry(url, attempt + 1);
    }
  }

  onMount(async () => {
    try {
      // Step 1: Fetch all tokens
      loadingStatus = "Fetching token list...";
      loadingProgress = 10;
      const mintData = await fetchBatchWithRetry(
        `https://api.tzkt.io/v1/tokens?contract=${kairosAddress}&metadata.symbol=Kairos%20NFTs`
      );

      const validTokens = mintData.filter(
        (token) =>
          token.metadata?.symbol === "Kairos NFTs" &&
          token.metadata?.event_location
      );

      loadingProgress = 20;
      loadingStatus = "Loading token balances...";

      // Step 2: Fetch all transfers in one call
      const allTransfers = await fetchBatchWithRetry(
        `https://api.tzkt.io/v1/tokens/transfers?token.contract=${kairosAddress}&to=${AkaDropAddress}&limit=10000`
      );

      loadingProgress = 50;
      loadingStatus = "Processing token data...";

      // Create a map for quick lookup
      const transferMap = new Map();
      allTransfers.forEach((transfer) => {
        const tokenId = transfer.token.tokenId;
        if (!transferMap.has(tokenId)) {
          transferMap.set(tokenId, []);
        }
        transferMap.get(tokenId).push(transfer);
      });

      // Step 3: Process tokens in efficient batches
      const batchSize = 10;
      const processedData = [];

      for (let i = 0; i < validTokens.length; i += batchSize) {
        loadingStatus = `Processing tokens ${i + 1} to ${Math.min(i + batchSize, validTokens.length)} of ${validTokens.length}...`;
        loadingProgress = 50 + (40 * i) / validTokens.length;

        const batch = validTokens.slice(i, i + batchSize);
        const batchPromises = batch.map(async (token) => {
          try {
            const balances = await fetchBatchWithRetry(
              `https://api.tzkt.io/v1/tokens/balances?token.contract=${kairosAddress}&token.tokenId=${token.tokenId}`
            );

            const tokenTransfers = transferMap.get(token.tokenId) || [];
            const originalAkaDropAmount = tokenTransfers.reduce(
              (sum, t) => sum + Number(t.amount),
              0
            );

            const currentAkaDropBalance = Number(
              balances.find((b) => b.account?.address === AkaDropAddress)
                ?.balance || 0
            );

            const isTokenBurned = balances.some(
              (b) =>
                b.account?.address === BurnedAddress && Number(b.balance) > 0
            );

            if (isTokenBurned) return null;

            return {
              tokenId: token.tokenId,
              date: token.metadata?.date,
              name: token.metadata?.name,
              tags: token.metadata?.tags,
              category: token.metadata?.category,
              event_location: token.metadata?.event_location,
              totalSupply: token.totalSupply,
              originalAkaDropAmount,
              currentAkaDropBalance,
              claimedAmount: originalAkaDropAmount - currentAkaDropBalance,
            };
          } catch (error) {
            console.error(`Error processing token ${token.tokenId}:`, error);
            return null;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        processedData.push(...batchResults.filter(Boolean));
        await sleep(1000); // Delay between batches
      }

      nftData = processedData;

      // Update filters
      locations = [
        "all",
        ...new Set(nftData.map((item) => item.event_location).filter(Boolean)),
      ];
      categories = [
        "all",
        ...new Set(nftData.map((item) => item.category).filter(Boolean)),
      ];

      filteredData = nftData;
      loadingProgress = 100;
      loading = false;
    } catch (error) {
      console.error("Error loading data:", error);
      loadingStatus = `Error: ${error.message}. Retrying...`;
      if (retryCount < MAX_RETRIES) {
        retryCount++;
        await sleep(2000);
        onMount(); // Retry loading
      } else {
        loadingStatus = "Failed to load data. Please refresh the page.";
        loading = false;
      }
    }
  });

  afterUpdate(() => {
    if (!loading && !chart) {
      createChart();
    }
  });

  onDestroy(() => {
    if (chart) {
      chart.destroy();
    }
  });

  function handleFilters() {
    try {
      filteredData = nftData.filter((item) => {
        if (!item) return false;

        const matchesLocation =
          selectedLocation === "all" ||
          (item.event_location && item.event_location === selectedLocation);
        const matchesCategory =
          selectedCategory === "all" ||
          (item.category && item.category === selectedCategory);

        return matchesLocation && matchesCategory;
      });

      updateChart();
    } catch (error) {
      console.error("Error filtering data:", error);
    }
  }

  const handleLocationChange = handleFilters;
  const handleCategoryChange = handleFilters;

  function createChart() {
    const ctx = document.getElementById("nftChart").getContext("2d");
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: filteredData.map((item) => item.name),
        datasets: [
          {
            label: "Total Supply",
            data: filteredData.map((item) => item.totalSupply),
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            borderColor: "rgba(75, 192, 192, 1)",
            borderWidth: 1,
          },
          {
            label: "Original AKAdrop Amount",
            data: filteredData.map((item) => item.originalAkaDropAmount),
            backgroundColor: "rgba(153, 102, 255, 0.2)",
            borderColor: "rgba(153, 102, 255, 1)",
            borderWidth: 1,
          },
          {
            label: "Current AKAdrop Balance",
            data: filteredData.map((item) => item.currentAkaDropBalance),
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            borderColor: "rgba(255, 99, 132, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        scales: {
          y: {
            beginAtZero: true,
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (context) {
                const dataIndex = context.dataIndex;
                const datasetLabel = context.dataset.label;
                const value = context.raw;
                const item = filteredData[dataIndex];

                return [
                  `${datasetLabel}: ${value}`,
                  `Date: ${new Date(item.date).toLocaleDateString()}`,
                  `Category: ${item.category || "N/A"}`,
                  `Location: ${item.event_location || "N/A"}`,
                  `Claimed Amount: ${item.claimedAmount}`,
                ];
              },
            },
          },
        },
      },
    });
  }

  function updateChart() {
    if (chart) {
      chart.destroy();
    }
    createChart();
  }
</script>

<div class="chart-container">
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
  </div>

  {#if loading}
    <div class="loading">
      <div class="progress-bar">
        <div class="progress-bar-inner" style="width: {loadingProgress}%"></div>
      </div>
      <p class="loading-status">{loadingStatus}</p>
      <p class="loading-progress">{Math.round(loadingProgress)}%</p>
    </div>
  {:else}
    <canvas id="nftChart" width="400" height="200"></canvas>
  {/if}
</div>

<style>
  canvas {
    max-width: 100%;
  }
  p {
    text-align: center;
    font-size: 1.5em;
  }
  .chart-container {
    padding: 1rem;
  }

  .filter-section {
    margin-bottom: 1rem;
    text-align: left;
    display: flex;
    gap: 1rem;
  }

  .filter-item {
    display: flex;
    align-items: center;
  }

  select {
    margin-left: 0.5rem;
    padding: 0.25rem;
    border-radius: 4px;
  }

  label {
    font-weight: 500;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #666;
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

  .loading p {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .loading-status {
    margin-top: 1rem;
    font-size: 1rem;
    color: #666;
  }

  .loading-progress {
    font-size: 0.9rem;
    color: #999;
  }

  @keyframes progress {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }
</style>
