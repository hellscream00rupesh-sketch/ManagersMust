const storeColors = ["#2f807d", "#cf6f5c", "#7a9eb8", "#bb7a3e", "#7da889", "#9467a3", "#c75a83", "#6675b5"];

export function buildInventoryCardData(item, stores, selectedStores) {
  const colorsByStore = new Map(stores.map((store, index) => [
    String(store.id),
    storeColors[index] || `hsl(${(index * 137.508) % 360}, 48%, 46%)`
  ]));
  const entries = selectedStores.map((store) => ({
    store,
    count: Number(item.countsByStore?.[String(store.id)] ?? 0),
    preferred: Number(item.preferredByStore?.[String(store.id)] ?? 0),
    color: colorsByStore.get(String(store.id))
  }));
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const preferredTotal = entries.reduce((sum, entry) => sum + entry.preferred, 0);
  const canChart = entries.every((entry) => Number.isFinite(entry.count) && entry.count >= 0);
  let cumulativePercent = 0;
  const slices = entries.filter((entry) => entry.count > 0).map((entry) => {
    const start = cumulativePercent;
    cumulativePercent += (entry.count / total) * 100;
    return `${entry.color} ${start}% ${cumulativePercent}%`;
  });

  return {
    entries: entries.map((entry) => ({
      ...entry,
      percent: canChart && total > 0 ? (entry.count / total) * 100 : 0
    })),
    total,
    preferredTotal,
    canChart,
    background: canChart && total > 0 ? `conic-gradient(${slices.join(", ")})` : null
  };
}
