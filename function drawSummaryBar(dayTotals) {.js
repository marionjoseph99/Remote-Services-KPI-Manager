function drawSummaryBar(dayTotals) {
  const canvas = document.getElementById('summaryBar');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const days = Object.keys(dayTotals || {}).sort(); // YYYY-MM-DD
  const labels = days;                              // use dates as labels
  const values = days.map(d => Number(dayTotals[d] || 0));
  const data = values.slice();
  const maxVal = Math.max(1, ...values);

  // widen hit area so hover works even when many days make bars very thin
  const barThickness = Math.max(8, Math.floor((canvas.clientWidth || 320) / Math.max(1, days.length) * 0.6));

  try {
    if (summaryChart) summaryChart.destroy();
    summaryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          // Visible dataset
          {
            label: 'Tasks per day',
            data,
            backgroundColor: 'rgba(167,139,250,0.35)',
            borderColor: 'rgba(167,139,250,0.9)',
            borderWidth: 1,
            // cap radius for tiny bars so they still render cleanly
            borderRadius: (ctx) => Math.min(6, Math.max(0, (ctx?.parsed?.y ?? 0) * 0.4)),
            grouped: false,                 // overlay, not side-by-side
            barThickness,
            maxBarThickness: barThickness,
            dates: days
          },
          // Invisible overlay to catch hover across the full day slot
          {
            label: 'hover-overlay',
            data: Array(days.length).fill(maxVal),
            backgroundColor: 'rgba(0,0,0,0.001)', // practically invisible but hoverable
            borderWidth: 0,
            grouped: false,                 // overlay, not grouped
            barThickness,
            maxBarThickness: barThickness,
            order: -1                       // draw behind
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', axis: 'x', intersect: false },
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            displayColors: false,
            // show tooltip only for the visible dataset (index 0)
            filter: (item) => item.datasetIndex === 0,
            callbacks: {
              title: (items) => items?.[0]?.label || '',
              label: (it) => `Tasks: ${it?.parsed?.y ?? 0}`
            }
          }
        },
        layout: { padding: 0 },
        scales: {
          x: {
            ticks: { display: false },
            title: { display: false },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y: {
            beginAtZero: true,
            title: { display: false },
            ticks: { color: '#c7c9d3' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  } catch (err) {
    console.warn('Summary bar render skipped:', err);
  }
}