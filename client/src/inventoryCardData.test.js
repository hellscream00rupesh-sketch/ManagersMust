import test from "node:test";
import assert from "node:assert/strict";
import { buildInventoryCardData } from "./inventoryCardData.js";

const stores = [
  { id: 1, name: "West", officeNumber: "101" },
  { id: 2, name: "East", officeNumber: "102" },
  { id: 3, name: "North", officeNumber: "103" }
];
const item = {
  countsByStore: { 1: 3, 2: 1, 3: 0 },
  preferredByStore: { 1: 5, 2: 2, 3: 2 }
};

test("pie slices reflect store quantities and retain zero-stock stores in the legend", () => {
  const data = buildInventoryCardData(item, stores, stores);
  assert.equal(data.total, 4);
  assert.equal(data.preferredTotal, 9);
  assert.deepEqual(data.entries.map(({ count, percent }) => ({ count, percent })), [
    { count: 3, percent: 75 }, { count: 1, percent: 25 }, { count: 0, percent: 0 }
  ]);
  assert.equal(data.background, "conic-gradient(#2f807d 0% 75%, #cf6f5c 75% 100%)");
});

test("store selection updates totals and pie slices without changing store colors", () => {
  const all = buildInventoryCardData(item, stores, stores);
  const selected = buildInventoryCardData(item, stores, [stores[1]]);
  assert.equal(selected.total, 1);
  assert.equal(selected.preferredTotal, 2);
  assert.equal(selected.entries[0].percent, 100);
  assert.equal(selected.entries[0].color, all.entries[1].color);
  assert.equal(selected.background, "conic-gradient(#cf6f5c 0% 100%)");
});

test("zero and missing quantities render an empty chart, not an invalid gradient", () => {
  const data = buildInventoryCardData({ countsByStore: { 1: 0 } }, stores, stores);
  assert.equal(data.total, 0);
  assert.equal(data.preferredTotal, 0);
  assert.equal(data.canChart, true);
  assert.equal(data.background, null);
  assert.ok(data.entries.every((entry) => entry.percent === 0));
});

test("negative quantities remain visible but are not misrepresented as pie slices", () => {
  const data = buildInventoryCardData({ countsByStore: { 1: -1, 2: 3 } }, stores, stores);
  assert.equal(data.total, 2);
  assert.equal(data.entries[0].count, -1);
  assert.equal(data.canChart, false);
  assert.equal(data.background, null);
});

test("numeric strings and additional stores have valid quantities and colors", () => {
  const manyStores = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));
  const data = buildInventoryCardData({
    countsByStore: { 9: "2" },
    preferredByStore: { 9: "4" }
  }, manyStores, [manyStores[8]]);
  assert.equal(data.total, 2);
  assert.equal(data.preferredTotal, 4);
  assert.match(data.entries[0].color, /^hsl\(/);
  assert.equal(data.entries[0].percent, 100);
});
