<script>
  import { onMount, tick } from "svelte";
  import Chart from "chart.js/auto";

  const BurnedAddress = "tz1burnburnburnburnburnburnburjAYjjX";
  const ExcludedAddress = "tz1XBEMJfYoMoMMZafjYv3Q5V9u3QKv1xuBR";
  const AkaDropAddress = "KT1GyHsoewbUGk4wpAVZFUYpP2VjZPqo1qBf";
  const ContractAddress = "KT1PTS3pPk4FeneMmcJ3HZVe39wra1bomsaW";

  let loading = true;
  let tokens = [];
  let debugStats = {
    totalTokensFetched: 0,
    validTokens: 0,
    akaDropTokens: 0,
    burnedTokens: 0,
    processedTokens: 0,
  };
  let locations = ["All Locations"];
  let selectedLocation = "All Locations";
  let tokenCollectionRates = [];
  let filteredTokens = [];
  let totalTokenCount = 0;
  let displayedTokenCount = 0;
  let chart;
  let canvasElement;
  let loadingProgress = 0;
  let chartContainer;
  let chart2;
  let canvas2Element;
  let durationStats = [];
  let chart3;
  let canvas3Element;
  let timeGranularity = "day"; // 'day', 'halfday', 'hour'
  let chart4;
  let canvas4Element;

  // Update the state variables initialization
  let selectedSequenceLength = 2; // Change from 0 to 2 as minimum sequence length
  let availableSequenceLengths = [2]; // Initialize with minimum sequence length
  let sequenceStats = {
    totalSequences: 0,
    uniqueSequences: 0,
    maxLength: 0,
    uniqueCollectors: 0, // Add this
  };

  // Add new state variables for sequence visualization
  let selectedSequence = null;
  let sequenceDetails = null;
  let showSequenceDetails = false;

  // Add new state variable
  let showAllSequences = false;

  let chart5;
  let canvas5Element;

  // Add new state variables for set visualization
  let selectedSet = null;
  let showSetDetails = false;

  // Add rate limiting utility
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchWithRetry(url, maxRetries = 3, delayMs = 1000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(url);
        if (response.status === 429) {
          // Rate limit hit
          console.log(
            `Rate limit hit, waiting ${delayMs}ms before retry ${i + 1}/${maxRetries}`
          );
          await sleep(delayMs);
          continue;
        }
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        console.log(`Attempt ${i + 1} failed, retrying...`);
        await sleep(delayMs);
      }
    }
  }

  async function calculateTokenCollectionRate(token) {
    try {
      console.log(`Processing token ${token.tokenId}:`, {
        name: token.metadata?.name,
        location: token.metadata?.event_location,
        symbol: token.metadata?.symbol,
      });

      // Use the new fetchWithRetry function for all API calls
      const balances = await fetchWithRetry(
        `https://api.tzkt.io/v1/tokens/balances?token.contract=${ContractAddress}&token.tokenId=${token.tokenId}`
      );

      const transfers = await fetchWithRetry(
        `https://api.tzkt.io/v1/tokens/transfers?token.contract=${ContractAddress}&token.tokenId=${token.tokenId}&to=${AkaDropAddress}`
      );

      const allTransfers = await fetchWithRetry(
        `https://api.tzkt.io/v1/tokens/transfers?token.contract=${ContractAddress}&token.tokenId=${token.tokenId}&sort.desc=timestamp`
      );

      // Calculate original drop amount from transfers
      const originalDropAmount = transfers.reduce(
        (sum, t) => sum + Number(t.amount),
        0
      );

      // Filter out burned address from balances first
      const activeBalances = balances.filter(
        (b) => b.account.address !== BurnedAddress
      );

      const totalSupply = activeBalances.reduce(
        (sum, b) => sum + Number(b.balance),
        0
      );
      const currentAkaDropAmount = Number(
        activeBalances.find((b) => b.account.address === AkaDropAddress)
          ?.balance || 0
      );

      console.log(`Token ${token.tokenId} balances:`, {
        totalSupply,
        currentAkaDropAmount,
        holdersCount: activeBalances.length,
      });

      if (totalSupply === 0) {
        debugStats.burnedTokens++;
        console.log(`Token ${token.tokenId} has no active supply`);
        return null;
      }

      if (currentAkaDropAmount > 0) {
        debugStats.akaDropTokens++;
        console.log(
          `Token ${token.tokenId} has ${currentAkaDropAmount} in AkaDrop`
        );
      }

      const collectors = new Set(
        activeBalances
          .filter(
            (b) =>
              Number(b.balance) > 0 &&
              ![ExcludedAddress, AkaDropAddress].includes(b.account.address)
          )
          .map((b) => b.account.address)
      );

      const location = token.metadata?.event_location?.trim();
      // Skip tokens without location
      if (!location) {
        return null;
      }

      // Filter valid transfers (not to/from AkaDrop or burned address)
      const validTransfers = allTransfers.filter(
        (t) =>
          ![AkaDropAddress, BurnedAddress, ExcludedAddress].includes(
            t.to.address
          )
      );

      let durationMins = 0;
      if (validTransfers.length >= 2) {
        const firstTransfer = validTransfers[validTransfers.length - 1];
        const lastTransfer = validTransfers[0];
        durationMins = Math.round(
          (new Date(lastTransfer.timestamp) -
            new Date(firstTransfer.timestamp)) /
            (1000 * 60)
        );
      }

      return {
        tokenId: token.tokenId,
        name: token.metadata?.name || `Token ${token.tokenId}`,
        totalSupply: Number(totalSupply),
        activeSupply: Number(totalSupply),
        collectors: collectors.size,
        location: location,
        originalDropAmount,
        currentAkaDropAmount,
        claimedDropAmount: originalDropAmount - currentAkaDropAmount,
        durationMins,
        transferCount: validTransfers.length,
        transfers: validTransfers,
      };
    } catch (error) {
      console.error(`Error processing token ${token.tokenId}:`, error);
      return null;
    }
  }

  onMount(async () => {
    try {
      loadingProgress = 10;
      console.log("Fetching tokens from contract...");

      // Use fetchWithRetry for initial token fetch
      const allTokens = await fetchWithRetry(
        `https://api.tzkt.io/v1/tokens?contract=${ContractAddress}`
      );

      debugStats.totalTokensFetched = allTokens.length;

      console.log("Total tokens fetched:", debugStats.totalTokensFetched);
      console.log("Sample token metadata:", allTokens[0]?.metadata);

      tokens = allTokens.filter((token) => {
        const isValid =
          token.metadata?.symbol === "Kairos NFTs" &&
          token.metadata?.event_location?.trim();
        if (!isValid) {
          console.log(`Filtered out token ${token.tokenId}:`, {
            symbol: token.metadata?.symbol,
            name: token.metadata?.name,
            location: token.metadata?.event_location,
          });
        }
        return isValid;
      });

      debugStats.validTokens = tokens.length;
      console.log("Valid Kairos NFTs tokens:", debugStats.validTokens);

      totalTokenCount = tokens.length;
      loadingProgress = 30;

      // Modify the batch processing to include delays between batches
      const batchSize = 5; // Reduce batch size
      const batchDelay = 1000; // 1 second delay between batches
      const results = [];

      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map((token) => calculateTokenCollectionRate(token))
        );
        results.push(...batchResults.filter((r) => r !== null));
        loadingProgress = 30 + (70 * (i + batchSize)) / tokens.length;

        // Add delay between batches
        if (i + batchSize < tokens.length) {
          await sleep(batchDelay);
        }
      }

      tokenCollectionRates = results;

      console.log("Processing results:", {
        totalFetched: debugStats.totalTokensFetched,
        validTokens: debugStats.validTokens,
        processedTokens: tokenCollectionRates.length,
        burnedTokens: debugStats.burnedTokens,
        akaDropTokens: debugStats.akaDropTokens,
        uniqueLocations: new Set(tokenCollectionRates.map((t) => t.location))
          .size,
      });

      // Group by location and count tokens
      const locationCounts = {};
      tokenCollectionRates.forEach((t) => {
        locationCounts[t.location] = (locationCounts[t.location] || 0) + 1;
      });

      // Include locations with at least 1 token
      const validLocations = Object.entries(locationCounts)
        .filter(([_, count]) => count >= 1)
        .map(([location]) => location)
        .sort();

      locations = ["All Locations", ...validLocations];

      updateFilteredTokens();
      loadingProgress = 100;
      loading = false;
      await tick();
      createChart();
      createDurationChart();
      createTimeSeriesChart();
      createSequenceChart();
      createCollectorSetChart();
    } catch (error) {
      console.error("Error loading data:", error);
      loading = false;
    }
  });

  function updateFilteredTokens() {
    filteredTokens =
      selectedLocation === "All Locations"
        ? [...tokenCollectionRates]
        : tokenCollectionRates.filter((t) => t.location === selectedLocation);

    filteredTokens.sort((a, b) => b.collectionRate - a.collectionRate);
  }

  function createChart() {
    if (!canvasElement) return;
    if (chart) chart.destroy();

    const ctx = canvasElement.getContext("2d");
    chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: filteredTokens.map((t) => t.name),
        datasets: [
          {
            label: "Collection Rate (%)",
            data: filteredTokens.map((t) =>
              ((t.collectors / t.originalDropAmount) * 100).toFixed(2)
            ),
            backgroundColor: filteredTokens.map(
              () => "rgba(75, 192, 192, 0.6)"
            ),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: [
              `Token Collection Rates - ${selectedLocation}`,
              `Showing ${filteredTokens.length} of ${totalTokenCount} tokens`,
            ],
            padding: 20,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const token = filteredTokens[context.dataIndex];
                const percentage = (
                  (token.collectors / token.originalDropAmount) *
                  100
                ).toFixed(2);
                return [
                  `Collection Rate: ${percentage}%`,
                  `Collectors: ${token.collectors}`,
                  `Active Supply: ${token.activeSupply}`,
                  `Original Drop Amount: ${token.originalDropAmount}`,
                  `Total Mint Amount: ${token.totalSupply}`,
                ];
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Collection Rate (% of Original Drop)",
            },
          },
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
        },
      },
    });
  }

  function createDurationChart() {
    if (!canvas2Element) return;
    if (chart2) chart2.destroy();

    // Group tokens by location
    const locationGroups = {};

    // First pass: Initialize location data
    filteredTokens.forEach((token) => {
      if (!locationGroups[token.location]) {
        locationGroups[token.location] = {
          maxTokens: token.originalDropAmount,
          holders: new Map(), // Map address -> number of tokens held
          durations: new Map(), // Map tokenCount -> array of durations
        };
      }

      // Process transfers for this token
      const transfers = token.transfers || [];
      const claimTransfers = transfers.filter(
        (t) =>
          t.from.address === AkaDropAddress &&
          ![BurnedAddress, ExcludedAddress].includes(t.to.address)
      );

      // Calculate duration for each holder
      claimTransfers.forEach((transfer) => {
        const holder = transfer.to.address;
        const currentCount =
          locationGroups[token.location].holders.get(holder) || 0;
        const newCount = currentCount + 1;
        locationGroups[token.location].holders.set(holder, newCount);

        if (token.durationMins > 0) {
          if (!locationGroups[token.location].durations.has(newCount)) {
            locationGroups[token.location].durations.set(newCount, []);
          }
          locationGroups[token.location].durations
            .get(newCount)
            .push(token.durationMins);
        }
      });
    });

    // Calculate average durations for each token count
    const locationData = Object.entries(locationGroups).map(
      ([location, data]) => {
        const points = Array.from(data.durations.entries())
          .map(([tokenCount, durations]) => ({
            x: parseInt(tokenCount),
            y: durations.reduce((sum, d) => sum + d, 0) / durations.length,
          }))
          .sort((a, b) => a.x - b.x);

        return {
          location,
          points,
          maxTokens: data.maxTokens,
        };
      }
    );

    const ctx = canvas2Element.getContext("2d");
    chart2 = new Chart(ctx, {
      type: "line",
      data: {
        datasets: locationData.map((loc, index) => ({
          label: `${loc.location} (total ${loc.maxTokens} tokens)`,
          data: loc.points,
          borderColor: `hsl(${index * (360 / locationData.length)}, 70%, 50%)`,
          fill: false,
          tension: 0.4,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: "Time to Collect X Tokens by Location",
            padding: 20,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const dataset = context.dataset;
                const point = context.raw;
                return [
                  `${dataset.label}`,
                  `${point.x} tokens: ${Math.round(point.y)} minutes`,
                  `(from first to last collection)`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            title: {
              display: true,
              text: "Number of Tokens Collected per Person",
            },
            ticks: {
              stepSize: 1,
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Average Collection Time (minutes)",
            },
          },
        },
      },
    });
  }

  function getTimeKeyFromDate(date, granularity) {
    switch (granularity) {
      case "hour":
        return new Date(date).toISOString().slice(0, 13); // YYYY-MM-DDTHH
      case "halfday":
        const hours = new Date(date).getHours();
        const period = hours < 12 ? "AM" : "PM";
        return `${new Date(date).toISOString().slice(0, 10)}-${period}`; // YYYY-MM-DD-AM/PM
      default: // day
        return new Date(date).toISOString().slice(0, 10); // YYYY-MM-DD
    }
  }

  function processTimeSeriesData(tokens, granularity) {
    const timeData = new Map();

    tokens.forEach((token) => {
      if (!token.transfers) return;

      const claimTransfers = token.transfers.filter(
        (t) =>
          t.from.address === AkaDropAddress &&
          ![BurnedAddress, ExcludedAddress].includes(t.to.address)
      );

      claimTransfers.forEach((transfer) => {
        const timeKey = getTimeKeyFromDate(transfer.timestamp, granularity);

        if (!timeData.has(timeKey)) {
          timeData.set(timeKey, {
            timestamp: new Date(transfer.timestamp).getTime(),
            claims: 0,
            locations: {},
          });
        }

        const data = timeData.get(timeKey);
        data.claims++;
        data.locations[token.location] =
          (data.locations[token.location] || 0) + 1;
      });
    });

    return Array.from(timeData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        time: key,
        ...data,
      }));
  }

  function createTimeSeriesChart() {
    if (!canvas3Element) return;
    if (chart3) chart3.destroy();

    const timeSeriesData = processTimeSeriesData(
      filteredTokens,
      timeGranularity
    );
    const locations = [...new Set(filteredTokens.map((t) => t.location))];

    const datasets = locations.map((location, index) => ({
      label: location,
      data: timeSeriesData.map((point) => ({
        x: point.time,
        y: point.locations[location] || 0,
      })),
      borderColor: `hsl(${index * (360 / locations.length)}, 70%, 50%)`,
      fill: false,
    }));

    const ctx = canvas3Element.getContext("2d");
    chart3 = new Chart(ctx, {
      type: "line",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `Claims Over Time (${timeGranularity})`,
            padding: 20,
          },
        },
        scales: {
          x: {
            type: "category",
            title: {
              display: true,
              text: "Time",
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Number of Claims",
            },
          },
        },
      },
    });
  }

  function processCollectionPatterns(tokens) {
    const locationTokens =
      selectedLocation === "All Locations"
        ? tokens
        : tokens.filter((t) => t.location === selectedLocation);

    // Create timeline of all claims
    const allClaims = [];
    const collectorTokens = new Map();

    // Process tokens in consistent order
    locationTokens
      .sort((a, b) => a.tokenId.localeCompare(b.tokenId))
      .forEach((token) => {
        if (!token.transfers) return;

        const claims = token.transfers
          .filter(
            (t) =>
              t.from.address === AkaDropAddress &&
              ![BurnedAddress, ExcludedAddress].includes(t.to.address) &&
              Number(t.amount) > 0
          )
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          .map((transfer) => ({
            tokenId: token.tokenId,
            tokenName: token.name,
            timestamp: new Date(transfer.timestamp).getTime(),
            collector: transfer.to.address,
            location: token.location,
            formattedTime: new Date(transfer.timestamp).toLocaleTimeString(),
            formattedDate: new Date(transfer.timestamp).toLocaleDateString(),
          }));

        allClaims.push(...claims);

        claims.forEach((claim) => {
          if (!collectorTokens.has(claim.collector)) {
            collectorTokens.set(claim.collector, new Set());
          }
          collectorTokens.get(claim.collector).add(claim.tokenId);
        });
      });

    // Sort all claims by timestamp and then by tokenId for consistency
    allClaims.sort((a, b) => {
      const timeDiff = a.timestamp - b.timestamp;
      return timeDiff === 0 ? a.tokenId.localeCompare(b.tokenId) : timeDiff;
    });

    // Sort claims by timestamp for each collector
    const collectorSequences = new Map();

    allClaims.sort((a, b) => a.timestamp - b.timestamp);

    allClaims.forEach((claim) => {
      if (!collectorSequences.has(claim.collector)) {
        collectorSequences.set(claim.collector, []);
      }
      const claims = collectorSequences.get(claim.collector);
      const lastClaim = claims[claims.length - 1];

      claim.timeSinceLast = lastClaim
        ? (claim.timestamp - lastClaim.timestamp) / 1000
        : 0;

      claims.push(claim);
    });

    // Process sequences with length validation
    const sequences = new Map();
    let maxLength = 0;

    collectorSequences.forEach((claims, collector) => {
      maxLength = Math.max(maxLength, claims.length);

      // Process all possible sequence lengths from 2 up to the claims length
      for (let len = 2; len <= claims.length; len++) {
        const sequence = claims.slice(0, len).map((c, i) => ({
          token: c.tokenId,
          name: c.tokenName,
          timeGap: c.timeSinceLast,
          timestamp: c.timestamp,
          formattedTime: c.formattedTime,
          formattedDate: c.formattedDate,
        }));

        const key = len;
        if (!sequences.has(key)) {
          sequences.set(key, new Map());
        }

        const sequenceKey = JSON.stringify(sequence.map((s) => s.token));
        const sequenceData = sequences.get(key).get(sequenceKey) || {
          sequence,
          collectors: new Set(),
        };
        sequenceData.collectors.add(collector);
        sequences.get(key).set(sequenceKey, sequenceData);
      }
    });

    // Update available sequence lengths
    availableSequenceLengths = Array.from(sequences.keys()).sort(
      (a, b) => a - b
    );

    // If current selection is invalid, select the shortest sequence length
    if (!availableSequenceLengths.includes(selectedSequenceLength)) {
      selectedSequenceLength = availableSequenceLengths[0] || 2;
    }

    // Update stats with correct counts
    sequenceStats = {
      totalSequences: allClaims.length,
      uniqueSequences: sequences.get(selectedSequenceLength)?.size || 0,
      maxLength,
      uniqueCollectors: collectorSequences.size,
      finalSets: collectorTokens.size,
    };

    return { sequences, collectorTokens };
  }

  function createSequenceChart() {
    if (!canvas4Element) return;
    if (chart4) chart4.destroy();

    const { sequences } = processCollectionPatterns(filteredTokens);
    const currentSequences = sequences.get(selectedSequenceLength);
    if (!currentSequences) return;

    // Process sequences for visualization
    const sortedSequences = Array.from(currentSequences.entries())
      .map(([sequenceKey, { sequence, collectors }]) => ({
        sequence,
        count: collectors.size,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, showAllSequences ? undefined : 20);

    const ctx = canvas4Element.getContext("2d");
    chart4 = new Chart(ctx, {
      type: "bar",
      data: {
        labels: sortedSequences.map(({ sequence }) =>
          sequence.map((s) => s.token).join(" → ")
        ),
        datasets: [
          {
            label: `${selectedSequenceLength}-Token Sequences`,
            data: sortedSequences.map((s) => s.count),
            backgroundColor: sortedSequences.map(
              (_, i) => `hsl(${(i * 360) / sortedSequences.length}, 70%, 60%)`
            ),
            borderColor: "rgba(75, 192, 192, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            selectedSequence = sortedSequences[idx].sequence;
            showSequenceDetails = true;
          }
        },
        plugins: {
          title: {
            display: true,
            text: [
              `Top ${showAllSequences ? "All" : "20"} Collection Sequences (Length: ${selectedSequenceLength})`,
              `${sequenceStats.uniqueSequences} unique patterns by ${sequenceStats.uniqueCollectors} collectors`,
              "Click bar to view sequence details",
            ],
            padding: 20,
          },
          tooltip: {
            callbacks: {
              title: (context) => {
                return `Collection Sequence #${context[0].dataIndex + 1}`;
              },
              label: (context) => {
                const { sequence } = sortedSequences[context.dataIndex];
                const count = context.raw;
                const percentage = (
                  (count / sequenceStats.uniqueCollectors) *
                  100
                ).toFixed(1);
                const totalTime =
                  sequence.reduce((sum, s) => sum + (s.timeGap || 0), 0) / 60;

                return [
                  `${count} collectors (${percentage}% of total)`,
                  `Total collection time: ${totalTime.toFixed(1)} minutes`,
                  "",
                  "Sequence pattern:",
                  ...sequence.map((s, i) =>
                    i === 0
                      ? `Start: ${s.token} (${s.formattedTime})`
                      : `  +${(s.timeGap / 60).toFixed(1)}min: ${s.token}`
                  ),
                ];
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Number of Collectors",
            },
            ticks: {
              stepSize: 1,
              precision: 0,
            },
          },
          y: {
            ticks: {
              font: { size: 11 },
            },
          },
        },
      },
    });
  }

  function getTokenUrl(tokenId) {
    return `https://kairos-mint.art/claimsToken/${ContractAddress}/${tokenId}`;
  }

  function processCollectorSets(tokens) {
    const { collectorTokens } = processCollectionPatterns(tokens);

    // Convert sets to patterns with deterministic ordering
    const setPatterns = new Map();

    // Process collectors in a consistent order
    Array.from(collectorTokens.keys())
      .sort()
      .forEach((collector) => {
        const tokenSet = collectorTokens.get(collector);
        const setKey = Array.from(tokenSet)
          .sort((a, b) => a.localeCompare(b))
          .join(",");

        if (!setPatterns.has(setKey)) {
          setPatterns.set(setKey, {
            tokens: Array.from(tokenSet).sort((a, b) => a.localeCompare(b)),
            collectors: new Set([collector]),
            count: 1,
          });
        } else {
          const pattern = setPatterns.get(setKey);
          pattern.collectors.add(collector);
          pattern.count++;
        }
      });

    // Sort patterns consistently
    return Array.from(setPatterns.values()).sort((a, b) => {
      // First by token count (descending)
      const countDiff = b.tokens.length - a.tokens.length;
      if (countDiff !== 0) return countDiff;

      // Then by collector count (descending)
      const collectorDiff = b.count - a.count;
      if (collectorDiff !== 0) return collectorDiff;

      // Finally by token IDs (ascending)
      return a.tokens[0].localeCompare(b.tokens[0]);
    });
  }

  function createCollectorSetChart() {
    if (!canvas5Element) return;
    if (chart5) chart5.destroy();

    const setPatterns = processCollectorSets(filteredTokens);

    // Group patterns by token count
    const groupedPatterns = setPatterns.reduce((acc, pattern) => {
      const size = pattern.tokens.length;
      if (!acc[size]) acc[size] = [];
      acc[size].push(pattern);
      return acc;
    }, {});

    // Prepare data for horizontal bar chart
    const labels = [];
    const counts = [];
    const bgColors = [];
    const hoverLabels = [];

    Object.entries(groupedPatterns).forEach(([size, patterns], groupIndex) => {
      patterns.forEach((pattern, idx) => {
        labels.push(`${size} tokens: ${pattern.tokens.join(", ")}`);
        counts.push(pattern.count);
        bgColors.push(
          `hsl(${(groupIndex * 360) / Object.keys(groupedPatterns).length}, 70%, 60%)`
        );
        hoverLabels.push({
          size,
          tokens: pattern.tokens,
          collectors: pattern.count,
        });
      });
    });

    const ctx = canvas5Element.getContext("2d");
    chart5 = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Number of Collectors",
            data: counts,
            backgroundColor: bgColors,
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements) => {
          if (elements.length > 0) {
            const idx = elements[0].index;
            selectedSet = {
              tokens: hoverLabels[idx].tokens,
              collectors: hoverLabels[idx].collectors,
              size: hoverLabels[idx].size,
            };
            showSetDetails = true;
          }
        },
        plugins: {
          title: {
            display: true,
            text: [
              "Token Collection Sets",
              `${setPatterns.length} unique patterns found`,
              "Sorted by set size and popularity",
            ],
            padding: 20,
          },
          tooltip: {
            callbacks: {
              title: (context) => {
                const pattern = hoverLabels[context[0].dataIndex];
                return `Set with ${pattern.size} tokens`;
              },
              label: (context) => {
                const pattern = hoverLabels[context.dataIndex];
                return [
                  `${pattern.collectors} collectors`,
                  "",
                  "Tokens in set:",
                  ...pattern.tokens.map((token) => `Token ${token}`),
                ];
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Number of Collectors",
              font: { weight: "bold" },
            },
            ticks: {
              stepSize: 1,
              precision: 0,
            },
          },
          y: {
            ticks: {
              callback: function (val) {
                const label = this.getLabelForValue(val);
                // Only show token count in axis label
                return label.split(":")[0];
              },
              font: { size: 11 },
            },
          },
        },
      },
    });
  }

  $: if (
    !loading &&
    (selectedLocation ||
      timeGranularity ||
      selectedSequenceLength ||
      showAllSequences)
  ) {
    updateFilteredTokens();
    createChart();
    createDurationChart();
    createTimeSeriesChart();
    createSequenceChart();
    createCollectorSetChart();
  }
</script>

<div class="dashboard-container">
  {#if loading}
    <div class="loading">
      <div class="progress-bar">
        <div class="progress-bar-inner" style="width: {loadingProgress}%"></div>
      </div>
      <p>Loading data... {Math.round(loadingProgress)}%</p>
    </div>
  {:else}
    <div class="chart-section" bind:this={chartContainer}>
      <div class="controls">
        <div class="stats">
          <span>Total Fetched: {debugStats.totalTokensFetched}</span>
          <span>Valid Tokens: {debugStats.validTokens}</span>
          <span>Processed: {tokenCollectionRates.length}</span>
          <span>In AkaDrop: {debugStats.akaDropTokens}</span>
          <span>Burned: {debugStats.burnedTokens}</span>
        </div>
        <select bind:value={selectedLocation}>
          {#each locations as location}
            <option value={location}
              >{location} ({tokenCollectionRates.filter(
                (t) => t.location === location
              ).length})</option
            >
          {/each}
        </select>
      </div>
      <h2>
        Token Collection Rates {selectedLocation !== "All Locations"
          ? `- ${selectedLocation}`
          : ""}
      </h2>
      <div class="canvas-container">
        <canvas bind:this={canvasElement}></canvas>
      </div>
    </div>
    <div class="chart-section">
      <h2>Collection Duration Analysis</h2>
      <div class="canvas-container">
        <canvas bind:this={canvas2Element}></canvas>
      </div>
    </div>
    <div class="chart-section">
      <h2>Claims Over Time</h2>
      <div class="controls">
        <select bind:value={timeGranularity}>
          <option value="day">Daily</option>
          <option value="halfday">Half-Day</option>
          <option value="hour">Hourly</option>
        </select>
      </div>
      <div class="canvas-container">
        <canvas bind:this={canvas3Element}></canvas>
      </div>
    </div>
    <div class="chart-section">
      <h2>Token Collection Sequences</h2>
      <h4>*Click bar to show sequence details*</h4>
      <div class="controls">
        <div class="sequence-controls">
          <label>
            Sequence Length:
            <select bind:value={selectedSequenceLength}>
              {#each availableSequenceLengths as length}
                <option value={length}>{length} tokens</option>
              {/each}
            </select>
          </label>
          <label class="show-all">
            <input type="checkbox" bind:checked={showAllSequences} />
            Show all sequences
          </label>
          <span class="sequence-stats">
            {sequenceStats.uniqueCollectors} collectors,
            {sequenceStats.uniqueSequences} unique patterns
          </span>
        </div>
      </div>
      <div class="canvas-container">
        <canvas bind:this={canvas4Element}></canvas>
      </div>
      {#if showSequenceDetails && selectedSequence}
        <div class="sequence-details">
          <h3>Sequence Details</h3>
          <div class="timeline">
            {#each selectedSequence as step, i}
              <div class="step">
                <div class="token">
                  <div class="token-id">
                    ID: <a
                      href={getTokenUrl(step.token)}
                      target="_blank"
                      class="token-link">{step.token}</a
                    >
                  </div>
                  <div class="token-name">{step.name}</div>
                </div>
                <div class="time">
                  {#if i === 0}
                    <div class="datetime">
                      <span class="date">{step.formattedDate}</span>
                      <span class="time">{step.formattedTime}</span>
                    </div>
                  {:else}
                    <div class="datetime">
                      <span class="date">{step.formattedDate}</span>
                      <span class="time"
                        >+{(step.timeGap / 60).toFixed(1)} min</span
                      >
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    <div class="chart-section">
      <h2>Collection Set Analysis</h2>
      <h4>*Shows all unique token combinations and their collector counts*</h4>
      <h5>*Click bar to show set details*</h5>
      <div class="set-controls">
        <div class="set-summary">
          Total unique patterns: {processCollectorSets(filteredTokens).length}
        </div>
      </div>
      <div class="canvas-container canvas-container-large">
        <canvas bind:this={canvas5Element}></canvas>
      </div>
      {#if showSetDetails && selectedSet}
        <div class="set-details">
          <h3>Set Details</h3>
          <div class="set-summary-stats">
            <span>Total Tokens: {selectedSet.size}</span>
            <span>Total Collectors: {selectedSet.collectors}</span>
          </div>
          <div class="token-grid">
            {#each selectedSet.tokens as tokenId}
              <div class="token-card">
                <div class="token-id">
                  ID: <a
                    href={getTokenUrl(tokenId)}
                    target="_blank"
                    class="token-link">{tokenId}</a
                  >
                </div>
                {#if filteredTokens.find((t) => t.tokenId === tokenId)}
                  <div class="token-name">
                    {filteredTokens.find((t) => t.tokenId === tokenId).name}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .dashboard-container {
    padding: 2rem;
  }
  .chart-section {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 2rem;
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
  .canvas-container {
    width: 100%;
    height: 400px;
    position: relative;
  }
  canvas {
    max-width: 100%;
  }
  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.9rem;
    color: #666;
  }
  select {
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid #ddd;
    background-color: white;
    font-size: 1rem;
  }
  .sequence-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .sequence-stats {
    font-size: 0.9rem;
    color: #666;
  }

  .sequence-details {
    margin-top: 1rem;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .timeline {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.5rem;
    overflow-x: auto;
    padding: 0.5rem;
  }

  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .token {
    padding: 0.5rem;
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .time {
    font-size: 0.8rem;
    color: #666;
  }

  .datetime {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }

  .date {
    font-size: 0.75rem;
    color: #666;
  }

  .time {
    font-size: 0.8rem;
    color: #444;
    font-weight: 500;
  }

  .show-all {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #666;
  }

  .show-all input[type="checkbox"] {
    margin: 0;
  }

  .token {
    padding: 0.5rem;
    background: white;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    text-align: center;
  }

  .token-id {
    font-weight: bold;
    color: #0066cc;
    margin-bottom: 0.2rem;
  }

  .token-name {
    font-size: 0.85rem;
    color: #666;
    word-break: break-word;
    max-width: 150px;
  }

  .token-link {
    color: #0066cc;
    text-decoration: none;
    cursor: pointer;
  }

  .token-link:hover {
    text-decoration: underline;
  }

  .canvas-container-large {
    height: 800px; /* Increased height for better visibility */
  }

  .set-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .set-summary {
    font-size: 0.9rem;
    color: #666;
  }

  .set-details {
    margin-top: 1rem;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .set-summary-stats {
    display: flex;
    gap: 2rem;
    margin: 1rem 0;
    font-size: 1.1rem;
    color: #444;
  }

  .token-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .token-card {
    background: white;
    padding: 1rem;
    border-radius: 4px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
</style>
