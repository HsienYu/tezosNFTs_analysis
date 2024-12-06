<script>
  import { onMount, afterUpdate, onDestroy } from "svelte";
  import Chart from "chart.js/auto";

  let nftData = [];
  let chart;
  let loading = true;
  let loadingProgress = 0;

  const contractAddress = "KT1GyHsoewbUGk4wpAVZFUYpP2VjZPqo1qBf";
  const kairosAddress = "KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW";
  const BurnedAddress = "tz1burnburnburnburnburnburnburjAYjjX";

  let selectedLocation = "all";
  let locations = [];
  let filteredData = [];
  let selectedCategory = "all";
  let categories = [];

  onMount(async () => {
    try {
      loadingProgress = 25;
      // Fetch mint data from new endpoint
      const mintDataResponse = await fetch(
        `https://api.tzkt.io/v1/tokens?contract=${kairosAddress}`
      );
      const mintData = await mintDataResponse.json();

      loadingProgress = 50;
      // Fetch transfer data for AKAdrop amounts
      const transferDataResponse = await fetch(
        `https://api.tzkt.io/v1/tokens/transfers?token.contract=${kairosAddress}`
      );
      const transferData = await transferDataResponse.json();

      loadingProgress = 75;
      const burnedTokensResponse = await fetch(
        `https://api.tzkt.io/v1/tokens/transfers?to.eq=${BurnedAddress}&token.contract=${kairosAddress}`
      );
      const burnedTokens = await burnedTokensResponse.json();

      const burnedTokenIds = new Set(
        burnedTokens.map((token) => token.token.tokenId)
      );

      // Create a map of tokenId to transfer amount
      const transferAmounts = {};
      transferData.forEach((transfer) => {
        if (!burnedTokenIds.has(transfer.token.tokenId)) {
          transferAmounts[transfer.token.tokenId] = transfer.amount;
        }
      });

      // Process and combine data
      nftData = mintData
        .filter((token) => !burnedTokenIds.has(token.tokenId))
        .map((token) => ({
          tokenId: token.tokenId,
          date: token.metadata.date,
          name: token.metadata.name,
          tags: token.metadata.tags,
          category: token.metadata.category,
          geoLocation: token.metadata.geoLocation,
          event_location: token.metadata.event_location,
          totalSupply: token.totalSupply,
          amount: transferAmounts[token.tokenId] || 0,
        }));

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
      loading = false;
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
            label: "Mint Amount",
            data: filteredData.map((item) => item.totalSupply),
            backgroundColor: "rgba(75, 192, 192, 0.2)",
            borderColor: "rgba(75, 192, 192, 1)",
            borderWidth: 1,
          },
          {
            label: "AKAdrop Amount",
            data: filteredData.map((item) => item.amount),
            backgroundColor: "rgba(153, 102, 255, 0.2)",
            borderColor: "rgba(153, 102, 255, 1)",
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

                if (datasetLabel === "Mint Amount") {
                  return [
                    `${datasetLabel}: ${value}`,
                    `Date: ${new Date(item.date).toLocaleDateString()}`,
                    `Category: ${item.category || "N/A"}`,
                    `Tags: ${item.tags ? item.tags.join(", ") : "N/A"}`,
                    `Location: ${item.event_location || "N/A"}`,
                  ];
                } else if (datasetLabel === "AKAdrop Amount") {
                  return [
                    `${datasetLabel}: ${value}`,
                    `Timestamp: ${new Date(item.date).toLocaleString()}`,
                  ];
                }
                return `${datasetLabel}: ${value}`;
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
      <p>Loading data... {Math.round(loadingProgress)}%</p>
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

  @keyframes progress {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(400%);
    }
  }
</style>
