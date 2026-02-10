#!/bin/bash
# Setup Elasticsearch index template for Lance traces

ES_HOST="${ES_HOST:-https://localhost:9200}"
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-Summer11}"

echo "Creating index template for traces-lance-*..."

curl -sk -u "$ES_USER:$ES_PASS" -X PUT "$ES_HOST/_index_template/traces-lance" \
  -H "Content-Type: application/json" \
  -d '{
  "index_patterns": ["traces-lance-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.mapping.total_fields.limit": 2000
    },
    "mappings": {
      "properties": {
        "@timestamp": { "type": "date" },
        "trace_id": { "type": "keyword" },
        "span_id": { "type": "keyword" },
        "parent_span_id": { "type": "keyword" },
        "name": { "type": "keyword" },
        "kind": { "type": "keyword" },
        "status": { "type": "keyword" },
        "status_message": { "type": "text" },
        "start_time": { "type": "date", "format": "epoch_millis" },
        "end_time": { "type": "date", "format": "epoch_millis" },
        "duration_ms": { "type": "float" },
        "service": {
          "properties": {
            "name": { "type": "keyword" },
            "version": { "type": "keyword" }
          }
        },
        "resource": {
          "properties": {
            "service.name": { "type": "keyword" },
            "service.version": { "type": "keyword" },
            "host.name": { "type": "keyword" }
          }
        },
        "attributes": {
          "type": "object",
          "dynamic": true,
          "properties": {
            "search.type": { "type": "keyword" },
            "search.k": { "type": "integer" },
            "search.num_candidates": { "type": "integer" },
            "search.results_count": { "type": "integer" },
            "dataset.name": { "type": "keyword" },
            "dataset.vectors": { "type": "long" },
            "dataset.dimensions": { "type": "integer" },
            "oss.cache_hit": { "type": "boolean" },
            "oss.bytes_downloaded": { "type": "long" },
            "oss.files_count": { "type": "integer" },
            "es.index": { "type": "keyword" },
            "es.took_ms": { "type": "float" },
            "es.hits_count": { "type": "integer" },
            "lance.search_time_ms": { "type": "float" },
            "http.method": { "type": "keyword" },
            "http.url": { "type": "keyword" },
            "http.status_code": { "type": "integer" }
          }
        },
        "events": {
          "type": "nested",
          "properties": {
            "name": { "type": "keyword" },
            "timestamp": { "type": "date", "format": "epoch_millis" },
            "attributes": { "type": "object", "dynamic": true }
          }
        }
      }
    }
  }
}'

echo ""
echo "Index template created. Verifying..."

curl -sk -u "$ES_USER:$ES_PASS" "$ES_HOST/_index_template/traces-lance" | head -100

echo ""
echo "Done."
