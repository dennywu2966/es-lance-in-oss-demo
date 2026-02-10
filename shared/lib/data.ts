export const validationPhases = [
  {
    phase: 1,
    title: "Foundation",
    summary: "Dependencies & JVM configuration",
    details: [
      "Apache Arrow memory integration for zero-copy data access",
      "JVM heap configuration with proper memory limits",
      "License management for native libraries",
      "Basic Lance dataset connector implementation"
    ],
    icon: "Code2",
    color: "from-blue-400 to-blue-600"
  },
  {
    phase: 2,
    title: "OOM Resolution",
    summary: "256MB allocator with batch clearing",
    details: [
      "Root allocator with 256MB memory cap",
      "Child allocator isolation for vector operations",
      "Automatic memory clearing after search operations",
      "Zero memory leaks after 20+ consecutive searches"
    ],
    icon: "Shield",
    color: "from-emerald-400 to-emerald-600"
  },
  {
    phase: 3,
    title: "Real Data Testing",
    summary: "20 searches, zero crashes",
    details: [
      "Generated 128-dimensional random vectors",
      "IVF-PQ indexing for fast approximate search",
      "Verified search latency: 15-22ms per query",
      "Validated memory stability under load"
    ],
    icon: "Activity",
    color: "from-purple-400 to-purple-600"
  },
  {
    phase: 4,
    title: "OSS Integration",
    summary: "Alibaba Cloud, 300 vectors",
    details: [
      "Configured OSS endpoint (oss-cn-hangzhou.aliyuncs.com)",
      "Uploaded Lance dataset to cloud storage",
      "Successfully indexed 300 vectors in OSS",
      "Validated end-to-end kNN search pipeline"
    ],
    icon: "Cloud",
    color: "from-orange-400 to-orange-600"
  }
];

export const performanceMetrics = {
  searchLatency: { value: 18, unit: "ms", label: "Average Search Time", target: 20 },
  memoryCap: { value: 256, unit: "MB", label: "Memory Limit", target: 256 },
  datasetSize: { value: 300, unit: "vectors", label: "Production Dataset", target: 1000 },
  indexType: { value: "IVF-PQ", label: "Index Type", description: "Inverted File with Product Quantization" }
};

export const architectureComponents = [
  {
    id: "elasticsearch",
    name: "Elasticsearch",
    description: "Manages metadata, coordinates queries, handles candidate filtering",
    position: { x: 20, y: 50 },
    icon: "Database",
    color: "text-yellow-400"
  },
  {
    id: "lance-plugin",
    name: "Lance Vector Plugin",
    description: "Custom kNN query with Lance Rust engine integration",
    position: { x: 40, y: 50 },
    icon: "Zap",
    color: "text-blue-400"
  },
  {
    id: "arrow-allocator",
    name: "Arrow Memory",
    description: "256MB allocator with child isolation for zero-copy operations",
    position: { x: 60, y: 30 },
    icon: "Cpu",
    color: "text-purple-400"
  },
  {
    id: "lance-dataset",
    name: "Lance Dataset",
    description: "IVF-PQ indexed vectors stored in OSS",
    position: { x: 60, y: 70 },
    icon: "Archive",
    color: "text-emerald-400"
  },
  {
    id: "oss-storage",
    name: "Alibaba Cloud OSS",
    description: "Object storage with zero-copy reads",
    position: { x: 80, y: 50 },
    icon: "Cloud",
    color: "text-orange-400"
  }
];

export const techCards = [
  {
    title: "Memory Management",
    icon: "Cpu",
    color: "from-purple-500 to-indigo-600",
    description: "Arrow allocator with child isolation",
    details: [
      "256MB root allocator prevents memory bloat",
      "Child allocators isolated per search operation",
      "Automatic clearing after query completion",
      "Zero-copy data transfer between JVM and native code"
    ]
  },
  {
    title: "SIMD Acceleration",
    icon: "Zap",
    color: "from-blue-500 to-cyan-600",
    description: "Native Rust vectorization",
    details: [
      "Lance Rust engine with SIMD-optimized distance calculations",
      "128-dimensional vector comparisons in microseconds",
      "Multi-core parallel processing for batch operations",
      "Compile-time safety with zero-cost abstractions"
    ]
  },
  {
    title: "Cloud Storage",
    icon: "Cloud",
    color: "from-emerald-500 to-teal-600",
    description: "OSS/S3 with zero-copy reads",
    details: [
      "Object storage integration via Lance native library",
      "Zero-copy reads directly into Arrow memory",
      "Support for Alibaba Cloud OSS, AWS S3, and compatible APIs",
      "Automatic connection pooling and retry logic"
    ]
  },
  {
    title: "Integration",
    icon: "GitMerge",
    color: "from-orange-500 to-red-600",
    description: "Custom Lucene query with candidate ranking",
    details: [
      "LanceKnnQuery extends Lucene's Query class",
      "Candidate filtering with num_candidates parameter",
      "Re-ranking using actual Lance distances",
      "Transparent integration with ES search API"
    ]
  }
];

export const codeExamples = [
  {
    title: "Mapping Configuration",
    language: "json",
    code: `{
  "mappings": {
    "properties": {
      "id": { "type": "long" },
      "embedding": {
        "type": "lance_vector",
        "dimension": 128,
        "lance_uri": "oss://denny-test-lance/test-data/oss-test-vectors.lance",
        "oss_endpoint": "oss-cn-hangzhou.aliyuncs.com",
        "index_type": "ivf_pq",
        "num_partitions": 10,
        "num_bits": 8
      },
      "category": { "type": "keyword" }
    }
  }
}`
  },
  {
    title: "kNN Search Query",
    language: "json",
    code: `POST /lance-oss-test/_search
{
  "knn": {
    "field": "embedding",
    "query_vector": [0.12, -0.34, 0.56, ...],
    "k": 5,
    "num_candidates": 10
  },
  "size": 5
}`
  },
  {
    title: "OSS Configuration",
    language: "yaml",
    code: `lance:
  oss:
    access_key: "YOUR_ACCESS_KEY"
    secret_key: "YOUR_SECRET_KEY"
    endpoint: "oss-cn-hangzhou.aliyuncs.com"
    bucket: "denny-test-lance"
  memory:
    root_allocator_limit: "256MB"
    enable_child_allocator: true`
  }
];

export const statsBadges = [
  { label: "Search Time", value: "20ms", icon: "Clock" },
  { label: "Memory Cap", value: "256MB", icon: "MemoryStick" },
  { label: "Cloud Native", value: "OSS Ready", icon: "Cloud" },
];

export const ctaContent = {
  title: "Production-Ready Vector Search",
  description: "Memory-safe, thoroughly tested, and horizontally scalable. The Lance Vector Plugin is ready for your most demanding workloads.",
  features: [
    {
      title: "Memory Safe",
      description: "256MB allocator with automatic cleanup prevents OOM crashes"
    },
    {
      title: "Battle Tested",
      description: "Validated with 300+ vectors and 20+ consecutive searches"
    },
    {
      title: "Cloud Native",
      description: "Seamless integration with OSS, S3, and compatible storage"
    },
    {
      title: "Horizontally Scalable",
      description: "Stateless design supports multi-region deployment"
    }
  ],
  nextSteps: [
    "Multi-region active-active replication",
    "Additional cloud provider support (GCS, Azure Blob)",
    "Streaming ingestion support",
    "GPU-accelerated indexing"
  ]
};

// Demo search configuration
export const DEMO_CONFIG = {
  esHost: "http://47.236.247.55:9201",
  indexName: "lance-oss-test",
  dimension: 128,
  defaultK: 5,
  numCandidates: 10
};
