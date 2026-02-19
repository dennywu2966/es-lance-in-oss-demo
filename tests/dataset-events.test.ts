import {
  ACTIVE_DATASET_CHANGED_EVENT,
  DATASET_CATALOG_CHANGED_EVENT,
  dispatchActiveDatasetChanged,
  dispatchDatasetCatalogChanged,
} from "@/lib/dataset-events";

describe("dataset events", () => {
  it("dispatches dataset catalog changed custom event with detail", () => {
    const listener = jest.fn();
    window.addEventListener(DATASET_CATALOG_CHANGED_EVENT, listener);

    dispatchDatasetCatalogChanged({
      reason: "generated",
      datasetName: "vectors-30-dims-128-shards-3-es-routing-test",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      reason: "generated",
      datasetName: "vectors-30-dims-128-shards-3-es-routing-test",
    });

    window.removeEventListener(DATASET_CATALOG_CHANGED_EVENT, listener);
  });

  it("dispatches active dataset changed custom event with selected dataset detail", () => {
    const listener = jest.fn();
    window.addEventListener(ACTIVE_DATASET_CHANGED_EVENT, listener);

    dispatchActiveDatasetChanged({
      datasetName: "vectors-30-dims-768-shards-3-es-routing-123",
      source: "vector-management",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      datasetName: "vectors-30-dims-768-shards-3-es-routing-123",
      source: "vector-management",
    });

    window.removeEventListener(ACTIVE_DATASET_CHANGED_EVENT, listener);
  });
});
