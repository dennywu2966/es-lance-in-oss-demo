# PRD: Enhanced Vector Search Demo - Lance + Elasticsearch Integration

## Introduction

This feature enhances the demo UI to demonstrate the complete Lance Vector Plugin workflow with Elasticsearch. The system will showcase end-to-end vector search operations: generating sample documents, computing embeddings via Jina API, creating Lance datasets with vector indices, storing them in Alibaba Cloud OSS, backfilling to Elasticsearch, and performing fusion search with detailed performance visualization and query inspection.

## Goals

- Demonstrate complete workflow: fake docs → Jina embeddings → Lance dataset → OSS storage → ES indexing → fusion search
- Provide transparent search performance with waterfall timeline showing all stages
- Allow users to inspect and modify actual Elasticsearch queries before execution
- Display full document content with view/hide toggle for search results
- Maintain consistent glass-morphism UI across all new components
- Show bottlenecks in the search pipeline (BM25, kNN, fusion merge)

## User Stories

### US-001: Generate fake documents with Jina embeddings
**Description:** As a developer, I want to generate a set of fake documents with embeddings via Jina API and store them as Lance datasets in OSS so that the demo has realistic search data.

**Acceptance Criteria:**
- [ ] Create 20 hardcoded fake documents covering tech topics (AI, databases, search engines, cloud computing, etc.)
- [ ] Each document has: `id` (UUID), `title`, `text` (200-500 chars), `topic`, `created_at`
- [ ] Call Jina Embeddings API (v2 or later) to generate vectors for each document's text
- [ ] Create Lance dataset with schema: `id` (string, primary key), `title`, `text`, `topic`, `created_at`, `vector` (fixed_size_list<float32>)
- [ ] Create vector index on Lance dataset (IVF_PQ with appropriate parameters)
- [ ] Upload Lance dataset to OSS bucket `denny-test-lance` at path `lance-documents/dataset.lance`
- [ ] Read OSS credentials (accessKeyId, secretAccessKey) from `~/.oss/config` or `~/.oss/credentials`
- [ ] Return success message with document count and OSS path
- [ ] Handle Jina API errors and OSS upload failures gracefully
- [ ] Typecheck passes

### US-002: View full document content from Lance dataset
**Description:** As a user, I want to view the complete document content (not just metadata) when browsing datasets so that I can understand what data is being searched.

**Acceptance Criteria:**
- [ ] Adapt existing view function to read full `title` and `text` fields from Lance dataset
- [ ] Display documents in a clean list format with title, topic, and full text
- [ ] Show document ID and creation timestamp
- [ ] Support pagination if document count exceeds 50
- [ ] Empty state message when no dataset exists
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-003: Backfill documents to Elasticsearch
**Description:** As a user, I want to insert fake documents into Elasticsearch (without vectors) so that I can perform hybrid fusion search (BM25 + kNN).

**Acceptance Criteria:**
- [ ] Add "Backfill to Elasticsearch" button in Vector Management section
- [ ] On click, create index `demo-documents` in Elasticsearch at `http://localhost:9200`
- [ ] Use credentials: username `elastic`, password `JJs+DtAm1Q0lf-vLJVZ4`
- [ ] Index mapping: `id` (keyword), `title` (text), `text` (text), `topic` (keyword), `created_at` (date)
- [ ] Bulk insert all 20 documents with fields: `id`, `title`, `text`, `topic`, `created_at` (NO vector field)
- [ ] Show progress indicator during backfill
- [ ] Display success message with indexed document count
- [ ] Handle connection errors and authentication failures gracefully
- [ ] Disable button if backfill already completed (check index exists)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-004: Fusion search with query input
**Description:** As a user, I want to perform fusion search using keywords or natural language queries so that I can see hybrid BM25 + vector search in action.

**Acceptance Criteria:**
- [ ] Add "Fusion Search" section with text input for search query
- [ ] Placeholder text: "Enter keywords or a natural language question..."
- [ ] Add "Advanced Options" collapsible section with:
  - BM25 weight (slider: 0.0-1.0, default 0.5)
  - kNN weight (slider: 0.0-1.0, default 0.5)
  - Number of results (input: 1-20, default 10)
- [ ] "Search" button triggers fusion query to Elasticsearch
- [ ] Query supports both keyword search ("machine learning databases") and natural language ("How do vector databases work?")
- [ ] Display search results as cards with title, topic, relevance score snippet
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-005: View/hide full document details in search results
**Description:** As a user, I want to toggle full document content visibility in search results so that I can scan results quickly or dive deep when needed.

**Acceptance Criteria:**
- [ ] Each search result card has "View Details" / "Hide Details" toggle button
- [ ] Default state: hidden (show only title, topic, score, text snippet)
- [ ] Expanded state: show full `text` field, `created_at`, and individual component scores (BM25 score, kNN score)
- [ ] Toggle button text changes based on state
- [ ] Smooth expand/collapse animation (max-height transition)
- [ ] Button style consistent with other UI elements
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-006: Interactive Elasticsearch query editor
**Description:** As a user, I want to see and modify the actual Elasticsearch DSL query before execution so that I can understand how fusion search works and experiment with query parameters.

**Acceptance Criteria:**
- [ ] Add "View/Edit Query" collapsible section below search input
- [ ] Pre-populate with the actual Elasticsearch DSL query that will be executed
- [ ] Query includes: `bool` query with `must` (match/text query) and `knn` sections
- [ ] Code editor with syntax highlighting (use lightweight library like Prism.js or simple styled `<pre>`)
- [ ] "Execute Modified Query" button sends edited query to ES
- [ ] "Reset to Default" button restores original query
- [ ] Validation warning if query JSON is invalid
- [ ] Collapse by default to avoid overwhelming users
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-007: Waterfall timeline visualization of search performance
**Description:** As a user, I want to see a visual waterfall chart of search timing so that I can identify bottlenecks in the fusion search pipeline.

**Acceptance Criteria:**
- [ ] Add "Performance Timeline" section below search results
- [ ] Display waterfall chart showing parallel operations:
  - Request to Elasticsearch (contains BM25 + kNN + fusion merge)
  - Vector similarity search from Lance/OSS (if applicable for comparison)
  - Response parsing
- [ ] X-axis: time in milliseconds (0 to total time)
- [ ] Y-axis: operation stages (labeled)
- [ ] Each bar shows: start time, duration, color-coded by stage type
- [ ] Tooltip on hover shows exact duration and stage name
- [ ] Summary text: "Total: 245ms (BM25: 80ms, kNN: 150ms, fusion: 15ms)"
- [ ] Bottleneck indicator (red highlight) on slowest stage
- [ ] Use simple HTML/CSS bars or lightweight chart library (avoid heavy dependencies)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: Consistent glass-morphism UI styling
**Description:** As a user, I want all new UI components to match the existing design system so that the demo feels cohesive and professional.

**Acceptance Criteria:**
- [ ] All new sections use `.glass-card` class with backdrop blur and border
- [ ] Buttons use consistent gradient colors and hover states
- [ ] Typography matches existing sections (font sizes, weights, line heights)
- [ ] Dark mode colors (already forced in layout.tsx)
- [ ] Spacing and padding consistent with existing components
- [ ] Animations use Framer Motion variants from `lib/animations.ts`
- [ ] No jarring visual jumps or style inconsistencies
- [ ] Verify in browser using dev-browser skill

## Functional Requirements

### Document Generation & Storage
- FR-1: System must generate 20 hardcoded fake documents with diverse tech topics
- FR-2: System must call Jina Embeddings API to generate vectors for each document text
- FR-3: System must create Lance dataset with schema: `id`, `title`, `text`, `topic`, `created_at`, `vector`
- FR-4: System must create vector index on Lance dataset using IVF_PQ
- FR-5: System must upload Lance dataset to OSS bucket `denny-test-lance` at path `lance-documents/dataset.lance`
- FR-6: System must read OSS credentials from `~/.oss/` directory (support `config` and `credentials` file formats)

### Document Viewing
- FR-7: System must read and display full document content from Lance dataset
- FR-8: System must show document title, text, topic, ID, and creation timestamp
- FR-9: System must support pagination for datasets larger than 50 documents

### Elasticsearch Integration
- FR-10: System must connect to Elasticsearch at `http://localhost:9200` with provided credentials
- FR-11: System must create index `demo-documents` with proper mapping (no vector field)
- FR-12: System must bulk insert all documents with fields: `id`, `title`, `text`, `topic`, `created_at`
- FR-13: System must check if index exists before backfilling

### Fusion Search
- FR-14: System must accept search queries via text input (keywords or natural language)
- FR-15: System must execute fusion search using Elasticsearch's hybrid query (bool query with match + knn)
- FR-16: System must support configurable BM25 and kNN weights via advanced options
- FR-17: System must display search results with title, topic, score, and text snippet
- FR-18: System must provide view/hide toggle for full document details

### Query Inspection & Modification
- FR-19: System must display actual Elasticsearch DSL query before execution
- FR-20: System must allow users to modify query via interactive editor
- FR-21: System must validate JSON syntax before sending modified query
- FR-22: System must provide "reset to default" option to restore original query

### Performance Visualization
- FR-23: System must measure duration of each search stage (BM25, kNN, fusion merge)
- FR-24: System must display waterfall chart showing operation timing
- FR-25: System must highlight bottleneck (slowest stage) in red
- FR-26: System must show summary text with total time and individual stage durations

### UI Consistency
- FR-27: All new components must use existing `.glass-card` styling
- FR-28: All animations must use Framer Motion variants from `lib/animations.ts`
- FR-29: All buttons must use consistent gradient styling

## Non-Goals

- No authentication/authorization for demo users (public access)
- No real document upload capability (hardcoded fake docs only)
- No query history or saved searches
- No A/B testing of different embedding models or search parameters
- No production deployment optimization (demo/development only)
- No multi-tenancy or user-specific datasets
- No automatic dataset refresh or updates
- No export of search results to CSV/PDF

## Design Considerations

### UI/UX Requirements
- Maintain existing glass-morphism design pattern (`.glass-card` with backdrop blur)
- Use consistent color scheme (gradients, dark mode colors)
- Collapsible sections (Advanced Options, View/Edit Query) to avoid overwhelming users
- Clear visual hierarchy: search input prominent, results below, performance at bottom
- Responsive design for mobile and desktop views

### Component Reuse
- Reuse existing section components structure from `app/page.tsx`
- Reuse Framer Motion variants from `lib/animations.ts`
- Reuse OSS client logic from `lib/oss-client.ts` (extend with Jina API calls)
- Reuse Elasticsearch proxy pattern from `app/api/search/route.ts`

### Mockup References
- Waterfall chart: similar to Chrome DevTools Network waterfall
- Query editor: similar to Kibana Dev Tools console (simplified)
- Performance summary: inspired by React DevTools Profiler

## Technical Considerations

### Dependencies
- **Jina Embeddings API**: Need API endpoint and key (assume environment variable or hardcoded for demo)
- **Elasticsearch client**: Use existing `@elastic/elasticsearch` or fetch API
- **Lance dataset creation**: Extend existing Python script in `lib/oss-client.ts`
- **Chart rendering**: Use simple HTML/CSS or lightweight library (avoid heavy chart libs)
- **Code syntax highlighting**: Prism.js or similar (minimal bundle size)

### API Integration Points
- `app/api/vectors/generate/route.ts`: Extend to call Jina API before Lance creation
- `app/api/vectors/backfill/route.ts`: NEW - handle Elasticsearch bulk insert
- `app/api/search/route.ts`: Extend to return timing data and actual query DSL
- `lib/oss-client.ts`: Extend Python script to include Jina API calls

### Performance Requirements
- Document generation: Complete within 30 seconds (20 API calls + Lance creation)
- Search response: Display results within 500ms (excluding network latency)
- UI rendering: No blocking main thread for chart animations

### Security Constraints
- Elasticsearch credentials currently hardcoded (accepted for demo, but add comment)
- OSS credentials read from `~/.oss/` (never expose in frontend)
- Jina API key: Use environment variable `JINA_API_KEY` or placeholder for demo
- No user input directly executed as code (validate JSON query before sending)

### Error Handling
- Jina API failures: Show error message with retry option
- OSS upload failures: Show error with cleanup of temp files
- Elasticsearch connection failures: Show error with troubleshooting steps
- Invalid query JSON: Show syntax error with line number

## Success Metrics

- User can complete full workflow (generate → backfill → search) in under 2 minutes
- Search completes and displays results with performance data within 1 second
- Waterfall chart clearly identifies bottleneck stage (visually distinct)
- Query editor allows successful modification and execution of queries
- No visual inconsistencies between new and existing UI sections
- Demo works end-to-end without errors on first attempt

## Open Questions

- Should the demo include a "Reset Demo" button to delete ES index and OSS dataset for fresh starts?
- What Jina Embeddings model should be used (e.g., `jina-embeddings-v2-base-en`)? Confirm model dimension.
- Should the waterfall chart show historical searches (last 5 queries) or just current search?
- Should we include a comparison mode (BM25-only vs. kNN-only vs. fusion)?
- Should Lance dataset include other metadata fields (author, tags, etc.) for more realistic demo?

## Implementation Notes

### Existing Codebase Patterns
- See `lib/oss-client.ts` lines 116-174 for Python script pattern (extend with Jina API)
- See `app/api/search/route.ts` for Elasticsearch integration pattern
- See `components/` directory for React component structure examples

### File Structure
- Create new components: `DocumentGeneration.tsx`, `BackfillSection.tsx`, `FusionSearch.tsx`, `PerformanceTimeline.tsx`
- Extend `lib/oss-client.ts` with Jina API integration
- Create new API routes: `app/api/vectors/backfill/route.ts`, `app/api/vectors/generate/route.ts`
- Update `app/page.tsx` to include new sections

### Testing Strategy
- Manual testing with dev server (`npm run dev`)
- Verify UI consistency across all new sections
- Test error cases (ES down, Jina API failure, OSS auth error)
- Performance test with 20 documents (ensure acceptable timing)
