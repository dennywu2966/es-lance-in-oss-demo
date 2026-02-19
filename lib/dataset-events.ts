export const DATASET_CATALOG_CHANGED_EVENT = "dataset:catalog:changed";
export const ACTIVE_DATASET_CHANGED_EVENT = "dataset:active:changed";

export type DatasetCatalogChangeReason = "generated" | "deleted" | "updated";

export interface DatasetCatalogChangedDetail {
  reason: DatasetCatalogChangeReason;
  datasetName?: string;
}

export interface ActiveDatasetChangedDetail {
  datasetName: string;
  source?: "vector-management" | "live-demo";
}

export function dispatchDatasetCatalogChanged(detail: DatasetCatalogChangedDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<DatasetCatalogChangedDetail>(DATASET_CATALOG_CHANGED_EVENT, {
      detail,
    })
  );
}

export function dispatchActiveDatasetChanged(detail: ActiveDatasetChangedDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ActiveDatasetChangedDetail>(ACTIVE_DATASET_CHANGED_EVENT, {
      detail,
    })
  );
}
